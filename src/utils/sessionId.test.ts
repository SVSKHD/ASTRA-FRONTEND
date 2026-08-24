// Section 27a — one session per install, and a heartbeat that does not chatter.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSessionId,
  HEARTBEAT_INTERVAL_MS,
  SESSION_KEY,
  sessionId,
  shouldHeartbeat,
} from '@/utils/sessionId'

beforeEach(() => {
  localStorage.clear()
  clearSessionId()
})
afterEach(() => vi.restoreAllMocks())

describe('one id per install', () => {
  it('mints once and then returns the same id forever', () => {
    // The failure this prevents: a session document per page load, which turns
    // one laptop into four hundred "devices" and buries the one sign-in that
    // actually deserved a second look.
    const first = sessionId()
    expect(sessionId()).toBe(first)
    expect(sessionId()).toBe(first)
  })

  it('survives a reload, because it is on disk not in memory', () => {
    const first = sessionId()
    clearSessionId() // wipes the in-memory copy AND the stored one
    localStorage.setItem(SESSION_KEY, first) // as a reload would find it
    expect(sessionId()).toBe(first)
  })

  it('mints an id the server will accept', () => {
    expect(sessionId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
  })

  it('replaces a corrupted id rather than sending it', () => {
    // A hand-edited localStorage, or an older scheme. Repairing it is not
    // possible and passing it on is a rejected call, so it is replaced.
    localStorage.setItem(SESSION_KEY, 'nope!')
    const id = sessionId()
    expect(id).not.toBe('nope!')
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
  })
})

describe('when the browser refuses to remember', () => {
  it('still returns a stable id for the tab', () => {
    // Private mode and "block all cookies" throw on access rather than
    // returning null. A sign-in must not fail because of it.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    const first = sessionId()
    expect(first).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(sessionId()).toBe(first)
  })
})

describe('signing out', () => {
  it('forgets the id, so the next sign-in is a new device', () => {
    // This is what makes "sign out everywhere else" stick: the revoked machine
    // cannot come back under the id someone deliberately killed.
    const first = sessionId()
    clearSessionId()
    expect(sessionId()).not.toBe(first)
  })
})

describe('the heartbeat clock', () => {
  const t0 = 1_700_000_000_000

  it('fires the first time', () => {
    expect(shouldHeartbeat(null, t0)).toBe(true)
  })

  it('stays quiet inside the five-minute window', () => {
    expect(shouldHeartbeat(t0, t0 + 1000)).toBe(false)
    expect(shouldHeartbeat(t0, t0 + HEARTBEAT_INTERVAL_MS - 1)).toBe(false)
  })

  it('fires once the window has passed', () => {
    expect(shouldHeartbeat(t0, t0 + HEARTBEAT_INTERVAL_MS)).toBe(true)
  })

  it('is five minutes, per the spec', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(300_000)
  })

  it('does not wedge when the clock goes backwards', () => {
    // A laptop waking from sleep, or an NTP correction. Without this the
    // heartbeat would be off until real time caught up with the bad reading.
    expect(shouldHeartbeat(t0, t0 - 60_000)).toBe(true)
  })
})
