// Section 27a — the two bits of view logic with a wrong answer that looks right.
import { describe, expect, it } from 'vitest'
import type { ActivityEvent, DeviceSession } from '@/types'
import {
  activityDetail,
  activityTitle,
  BANNER_WINDOW_MS,
  MAP_LOCATIONS,
  mapPoints,
  newCountryAlert,
  project,
} from '@/utils/sessionView'

const T = 1_700_000_000_000

function session(over: Partial<DeviceSession>): DeviceSession {
  return {
    id: 's1',
    deviceLabel: 'Chrome on macOS',
    deviceType: 'desktop',
    os: 'macOS',
    browser: 'Chrome',
    ipHash: 'abc',
    city: 'Hyderabad',
    region: 'Telangana',
    country: 'India',
    approxLat: 17.4,
    approxLng: 78.5,
    createdAt: T,
    lastActiveAt: T,
    revokedAt: null,
    userAgent: '',
    ...over,
  }
}

function event(over: Partial<ActivityEvent>): ActivityEvent {
  return {
    id: 'e1',
    type: 'login',
    sessionId: 's1',
    city: null,
    country: null,
    detail: null,
    at: T,
    ...over,
  }
}

describe('the map points', () => {
  it('counts a place once, however many sessions came from it', () => {
    // The failure: geo-IP returns 17.4/78.5 for one session and 17.39/78.51 for
    // the next, so five pins stack on Hyderabad and the one sign-in from
    // Frankfurt — the only reason to draw a map at all — is crowded out.
    const points = mapPoints([
      session({ id: 'a', approxLat: 17.4, approxLng: 78.5, lastActiveAt: T }),
      session({ id: 'b', approxLat: 17.3, approxLng: 78.6, lastActiveAt: T - 1000 }),
      session({ id: 'c', city: 'Frankfurt', country: 'Germany', approxLat: 50.1, approxLng: 8.7 }),
    ])
    expect(points.map((p) => p.label)).toEqual(['Hyderabad, India', 'Frankfurt, Germany'])
  })

  it('keeps the most recent sighting of a place', () => {
    const points = mapPoints([
      session({ id: 'a', lastActiveAt: T - 5000 }),
      session({ id: 'b', lastActiveAt: T }),
    ])
    expect(points).toHaveLength(1)
    expect(points[0].seenAt).toBe(T)
  })

  it('never plots a session with no coordinates at (0, 0)', () => {
    // Null Island, in the Gulf of Guinea, has misled every engineer who has
    // seen a pin there. A session with no location gets no pin.
    expect(mapPoints([session({ approxLat: null, approxLng: null })])).toEqual([])
  })

  it('shows the five most recent, newest first', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      session({ id: `s${i}`, city: `City${i}`, lastActiveAt: T - i * 1000 }),
    )
    const points = mapPoints(many)
    expect(points).toHaveLength(MAP_LOCATIONS)
    expect(points[0].label).toContain('City0')
  })
})

describe('the projection', () => {
  it('puts the origin in the middle', () => {
    expect(project(0, 0)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('grows y downward, because SVG does', () => {
    // The sign error that puts the northern hemisphere at the bottom.
    expect(project(60, 0).y).toBeLessThan(project(-60, 0).y)
  })

  it('puts the far west at 0 and the far east at 1', () => {
    expect(project(0, -180).x).toBe(0)
    expect(project(0, 180).x).toBe(1)
  })

  it('clamps a pole, so a pin never lands outside the box', () => {
    expect(project(90, 0).y).toBeLessThanOrEqual(1)
    expect(project(90, 0).y).toBeGreaterThanOrEqual(0)
    expect(project(-95, 400).x).toBeLessThanOrEqual(1)
  })
})

describe('the activity lines', () => {
  it('names each kind in words a person would use', () => {
    expect(activityTitle('new-country')).toBe('Sign-in from a new country')
    expect(activityTitle('revoke')).toBe('Device signed out')
  })

  it('says nothing rather than saying "unknown"', () => {
    // An empty second line is invisible. A line reading "Unknown location" is a
    // line that took up space to report a non-fact.
    expect(activityDetail(event({}))).toBe('')
  })

  it('joins the detail and the place when it has both', () => {
    expect(
      activityDetail(event({ detail: 'Chrome on macOS', city: 'Hyderabad', country: 'India' })),
    ).toBe('Chrome on macOS · Hyderabad, India')
  })
})

describe('the new-country banner', () => {
  it('appears for a recent sign-in from somewhere new', () => {
    const alert = newCountryAlert([event({ type: 'new-country', country: 'Germany' })], T, null)
    expect(alert?.country).toBe('Germany')
  })

  it('does not appear for an old one', () => {
    // A banner about a sign-in from three months ago is not actionable.
    const old = event({ type: 'new-country', at: T - BANNER_WINDOW_MS - 1 })
    expect(newCountryAlert([old], T, null)).toBeNull()
  })

  it('stays dismissed', () => {
    // Reappearing every load for an event the user already read is how a
    // security banner becomes something people click away without looking.
    const e = event({ type: 'new-country', at: T - 1000 })
    expect(newCountryAlert([e], T, T)).toBeNull()
  })

  it('comes back for a NEWER event after a dismissal', () => {
    const dismissed = T - 10_000
    const fresh = event({ type: 'new-country', at: T - 1000 })
    expect(newCountryAlert([fresh], T, dismissed)?.at).toBe(T - 1000)
  })

  it('ignores everything that is not a new country', () => {
    expect(newCountryAlert([event({ type: 'login' })], T, null)).toBeNull()
  })
})
