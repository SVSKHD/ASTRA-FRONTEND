// Every number and date this feature puts on a screen (section 36).
//
// One file, because the alternative is what was here before: `toFixed(2)` in a
// component, `signed2` in a utils module, an hour padded by hand in a third
// place, and three subtly different answers to "what does zero look like".
// Formatting is where a codebase leaks inconsistency fastest, and it is the
// cheapest thing to centralise, because none of it has state.
//
// The dividing line with `tradeMath` is arithmetic versus appearance: rounding
// a figure is arithmetic and lives there, rendering it with a sign, a unit or a
// dash lives here. Nothing in this file computes anything that is stored.

import { round2 } from '@/utils/tradeMath'

/** Two decimals, always, so a column of figures is a column. */
export function fmt2(value: number): string {
  return round2(value).toFixed(2)
}

/**
 * A figure whose SIGN is the information — a move, a P/L, a net.
 *
 * `-0.00` is the same number as zero and reads as a loss, so it is normalised
 * here rather than at every call site. The minus is U+2212, which lines up with
 * the plus in a tabular font; a hyphen does not.
 */
export function signed2(value: number): string {
  const rounded = round2(value)
  if (rounded === 0) return '0.00'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(2)}`
}

/** A size, never a direction: an expense, a budget, a lot. Never signed. */
export function amount2(value: number): string {
  return fmt2(Math.abs(value))
}

/** A percentage, two decimals, with the sign left off — a rate has no side. */
export function pct2(value: number): string {
  return `${fmt2(value)}%`
}

/** A count with its noun, pluralised. `1 trade`, `4 trades`, `0 trades`. */
export function countOf(n: number, noun: string, plural = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : plural}`
}

/** Minutes east of UTC, the way a broker quotes an offset: `+03:00`. */
export function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+'
  const abs = Math.abs(minutes)
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 'HH:mm' from minutes past midnight, wrapping the day rather than overflowing. */
export function hhmm(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`
}

/** The pair the trade log reads two clocks with: `IST 19:42 · Broker 17:12`. */
export function clockPair(ist: string, broker: string): string {
  return `IST ${ist} · Broker ${broker}`
}

/** A value that has not been recorded. One dash, everywhere, never an empty cell. */
export const DASH = '—'

export function orDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return DASH
  return String(value)
}

/** 'YYYY-MM' as a month a person would say. */
export function monthName(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** 'YYYY-MM-DD' as a short day: `4 Sep`, with the year only when it differs. */
export function dayLabel(ymd: string, today = new Date()): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: y === today.getFullYear() ? undefined : 'numeric',
    timeZone: 'UTC',
  })
}
