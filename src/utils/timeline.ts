// The Timeline: features written up in markdown, each on its day, linked to the
// tasks and todos that build them and the notes behind them.
//
// Everything here is pure so it can be tested without a store: reading the
// stored list back safely, the month grouping the sidebar draws, search,
// "which entries belong to this task", every linked item's parent chain, and
// the auto-format that writes the linked work into the write-up.
//
// The links are held on the entry alone (`taskIds`, `todoIds`, `noteIds`). A
// task asks for its entries rather than carrying a list of them, so there is
// never a second end to drift out of step — and a deleted task simply stops
// matching, which is why every reader filters ids against what still exists.
import { ymd } from '@/utils/dayGroups'
import { noteText } from '@/utils/notes'
import type { TimelineEntry, TimelineStatus } from '@/types'

export const TIMELINE_STATUSES: { value: TimelineStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'progress', label: 'In progress' },
  { value: 'shipped', label: 'Shipped' },
]
export const TIMELINE_STATUS_LABEL: Record<TimelineStatus, string> = {
  planned: 'Planned',
  progress: 'In progress',
  shipped: 'Shipped',
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isTimelineStatus(v: unknown): v is TimelineStatus {
  return v === 'planned' || v === 'progress' || v === 'shipped'
}

export function todayYmd(now = Date.now()): string {
  return ymd(new Date(now))
}

function ids(v: unknown): number[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)))]
}

/**
 * The stored list, read back defensively. An entry needs an id and either a
 * title or a body; everything else falls back to something usable rather than
 * dropping the entry, because a write-up with a bad date is still worth keeping.
 */
export function sanitizeTimeline(raw: unknown, now = Date.now()): TimelineEntry[] {
  if (!Array.isArray(raw)) return []
  const out: TimelineEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const e = item as Partial<TimelineEntry>
    if (typeof e.id !== 'number') continue
    const title = typeof e.title === 'string' ? e.title.trim() : ''
    const body = typeof e.body === 'string' ? e.body : ''
    if (!title && !body.trim()) continue
    const createdAt = typeof e.createdAt === 'number' ? e.createdAt : 0
    out.push({
      id: e.id,
      title,
      body,
      date:
        typeof e.date === 'string' && DATE_RE.test(e.date) ? e.date : todayYmd(createdAt || now),
      status: isTimelineStatus(e.status) ? e.status : 'planned',
      taskIds: ids(e.taskIds),
      todoIds: ids(e.todoIds),
      noteIds: ids(e.noteIds),
      createdAt,
      updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : createdAt,
    })
  }
  return out
}

/** What an entry is called: its title, else the first line of its body. */
export function timelineLabel(e: Pick<TimelineEntry, 'title' | 'body'>, max = 60): string {
  const own = e.title.trim() || noteText(e.body).trim()
  if (!own) return 'Untitled entry'
  return own.length > max ? own.slice(0, max - 1).trimEnd() + '…' : own
}

/** The body flattened to one line of plain text for a card's preview. */
export function timelinePreview(body: string, max = 140): string {
  const plain = noteText(body)
    // The markdown that reads as noise once the lines are joined.
    .replace(/(^|\s)#{1,6}\s+/g, '$1')
    .replace(/[*_`~]+/g, '')
    .replace(/\[( |x|X)\]\s*/g, '')
    .replace(/(^|\s)[-+>]\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > max ? plain.slice(0, max - 1).trimEnd() + '…' : plain
}

/** Newest day first; within a day, the most recently touched first. */
export function sortTimeline(list: readonly TimelineEntry[]): TimelineEntry[] {
  return [...list].sort((a, b) =>
    a.date === b.date ? b.updatedAt - a.updatedAt : a.date < b.date ? 1 : -1,
  )
}

export interface TimelineMonth {
  /** YYYY-MM */
  key: string
  label: string
  items: TimelineEntry[]
}

/** The sidebar's sections: one per month, newest month first. */
export function groupTimelineByMonth(list: readonly TimelineEntry[]): TimelineMonth[] {
  const months: TimelineMonth[] = []
  for (const e of sortTimeline(list)) {
    const key = e.date.slice(0, 7)
    let month = months[months.length - 1]
    if (!month || month.key !== key) {
      const [y, m] = key.split('-').map(Number)
      month = {
        key,
        label: new Date(y, m - 1, 1).toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        }),
        items: [],
      }
      months.push(month)
    }
    month.items.push(e)
  }
  return months
}

/**
 * Search across the title, the body, and the names of what the entry links to
 * — so "checkout" finds the entry that builds the checkout task even when the
 * write-up never uses the word.
 */
export function searchTimeline(
  list: readonly TimelineEntry[],
  query: string,
  taskTitle: (id: number) => string | undefined = () => undefined,
  todoTitle: (id: number) => string | undefined = () => undefined,
): TimelineEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...list]
  return list.filter((e) => {
    const linked = [
      ...e.taskIds.map((id) => taskTitle(id) ?? ''),
      ...e.todoIds.map((id) => todoTitle(id) ?? ''),
    ].join(' ')
    return (e.title + ' ' + e.body + ' ' + linked).toLowerCase().includes(q)
  })
}

/** The entries a task appears on, newest first. */
export function timelineForTask(list: readonly TimelineEntry[], taskId: number): TimelineEntry[] {
  return sortTimeline(list.filter((e) => e.taskIds.includes(taskId)))
}

/** The entries a todo appears on, newest first. */
export function timelineForTodo(list: readonly TimelineEntry[], todoId: number): TimelineEntry[] {
  return sortTimeline(list.filter((e) => e.todoIds.includes(todoId)))
}

/** The entries a note appears on, newest first. */
export function timelineForNote(list: readonly TimelineEntry[], noteId: number): TimelineEntry[] {
  return sortTimeline(list.filter((e) => e.noteIds.includes(noteId)))
}

/** "8 Oct" — the date on a card; the month heading above it carries the year. */
export function timelineDayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const at = new Date(y, m - 1, d)
  return `${d} ${at.toLocaleDateString(undefined, { month: 'short' })}`
}

// ---- linked work, with where it sits ------------------------------------------
// A subtask on its own ("Clash warnings") says little; with its parent chain
// ("Scheduling board › Clash warnings") it says what it belongs to. Tasks and
// todos are both trees, so one shape covers both.

export interface TreeNode {
  id: number
  title: string
  parentId: number | null
  done: boolean
}
export interface LinkedRow {
  id: number
  title: string
  /** Ancestor titles, root first. Empty for a top-level item. */
  path: string[]
  done: boolean
}

/** Ancestor titles of `id`, root first. Stops at a missing parent or a cycle. */
export function pathOf(byId: ReadonlyMap<number, TreeNode>, id: number): string[] {
  const path: string[] = []
  const seen = new Set<number>([id])
  let parent = byId.get(id)?.parentId ?? null
  while (parent != null && !seen.has(parent)) {
    seen.add(parent)
    const node = byId.get(parent)
    if (!node) break
    path.unshift(node.title || 'Untitled')
    parent = node.parentId
  }
  return path
}

/** The linked ids as rows, in link order, dropping any that no longer exist. */
export function linkedRows(idList: readonly number[], nodes: readonly TreeNode[]): LinkedRow[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return idList.flatMap((id) => {
    const n = byId.get(id)
    return n ? [{ id, title: n.title || 'Untitled', path: pathOf(byId, id), done: n.done }] : []
  })
}

/** "Parent › Child" for an option list or a chip's tooltip. */
export function rowLabel(row: Pick<LinkedRow, 'title' | 'path'>): string {
  return [...row.path, row.title].join(' › ')
}

// ---- auto-format --------------------------------------------------------------
// The write-up keeps the user's prose and gains two sections it owns, rebuilt
// from the links every time: `## Tasks` and `## Todos`, one checkbox per item,
// grouped under its parent so each piece of work reads separately. Anything
// under those two headings is replaced; everything else is left exactly as it
// was written.

const MANAGED = new Set(['## tasks', '## todos'])

/** The body with the two managed sections taken out. */
export function stripManagedSections(body: string): string {
  const out: string[] = []
  let skipping = false
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    const head = line.trim().toLowerCase()
    if (/^#{1,2}\s/.test(head)) skipping = MANAGED.has(head.replace(/\s+/g, ' '))
    if (!skipping) out.push(line)
  }
  return out.join('\n').trim()
}

function section(heading: string, rows: readonly LinkedRow[]): string {
  if (!rows.length) return ''
  const lines = [heading, '']
  const loose = rows.filter((r) => !r.path.length)
  for (const r of loose) lines.push(`- [${r.done ? 'x' : ' '}] ${r.title}`)
  // Subtasks under their parent chain, one group per chain, in link order.
  const groups = new Map<string, LinkedRow[]>()
  for (const r of rows) {
    if (!r.path.length) continue
    const key = r.path.join(' › ')
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  for (const [key, members] of groups) {
    if (lines.length > 2) lines.push('')
    lines.push(`### ${key}`, '')
    for (const r of members) lines.push(`- [${r.done ? 'x' : ' '}] ${r.title}`)
  }
  return lines.join('\n')
}

/**
 * The write-up with its linked work written in. An empty write-up starts with
 * an Overview heading so there is somewhere obvious to begin; with nothing
 * linked, the managed sections are simply removed.
 */
export function formatTimelineBody(
  body: string,
  linked: { tasks: readonly LinkedRow[]; todos: readonly LinkedRow[] },
): string {
  const prose = stripManagedSections(body)
  const parts = [
    prose || (linked.tasks.length || linked.todos.length ? '## Overview' : ''),
    section('## Tasks', linked.tasks),
    section('## Todos', linked.todos),
  ].filter(Boolean)
  return parts.join('\n\n')
}
