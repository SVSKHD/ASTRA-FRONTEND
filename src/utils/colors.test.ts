import { describe, expect, it } from 'vitest'
import { CATEGORY_COLOR, urg } from '@/utils/colors'

describe('urg', () => {
  it('escalates through three bands as the deadline nears', () => {
    const far = urg(30, false)
    const soon = urg(5, false)
    const urgent = urg(1, false)
    expect(new Set([far, soon, urgent]).size).toBe(3)
  })

  it('switches band exactly at the 2 and 7 day boundaries', () => {
    expect(urg(2, false)).toBe(urg(1, false))
    expect(urg(3, false)).not.toBe(urg(2, false))
    expect(urg(7, false)).toBe(urg(3, false))
    expect(urg(8, false)).not.toBe(urg(7, false))
  })

  it('treats an overdue deadline as the most urgent band', () => {
    expect(urg(0, false)).toBe(urg(1, false))
    expect(urg(-5, false)).toBe(urg(1, false))
  })

  it('returns a distinct colour per theme group', () => {
    for (const days of [1, 5, 30]) {
      expect(urg(days, true), `${days}d`).not.toBe(urg(days, false))
    }
  })

  it('always returns a parseable oklch colour', () => {
    for (const dark of [true, false]) {
      for (const days of [-1, 0, 2, 3, 7, 8, 365]) {
        expect(urg(days, dark)).toMatch(/^oklch\([\d.]+ [\d.]+ \d+\)$/)
      }
    }
  })
})

describe('CATEGORY_COLOR', () => {
  it('gives every mapped category a distinct colour', () => {
    const values = Object.values(CATEGORY_COLOR)
    expect(new Set(values).size).toBe(values.length)
  })

  it('has no entry for Other, which falls back at the call site', () => {
    expect(CATEGORY_COLOR.Other).toBeUndefined()
  })
})
