// Pure date logic for recurring goals (task 11). A goal's recurrence config drives
// which local dates it fires on; occurrence docs are keyed by the local date
// string (yyyy-mm-dd) so generation is idempotent across devices. Everything here
// works on date strings via UTC math so it is DST- and timezone-agnostic and
// fully unit-testable — the store snapshots the timezone at creation and passes
// the local "today" string in, this module never reads the clock.

export type RecurrenceFreq = 'daily' | 'weekdays' | 'weekly' | 'custom'

export interface Recurrence {
  enabled: boolean
  freq: RecurrenceFreq
  daysOfWeek: number[] // 0=Sun … 6=Sat, for weekly/custom
  timeOfDay: string // 'HH:mm', user's local time
  timezone: string // IANA, captured at creation
  startDate: string // yyyy-mm-dd
  endDate: string | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isDateStr(s: unknown): s is string {
  return typeof s === 'string' && DATE_RE.test(s)
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
    default:
      return false
  }
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
