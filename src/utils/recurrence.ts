// Pure date logic for recurring goals (task 11). A goal's recurrence config drives
// which local dates it fires on; occurrence docs are keyed by the local date
// string (yyyy-mm-dd) so generation is idempotent across devices. Everything here
// works on date strings via UTC math so it is DST- and timezone-agnostic and
// fully unit-testable — the store snapshots the timezone at creation and passes
// the local "today" string in, this module never reads the clock.

export type RecurrenceFreq = 'daily' | 'weekdays' | 'weekly' | 'custom' | 'monthly'

export interface Recurrence {
  enabled: boolean
  freq: RecurrenceFreq
  daysOfWeek: number[] // 0=Sun … 6=Sat, for weekly/custom
  timeOfDay: string // 'HH:mm', user's local time
  timezone: string // IANA, captured at creation
  startDate: string // yyyy-mm-dd
  endDate: string | null
  /**
   * For 'monthly': the day of the month it fires on, 1–31. Added for recurring
   * transactions (section 27b), where rent-on-the-5th is the shape almost every
   * recurring money item takes and no weekly rule can express it.
   *
   * A value past the end of a short month CLAMPS to the last day rather than
   * skipping: a rent due on the 31st is due in February, and a rule that
   * silently misses February is worse than one that fires on the 28th.
   */
  dayOfMonth?: number
  // Second "still pending?" nudge time (HH:mm). null = no end-of-day nudge.
  endOfDayNudge?: string | null
}

// Day of week (0=Sun … 6=Sat) for a yyyy-mm-dd string, computed from the calendar
// components alone (UTC epoch) so it never shifts with the host timezone.
export function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

// Add n whole days to a yyyy-mm-dd string (n may be negative). UTC math avoids any
// DST hour drift, since we only ever care about the calendar date.
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + n * 86400000
  const dt = new Date(t)
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${mm}-${dd}`
}

// Whether the recurrence fires on a given local date (inside its start/end window
// and matching its frequency).
export function isRecurrenceDay(rec: Recurrence, dateStr: string): boolean {
  if (!rec.enabled) return false
  if (rec.startDate && dateStr < rec.startDate) return false
  if (rec.endDate && dateStr > rec.endDate) return false
  const dow = dayOfWeek(dateStr)
  switch (rec.freq) {
    case 'daily':
      return true
    case 'weekdays':
      return dow >= 1 && dow <= 5
    case 'weekly':
    case 'custom':
      return rec.daysOfWeek.includes(dow)
    case 'monthly':
      return dayOfMonth(dateStr) === clampedMonthDay(rec.dayOfMonth ?? 1, dateStr)
    default:
      return false
  }
}

export function dayOfMonth(dateStr: string): number {
  return Number(dateStr.slice(8, 10))
}

/** Days in the month `dateStr` falls in — day 0 of the next month is this one's last. */
export function daysInMonth(dateStr: string): number {
  const [y, m] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * The requested day of the month, pulled back to the last day when the month is
 * too short. The 31st in February is the 28th (or the 29th), not nothing.
 */
export function clampedMonthDay(wanted: number, dateStr: string): number {
  const last = daysInMonth(dateStr)
  return Math.min(Math.max(1, Math.trunc(wanted)), last)
}

// Every firing date in [fromStr, toStr] inclusive. Used to lazily materialise
// occurrences for today + a short horizon (never the whole year).
export function occurrenceDatesInRange(rec: Recurrence, fromStr: string, toStr: string): string[] {
  const out: string[] = []
  if (toStr < fromStr) return out
  // Guard against a pathological range blowing up (config can't produce more than
  // ~a couple years of horizon in practice; cap for safety).
  let cursor = fromStr
  let guard = 0
  while (cursor <= toStr && guard < 3660) {
    if (isRecurrenceDay(rec, cursor)) out.push(cursor)
    cursor = addDays(cursor, 1)
    guard++
  }
  return out
}

// The horizon the generator ensures exists: today through today+horizonDays.
export function horizonDates(rec: Recurrence, todayStr: string, horizonDays = 7): string[] {
  return occurrenceDatesInRange(rec, todayStr, addDays(todayStr, horizonDays))
}

// The local date string (yyyy-mm-dd) for an instant in a given IANA timezone.
// Falls back to the host-local date if the timezone is unknown/unsupported.
export function localDateInTz(epochMs: number, timezone: string): string {
  try {
    // en-CA yields yyyy-mm-dd; the timeZone option does the tz conversion.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(epochMs))
  } catch {
    const d = new Date(epochMs)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${mm}-${dd}`
  }
}
