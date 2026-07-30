import { describe, expect, it } from 'vitest'
import { upcomingOccurrences } from '@/utils/reminders'
import type { Reminder, Repeat } from '@/types'

// The individual reminder page asks for a fixed forecast rather than a calendar
// window, so these assert the count is exactly what was requested regardless of
// where in the year the reminder starts, and that the run crosses New Year.
function reminder(start: string, repeat: Repeat = { type: 'none' }): Reminder {
  return {
    id: 1,
    title: 'Water plants',
    note: '',
    start,
    repeat,
    priority: 'normal',
    calSync: 'local',
    calEventId: null,
    lastFiredOcc: null,
    acknowledgedAt: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

const TODAY = new Date('2026-07-20T10:00:00').getTime()
const DAY = 86400000

describe('upcomingOccurrences', () => {
  it('returns 12 future dates for an every-26-days repeat', () => {
    const dates = upcomingOccurrences(reminder('2026-07-01T09:00', { type: 'days', n: 26 }), TODAY)
    expect(dates.length).toBe(12)
    expect(dates.every((d) => d >= TODAY)).toBe(true)
    // Each step is exactly the interval, and the first is the 27 Jul occurrence.
    expect(new Date(dates[0]).getDate()).toBe(27)
    for (let i = 1; i < dates.length; i++) expect(dates[i] - dates[i - 1]).toBe(26 * DAY)
  })

  it('runs into the following year rather than stopping at 31 Dec', () => {
    const dates = upcomingOccurrences(reminder('2026-07-01T09:00', { type: 'days', n: 26 }), TODAY)
    const years = new Set(dates.map((d) => new Date(d).getFullYear()))
    expect(years.has(2026)).toBe(true)
    expect(years.has(2027)).toBe(true)
  })

  it('still returns 12 when the reminder starts late in December', () => {
    const dec = new Date('2026-12-28T10:00:00').getTime()
    const dates = upcomingOccurrences(reminder('2026-12-29T09:00', { type: 'days', n: 26 }), dec)
    expect(dates.length).toBe(12)
  })

  it('honours a custom count', () => {
    const dates = upcomingOccurrences(
      reminder('2026-01-05T09:00', { type: 'months', n: 1 }),
      TODAY,
      5,
    )
    expect(dates.length).toBe(5)
    expect(new Date(dates[0]).getMonth()).toBe(7) // August
  })

  it('walks calendar months and years without drifting the day of month', () => {
    const dates = upcomingOccurrences(reminder('2026-01-31T09:00', { type: 'years', n: 1 }), TODAY)
    expect(dates.length).toBe(12)
    expect(dates.every((d) => new Date(d).getDate() === 31)).toBe(true)
    expect(new Date(dates[0]).getFullYear()).toBe(2027)
  })

  it('picks only the selected weekdays', () => {
    const dates = upcomingOccurrences(
      reminder('2026-01-05T09:00', { type: 'weekdays', weekdays: [1, 3] }),
      TODAY,
    )
    expect(dates.length).toBe(12)
    expect(dates.every((d) => [1, 3].includes(new Date(d).getDay()))).toBe(true)
  })

  it('returns the one-off itself when future, and nothing once passed', () => {
    expect(upcomingOccurrences(reminder('2026-09-01T09:00'), TODAY).length).toBe(1)
    expect(upcomingOccurrences(reminder('2026-01-01T09:00'), TODAY).length).toBe(0)
  })

  it('returns nothing for an unparseable start or a non-positive count', () => {
    expect(upcomingOccurrences(reminder('not-a-date', { type: 'days', n: 1 }), TODAY)).toEqual([])
    expect(
      upcomingOccurrences(reminder('2026-07-01T09:00', { type: 'days', n: 1 }), TODAY, 0),
    ).toEqual([])
  })
})
