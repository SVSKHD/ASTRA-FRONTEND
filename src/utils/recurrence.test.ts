import { describe, it, expect } from 'vitest'
import {
  dayOfWeek,
  addDays,
  isRecurrenceDay,
  occurrenceDatesInRange,
  horizonDates,
  localDateInTz,
  type Recurrence,
} from './recurrence'

function rec(partial: Partial<Recurrence>): Recurrence {
  return {
    enabled: true,
    freq: 'daily',
    daysOfWeek: [],
    timeOfDay: '09:00',
    timezone: 'UTC',
    startDate: '2026-08-01',
    endDate: null,
    ...partial,
  }
}

describe('date helpers', () => {
  it('dayOfWeek is timezone-independent', () => {
    expect(dayOfWeek('2026-08-15')).toBe(6) // a Saturday
    expect(dayOfWeek('2026-08-17')).toBe(1) // Monday
  })
  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-08-15', 7)).toBe('2026-08-22')
  })
})

describe('isRecurrenceDay', () => {
  it('daily fires every day inside the window', () => {
    const r = rec({ freq: 'daily' })
    expect(isRecurrenceDay(r, '2026-08-15')).toBe(true)
    expect(isRecurrenceDay(r, '2026-07-31')).toBe(false) // before start
  })
  it('weekdays fires Mon–Fri only', () => {
    const r = rec({ freq: 'weekdays' })
    expect(isRecurrenceDay(r, '2026-08-17')).toBe(true) // Mon
    expect(isRecurrenceDay(r, '2026-08-15')).toBe(false) // Sat
  })
  it('weekly/custom honours daysOfWeek', () => {
    const r = rec({ freq: 'weekly', daysOfWeek: [1, 3] })
    expect(isRecurrenceDay(r, '2026-08-17')).toBe(true) // Mon
    expect(isRecurrenceDay(r, '2026-08-19')).toBe(true) // Wed
    expect(isRecurrenceDay(r, '2026-08-18')).toBe(false) // Tue
  })
  it('respects endDate and disabled', () => {
    expect(isRecurrenceDay(rec({ endDate: '2026-08-10' }), '2026-08-15')).toBe(false)
    expect(isRecurrenceDay(rec({ enabled: false }), '2026-08-15')).toBe(false)
  })
})

describe('occurrenceDatesInRange / horizonDates', () => {
  it('lists daily dates inclusive', () => {
    const dates = occurrenceDatesInRange(rec({}), '2026-08-15', '2026-08-18')
    expect(dates).toEqual(['2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18'])
  })
  it('horizon covers today + 7 days', () => {
    const dates = horizonDates(rec({}), '2026-08-15', 7)
    expect(dates[0]).toBe('2026-08-15')
    expect(dates.at(-1)).toBe('2026-08-22')
    expect(dates).toHaveLength(8)
  })
  it('weekly horizon only includes matching weekdays', () => {
    const dates = horizonDates(rec({ freq: 'weekly', daysOfWeek: [1] }), '2026-08-15', 7)
    expect(dates).toEqual(['2026-08-17']) // the single Monday in the window
  })
})

describe('localDateInTz', () => {
  it('maps an instant to the local calendar date in a tz', () => {
    // 2026-08-15 23:30 UTC is already 2026-08-16 in Tokyo (+09:00).
    const t = Date.UTC(2026, 7, 15, 23, 30)
    expect(localDateInTz(t, 'Asia/Tokyo')).toBe('2026-08-16')
    expect(localDateInTz(t, 'UTC')).toBe('2026-08-15')
  })
})
