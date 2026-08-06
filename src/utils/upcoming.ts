// Fire-time windowing and countdown formatting for reminders — the pure core
// behind the "Up next" band, the Overview tile and the todo bell chip. Kept
// framework-free so a single interval in one composable can call it rather than
// each card computing its own clock.

import { occurrences } from '@/utils/reminders'
import type { Reminder } from '@/types'

export const HOUR_MS = 3600000
export const DAY_MS = 86400000
export const SOON_MS = 15 * 60000 // "under 15 minutes" — the pulse threshold.

// One reminder as it appears in the Up next window: the occurrence we are
// counting to (or from, when overdue), and how far off it is.
export interface UpcomingReminder {
  reminder: Reminder
  fireAt: number // the occurrence time in ms
  ms: number // fireAt - now (negative = already fired)
  overdue: boolean // fired, in the past, and not yet acknowledged
}

// Has this reminder's occurrence at `at` already been acknowledged? A repeat is
// re-armed each occurrence, so an acknowledge only silences fires up to its own
// timestamp — a later occurrence is due again.
function acknowledgedFor(r: Reminder, at: number): boolean {
  return r.acknowledgedAt != null && r.acknowledgedAt >= at
}

// The single occurrence a reminder should surface right now, if any: an overdue
// unacknowledged fire takes precedence over the next upcoming one, so a missed
// reminder stays pinned instead of being replaced by its own next occurrence.
export function relevantOccurrence(
  r: Reminder,
  now: number,
): { fireAt: number; overdue: boolean } | null {
  if (r.cancelledAt != null) return null
  const occ = occurrences(r, now)
  if (occ.last != null && !acknowledgedFor(r, occ.last)) {
    return { fireAt: occ.last, overdue: true }
  }
  if (occ.next != null) return { fireAt: occ.next, overdue: false }
  return null
}

export interface UpcomingOptions {
  withinMs?: number // upcoming horizon (default 24h)
  limit?: number // cap on upcoming (overdue are always kept); default 3
}

// Reminders to show in the Up next band, ordered oldest-first (overdue negatives
// lead). Overdue-unacknowledged reminders are always included regardless of the
// horizon; upcoming ones are those firing within `withinMs`, capped at `limit`.
export function upcomingReminders(
  reminders: readonly Reminder[],
  now: number,
  opts: UpcomingOptions = {},
): UpcomingReminder[] {
  const withinMs = opts.withinMs ?? DAY_MS
  const limit = opts.limit ?? 3
  const overdue: UpcomingReminder[] = []
  const upcoming: UpcomingReminder[] = []
  for (const r of reminders) {
    const rel = relevantOccurrence(r, now)
    if (!rel) continue
    const entry: UpcomingReminder = {
      reminder: r,
      fireAt: rel.fireAt,
      ms: rel.fireAt - now,
      overdue: rel.overdue,
    }
    if (rel.overdue) overdue.push(entry)
    else if (entry.ms <= withinMs) upcoming.push(entry)
  }
  overdue.sort((a, b) => a.fireAt - b.fireAt)
  upcoming.sort((a, b) => a.fireAt - b.fireAt)
  return [...overdue, ...upcoming.slice(0, Math.max(0, limit))]
}

// The soonest fire strictly beyond the window — powers the empty state's muted
// "next one is <date>" hint when nothing is due in the next 24h.
export function nextBeyondWindow(
  reminders: readonly Reminder[],
  now: number,
  withinMs = DAY_MS,
): number | null {
  let soonest: number | null = null
  for (const r of reminders) {
    if (r.cancelledAt != null) continue
    const occ = occurrences(r, now)
    if (occ.next == null) continue
    if (occ.next - now <= withinMs) continue
    if (soonest == null || occ.next < soonest) soonest = occ.next
  }
  return soonest
}

// The big live countdown shown on a card. Under an hour it reads MM:SS (and the
// caller ticks every second); above that it coarsens to H/M then D/H, where a
// per-second tick would be wasted motion.
export function countdownClock(ms: number): string {
  if (ms <= 0) return '0:00'
  const totalSec = Math.floor(ms / 1000)
  if (ms < HOUR_MS) {
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return m + ':' + String(s).padStart(2, '0')
  }
  if (ms < DAY_MS) {
    const h = Math.floor(ms / HOUR_MS)
    const m = Math.floor((ms % HOUR_MS) / 60000)
    return h + 'h ' + m + 'm'
  }
  const d = Math.floor(ms / DAY_MS)
  const h = Math.floor((ms % DAY_MS) / HOUR_MS)
  return d + 'd ' + h + 'h'
}

// True when the card should tick every second rather than every minute: only
// meaningful for a countdown under an hour out.
export function ticksBySecond(ms: number): boolean {
  return ms > 0 && ms < HOUR_MS
}

// A coarse relative label for chips and overdue cards: "in 3h", "in 40m",
// "3h ago", "now". Never seconds — chips are glanced at, not watched.
export function relLabel(ms: number): string {
  const abs = Math.abs(ms)
  const suffix = ms < 0 ? ' ago' : ''
  const prefix = ms < 0 ? '' : 'in '
  if (abs < 60000) return ms < 0 ? 'just now' : 'now'
  if (abs < HOUR_MS) return prefix + Math.round(abs / 60000) + 'm' + suffix
  if (abs < DAY_MS) return prefix + Math.round(abs / HOUR_MS) + 'h' + suffix
  return prefix + Math.round(abs / DAY_MS) + 'd' + suffix
}

// The bell-chip label on a todo/task row: the soonest not-yet-cancelled reminder
// among `ids`, as a coarse "in 3h". Null when none are pending in the future.
export function bellChipLabel(
  reminders: readonly Reminder[],
  ids: number[],
  now: number,
): string | null {
  const soonest = soonestFireAmong(reminders, ids, now)
  return soonest == null ? null : relLabel(soonest - now)
}

// The soonest upcoming (or overdue-unacknowledged) fire time among `ids`.
export function soonestFireAmong(
  reminders: readonly Reminder[],
  ids: number[],
  now: number,
): number | null {
  if (!ids.length) return null
  const set = new Set(ids)
  let soonest: number | null = null
  for (const r of reminders) {
    if (!set.has(r.id)) continue
    const rel = relevantOccurrence(r, now)
    if (!rel) continue
    if (soonest == null || rel.fireAt < soonest) soonest = rel.fireAt
  }
  return soonest
}
