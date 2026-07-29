import { describe, it, expect } from 'vitest'
import { formatGap, formatWhen, haversineKm, routeDistanceKm, formatDistance } from './geo'

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

describe('haversineKm', () => {
  it('is zero between a point and itself', () => {
    expect(haversineKm(51.5, -0.1, 51.5, -0.1)).toBe(0)
  })

  it('approximates a known distance (London → Paris ≈ 340 km)', () => {
    const d = haversineKm(51.5074, -0.1278, 48.8566, 2.3522)
    expect(d).toBeGreaterThan(320)
    expect(d).toBeLessThan(360)
  })
})

describe('routeDistanceKm', () => {
  it('sums the legs and skips points without coordinates', () => {
    const total = routeDistanceKm([
      { lat: 51.5074, lng: -0.1278 }, // London
      { lat: null, lng: null }, // no location — skipped
      { lat: 48.8566, lng: 2.3522 }, // Paris
    ])
    // London→Paris directly, since the middle point is skipped.
    expect(total).toBeGreaterThan(320)
    expect(total).toBeLessThan(360)
  })

  it('is zero with fewer than two located points', () => {
    expect(routeDistanceKm([{ lat: 1, lng: 1 }])).toBe(0)
    expect(routeDistanceKm([])).toBe(0)
  })
})

describe('formatDistance', () => {
  it('renders metres, one-decimal km, and rounded km', () => {
    expect(formatDistance(0)).toBe('0 km')
    expect(formatDistance(0.82)).toBe('820 m')
    expect(formatDistance(3.44)).toBe('3.4 km')
    expect(formatDistance(128.6)).toBe('129 km')
  })
})
