// The small conversions the detail bodies need (section 18c/18d), kept out of
// the components so they can be checked directly: epoch milliseconds to and from
// the picker's local string, minutes to and from something a person types, and
// timestamps to something a person reads.

import { STATUS_LABEL, type ItemStatus } from '@/types'

const pad = (n: number) => String(n).padStart(2, '0')

// Epoch ms → the 'YYYY-MM-DDTHH:mm' shape GlassDatePicker speaks, in LOCAL time.
// Deliberately not toISOString(): that is UTC, and a task scheduled for 9am
// would show as 9am only for readers on the prime meridian.
export function toLocalInput(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return ''
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// The inverse. An unparseable or empty value is null — "no time" rather than an
// invented one.
export function fromLocalInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec((value || '').trim())
  if (!match) return null
  const [, y, mo, d, h, mi] = match
  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)
  const hour = Number(h ?? 0)
  const minute = Number(mi ?? 0)
  // The Date constructor rolls out-of-range parts over rather than rejecting
  // them — month 13 becomes January of the next year — so the range is checked
  // here. A garbled value must read as "no time", never as a different one.
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null
  const date = new Date(year, month - 1, day, hour, minute, 0, 0)
  // Catches the last case the range check cannot: the 31st of a 30-day month.
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

// --- durations --------------------------------------------------------------
// Minutes as something readable: 0m, 45m, 2h, 2h 30m.
export function formatMinutes(minutes: number | null | undefined): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return '0m'
  const whole = Math.round(minutes)
  const h = Math.floor(whole / 60)
  const m = whole % 60
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

// Whatever the reader typed as minutes: '90', '1h30', '1h 30m', '2h', '45m'.
// Returns null for empty (no estimate) and for anything it cannot make sense of,
// which leaves the stored value alone rather than zeroing it.
export function parseMinutes(text: string): number | null {
  const value = (text || '').trim().toLowerCase()
  if (!value) return null
  // Bare number = minutes, the shape most people type.
  if (/^\d+(\.\d+)?$/.test(value)) return Math.max(0, Math.round(Number(value)))
  const match = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m?)?$/.exec(value)
  if (!match || (!match[1] && !match[2])) return null
  const hours = match[1] ? Number(match[1]) : 0
  const mins = match[2] ? Number(match[2]) : 0
  return Math.max(0, Math.round(hours * 60 + mins))
}

// --- timestamps -------------------------------------------------------------
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// A stamp for the activity section. Recent times are relative because that is
// what "when did this change" actually asks; older ones become a date, because
// "412 days ago" is not an answer anybody wanted.
export function relativeStamp(at: number | null | undefined, now = Date.now()): string {
  if (typeof at !== 'number' || at <= 0) return 'Unknown'
  const delta = now - at
  if (delta < 0)
    return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  if (delta < MINUTE) return 'just now'
  if (delta < HOUR) {
    const m = Math.floor(delta / MINUTE)
    return `${m} minute${m === 1 ? '' : 's'} ago`
  }
  if (delta < DAY) {
    const h = Math.floor(delta / HOUR)
    return `${h} hour${h === 1 ? '' : 's'} ago`
  }
  if (delta < 7 * DAY) {
    const d = Math.floor(delta / DAY)
    return `${d} day${d === 1 ? '' : 's'} ago`
  }
  return new Date(at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// --- deadlines --------------------------------------------------------------
export interface DaysChip {
  text: string
  tone: 'overdue' | 'today' | 'ahead'
}

// Days remaining against a YYYY-MM-DD target, as the chip both bodies show.
// Compared date-to-date rather than instant-to-instant: a target of today is
// "today" all day, not "overdue" from one minute past midnight.
export function daysRemaining(target: string, now = new Date()): DaysChip | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target || '')) return null
  const due = new Date(`${target}T00:00:00`)
  if (Number.isNaN(due.getTime())) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((due.getTime() - today.getTime()) / DAY)
  if (days < 0) return { text: `${-days} day${days === -1 ? '' : 's'} overdue`, tone: 'overdue' }
  if (days === 0) return { text: 'due today', tone: 'today' }
  return { text: `${days} day${days === 1 ? '' : 's'} left`, tone: 'ahead' }
}

// --- status history ---------------------------------------------------------
// A status that is no longer part of the cycle can still be sitting in a stored
// history, so this falls back to the raw value rather than rendering nothing.
export function statusWord(status: ItemStatus | string): string {
  return STATUS_LABEL[status as ItemStatus] ?? String(status)
}
