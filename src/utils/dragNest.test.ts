import { describe, expect, it } from 'vitest'
import { autoScrollSpeed, nestSummary, planNest, resolveZone } from '@/utils/dragNest'
import type { LinkCheck } from '@/utils/links'
import type { LinkRef } from '@/types'

const ref = (id: number, collection: 'todos' | 'tasks' = 'todos'): LinkRef => ({ id, collection })

describe('resolveZone', () => {
  it('splits a row into above / nest / below by vertical position', () => {
    expect(resolveZone(5, 100)).toBe('above') // top 25%
    expect(resolveZone(50, 100)).toBe('nest') // middle 50%
    expect(resolveZone(90, 100)).toBe('below') // bottom 25%
    expect(resolveZone(25, 100)).toBe('nest') // boundary → nest
  })
})

describe('planNest', () => {
  it('keeps valid children and reports skips with reasons, de-duping', () => {
    const okFor = new Set([1, 2])
    const check = (c: LinkRef): LinkCheck =>
      okFor.has(c.id) ? { ok: true } : { ok: false, reason: 'cycle' }
    const plan = planNest([ref(1), ref(2), ref(3), ref(1)], check)
    expect(plan.valid.map((r) => r.id)).toEqual([1, 2])
    expect(plan.skipped).toEqual([{ ref: ref(3), reason: 'cycle' }])
  })
})

describe('nestSummary', () => {
  it('reads plainly for one, counts for many, and names the first skip', () => {
    expect(nestSummary({ valid: [ref(1)], skipped: [] })).toBe('Linked')
    expect(nestSummary({ valid: [ref(1), ref(2)], skipped: [] })).toBe('2 linked')
    expect(nestSummary({ valid: [ref(1)], skipped: [{ ref: ref(2), reason: 'cycle' }] })).toBe(
      '1 linked, 1 skipped — that would create a loop',
    )
    expect(nestSummary({ valid: [], skipped: [{ ref: ref(2), reason: 'cycle' }] })).toBe(
      "Couldn't link — that would create a loop",
    )
  })
})

describe('autoScrollSpeed', () => {
  it('is negative near the top, positive near the bottom, zero in the middle', () => {
    expect(autoScrollSpeed(500, 0, 1000)).toBe(0)
    expect(autoScrollSpeed(10, 0, 1000)).toBeLessThan(0)
    expect(autoScrollSpeed(995, 0, 1000)).toBeGreaterThan(0)
  })
})
