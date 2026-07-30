import { describe, expect, it } from 'vitest'
import { occurrencesBetween } from '@/utils/reminders'
import type { Reminder, Repeat } from '@/types'

// Reproduces exactly the window ReminderTimeline uses — now to 31 Dec of the
// current year — against a realistic mid-year "today", to prove the default
// view is populated rather than silently empty.
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
const endOfYear = (ms: number) =>
  new Date(new Date(ms).getFullYear(), 11, 31, 23, 59, 59, 999).getTime()

describe('default timeline window (now → 31 Dec)', () => {
  it('fills the strip for a 26-day repeat started earlier in the year', () => {
    const dates = occurrencesBetween(
      reminder('2026-03-10T09:00', { type: 'days', n: 26 }),
      TODAY,
      endOfYear(TODAY),
    )
    expect(dates.length).toBeGreaterThanOrEqual(5)
    expect(dates.every((d) => d >= TODAY)).toBe(true)
  })

  it('fills the strip for a monthly repeat', () => {
    const dates = occurrencesBetween(
      reminder('2026-01-05T09:00', { type: 'months', n: 1 }),
      TODAY,
      endOfYear(TODAY),
    )
    // Aug through Dec inclusive.
    expect(dates.length).toBe(5)
  })

  it('fills the strip for a weekday repeat', () => {
    const dates = occurrencesBetween(
      reminder('2026-01-05T09:00', { type: 'weekdays', weekdays: [1, 4] }),
      TODAY,
      endOfYear(TODAY),
    )
    expect(dates.length).toBeGreaterThan(40)
  })

  it('returns a single date for a future one-off — not a bug, just one date', () => {
    const dates = occurrencesBetween(reminder('2026-09-01T09:00'), TODAY, endOfYear(TODAY))
    expect(dates).toHaveLength(1)
  })

  it('returns nothing for a one-off that has already passed', () => {
    // This is the case that reads as "the timeline is broken" but is correct.
    const dates = occurrencesBetween(reminder('2026-02-01T09:00'), TODAY, endOfYear(TODAY))
    expect(dates).toHaveLength(0)
  })

  it('still fills the strip late in the year, when the window is short', () => {
    const december = new Date('2026-12-05T10:00:00').getTime()
    const dates = occurrencesBetween(
      reminder('2026-03-10T09:00', { type: 'days', n: 7 }),
      december,
      endOfYear(december),
    )
    expect(dates.length).toBeGreaterThanOrEqual(3)
  })
})
