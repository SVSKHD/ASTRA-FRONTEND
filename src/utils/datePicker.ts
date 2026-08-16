// The headless half of GlassDatePicker (section 16a): value shapes, the month
// grid, keyboard navigation, disabled-date rules, presets and time steps.
//
// Values are the strings this app already stores, so the picker is a drop-in for
// the native inputs it replaces:
//   date      'YYYY-MM-DD'
//   datetime  'YYYY-MM-DDTHH:mm'   (the datetime-local shape)
//   time      'HH:mm'
//   month     'YYYY-MM'
//   range     { start, end } of 'YYYY-MM-DD'
//
// Everything here is pure: the component owns state and focus, this owns the
// arithmetic, and the tests exercise the arithmetic without a DOM.

import { ymdOf } from '@/utils/dateParse'

export type PickerMode = 'date' | 'datetime' | 'time' | 'range' | 'month'

export interface DateRange {
  start: string | null
  end: string | null
}

export interface DisabledRules {
  // Inclusive bounds, as 'YYYY-MM-DD'.
  min?: string | null
  max?: string | null
  // Individual blocked days.
  disabledDates?: string[]
}

const pad = (n: number) => String(n).padStart(2, '0')

export function toDate(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '')
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

export function addDays(ymd: string, days: number): string {
  const d = toDate(ymd)
  if (!d) return ymd
  d.setDate(d.getDate() + days)
  return ymdOf(d)
}

export function addMonths(ymd: string, months: number): string {
  const d = toDate(ymd)
  if (!d) return ymd
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  // Clamp into the target month rather than rolling over: 31 Jan + 1 month is
  // the last day of February, not the 2nd or 3rd of March.
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return ymdOf(d)
}

// ---- value shapes -----------------------------------------------------------

export interface SplitValue {
  date: string | null
  time: string | null
}

export function splitValue(mode: PickerMode, value: string | null | undefined): SplitValue {
  const raw = (value || '').trim()
  if (!raw) return { date: null, time: null }
  if (mode === 'time') return { date: null, time: /^\d{2}:\d{2}$/.test(raw) ? raw : null }
  if (mode === 'month') return { date: /^\d{4}-\d{2}$/.test(raw) ? `${raw}-01` : null, time: null }
  const [datePart, timePart] = raw.split('T')
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null,
    time: timePart && /^\d{2}:\d{2}/.test(timePart) ? timePart.slice(0, 5) : null,
  }
}

export function joinValue(mode: PickerMode, date: string | null, time: string | null): string {
  if (mode === 'time') return time || ''
  if (!date) return ''
  if (mode === 'month') return date.slice(0, 7)
  if (mode === 'datetime') return `${date}T${time || '09:00'}`
  return date
}

// ---- the grid ---------------------------------------------------------------

export interface DayCell {
  ymd: string
  day: number
  inMonth: boolean
  isToday: boolean
  weekend: boolean
}

// Six weeks always, so the grid never changes height as months are paged and
// nothing below it jumps.
export function monthMatrix(
  anchor: string,
  firstDayOfWeek = 1,
  today = ymdOf(new Date()),
): DayCell[][] {
  const base = toDate(anchor) ?? new Date()
  const year = base.getFullYear()
  const month = base.getMonth()
  const first = new Date(year, month, 1)
  const lead = (first.getDay() - firstDayOfWeek + 7) % 7
  const start = new Date(year, month, 1 - lead)

  const weeks: DayCell[][] = []
  for (let w = 0; w < 6; w++) {
    const row: DayCell[] = []
    for (let d = 0; d < 7; d++) {
      const cur = new Date(start)
      cur.setDate(start.getDate() + w * 7 + d)
      const ymd = ymdOf(cur)
      row.push({
        ymd,
        day: cur.getDate(),
        inMonth: cur.getMonth() === month,
        isToday: ymd === today,
        weekend: cur.getDay() === 0 || cur.getDay() === 6,
      })
    }
    weeks.push(row)
  }
  return weeks
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function weekdayLabels(firstDayOfWeek = 1): string[] {
  return Array.from({ length: 7 }, (_, i) => WEEKDAY_SHORT[(firstDayOfWeek + i) % 7])
}

export function monthLabel(anchor: string): string {
  const d = toDate(anchor)
  if (!d) return ''
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

// ---- keyboard navigation ----------------------------------------------------

// The arrow/page/home/end contract, as one function so the component's key
// handler is a lookup rather than a pile of branches.
export function shiftFocus(ymd: string, key: string, firstDayOfWeek = 1): string {
  switch (key) {
    case 'ArrowLeft':
      return addDays(ymd, -1)
    case 'ArrowRight':
      return addDays(ymd, 1)
    case 'ArrowUp':
      return addDays(ymd, -7)
    case 'ArrowDown':
      return addDays(ymd, 7)
    case 'PageUp':
      return addMonths(ymd, -1)
    case 'PageDown':
      return addMonths(ymd, 1)
    case 'Home': {
      const d = toDate(ymd)
      if (!d) return ymd
      return addDays(ymd, -((d.getDay() - firstDayOfWeek + 7) % 7))
    }
    case 'End': {
      const d = toDate(ymd)
      if (!d) return ymd
      return addDays(ymd, 6 - ((d.getDay() - firstDayOfWeek + 7) % 7))
    }
    default:
      return ymd
  }
}

// ---- availability -----------------------------------------------------------

export function isDateDisabled(ymd: string, rules: DisabledRules = {}): boolean {
  if (rules.min && ymd < rules.min) return true
  if (rules.max && ymd > rules.max) return true
  return !!rules.disabledDates?.includes(ymd)
}

// Move a candidate inside the allowed bounds — used when the picker opens on a
// date the caller has since disallowed.
export function clampDate(ymd: string, rules: DisabledRules = {}): string {
  if (rules.min && ymd < rules.min) return rules.min
  if (rules.max && ymd > rules.max) return rules.max
  return ymd
}

// Step forward until an allowed day is found, giving up after a bounded search
// so a fully-disabled calendar cannot spin.
export function nextEnabled(
  ymd: string,
  step: number,
  rules: DisabledRules = {},
  limit = 366,
): string | null {
  let cursor = ymd
  for (let i = 0; i < limit; i++) {
    if (!isDateDisabled(cursor, rules)) return cursor
    cursor = addDays(cursor, step)
  }
  return null
}

// ---- presets and time steps -------------------------------------------------

export interface Preset {
  label: string
  // null clears the value ("No date").
  ymd: string | null
}

export function presets(now: Date = new Date()): Preset[] {
  const today = ymdOf(now)
  return [
    { label: 'Today', ymd: today },
    { label: 'Tomorrow', ymd: addDays(today, 1) },
    { label: 'Next week', ymd: addDays(today, 7) },
    { label: 'No date', ymd: null },
  ]
}

// Quarter-hour steps for the time column; free entry handles everything between.
export function timeOptions(stepMinutes = 15): string[] {
  const out: string[] = []
  for (let m = 0; m < 24 * 60; m += Math.max(1, stepMinutes)) {
    out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`)
  }
  return out
}

// The nearest step at or after a time, so opening the column scrolls to
// something sensible rather than to midnight.
export function nearestTimeOption(time: string | null, stepMinutes = 15): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time || '')
  if (!m) return '09:00'
  const total = Number(m[1]) * 60 + Number(m[2])
  const snapped = Math.round(total / stepMinutes) * stepMinutes
  const capped = Math.min(snapped, 24 * 60 - stepMinutes)
  return `${pad(Math.floor(capped / 60))}:${pad(capped % 60)}`
}

// ---- ranges -----------------------------------------------------------------

// A range is stored start-first however it was clicked.
export function normalizeRange(range: DateRange): DateRange {
  const { start, end } = range
  if (start && end && end < start) return { start: end, end: start }
  return range
}

export function rangeContains(range: DateRange, ymd: string): boolean {
  const { start, end } = normalizeRange(range)
  if (!start || !end) return false
  return ymd >= start && ymd <= end
}

// Clicking within a range restarts it; that is what makes a second click feel
// like "and to here" rather than an unexplained jump.
export function nextRange(range: DateRange, ymd: string): DateRange {
  if (!range.start || (range.start && range.end)) return { start: ymd, end: null }
  return normalizeRange({ start: range.start, end: ymd })
}

// ---- display ----------------------------------------------------------------

// What the trigger shows. Deliberately locale-formatted: the stored value is
// ISO, the human sees their own format.
export function formatDisplay(mode: PickerMode, value: string | DateRange | null): string {
  if (mode === 'range') {
    const range = normalizeRange((value as DateRange) ?? { start: null, end: null })
    if (!range.start) return ''
    const from = formatDisplay('date', range.start)
    return range.end ? `${from} – ${formatDisplay('date', range.end)}` : from
  }
  const raw = (value as string) || ''
  if (!raw) return ''
  if (mode === 'time') return raw
  const { date, time } = splitValue(mode, raw)
  if (!date) return ''
  const d = toDate(date)
  if (!d) return ''
  if (mode === 'month') return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const datePart = d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
  return mode === 'datetime' && time ? `${datePart}, ${time}` : datePart
}

// The aria-live sentence announced as focus moves across the grid.
export function announce(ymd: string, disabled: boolean): string {
  const d = toDate(ymd)
  if (!d) return ''
  const label = d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return disabled ? `${label}, unavailable` : label
}
