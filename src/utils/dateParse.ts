// Typed-input parsing for GlassDatePicker (section 16a). The picker's text field
// accepts what a person actually types — "tmrw 6pm", "25/12", "in 3 days",
// "next mon", "18:30" — and this turns it into the app's stored string formats.
//
// Pure and timezone-agnostic: every calculation is done on a caller-supplied
// `now`, so the tests do not depend on the clock and the picker can be driven
// from a specific timezone's "today" rather than the host's.
//
// The rule everywhere: an input that is not confidently understood returns null.
// A date picker that guesses is worse than one that asks again.

export interface ParsedInput {
  // 'YYYY-MM-DD' when a date was understood, else null.
  date: string | null
  // 'HH:mm' when a time was understood, else null.
  time: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')

export function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function hmOf(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + days)
  return out
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function monthIndex(word: string): number {
  const w = word.toLowerCase()
  return MONTHS.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w)))
}
function weekdayIndex(word: string): number {
  const w = word.toLowerCase()
  if (w === 'tues') return 2
  if (w === 'thurs' || w === 'thur') return 4
  return WEEKDAYS.findIndex((d) => d === w || (w.length >= 3 && d.startsWith(w)))
}

// "6pm", "6:30 pm", "18:30", "1830" → 'HH:mm'. Returns null when the fragment is
// not a time at all, so a bare "25" stays a day-of-month rather than an hour.
export function parseTimeFragment(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return null

  const ampm = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(s)
  if (ampm) {
    let hour = Number(ampm[1])
    const min = Number(ampm[2] ?? 0)
    if (hour < 1 || hour > 12 || min > 59) return null
    if (ampm[3] === 'pm' && hour !== 12) hour += 12
    if (ampm[3] === 'am' && hour === 12) hour = 0
    return `${pad(hour)}:${pad(min)}`
  }
  const colon = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (colon) {
    const hour = Number(colon[1])
    const min = Number(colon[2])
    if (hour > 23 || min > 59) return null
    return `${pad(hour)}:${pad(min)}`
  }
  // Bare four digits read as a 24h clock ("1830"); anything shorter is
  // ambiguous with a day number and is left alone.
  const bare = /^(\d{2})(\d{2})$/.exec(s)
  if (bare) {
    const hour = Number(bare[1])
    const min = Number(bare[2])
    if (hour > 23 || min > 59) return null
    return `${pad(hour)}:${pad(min)}`
  }
  return null
}

// Relative and named days. Returns 'YYYY-MM-DD' or null.
export function parseDateFragment(raw: string, now: Date, dayFirst = true): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!s) return null

  if (s === 'today' || s === 'tod') return ymdOf(now)
  if (s === 'tomorrow' || s === 'tmrw' || s === 'tmr' || s === 'tom') return ymdOf(addDays(now, 1))
  if (s === 'yesterday' || s === 'yest') return ymdOf(addDays(now, -1))
  if (s === 'next week') return ymdOf(addDays(now, 7))
  if (s === 'next month') {
    const d = new Date(now)
    d.setMonth(d.getMonth() + 1)
    return ymdOf(d)
  }

  // "in 3 days" / "in 2 weeks" / "in a month"
  const relIn = /^in (\d+|a|an) (day|days|week|weeks|month|months)$/.exec(s)
  if (relIn) {
    const n = relIn[1] === 'a' || relIn[1] === 'an' ? 1 : Number(relIn[1])
    const unit = relIn[2]
    if (unit.startsWith('day')) return ymdOf(addDays(now, n))
    if (unit.startsWith('week')) return ymdOf(addDays(now, n * 7))
    const d = new Date(now)
    d.setMonth(d.getMonth() + n)
    return ymdOf(d)
  }

  // "next monday" / "mon" — the next occurrence strictly after today.
  const nextDow = /^(?:next |this )?([a-z]{3,9})$/.exec(s)
  if (nextDow) {
    const target = weekdayIndex(nextDow[1])
    if (target >= 0) {
      const delta = (target - now.getDay() + 7) % 7 || 7
      return ymdOf(addDays(now, delta))
    }
  }

  // ISO first: unambiguous, so it never goes through the day/month guess.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (iso) return validYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  // "25/12", "25/12/26", "12-25-2026" — separator agnostic. The year is
  // inferred as the next occurrence when omitted, so typing "25/12" in January
  // means this year's December, not last year's.
  const numeric = /^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2}|\d{4}))?$/.exec(s)
  if (numeric) {
    const a = Number(numeric[1])
    const b = Number(numeric[2])
    let day = dayFirst ? a : b
    let month = dayFirst ? b : a
    // A value over 12 in the month slot can only be a day, whichever order the
    // locale prefers.
    if (month > 12 && day <= 12) [day, month] = [month, day]
    let year = now.getFullYear()
    if (numeric[3]) {
      const y = Number(numeric[3])
      year = numeric[3].length === 2 ? 2000 + y : y
    }
    return validYmd(year, month, day)
  }

  // "dec 25" / "25 dec" / "25 december 2026"
  const words = s.split(' ')
  if (words.length >= 2 && words.length <= 3) {
    const asMonthFirst = monthIndex(words[0])
    const asDayFirst = monthIndex(words[1])
    if (asMonthFirst >= 0 && /^\d{1,2}$/.test(words[1])) {
      const year = words[2] ? Number(words[2]) : now.getFullYear()
      return validYmd(year, asMonthFirst + 1, Number(words[1]))
    }
    if (asDayFirst >= 0 && /^\d{1,2}$/.test(words[0])) {
      const year = words[2] ? Number(words[2]) : now.getFullYear()
      return validYmd(year, asDayFirst + 1, Number(words[0]))
    }
  }

  return null
}

// Rejects impossible dates (31 February) rather than letting Date roll them over
// into the next month.
function validYmd(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return ymdOf(d)
}

// The whole input: an optional date fragment and an optional time fragment, in
// either order. "tmrw 6pm", "6pm tomorrow", "25/12 18:30", "6pm" all parse.
export function parseTypedInput(raw: string, now: Date = new Date()): ParsedInput | null {
  const input = (raw || '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!input) return null

  // Whole-string attempts first, so "next week" is not split into fragments.
  const wholeDate = parseDateFragment(input, now)
  if (wholeDate) return { date: wholeDate, time: null }
  const wholeTime = parseTimeFragment(input)
  if (wholeTime) return { date: null, time: wholeTime }

  // Otherwise split at each boundary and take the first split where both halves
  // parse — one as a date, the other as a time, in whichever order they came.
  const parts = input.split(' ')
  for (let i = 1; i < parts.length; i++) {
    const left = parts.slice(0, i).join(' ')
    const right = parts.slice(i).join(' ')
    const leftDate = parseDateFragment(left, now)
    const rightTime = parseTimeFragment(right)
    if (leftDate && rightTime) return { date: leftDate, time: rightTime }
    const leftTime = parseTimeFragment(left)
    const rightDate = parseDateFragment(right, now)
    if (leftTime && rightDate) return { date: rightDate, time: leftTime }
  }
  return null
}
