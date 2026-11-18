import { describe, expect, it } from 'vitest'
import { countdown, marketClock, nextOpen } from './marketClock'

// IST is UTC+5:30. 17 Nov 2026 is a Tuesday.
const ist = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+05:30`)

describe('marketClock', () => {
  it('is open from 09:15 to 15:30 on a weekday, counting down to the close', () => {
    const c = marketClock(ist('2026-11-17', '13:16'))
    expect(c.phase).toBe('open')
    expect(c.next).toBe(ist('2026-11-17', '15:30'))
    expect(c.detail).toBe('Closes 15:30 · in 2h 14m')
    expect(c.progress).toBeGreaterThan(0.6)
    expect(c.progress).toBeLessThan(0.7)
  })

  it('is pre-open from 09:00 to 09:15', () => {
    const c = marketClock(ist('2026-11-17', '09:07'))
    expect(c.phase).toBe('pre')
    expect(c.detail).toBe('Opens 09:15 · in 8m')
  })

  it('is open at 09:15 sharp and closed at 15:30 sharp', () => {
    expect(marketClock(ist('2026-11-17', '09:15')).phase).toBe('open')
    expect(marketClock(ist('2026-11-17', '15:30')).phase).toBe('closed')
  })

  it('after the close, opens tomorrow', () => {
    const c = marketClock(ist('2026-11-17', '16:00'))
    expect(c.phase).toBe('closed')
    expect(c.next).toBe(ist('2026-11-18', '09:15'))
    expect(c.detail).toBe('Opens tomorrow 09:15 · in 17h 15m')
  })

  it('before dawn, opens today', () => {
    const c = marketClock(ist('2026-11-17', '06:00'))
    expect(c.detail).toBe('Opens 09:15 · in 3h 15m')
  })

  it('on Friday evening and the weekend, opens on Monday', () => {
    expect(nextOpen(ist('2026-11-20', '16:00'))).toBe(ist('2026-11-23', '09:15'))
    const sat = marketClock(ist('2026-11-21', '12:00'))
    expect(sat.phase).toBe('closed')
    expect(sat.detail).toBe('Opens Mon 09:15 · in 1d 21h')
  })
})

describe('countdown', () => {
  it('reads as days, hours and minutes', () => {
    expect(countdown(30_000)).toBe('under a minute')
    expect(countdown(45 * 60_000)).toBe('45m')
    expect(countdown(120 * 60_000)).toBe('2h')
    expect(countdown((2 * 1440 + 3 * 60 + 10) * 60_000)).toBe('2d 3h')
  })
})
