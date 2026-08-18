import { describe, expect, it } from 'vitest'
import { clampOffset, offsetFor, snapFor, velocityOf } from '@/utils/sheetSnap'

const H = 600

describe('the snap positions', () => {
  it('puts the full sheet flush with the bottom', () => {
    expect(offsetFor('full', H)).toBe(0)
  })

  it('pushes part of the sheet away at the half point', () => {
    const half = offsetFor('half', H)
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(H / 2)
  })
})

describe('following the thumb', () => {
  it('tracks a downward drag one to one', () => {
    expect(clampOffset(120, H)).toBe(120)
  })

  it('resists dragging above the full position instead of blocking it', () => {
    const pulled = clampOffset(-100, H)
    expect(pulled).toBeLessThan(0)
    expect(pulled).toBeGreaterThan(-100)
  })

  it('never travels further than the sheet is tall', () => {
    expect(clampOffset(H * 3, H)).toBe(H)
  })
})

describe('where a release lands', () => {
  it('springs back to full from a small drag', () => {
    expect(snapFor(30, H)).toBe('full')
  })

  it('settles at the half point from a middling drag', () => {
    expect(snapFor(H * 0.3, H)).toBe('half')
  })

  it('dismisses once most of the sheet is gone', () => {
    expect(snapFor(H * 0.7, H)).toBe('dismiss')
  })

  it('dismisses on a downward flick even from near the top', () => {
    expect(snapFor(40, H, 1.2)).toBe('dismiss')
  })

  it('opens on an upward flick from the half point', () => {
    expect(snapFor(offsetFor('half', H), H, -1.2)).toBe('full')
  })

  it('treats a slow drag as position, not a flick', () => {
    expect(snapFor(20, H, 0.1)).toBe('full')
  })

  it('does not dismiss a sheet that was never dragged', () => {
    expect(snapFor(0, H, 0)).toBe('full')
    // A flick with no travel is a swipe on the content, not a dismissal.
    expect(snapFor(0, H, 1.5)).toBe('half')
  })

  it('survives a zero height rather than dividing by it', () => {
    expect(snapFor(0, 0)).toBe('full')
  })
})

describe('velocity', () => {
  it('is distance over time', () => {
    expect(velocityOf(60, 100)).toBeCloseTo(0.6)
  })

  it('is zero when two samples share a timestamp', () => {
    // Coalesced pointer events do this; an infinite velocity would dismiss on
    // any touch at all.
    expect(velocityOf(60, 0)).toBe(0)
    expect(velocityOf(60, -5)).toBe(0)
  })
})
