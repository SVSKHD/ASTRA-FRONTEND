// Milestone progress, state and closure (Learning & Goals spec, sections 4–5).
//
// Every percentage the milestone surfaces show comes from here, so a point, its
// milestone and its goal can never disagree about how far along they are.
//
// THE UNIT OF PROGRESS is a subtask. A point with subtasks counts each of them;
// a point without any counts as one unit of its own — the shape every point had
// before subtasks existed, so old milestones keep the progress they showed.
// A milestone with no units at all is 0% and can never be closed.
//
// CLOSING is separate from ticking. 100% means every unit is checked; the
// milestone is "completed" only once its conclusion is recorded and confirmed.
import type { Goal, GoalChecklistItem, MilestoneConclusion } from '@/types'

export interface Progress {
  done: number
  total: number
  /** 0..1; 0 when there is nothing to count. */
  ratio: number
}

const progress = (done: number, total: number): Progress => ({
  done,
  total,
  ratio: total ? done / total : 0,
})

/** A point's own units: its subtasks, or itself when it has none. */
export function pointProgress(point: Pick<GoalChecklistItem, 'done' | 'subtasks'>): Progress {
  const subs = point.subtasks ?? []
  if (!subs.length) return progress(point.done ? 1 : 0, 1)
  return progress(subs.filter((s) => s.completed).length, subs.length)
}

/** A point is complete only when it has units and all of them are checked. */
export function pointComplete(point: Pick<GoalChecklistItem, 'done' | 'subtasks'>): boolean {
  const p = pointProgress(point)
  return p.total > 0 && p.done === p.total
}

/** Every unit across the points, summed — not an average of point percentages. */
export function milestoneProgress(
  points: readonly Pick<GoalChecklistItem, 'done' | 'subtasks'>[],
): Progress {
  let done = 0
  let total = 0
  for (const point of points) {
    const p = pointProgress(point)
    done += p.done
    total += p.total
  }
  return progress(done, total)
}

/** A goal's progress, weighted by its milestones' actual unit counts. */
export function weightedProgress(parts: readonly Progress[]): Progress {
  return progress(
    parts.reduce((n, p) => n + p.done, 0),
    parts.reduce((n, p) => n + p.total, 0),
  )
}

/**
 * Closed means a confirmed conclusion. A milestone marked done before
 * conclusions existed has none, and keeps reading as closed by its status.
 */
export function isClosed(goal: Pick<Goal, 'conclusion' | 'status'>): boolean {
  return goal.conclusion ? goal.conclusion.status === 'completed' : goal.status === 'done'
}

export type MilestoneState = 'not_started' | 'in_progress' | 'completed' | 'overdue'

/**
 * What the milestone shows. Overdue is derived: the deadline has passed and it
 * is not closed. `today` is the user's local YYYY-MM-DD.
 */
export function milestoneState(
  goal: Pick<Goal, 'conclusion' | 'targetDate' | 'status'>,
  p: Progress,
  today: string,
): MilestoneState {
  if (isClosed(goal)) return 'completed'
  if (goal.targetDate && goal.targetDate < today) return 'overdue'
  return p.done > 0 ? 'in_progress' : 'not_started'
}

export const STATE_LABEL: Record<MilestoneState, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  overdue: 'Overdue',
}

// Calendar days at local midnight, so a DST shift never makes a day 23 hours.
function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** Inclusive calendar days: Oct 1 → Oct 21 is 21 days. Null without both dates. */
export function durationDays(start: string, deadline: string): number | null {
  if (!start || !deadline) return null
  const days = dayNumber(deadline) - dayNumber(start) + 1
  return days > 0 ? days : null
}

/** The deadline an inclusive duration gives from a start date. */
export function deadlineFrom(start: string, days: number): string {
  const t = new Date((dayNumber(start) + days - 1) * 86_400_000)
  return t.toISOString().slice(0, 10)
}

/** "12 days left", "Due today", "3 days overdue"; null without a deadline. */
export function deadlineLabel(deadline: string, today: string): string | null {
  if (!deadline) return null
  const diff = dayNumber(deadline) - dayNumber(today)
  if (diff === 0) return 'Due today'
  if (diff > 0) return `${diff} day${diff === 1 ? '' : 's'} left`
  return `${-diff} day${diff === -1 ? '' : 's'} overdue`
}

export function emptyConclusion(): MilestoneConclusion {
  return { status: 'pending', summary: '', evidence: [], acceptance: [], closedAt: null }
}

/**
 * Why Close is not available yet, in the order a reader would fix them. An
 * empty list means it can close. The store checks again before closing.
 */
export function closeBlockers(p: Progress, conclusion: MilestoneConclusion | undefined): string[] {
  const c = conclusion ?? emptyConclusion()
  const out: string[] = []
  if (p.total === 0) out.push('Add at least one point or subtask')
  else if (p.done < p.total) out.push(`${p.total - p.done} of ${p.total} still unchecked`)
  if (!c.summary.trim()) out.push('Write a conclusion summary')
  if (c.evidenceRequired && !c.evidence.some((e) => e.trim())) out.push('Add evidence')
  const open = c.acceptance.filter((a) => !a.checked).length
  if (open) out.push(`Confirm ${open} acceptance check${open === 1 ? '' : 's'}`)
  return out
}

/** ISO 8601 with the local offset ("2026-10-27T14:05:00+05:30"). */
export function isoWithOffset(at: Date = new Date()): string {
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, '0')
  const off = -at.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}` +
    `${sign}${pad(off / 60)}:${pad(off % 60)}`
  )
}
