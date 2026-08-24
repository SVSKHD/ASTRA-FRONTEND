import { describe, it, expect } from 'vitest'
import {
  dayOfWeek,
  addDays,
  isRecurrenceDay,
  occurrenceDatesInRange,
  horizonDates,
  localDateInTz,
  clampedMonthDay,
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

describe('monthly recurrence (section 27b)', () => {
  const monthly = (dayOfMonth: number, over: Partial<Recurrence> = {}): Recurrence => ({
    enabled: true,
    freq: 'monthly',
    daysOfWeek: [],
    timeOfDay: '09:00',
    timezone: 'Asia/Kolkata',
    startDate: '2026-01-01',
    endDate: null,
    dayOfMonth,
    ...over,
  })

  it('fires on the chosen day of each month', () => {
    // Rent on the 5th: the shape almost every recurring money item takes, and
    // one no weekly rule can express.
    const dates = occurrenceDatesInRange(monthly(5), '2026-01-01', '2026-04-30')
    expect(dates).toEqual(['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05'])
  })

  it('clamps to the last day of a short month rather than skipping it', () => {
    // A rent due on the 31st is still due in February. A rule that silently
    // misses February is worse than one that fires on the 28th.
    const dates = occurrenceDatesInRange(monthly(31), '2026-01-01', '2026-04-30')
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('clamps to the 29th in a leap February', () => {
    expect(occurrenceDatesInRange(monthly(31), '2028-02-01', '2028-02-29')).toEqual(['2028-02-29'])
  })

  it('honours the start and end dates like every other frequency', () => {
    const rec = monthly(5, { startDate: '2026-02-01', endDate: '2026-03-31' })
    expect(occurrenceDatesInRange(rec, '2026-01-01', '2026-05-30')).toEqual([
      '2026-02-05',
      '2026-03-05',
    ])
  })

  it('treats a nonsense day as the 1st rather than never firing', () => {
    expect(occurrenceDatesInRange(monthly(0), '2026-01-01', '2026-01-31')).toEqual(['2026-01-01'])
    expect(clampedMonthDay(99, '2026-02-10')).toBe(28)
  })
})
