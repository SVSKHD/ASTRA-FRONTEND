// "Fix typos in my items" (AI tab): proofread the titles and descriptions of
// the todos, tasks, goals and reminders that already exist. The calendar has no
// events of its own — every event on it is one of those items — so fixing them
// fixes the calendar too.
//
// The sweep never writes on its own. `scanForTypos` sends the text in batches
// and returns a list of proposed fixes; the dialog shows them and
// `applyTypoFixes` writes the ones that are kept, with an Undo.
//
// Rich-text descriptions (HTML from RichEditor) are proofread a text node at a
// time and put back into the same markup, so bold, lists and links survive.

import type { useAppStore } from '@/stores/app'
import { askProofreader, plausibleCorrection, PROOFREAD_RULES } from '@/utils/autoCorrect'
import { looksLikeHtml, repairEntities, richPlain } from '@/utils/richText'

type App = ReturnType<typeof useAppStore>

export type SweepKind = 'todo' | 'task' | 'goal' | 'reminder'
export type SweepField = 'title' | 'description'

export const SWEEP_KIND_LABEL: Record<SweepKind, string> = {
  todo: 'Todos',
  task: 'Tasks',
  goal: 'Goals',
  reminder: 'Reminders',
}

/** One proposed fix: a field of an item, before and after. */
export interface TypoFix {
  key: string
  kind: SweepKind
  id: number
  field: SweepField
  /** The item's title, for the review list. */
  label: string
  /** The stored values — HTML for a rich description. */
  before: string
  after: string
  /** The same, as plain words, for the review list. */
  beforePlain: string
  afterPlain: string
}

interface Source {
  kind: SweepKind
  id: number
  title: string
  description: string
}

/** The items a sweep would look at. Finished items only when asked for. */
export function sweepSources(app: App, kinds: SweepKind[], includeDone: boolean): Source[] {
  const out: Source[] = []
  if (kinds.includes('todo'))
    for (const t of app.todos)
      if (includeDone || t.status !== 'done')
        out.push({ kind: 'todo', id: t.id, title: t.text, description: t.description ?? '' })
  if (kinds.includes('task'))
    for (const t of app.tasks)
      if (includeDone || t.status !== 'done')
        out.push({ kind: 'task', id: t.id, title: t.title, description: t.notes ?? '' })
  if (kinds.includes('goal'))
    for (const g of app.goals)
      if (includeDone || g.status === 'active' || g.status === 'paused')
        out.push({ kind: 'goal', id: g.id, title: g.title, description: g.description ?? '' })
  if (kinds.includes('reminder'))
    for (const r of app.reminders)
      if (includeDone || !r.cancelledAt)
        out.push({ kind: 'reminder', id: r.id, title: r.title, description: r.note ?? '' })
  return out
}

/** How many items of each kind a sweep would look at. */
export function sweepCounts(app: App, includeDone: boolean): Record<SweepKind, number> {
  const all = sweepSources(app, ['todo', 'task', 'goal', 'reminder'], includeDone)
  const counts = { todo: 0, task: 0, goal: 0, reminder: 0 }
  for (const s of all) counts[s.kind]++
  return counts
}

/** Worth sending: has a real word in it, and is not a link or code. */
function worthChecking(text: string): boolean {
  const t = text.trim()
  if (t.length < 3 || t.length > 2000) return false
  if (!/[a-z]{3,}/i.test(t)) return false
  if (/^(https?:\/\/|www\.)\S+$/i.test(t)) return false
  return true
}

// ---- splitting a description into pieces of text --------------------------

interface Piece {
  /** Key sent to the model. */
  key: string
  text: string
}

/** A description, ready to be proofread and put back together. */
interface Doc {
  pieces: Piece[]
  rebuild: (fixed: Map<string, string>) => string
}

const SKIP_TAGS = new Set(['CODE', 'PRE', 'A'])

function splitDescription(raw: string, prefix: string): Doc {
  const value = repairEntities(raw)
  if (!looksLikeHtml(value) || typeof document === 'undefined') {
    return {
      pieces: worthChecking(raw) ? [{ key: prefix, text: raw }] : [],
      rebuild: (fixed) => fixed.get(prefix) ?? raw,
    }
  }
  const tpl = document.createElement('template')
  tpl.innerHTML = value
  const nodes: Text[] = []
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    let skip = false
    for (let p = n.parentElement; p; p = p.parentElement) if (SKIP_TAGS.has(p.tagName)) skip = true
    if (!skip && worthChecking(n.textContent ?? '')) nodes.push(n as Text)
  }
  const pieces = nodes.map((n, i) => ({ key: `${prefix}.${i}`, text: n.textContent ?? '' }))
  return {
    pieces,
    rebuild: (fixed) => {
      let changed = false
      pieces.forEach((p, i) => {
        const next = fixed.get(p.key)
        if (next != null && next !== p.text) {
          nodes[i].textContent = next
          changed = true
        }
      })
      return changed ? tpl.innerHTML : raw
    },
  }
}

// ---- asking the model -------------------------------------------------------

const SWEEP_INSTRUCTIONS = `You are a proofreader for a to-do and planning app. The user sends a JSON object whose values are short texts (item titles and descriptions). Proofread each value on its own.
${PROOFREAD_RULES}
Titles are short labels: only fix spelling and capitalisation in them; do not add words or punctuation.
Reply with ONLY a JSON object holding just the keys whose value you changed, each mapped to its corrected text — for example {"3":"Call the bank"}. Reply {} when nothing needs fixing. No Markdown, no explanation.`

const BATCH_CHARS = 3500
const BATCH_ITEMS = 40
const PARALLEL = 3

function batches(pieces: Piece[]): Piece[][] {
  const out: Piece[][] = []
  let cur: Piece[] = []
  let size = 0
  for (const p of pieces) {
    if (cur.length && (size + p.text.length > BATCH_CHARS || cur.length >= BATCH_ITEMS)) {
      out.push(cur)
      cur = []
      size = 0
    }
    cur.push(p)
    size += p.text.length
  }
  if (cur.length) out.push(cur)
  return out
}

/** The model's JSON object, or null when the answer is not one. */
export function parseSweepAnswer(answer: string): Record<string, string> | null {
  const body = answer
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try {
    const obj = JSON.parse(body.slice(start, end + 1)) as unknown
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj)) if (typeof v === 'string') out[k] = v
    return out
  } catch {
    return null
  }
}

/** Keep the original's surrounding whitespace, and refuse anything that is not a light fix. */
function acceptFix(before: string, after: string): string | null {
  const lead = /^\s*/.exec(before)?.[0] ?? ''
  const trail = /\s*$/.exec(before)?.[0] ?? ''
  const next = lead + after.trim() + trail
  if (next === before || !plausibleCorrection(before, next)) return null
  return next
}

async function askBatch(batch: Piece[], signal: AbortSignal): Promise<Map<string, string>> {
  // Short numeric keys keep the request small; mapped back to the piece keys here.
  const payload: Record<string, string> = {}
  batch.forEach((p, i) => (payload[String(i)] = p.text))
  const answer = await askProofreader(SWEEP_INSTRUCTIONS, JSON.stringify(payload), signal)
  if (answer == null) throw new Error('unavailable')
  const parsed = parseSweepAnswer(answer) ?? {}
  const out = new Map<string, string>()
  for (const [k, v] of Object.entries(parsed)) {
    const piece = batch[Number(k)]
    if (!piece) continue
    const fixed = acceptFix(piece.text, v)
    if (fixed != null) out.set(piece.key, fixed)
  }
  return out
}

export interface ScanProgress {
  done: number
  total: number
}

/**
 * Proofread the items and return the fixes the model proposed. Throws only
 * when no batch could be checked at all (offline, signed out, no proxy).
 */
export async function scanForTypos(
  sources: Source[],
  opts: { signal: AbortSignal; onProgress?: (p: ScanProgress) => void },
): Promise<TypoFix[]> {
  // Every field becomes one or more pieces; each remembers how to rebuild.
  const fields: { src: Source; field: SweepField; raw: string; doc: Doc }[] = []
  for (const src of sources) {
    const prefix = `${src.kind}:${src.id}`
    // A title is always plain text, even when it holds a "<".
    fields.push({
      src,
      field: 'title',
      raw: src.title,
      doc: {
        pieces: worthChecking(src.title) ? [{ key: `${prefix}:t`, text: src.title }] : [],
        rebuild: (fixed) => fixed.get(`${prefix}:t`) ?? src.title,
      },
    })
    if (src.description.trim())
      fields.push({
        src,
        field: 'description',
        raw: src.description,
        doc: splitDescription(src.description, `${prefix}:d`),
      })
  }

  const all = batches(fields.flatMap((f) => f.doc.pieces))
  const fixed = new Map<string, string>()
  let done = 0
  let worked = 0
  opts.onProgress?.({ done, total: all.length })

  let next = 0
  async function worker() {
    while (next < all.length && !opts.signal.aborted) {
      const batch = all[next++]
      try {
        const got = await askBatch(batch, opts.signal)
        for (const [k, v] of got) fixed.set(k, v)
        worked++
      } catch {
        if (opts.signal.aborted) return
        // One failed batch does not sink the sweep; the rest still report.
      }
      done++
      opts.onProgress?.({ done, total: all.length })
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, all.length) }, worker))
  if (opts.signal.aborted) throw new DOMException('Aborted', 'AbortError')
  if (all.length && !worked) throw new Error('The AI could not be reached.')

  const out: TypoFix[] = []
  for (const f of fields) {
    if (!f.doc.pieces.some((p) => fixed.has(p.key))) continue
    const after = f.doc.rebuild(fixed)
    if (after === f.raw) continue
    const plain = f.field === 'description'
    out.push({
      key: `${f.src.kind}:${f.src.id}:${f.field}`,
      kind: f.src.kind,
      id: f.src.id,
      field: f.field,
      label: f.src.title.trim() || '(untitled)',
      before: f.raw,
      after,
      beforePlain: plain ? richPlain(f.raw) : f.raw,
      afterPlain: plain ? richPlain(after) : after,
    })
  }
  return out
}

// ---- writing ---------------------------------------------------------------

function read(app: App, kind: SweepKind, id: number, field: SweepField): string | undefined {
  switch (kind) {
    case 'todo': {
      const x = app.todos.find((t) => t.id === id)
      return x && (field === 'title' ? x.text : x.description)
    }
    case 'task': {
      const x = app.tasks.find((t) => t.id === id)
      return x && (field === 'title' ? x.title : x.notes)
    }
    case 'goal': {
      const x = app.goals.find((g) => g.id === id)
      return x && (field === 'title' ? x.title : x.description)
    }
    case 'reminder': {
      const x = app.reminders.find((r) => r.id === id)
      return x && (field === 'title' ? x.title : x.note)
    }
  }
}

function write(app: App, kind: SweepKind, id: number, field: SweepField, value: string) {
  switch (kind) {
    case 'todo':
      app.updateTodo(id, field === 'title' ? { text: value } : { description: value })
      break
    case 'task':
      app.patchTask(id, field === 'title' ? { title: value } : { notes: value })
      break
    case 'goal':
      app.updateGoal(id, field === 'title' ? { title: value } : { description: value })
      break
    case 'reminder':
      app.updateReminder(id, field === 'title' ? 'title' : 'note', value)
      break
  }
}

/** Reminders already on Google Calendar get the corrected text pushed there too. */
function pushToCalendar(app: App, ids: Set<number>) {
  for (const id of ids)
    if (app.reminders.find((r) => r.id === id)?.calEventId) void app.syncCalendar(id)
}

/**
 * Write the kept fixes. A field edited since the scan is left alone. Shows a
 * toast with Undo; returns how many fields were changed.
 */
export function applyTypoFixes(app: App, fixes: TypoFix[]): number {
  const applied: TypoFix[] = []
  const reminders = new Set<number>()
  for (const f of fixes) {
    if (read(app, f.kind, f.id, f.field) !== f.before) continue
    write(app, f.kind, f.id, f.field, f.after)
    applied.push(f)
    if (f.kind === 'reminder') reminders.add(f.id)
  }
  pushToCalendar(app, reminders)
  const items = new Set(applied.map((f) => `${f.kind}:${f.id}`)).size
  if (applied.length) {
    app.showToastWithUndo(`Fixed typos in ${items} item${items === 1 ? '' : 's'}`, () => {
      for (const f of applied)
        if (read(app, f.kind, f.id, f.field) === f.after)
          write(app, f.kind, f.id, f.field, f.before)
      pushToCalendar(app, reminders)
    })
  }
  return applied.length
}
