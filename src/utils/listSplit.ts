// The shared shape of every list once the Done/Not-done split lands: one flat
// "carried over" run (everything pending from before today), today's active
// items, and a collapsed Completed section — no per-day date groups. Todos,
// tasks, deadlines and reminders all feed the same function so the four lists
// cannot drift apart.
//
// Pure and framework-free: the views pass accessors for the few things that
// differ between collections (which day an item belongs to, when it completed,
// whether it counts as carried over) and get back the three regions plus the
// progress tally the liquid bar renders.

export interface ListStats {
  done: number
  total: number
  pct: number // 0..100, rounded
}

export interface SplitResult<T> {
  carriedOver: T[]
  active: T[]
  completed: T[]
  stats: ListStats
}

export interface SplitOptions<T> {
  // True when the item is complete. Kept as an accessor rather than reading
  // `status` directly so a collection without a lifecycle (a plain reminder)
  // can define "done" its own way.
  isDone: (item: T) => boolean
  // True when the item is pending from before today — the single flat "carried
  // over" run. The caller owns the overdue rule (a todo's day is its createdAt,
  // a task's is its deadline), so this composable stays collection-agnostic.
  isCarried: (item: T) => boolean
  // When the item was completed, for the Today filter and the "recently
  // completed" sort. Null while not done.
  completedAt?: (item: T) => number | null
  // When set, the item is hidden from every region (archived via "Clear
  // completed") but the caller may still count it elsewhere. Null/absent = live.
  archivedAt?: (item: T) => number | null
  // A YYYY-MM-DD day key. When set, the Completed region shows only items
  // completed on that day (the Today filter), rather than everything ever done.
  completedOnDay?: string | null
  // 'recent' sorts Completed most-recently-completed first; 'original' leaves
  // the caller's incoming order untouched.
  completedSort?: 'recent' | 'original'
  // Local YYYY-MM-DD for `completedOnDay` comparison. Defaults to deriving from
  // the completion stamp's own local date.
  dayKeyOf?: (ms: number) => string
}

function pct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

export function splitList<T>(items: readonly T[], opts: SplitOptions<T>): SplitResult<T> {
  const completedAt = opts.completedAt ?? (() => null)
  const archivedAt = opts.archivedAt ?? (() => null)
  const live = items.filter((it) => archivedAt(it) == null)

  const carriedOver: T[] = []
  const active: T[] = []
  let completed: T[] = []

  for (const it of live) {
    if (opts.isDone(it)) {
      completed.push(it)
    } else if (opts.isCarried(it)) {
      carriedOver.push(it)
    } else {
      active.push(it)
    }
  }

  // The Today filter restricts Completed to items finished on the active day —
  // "done today", not everything ever done. Items with no completion stamp are
  // dropped from the day-scoped view rather than guessed at.
  if (opts.completedOnDay) {
    const key = opts.completedOnDay
    const dayKeyOf = opts.dayKeyOf
    completed = completed.filter((it) => {
      const at = completedAt(it)
      if (at == null) return false
      return (dayKeyOf ? dayKeyOf(at) : localDayKey(at)) === key
    })
  }

  if (opts.completedSort === 'recent') {
    completed = [...completed].sort((a, b) => (completedAt(b) ?? 0) - (completedAt(a) ?? 0))
  }

  const doneCount = completed.length
  const total = carriedOver.length + active.length + doneCount
  return {
    carriedOver,
    active,
    completed,
    stats: { done: doneCount, total, pct: pct(doneCount, total) },
  }
}

// Local calendar day of a timestamp, matching utils/dayGroups.ymd (not UTC, so
// an evening in a positive-offset zone files under the right day).
export function localDayKey(ms: number): string {
  const d = new Date(ms)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return d.getFullYear() + '-' + m + '-' + day
}

// A short age chip for a carried-over row: "5d", "1d", "today". The only date
// signal the flat carried-over run needs, replacing per-day headers.
export function ageChip(dayKey: string, today: string): string {
  if (!dayKey) return ''
  const a = new Date(dayKey + 'T00:00:00').getTime()
  const b = new Date(today + 'T00:00:00').getTime()
  const days = Math.round((b - a) / 86400000)
  if (days <= 0) return 'today'
  return days + 'd'
}

// "oldest from Jul 18" subtitle for the carried-over accordion, from the oldest
// day key present. Empty when nothing is carried.
export function oldestFromLabel(dayKeys: string[]): string {
  const real = dayKeys.filter(Boolean).sort()
  if (!real.length) return ''
  const d = new Date(real[0] + 'T00:00:00')
  return 'oldest from ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
