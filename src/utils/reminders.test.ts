import { describe, expect, it } from 'vitest'
import { buildGCalUrl, occurrences, occurrencesBetween, repFreqLabel } from '@/utils/reminders'
import type { Reminder, Repeat } from '@/types'

function reminder(start: string, repeat: Repeat = { type: 'none' }): Reminder {
  return {
    id: 1,
    title: 'Standup',
    note: '',
    start,
    repeat,
    calSync: 'none' as Reminder['calSync'],
    priority: 'normal',
    calEventId: null,
    lastFiredOcc: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

// A fixed reference point so these never depend on the wall clock.
const NOW = new Date('2026-03-10T12:00:00').getTime()
const at = (iso: string) => new Date(iso).getTime()

describe('occurrences — one-off', () => {
  it('reports a future start as next, with no last', () => {
    const { last, next } = occurrences(reminder('2026-03-10T15:00'), NOW)
    expect(last).toBeNull()
    expect(next).toBe(at('2026-03-10T15:00'))
  })

  it('reports a past start as last, with no next', () => {
    const { last, next } = occurrences(reminder('2026-03-09T09:00'), NOW)
    expect(last).toBe(at('2026-03-09T09:00'))
    expect(next).toBeNull()
  })

  it('returns nulls for an unparseable start', () => {
    expect(occurrences(reminder('not-a-date'), NOW)).toEqual({ last: null, next: null })
  })
})

describe('occurrences — interval repeats', () => {
  it('walks daily steps to straddle now', () => {
    const { last, next } = occurrences(reminder('2026-03-08T09:00', { type: 'days', n: 1 }), NOW)
    expect(last).toBe(at('2026-03-10T09:00'))
    expect(next).toBe(at('2026-03-11T09:00'))
  })

  it('honours the interval multiplier', () => {
    const { last, next } = occurrences(reminder('2026-03-01T09:00', { type: 'days', n: 4 }), NOW)
    expect(last).toBe(at('2026-03-09T09:00'))
    expect(next).toBe(at('2026-03-13T09:00'))
  })

  it('defaults a missing n to 1', () => {
    const { next } = occurrences(reminder('2026-03-10T11:00', { type: 'hours' }), NOW)
    expect(next).toBe(at('2026-03-10T13:00'))
  })

  it('steps months by calendar, not by fixed days', () => {
    const { next } = occurrences(reminder('2026-01-31T09:00', { type: 'months', n: 1 }), NOW)
    // Date.setMonth overflows Feb 31 into March; the point is it lands in a
    // later month rather than 30 fixed days on.
    expect(new Date(next!).getFullYear()).toBe(2026)
    expect(next).toBeGreaterThan(NOW)
  })

  it('steps years by calendar', () => {
    const { last, next } = occurrences(reminder('2024-06-01T09:00', { type: 'years', n: 1 }), NOW)
    expect(new Date(last!).getFullYear()).toBe(2025)
    expect(new Date(next!).getFullYear()).toBe(2026)
  })

  it('gives up rather than hanging when the step count is exhausted', () => {
    // 1-minute repeat from years back cannot reach now within maxSteps.
    const { next } = occurrences(reminder('2020-01-01T00:00', { type: 'minutes', n: 1 }), NOW, 10)
    expect(next).toBeNull()
  })
})

describe('occurrences — weekdays', () => {
  it('only lands on the selected weekdays', () => {
    // 2026-03-10 is a Tuesday. Select Mon(1) and Wed(3).
    const { last, next } = occurrences(
      reminder('2026-03-09T09:00', { type: 'weekdays', weekdays: [1, 3] }),
      NOW,
    )
    expect(new Date(last!).getDay()).toBe(1)
    expect(new Date(next!).getDay()).toBe(3)
  })

  it('returns nulls when no weekday is selected', () => {
    const { last, next } = occurrences(
      reminder('2026-03-09T09:00', { type: 'weekdays', weekdays: [] }),
      NOW,
    )
    expect(last).toBeNull()
    expect(next).toBeNull()
  })
})

describe('occurrencesBetween', () => {
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

  it('projects a 26-day repeat through to the end of the year', () => {
    // The case that motivated this: "every 26 days, show dates till December".
    const dec31 = new Date('2026-12-31T23:59:59').getTime()
    const dates = occurrencesBetween(
      reminder('2026-03-10T09:00', { type: 'days', n: 26 }),
      NOW,
      dec31,
    )
    expect(dates.length).toBeGreaterThan(10)
    // The 09:00 start has already elapsed at NOW (12:00), so the window opens
    // on the following step rather than on the start date itself.
    expect(iso(dates[0])).toBe('2026-04-05')
    for (const d of dates) {
      expect(d).toBeGreaterThanOrEqual(NOW)
      expect(d).toBeLessThanOrEqual(dec31)
    }
    // Consecutive entries stay exactly 26 days apart.
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] - dates[i - 1]).toBe(26 * 86400000)
    }
  })

  it('returns results oldest first', () => {
    const dates = occurrencesBetween(
      reminder('2026-03-01T09:00', { type: 'days', n: 3 }),
      NOW,
      at('2026-04-01T00:00'),
    )
    const sorted = [...dates].sort((a, b) => a - b)
    expect(dates).toEqual(sorted)
  })

  it('includes occurrences exactly on the window bounds', () => {
    const from = at('2026-03-10T09:00')
    const to = at('2026-03-12T09:00')
    const dates = occurrencesBetween(reminder('2026-03-10T09:00', { type: 'days', n: 1 }), from, to)
    expect(dates[0]).toBe(from)
    expect(dates[dates.length - 1]).toBe(to)
  })

  it('returns past occurrences when the window is in the past', () => {
    // Scrolling backwards asks for windows entirely before now.
    const dates = occurrencesBetween(
      reminder('2026-01-01T09:00', { type: 'days', n: 7 }),
      at('2026-01-01T00:00'),
      at('2026-02-01T00:00'),
    )
    expect(dates.length).toBe(5)
    expect(iso(dates[0])).toBe('2026-01-01')
  })

  it('skips cheaply to a far-future window from an ancient start', () => {
    // A minutes-repeat from 2020 must not exhaust its step budget walking to
    // the window — this is the case the arithmetic skip exists for.
    const from = at('2026-03-10T12:00')
    const to = at('2026-03-10T12:10')
    const dates = occurrencesBetween(
      reminder('2020-01-01T00:00', { type: 'minutes', n: 1 }),
      from,
      to,
    )
    expect(dates.length).toBe(11)
    expect(dates[0]).toBe(from)
  })

  it('honours maxResults', () => {
    const dates = occurrencesBetween(
      reminder('2026-03-10T09:00', { type: 'minutes', n: 1 }),
      NOW,
      at('2026-12-31T00:00'),
      50,
    )
    expect(dates.length).toBe(50)
  })

  it('handles a one-off inside and outside the window', () => {
    const r = reminder('2026-06-01T09:00')
    expect(occurrencesBetween(r, NOW, at('2026-12-31T00:00'))).toHaveLength(1)
    expect(occurrencesBetween(r, NOW, at('2026-05-01T00:00'))).toHaveLength(0)
  })

  it('steps months by calendar', () => {
    const dates = occurrencesBetween(
      reminder('2026-03-15T09:00', { type: 'months', n: 1 }),
      NOW,
      at('2026-07-01T00:00'),
    )
    expect(dates.map(iso)).toEqual(['2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15'])
  })

  it('only lands on the selected weekdays', () => {
    const dates = occurrencesBetween(
      reminder('2026-03-09T09:00', { type: 'weekdays', weekdays: [1, 3] }),
      NOW,
      at('2026-03-31T00:00'),
    )
    expect(dates.length).toBeGreaterThan(0)
    for (const d of dates) expect([1, 3]).toContain(new Date(d).getDay())
  })

  it('returns nothing for an unparseable start or an inverted window', () => {
    expect(occurrencesBetween(reminder('not-a-date'), NOW, at('2026-12-31T00:00'))).toEqual([])
    expect(
      occurrencesBetween(
        reminder('2026-03-10T09:00', { type: 'days', n: 1 }),
        at('2026-12-31T00:00'),
        NOW,
      ),
    ).toEqual([])
  })

  it('returns nothing when no weekday is selected', () => {
    expect(
      occurrencesBetween(
        reminder('2026-03-09T09:00', { type: 'weekdays', weekdays: [] }),
        NOW,
        at('2026-12-31T00:00'),
      ),
    ).toEqual([])
  })
})

describe('repFreqLabel', () => {
  it('labels one-offs', () => {
    expect(repFreqLabel(undefined)).toBe('One-off')
    expect(repFreqLabel({ type: 'none' })).toBe('One-off')
  })

  it('singularises and pluralises the unit', () => {
    expect(repFreqLabel({ type: 'days', n: 1 })).toBe('Every 1 day')
    expect(repFreqLabel({ type: 'days', n: 3 })).toBe('Every 3 days')
    expect(repFreqLabel({ type: 'weeks', n: 2 })).toBe('Every 2 wks')
  })

  it('names the selected weekdays', () => {
    expect(repFreqLabel({ type: 'weekdays', weekdays: [1, 3, 5] })).toBe('Mon, Wed, Fri')
    expect(repFreqLabel({ type: 'weekdays', weekdays: [] })).toBe('Weekdays')
  })
})

describe('buildGCalUrl', () => {
  it('emits a 30-minute window in UTC basic format', () => {
    const url = new URL(buildGCalUrl(reminder('2026-03-10T09:00')))
    const [start, end] = url.searchParams.get('dates')!.split('/')
    expect(start).toMatch(/^\d{8}T\d{6}Z$/)
    expect(
      at(end.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')) -
        at(start.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')),
    ).toBe(30 * 60_000)
  })

  it('omits recur for a one-off', () => {
    expect(buildGCalUrl(reminder('2026-03-10T09:00'))).not.toContain('recur=')
  })

  it('maps each repeat type to its RRULE frequency', () => {
    const cases: Array<[Repeat, string]> = [
      [{ type: 'minutes', n: 5 }, 'FREQ=MINUTELY;INTERVAL=5'],
      [{ type: 'hours', n: 2 }, 'FREQ=HOURLY;INTERVAL=2'],
      [{ type: 'days', n: 1 }, 'FREQ=DAILY;INTERVAL=1'],
      [{ type: 'weeks', n: 3 }, 'FREQ=WEEKLY;INTERVAL=3'],
      [{ type: 'months', n: 1 }, 'FREQ=MONTHLY;INTERVAL=1'],
      [{ type: 'years', n: 1 }, 'FREQ=YEARLY;INTERVAL=1'],
      [{ type: 'weekdays', weekdays: [1, 5] }, 'FREQ=WEEKLY;BYDAY=MO,FR'],
    ]
    for (const [repeat, expected] of cases) {
      const recur = new URL(buildGCalUrl(reminder('2026-03-10T09:00', repeat))).searchParams.get(
        'recur',
      )
      expect(recur, repeat.type).toBe(`RRULE:${expected}`)
    }
  })

  it('escapes the title rather than breaking the query string', () => {
    const r = reminder('2026-03-10T09:00')
    r.title = 'Pay rent & council tax'
    expect(new URL(buildGCalUrl(r)).searchParams.get('text')).toBe('Pay rent & council tax')
  })
})
