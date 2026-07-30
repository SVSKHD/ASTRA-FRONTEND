// Monthly fulfilment maths for the Overview tab. Pure and month-keyed so the
// selector, the four cards and the comparison row all derive from one function,
// and so it is testable without a store. Everything is in-memory over the
// workspace arrays (this app has no per-item Firestore docs to query).
//
// Fulfilled counts use completion timestamps (completedAt / acknowledgedAt), so
// a rolled-over item counts in the month it was actually completed. The
// denominator is "due in the month" ∪ "completed in the month", which keeps
// done ⊆ total and never leaves a completed item uncounted.

import { monthKeyOf, resolveIncome } from '@/utils/budget'
import type { Finance, FinanceSettings, Reminder, Task, Todo } from '@/types'

export interface Bucket {
  done: number
  total: number
}
export interface MonthlyOverview {
  tasks: Bucket
  todos: Bucket
  reminders: Bucket
  finance: { spent: number; income: number }
}

export interface OverviewInput {
  todos: Todo[]
  tasks: Task[]
  reminders: Reminder[]
  finances: Finance[]
  settings: FinanceSettings
}

// Month key ('YYYY-MM') of a numeric timestamp, or '' for the 0/unknown stamp.
function msMonth(ms: number | null | undefined): string {
  return typeof ms === 'number' && ms > 0 ? monthKeyOf(new Date(ms)) : ''
}
// Month key of a stored date/datetime string ('YYYY-MM-DD' or '…THH:mm').
function strMonth(s: string | null | undefined): string {
  return typeof s === 'string' && s.length >= 7 ? s.slice(0, 7) : ''
}

// done = completed this month; total = due this month OR completed this month.
function bucket<T>(
  items: T[],
  isDone: (it: T) => boolean,
  completedMonth: (it: T) => string,
  dueMonth: (it: T) => string,
  monthKey: string,
): Bucket {
  let done = 0
  let total = 0
  for (const it of items) {
    const completedHere = completedMonth(it) === monthKey && isDone(it)
    const dueHere = dueMonth(it) === monthKey
    if (completedHere) done++
    if (dueHere || completedHere) total++
  }
  return { done, total }
}

export function computeMonthlyOverview(input: OverviewInput, monthKey: string): MonthlyOverview {
  const tasks = bucket(
    input.tasks,
    (t) => t.status === 'done',
    (t) => msMonth(t.completedAt),
    (t) => strMonth(t.deadline),
    monthKey,
  )
  // Todos have no due date — their day is createdAt.
  const todos = bucket(
    input.todos,
    (t) => t.status === 'done',
    (t) => msMonth(t.completedAt),
    (t) => msMonth(t.createdAt),
    monthKey,
  )
  // Reminders: fulfilled = acknowledged this month; scheduled = `start`.
  const reminders = bucket(
    input.reminders,
    (r) => typeof r.acknowledgedAt === 'number' && r.acknowledgedAt > 0,
    (r) => msMonth(r.acknowledgedAt),
    (r) => strMonth(r.start),
    monthKey,
  )
  let spent = 0
  for (const f of input.finances) {
    if (strMonth(f.date) === monthKey) spent += Number.isFinite(f.amount) ? f.amount : 0
  }
  return {
    tasks,
    todos,
    reminders,
    finance: { spent, income: resolveIncome(input.settings, monthKey) },
  }
}

// Fulfilment percentage for a bucket (0 when nothing was due/done).
export function bucketPct(b: Bucket): number {
  return b.total > 0 ? Math.round((b.done / b.total) * 100) : 0
}
