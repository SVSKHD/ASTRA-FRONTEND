// The History panel's reading of a list: everything finished or put away.
//
// "Clear completed" and ⋯ → Archive never delete — they stamp `archivedAt` and
// the item stays in the workspace (and so in Supabase) for Overview and the
// Calendar to count. Until History there was no screen that showed those items
// again, so a cleared task was only recoverable by editing the database. This
// module is the pure half: which items count, how they are searched and how
// they are grouped by day. The panel owns the actions.

import type { ItemStatus, StatusChange } from '@/types'

export type HistoryFilter = 'all' | 'completed' | 'archived'

export interface HistorySource {
  id: number
  status: ItemStatus
  tag: string
  completedAt: number | null
  archivedAt?: number | null
  updatedAt?: number
  createdAt?: number
  statusLog?: StatusChange[]
}

export interface HistoryEntry {
  id: number
  title: string
  tag: string
  status: ItemStatus
  completedAt: number | null
  archivedAt: number | null
  /** The moment the entry is filed under: done, else archived, else last touched. */
  at: number
  statusLog: StatusChange[]
}

/** In History: done (still in the list or cleared) or archived in any state. */
export function inHistory(item: HistorySource): boolean {
  return item.status === 'done' || item.archivedAt != null
}

export function toEntry(item: HistorySource, title: string): HistoryEntry {
  const archivedAt = item.archivedAt ?? null
  return {
    id: item.id,
    title,
    tag: item.tag ?? '',
    status: item.status,
    completedAt: item.completedAt ?? null,
    archivedAt,
    at: item.completedAt ?? archivedAt ?? item.updatedAt ?? item.createdAt ?? 0,
    statusLog: item.statusLog ?? [],
  }
}

export function filterHistory(
  entries: HistoryEntry[],
  filter: HistoryFilter,
  query: string,
): HistoryEntry[] {
  const q = query.trim().toLowerCase()
  return entries
    .filter((e) =>
      filter === 'completed'
        ? e.archivedAt == null
        : filter === 'archived'
          ? e.archivedAt != null
          : true,
    )
    .filter((e) => !q || e.title.toLowerCase().includes(q) || e.tag.toLowerCase().includes(q))
    .sort((a, b) => b.at - a.at)
}

function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "Today", "Yesterday", a weekday this week, else a date. */
export function dayLabel(ms: number, now: number): string {
  if (!ms) return 'Undated'
  const key = dayKey(ms)
  if (key === dayKey(now)) return 'Today'
  if (key === dayKey(now - 86_400_000)) return 'Yesterday'
  const d = new Date(ms)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  if (now - ms < 6 * 86_400_000) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** Consecutive entries on the same calendar day, newest group first. */
export function groupByDay(
  entries: HistoryEntry[],
  now: number,
): { key: string; label: string; entries: HistoryEntry[] }[] {
  const groups: { key: string; label: string; entries: HistoryEntry[] }[] = []
  for (const entry of entries) {
    const key = entry.at ? dayKey(entry.at) : 'undated'
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.entries.push(entry)
    else groups.push({ key, label: dayLabel(entry.at, now), entries: [entry] })
  }
  return groups
}
