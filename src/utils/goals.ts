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
