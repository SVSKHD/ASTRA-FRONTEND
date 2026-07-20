// Google Calendar REST client.
//
// Firebase Auth hands back a Google OAuth access token at sign-in, but only
// once and only in memory — there is no refresh token in the browser. The token
// lives roughly an hour, after which calls fail with 401 and the user has to
// re-authorise. Those are surfaced as CalendarAuthError so callers can prompt
// for re-consent rather than failing silently.

import type { Reminder, Repeat } from '@/types'

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

let accessToken: string | null = null

export function setCalendarToken(token: string | null) {
  accessToken = token
}
export function hasCalendarToken(): boolean {
  return !!accessToken
}

export class CalendarAuthError extends Error {
  constructor(message = 'Google Calendar access has expired.') {
    super(message)
    this.name = 'CalendarAuthError'
  }
}

// RFC 5545 recurrence for the repeat shapes Aureon supports.
export function toRRule(rep: Repeat | undefined): string[] {
  if (!rep || rep.type === 'none') return []
  const n = Math.max(1, rep.n || 1)
  const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
  switch (rep.type) {
    case 'minutes':
      return [`RRULE:FREQ=MINUTELY;INTERVAL=${n}`]
    case 'hours':
      return [`RRULE:FREQ=HOURLY;INTERVAL=${n}`]
    case 'days':
      return [`RRULE:FREQ=DAILY;INTERVAL=${n}`]
    case 'weeks':
      return [`RRULE:FREQ=WEEKLY;INTERVAL=${n}`]
    case 'months':
      return [`RRULE:FREQ=MONTHLY;INTERVAL=${n}`]
    case 'years':
      return [`RRULE:FREQ=YEARLY;INTERVAL=${n}`]
    case 'weekdays': {
      const list = (rep.weekdays || []).map((d) => days[d]).filter(Boolean)
      return list.length ? [`RRULE:FREQ=WEEKLY;BYDAY=${list.join(',')}`] : []
    }
    default:
      return []
  }
}

export function eventBody(r: Reminder) {
  const start = new Date(r.start)
  const end = new Date(start.getTime() + 30 * 60000)
  return {
    summary: r.title,
    description: r.note || '',
    // Local wall-clock time plus the browser's zone, so the event lands at the
    // time the user actually picked rather than shifting by their UTC offset.
    start: {
      dateTime: start.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    recurrence: toRRule(r.repeat),
  }
}

async function call(url: string, init: RequestInit): Promise<Response> {
  if (!accessToken) throw new CalendarAuthError('Not connected to Google Calendar.')
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  if (res.status === 401 || res.status === 403) {
    accessToken = null
    throw new CalendarAuthError()
  }
  return res
}

// Returns the created event id, which must be stored on the reminder so the
// event can be deleted later.
export async function createEvent(r: Reminder): Promise<string> {
  const res = await call(API, { method: 'POST', body: JSON.stringify(eventBody(r)) })
  if (!res.ok) throw new Error(`Calendar create failed (${res.status})`)
  const data = (await res.json()) as { id?: string }
  if (!data.id) throw new Error('Calendar create returned no event id')
  return data.id
}

export async function updateEvent(eventId: string, r: Reminder): Promise<void> {
  const res = await call(`${API}/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(eventBody(r)),
  })
  if (!res.ok) throw new Error(`Calendar update failed (${res.status})`)
}

// 404/410 mean the event is already gone — that is the desired end state, so
// it is treated as success rather than surfaced as an error.
export async function deleteEvent(eventId: string): Promise<void> {
  const res = await call(`${API}/${encodeURIComponent(eventId)}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Calendar delete failed (${res.status})`)
  }
}
