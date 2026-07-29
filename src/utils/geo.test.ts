import { describe, it, expect } from 'vitest'
import { formatGap, formatWhen } from './geo'

describe('formatGap', () => {
  it('is empty when either side is missing or unparseable', () => {
    expect(formatGap('', '2026-07-03T14:00')).toBe('')
    expect(formatGap('2026-07-03T14:00', '')).toBe('')
    expect(formatGap('not-a-date', 'also-not')).toBe('')
  })

  it('formats a sub-hour gap in minutes', () => {
    expect(formatGap('2026-07-03T14:00', '2026-07-03T14:15')).toBe('+15m')
  })

  it('formats an hours-and-minutes gap', () => {
    expect(formatGap('2026-07-03T14:00', '2026-07-03T16:15')).toBe('+2h 15m')
  })

  it('rolls into days and drops minutes past a day boundary', () => {
    // 1 day, 2 hours, 30 minutes — minutes are dropped once days are present.
    expect(formatGap('2026-07-03T10:00', '2026-07-04T12:30')).toBe('+1d 2h')
  })

  it('marks a negative (out-of-order) gap with a minus sign', () => {
    expect(formatGap('2026-07-03T16:00', '2026-07-03T14:00')).toBe('−2h')
  })

  it('shows +0m for the same instant', () => {
    expect(formatGap('2026-07-03T14:00', '2026-07-03T14:00')).toBe('+0m')
  })
})

describe('formatWhen', () => {
  it('is empty for an unparseable value', () => {
    expect(formatWhen('')).toBe('')
    expect(formatWhen('nope')).toBe('')
  })

  it('produces a non-empty label for a valid datetime-local value', () => {
    const label = formatWhen('2026-07-03T14:30')
    expect(label.length).toBeGreaterThan(0)
    // Locale-dependent formatting, but the time should always survive.
    expect(label).toMatch(/\d/)
  })
})
