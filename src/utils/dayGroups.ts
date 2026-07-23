// Day-wise bucketing shared by the todo and task lists so both read the same
// way: one card per day, newest concept first (tasks look forward from their
// deadline, todos look back from when they were created), each headed by a
// pending / in progress / done tally.

import { STATUS_CYCLE, type ItemStatus } from '@/types'

export type StatusCounts = Record<ItemStatus, number>

export interface DayGroup<T> {
  key: string
  label: string
  date: string // 'YYYY-MM-DD', '' = the undated bucket
  items: T[]
  counts: StatusCounts
  total: number
}

// Local calendar date. Deliberately not toISOString().slice(0,10): that is UTC,
// so an evening in a positive-offset zone would file "today" under tomorrow.
export function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return d.getFullYear() + '-' + m + '-' + day
}

export function shiftDays(from: Date, days: number): string {
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  return ymd(d)
}

// Move a stamp onto another calendar day, keeping its time of day so a todo
// dragged from yesterday to today stays "written at 09:14", just a day later.
// An unknown stamp (0) adopts the current clock instead. '' means undated,
// which is the 0 sentinel again.
export function stampOnDay(date: string, keepTimeFrom: number, now = new Date()): number {
  if (!date) return 0
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return keepTimeFrom
  const src = keepTimeFrom > 0 ? new Date(keepTimeFrom) : now
  return new Date(
    y,
    m - 1,
    d,
    src.getHours(),
    src.getMinutes(),
    src.getSeconds(),
    src.getMilliseconds(),
  ).getTime()
}

export function countByStatus(items: { status: ItemStatus }[]): StatusCounts {
  const counts = { pending: 0, progress: 0, done: 0 } as StatusCounts
  for (const it of items) {
    // A row hydrated from an older payload could still carry something else.
    if (STATUS_CYCLE.indexOf(it.status) === -1) counts.pending++
    else counts[it.status]++
  }
  return counts
}

function longLabel(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export interface DayGroupOptions {
  // 'future' pins Today then Tomorrow and runs the rest ascending (deadlines);
  // 'past' pins Today then Yesterday and runs the rest descending (created).
  direction: 'future' | 'past'
  undatedLabel: string
  // Forward lists keep an empty undated bucket as a drop target; backward ones
  // only show it when something is actually in it.
  keepEmptyUndated?: boolean
  now?: Date
}

export function buildDayGroups<T extends { status: ItemStatus }>(
  items: readonly T[],
  dateOf: (item: T) => string,
  opts: DayGroupOptions,
): DayGroup<T>[] {
  const now = opts.now ?? new Date()
  const today = ymd(now)
  const adjacent = opts.direction === 'future' ? shiftDays(now, 1) : shiftDays(now, -1)
  const adjacentLabel = opts.direction === 'future' ? 'Tomorrow' : 'Yesterday'

  const byDate: Record<string, T[]> = {}
  for (const it of items) {
    const d = dateOf(it) || ''
    ;(byDate[d] = byDate[d] || []).push(it)
  }

  const rest = Object.keys(byDate)
    .filter((d) => d && d !== today && d !== adjacent)
    .sort()
  if (opts.direction === 'past') rest.reverse()

  const defs: { key: string; label: string; date: string }[] = [
    { key: 'today', label: 'Today', date: today },
  ]
  if (byDate[adjacent]) defs.push({ key: adjacent, label: adjacentLabel, date: adjacent })
  for (const d of rest) defs.push({ key: d, label: longLabel(d), date: d })
  if (opts.keepEmptyUndated || byDate[''])
    defs.push({ key: 'nodate', label: opts.undatedLabel, date: '' })

  return defs.map((g) => {
    const groupItems = byDate[g.date] || []
    return {
      ...g,
      items: groupItems,
      counts: countByStatus(groupItems),
      total: groupItems.length,
    }
  })
}
