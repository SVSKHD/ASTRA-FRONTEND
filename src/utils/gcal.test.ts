import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CalendarAuthError,
  createEvent,
  deleteEvent,
  eventBody,
  hasCalendarToken,
  setCalendarToken,
  toRRule,
  updateEvent,
} from '@/utils/gcal'
import type { Reminder, Repeat } from '@/types'

function reminder(start = '2026-03-10T09:00', repeat: Repeat = { type: 'none' }): Reminder {
  return {
    id: 1,
    title: 'Standup',
    note: 'daily sync',
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

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  setCalendarToken('test-token')
})
afterEach(() => {
  setCalendarToken(null)
  vi.unstubAllGlobals()
})

function ok(body: unknown = {}) {
  return { ok: true, status: 200, json: async () => body }
}

describe('toRRule', () => {
  it('maps every repeat type', () => {
    expect(toRRule({ type: 'minutes', n: 5 })).toEqual(['RRULE:FREQ=MINUTELY;INTERVAL=5'])
    expect(toRRule({ type: 'hours', n: 2 })).toEqual(['RRULE:FREQ=HOURLY;INTERVAL=2'])
    expect(toRRule({ type: 'days', n: 26 })).toEqual(['RRULE:FREQ=DAILY;INTERVAL=26'])
    expect(toRRule({ type: 'weeks', n: 3 })).toEqual(['RRULE:FREQ=WEEKLY;INTERVAL=3'])
    expect(toRRule({ type: 'months', n: 1 })).toEqual(['RRULE:FREQ=MONTHLY;INTERVAL=1'])
    expect(toRRule({ type: 'years', n: 1 })).toEqual(['RRULE:FREQ=YEARLY;INTERVAL=1'])
    expect(toRRule({ type: 'weekdays', weekdays: [1, 5] })).toEqual([
      'RRULE:FREQ=WEEKLY;BYDAY=MO,FR',
    ])
  })

  it('returns no recurrence for a one-off or missing repeat', () => {
    expect(toRRule({ type: 'none' })).toEqual([])
    expect(toRRule(undefined)).toEqual([])
  })

  it('omits BYDAY when no weekday is selected, rather than emitting an invalid rule', () => {
    expect(toRRule({ type: 'weekdays', weekdays: [] })).toEqual([])
  })

  it('treats a missing or zero interval as 1', () => {
    expect(toRRule({ type: 'days' })).toEqual(['RRULE:FREQ=DAILY;INTERVAL=1'])
    expect(toRRule({ type: 'days', n: 0 })).toEqual(['RRULE:FREQ=DAILY;INTERVAL=1'])
  })
})

describe('eventBody', () => {
  it('carries title, note and a 30 minute window', () => {
    const body = eventBody(reminder())
    expect(body.summary).toBe('Standup')
    expect(body.description).toBe('daily sync')
    const span = new Date(body.end.dateTime).getTime() - new Date(body.start.dateTime).getTime()
    expect(span).toBe(30 * 60000)
  })

  it('includes a time zone so the event does not shift by the UTC offset', () => {
    const body = eventBody(reminder())
    expect(body.start.timeZone).toBeTruthy()
    expect(body.end.timeZone).toBe(body.start.timeZone)
  })
})

describe('token handling', () => {
  it('reports whether a token is held', () => {
    expect(hasCalendarToken()).toBe(true)
    setCalendarToken(null)
    expect(hasCalendarToken()).toBe(false)
  })

  it('refuses to call without a token', async () => {
    setCalendarToken(null)
    await expect(createEvent(reminder())).rejects.toBeInstanceOf(CalendarAuthError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the token as a bearer header', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'evt-1' }))
    await createEvent(reminder())
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer test-token')
  })
})

describe('createEvent', () => {
  it('returns the new event id', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'evt-1' }))
    expect(await createEvent(reminder())).toBe('evt-1')
  })

  it('throws when the response carries no id, so nothing is stored as synced', async () => {
    fetchMock.mockResolvedValue(ok({}))
    await expect(createEvent(reminder())).rejects.toThrow(/no event id/)
  })

  it('throws on a non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    await expect(createEvent(reminder())).rejects.toThrow(/500/)
  })
})

describe('401 handling', () => {
  it.each([401, 403])('maps %i to CalendarAuthError and drops the token', async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({}) })
    await expect(createEvent(reminder())).rejects.toBeInstanceOf(CalendarAuthError)
    // The stale token is cleared so the UI can prompt for re-consent rather
    // than retrying forever with a token that will never work again.
    expect(hasCalendarToken()).toBe(false)
  })
})

describe('deleteEvent', () => {
  it('issues a DELETE for the event id', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: async () => ({}) })
    await deleteEvent('evt-1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/evt-1')
    expect((init as RequestInit).method).toBe('DELETE')
  })

  it.each([404, 410])('treats %i as success — the event is already gone', async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({}) })
    await expect(deleteEvent('evt-1')).resolves.toBeUndefined()
  })

  it('throws on a real failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    await expect(deleteEvent('evt-1')).rejects.toThrow(/500/)
  })

  it('url-encodes the event id', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: async () => ({}) })
    await deleteEvent('a/b c')
    expect(String(fetchMock.mock.calls[0][0])).toContain(encodeURIComponent('a/b c'))
  })
})

describe('updateEvent', () => {
  it('PATCHes the existing event rather than creating a duplicate', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'evt-1' }))
    await updateEvent('evt-1', reminder('2026-04-01T10:00', { type: 'days', n: 26 }))
    const [url, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).method).toBe('PATCH')
    expect(String(url)).toContain('/evt-1')
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.recurrence).toEqual(['RRULE:FREQ=DAILY;INTERVAL=26'])
  })
})
