// Tolerant parser for the inbound Goals-import links (task 8, "URL IMPORT").
// These are pasted by hand, so every step is forgiving: the query may be a full
// URL or a bare query string, the item list may be JSON or delimited by any of
// several characters, and the project slug may carry the item payload inline in
// the legacy `?project=slug=a|b|c` form. Pure + fully unit-tested; the import
// view (GoalsImportView) drives the preview from what this returns.

export const MAX_IMPORT_ITEMS = 200

export interface ParsedGoalItem {
  text: string
  estimateMins: number | null
  dueAt: string | null // ISO yyyy-mm-dd
  tags: string[]
}

export interface ParsedImport {
  // The project token exactly as it appeared, its slug, and a human title.
  projectRaw: string
  projectSlug: string
  goalTitle: string
  items: ParsedGoalItem[]
  // True when the source carried more than MAX_IMPORT_ITEMS (the caller rejects).
  overCap: boolean
  sourceUrl: string
}

// decodeURIComponent that never throws on a malformed %-sequence (hand-pasted
// links routinely contain a bare '%').
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

// A concatenated lowercase slug like `learningandgoals` has no separators to
// split on, so we also break on the stop-word "and"; `my-project` / `my_project`
// split on their separators. Title-cased with small words kept lowercase (except
// the first). Best-effort — the preview lets the user rename it.
const SMALL_WORDS = new Set(['and', 'or', 'the', 'of', 'to', 'a', 'an', 'in', 'on', 'for'])

export function deSlugTitle(slug: string): string {
  const decoded = safeDecode(slug).trim()
  // Normalise real separators to spaces first.
  let s = decoded.replace(/[-_+.]+/g, ' ').trim()
  // If it collapsed to a single run of letters, break on embedded "and".
  if (!s.includes(' ')) s = s.replace(/and/gi, ' and ')
  const words = collapseWs(s).split(' ').filter(Boolean)
  return words
    .map((w, i) => {
      const lower = w.toLowerCase()
      if (i > 0 && SMALL_WORDS.has(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

// Pull the query portion off a full URL or a bare query string, dropping any
// trailing hash fragment.
function queryOf(input: string): string {
  const noHash = input.split('#')[0]
  const q = noHash.includes('?') ? noHash.slice(noHash.indexOf('?') + 1) : noHash
  return q.trim()
}

// Split a payload into raw item strings: JSON array first, then the first of
// | ; newline , that appears. Literal "\n" (backslash-n) is treated as newline.
function splitItems(payload: string): string[] {
  const decoded = safeDecode(payload).replace(/\\n/g, '\n').trim()
  if (!decoded) return []
  if (decoded.startsWith('[')) {
    try {
      const arr = JSON.parse(decoded)
      if (Array.isArray(arr)) return arr.map((x) => String(x))
    } catch {
      /* fall through to delimiter splitting */
    }
  }
  const delim = decoded.includes('|')
    ? '|'
    : decoded.includes(';')
      ? ';'
      : decoded.includes('\n')
        ? '\n'
        : ','
  return decoded.split(delim)
}

// ---- Canonical Goals JSON (task 10a) --------------------------------------
// The import/export interchange shape. The same normalisation feeds the URL
// import, a pasted-JSON box and a dropped .json file; export emits it back and
// round-trips losslessly. Pure + unit-tested (goals.test.ts).

export const GOALS_JSON_VERSION = 1

export type GoalDocStatus = 'active' | 'paused' | 'done' | 'archived'
const GOAL_STATUSES: GoalDocStatus[] = ['active', 'paused', 'done', 'archived']

// A fully-normalised point: strings promoted to { text }, inline shorthand parsed
// out, timeline split into start/target (ISO or null).
export interface GoalPoint {
  text: string
  estimateMins: number | null
  dueAt: string | null // timeline target / @date
  startAt: string | null // timeline start
  done: boolean
  tags: string[]
}
// A normalised goal. `error` is set (and the goal marked non-importable) when a
// required field is missing; every other goal in the document stays importable.
export interface GoalDoc {
  title: string
  description: string
  startAt: string | null
  targetAt: string | null
  color: string
  status: GoalDocStatus
  points: GoalPoint[]
  error?: string
}
export interface GoalsDocument {
  project: string
  goals: GoalDoc[]
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
function asIsoDate(v: unknown): string | null {
  return typeof v === 'string' && ISO_DATE.test(v.trim()) ? v.trim() : null
}

// A timeline may be an object { start, target } (either optional) or a bare
// string, which is read as the target. Returns nulls for anything unparseable.
function parseTimeline(v: unknown): { start: string | null; target: string | null } {
  if (typeof v === 'string') return { start: null, target: asIsoDate(v) }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return { start: asIsoDate(o.start), target: asIsoDate(o.target) }
  }
  return { start: null, target: null }
}

// Normalise one point. A plain string becomes { text }; an object is read
// field-by-field. Inline shorthand (@date ~est #tag) is always parsed out of the
// text and stripped; explicit object fields win over shorthand, shorthand fills
// the gaps. Unknown keys are ignored.
export function normalizePoint(input: unknown): GoalPoint {
  const raw =
    typeof input === 'string' ? { text: input } : ((input ?? {}) as Record<string, unknown>)
  const shorthand = parseItemMetadata(typeof raw.text === 'string' ? raw.text : '')
  const timeline = parseTimeline(raw.timeline)
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === 'string')
    : []
  // De-dupe tags (shorthand + explicit) case-insensitively, keeping first spelling.
  const mergedTags: string[] = []
  const seenTag = new Set<string>()
  for (const t of [...tags, ...shorthand.tags]) {
    const k = t.toLowerCase()
    if (!k || seenTag.has(k)) continue
    seenTag.add(k)
    mergedTags.push(t)
  }
  return {
    text: shorthand.text,
    estimateMins:
      typeof raw.estimateMins === 'number' && raw.estimateMins >= 0
        ? raw.estimateMins
        : shorthand.estimateMins,
    dueAt: asIsoDate(raw.dueAt) ?? timeline.target ?? shorthand.dueAt,
    startAt: timeline.start,
    done: raw.done === true,
    tags: mergedTags,
  }
}

function normalizeGoal(input: unknown): GoalDoc {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const timeline = parseTimeline(o.timeline)
  const status =
    typeof o.status === 'string' && (GOAL_STATUSES as string[]).includes(o.status)
      ? (o.status as GoalDocStatus)
      : 'active'
  const points = Array.isArray(o.points) ? o.points.map(normalizePoint).filter((p) => p.text) : []
  const title = typeof o.title === 'string' ? o.title.trim() : ''
  const goal: GoalDoc = {
    title,
    description: typeof o.description === 'string' ? o.description : '',
    startAt: timeline.start ?? asIsoDate(o.startDate),
    targetAt: timeline.target ?? asIsoDate(o.targetDate),
    color: typeof o.color === 'string' ? o.color : '',
    status,
    points,
  }
  // Schema check: a goal without a title is surfaced as an error row in the
  // preview but never fails the whole import.
  if (!title) goal.error = 'Missing title'
  return goal
}

// Parse the canonical document from a JSON string or an already-parsed object.
// Never throws: a malformed string yields an empty document with a parseError.
export function parseGoalsJson(input: string | unknown): GoalsDocument & { parseError?: string } {
  let obj: unknown = input
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return { project: '', goals: [] }
    try {
      obj = JSON.parse(trimmed)
    } catch (e) {
      return { project: '', goals: [], parseError: (e as Error).message || 'Invalid JSON' }
    }
  }
  const o = (obj && typeof obj === 'object' ? obj : {}) as Record<string, unknown>
  const rawGoals = Array.isArray(o.goals) ? o.goals : []
  return {
    project: typeof o.project === 'string' ? o.project : '',
    goals: rawGoals.map(normalizeGoal),
  }
}

// Serialise goals back to the canonical shape. Only set keys carry through, so a
// re-parse yields the same normalised document (lossless round-trip). exportedAt
// is passed in so the function stays pure/testable.
export function exportGoalsJson(project: string, goals: GoalDoc[], exportedAt: string): string {
  const timeline = (start: string | null, target: string | null) =>
    start || target ? { ...(start ? { start } : {}), ...(target ? { target } : {}) } : undefined
  const doc = {
    version: GOALS_JSON_VERSION,
    exportedAt,
    sourceProject: project,
    project,
    goals: goals.map((g) => {
      const tl = timeline(g.startAt, g.targetAt)
      return {
        title: g.title,
        ...(g.description ? { description: g.description } : {}),
        ...(tl ? { timeline: tl } : {}),
        points: g.points.map((p) => {
          const ptl = timeline(p.startAt, p.dueAt)
          return {
            text: p.text,
            ...(p.estimateMins != null ? { estimateMins: p.estimateMins } : {}),
            ...(ptl ? { timeline: ptl } : {}),
            done: p.done,
            ...(p.tags.length ? { tags: p.tags } : {}),
          }
        }),
        ...(g.color ? { color: g.color } : {}),
        status: g.status,
      }
    }),
  }
  return JSON.stringify(doc, null, 2)
}

// Extract @date / ~estimate / #tag from an item and strip them from the text.
export function parseItemMetadata(raw: string): ParsedGoalItem {
  let text = raw
  let dueAt: string | null = null
  let estimateMins: number | null = null
  const tags: string[] = []

  const due = text.match(/@(\d{4}-\d{2}-\d{2})/)
  if (due) dueAt = due[1]

  const est = text.match(/~\s*(\d+)\s*(h|m)\b/i)
  if (est) estimateMins = parseInt(est[1], 10) * (est[2].toLowerCase() === 'h' ? 60 : 1)

  for (const m of text.matchAll(/#([\p{L}\d][\w-]*)/gu)) tags.push(m[1])

  text = collapseWs(
    text
      .replace(/@\d{4}-\d{2}-\d{2}/g, '')
      .replace(/~\s*\d+\s*(h|m)\b/gi, '')
      .replace(/#[\p{L}\d][\w-]*/gu, ''),
  )
  return { text, estimateMins, dueAt, tags }
}

// Drop empties and de-duplicate case-insensitively, keeping first occurrence.
function dedupeItems(items: ParsedGoalItem[]): ParsedGoalItem[] {
  const seen = new Set<string>()
  const out: ParsedGoalItem[] = []
  for (const it of items) {
    if (!it.text) continue
    const key = it.text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

export function parseImportUrl(input: string): ParsedImport {
  const sourceUrl = input.trim()
  const query = queryOf(sourceUrl)

  // Separate the project segment from the goals payload. A real `&goals=`
  // (or leading `goals=`) wins; otherwise the payload rides inline on `project`.
  let projectPart = query
  let goalsPayload: string | null = null
  const goalsMatch = query.match(/(?:^|&)goals=([\s\S]*)$/)
  if (goalsMatch) {
    goalsPayload = goalsMatch[1]
    projectPart = query.slice(0, goalsMatch.index).replace(/&$/, '')
  }

  // The project value: everything after `project=` (tolerate its absence).
  let projectValue = projectPart.replace(/(?:^|&).*?project=/, '')
  if (projectValue === projectPart && !/project=/.test(projectPart)) projectValue = projectPart

  // Legacy inline form: `project=slug=a|b|c` — split the value on its first '='.
  if (goalsPayload === null) {
    const eq = projectValue.indexOf('=')
    if (eq !== -1) {
      goalsPayload = projectValue.slice(eq + 1)
      projectValue = projectValue.slice(0, eq)
    }
  }

  const projectRaw = safeDecode(projectValue).trim()
  const projectSlug = projectRaw.toLowerCase()
  const rawItems = goalsPayload === null ? [] : splitItems(goalsPayload)
  const parsed = dedupeItems(rawItems.map((r) => parseItemMetadata(safeDecode(r))))

  return {
    projectRaw,
    projectSlug,
    goalTitle: deSlugTitle(projectRaw) || 'Imported Goals',
    items: parsed.slice(0, MAX_IMPORT_ITEMS),
    overCap: parsed.length > MAX_IMPORT_ITEMS,
    sourceUrl,
  }
}
