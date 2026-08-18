import { describe, expect, it } from 'vitest'
import { LONG_PRESS_MS, beginPress, isTap, movedBeyondSlop } from '@/utils/pressGesture'

const at = (t: number) => beginPress(t, 100, 100)

describe('telling a tap from a long press (section 18b)', () => {
  it('a quick press in one place is a tap', () => {
    expect(isTap(at(0), 120, 100, 100)).toBe(true)
  })

  it('a press held past the threshold is not — that is a drag starting', () => {
    expect(isTap(at(0), LONG_PRESS_MS, 100, 100)).toBe(false)
    expect(isTap(at(0), LONG_PRESS_MS + 500, 100, 100)).toBe(false)
  })

  it('a quick press that travelled is not a tap either', () => {
    expect(isTap(at(0), 120, 100, 400)).toBe(false)
  })

  it('tolerates the wobble every finger has', () => {
    expect(isTap(at(0), 120, 104, 103)).toBe(true)
  })

  it('counts an activation with no press behind it as a tap', () => {
    // A keyboard Enter, or a synthetic click: refusing to open on those would
    // break the keyboard path in order to fix a touch one.
    expect(isTap(null, 0, 0, 0)).toBe(true)
  })
})

describe('the slop radius', () => {
  it('measures distance, not axis', () => {
    const start = beginPress(0, 0, 0)
    expect(movedBeyondSlop(start, 3, 3)).toBe(false)
    expect(movedBeyondSlop(start, 40, 0)).toBe(true)
    expect(movedBeyondSlop(start, 0, -40)).toBe(true)
    expect(movedBeyondSlop(start, 30, 30)).toBe(true)
  })
})
