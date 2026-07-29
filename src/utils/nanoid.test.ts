import { describe, expect, it } from 'vitest'
import { nanoid } from '@/utils/nanoid'

describe('nanoid', () => {
  it('produces an id of the requested length', () => {
    expect(nanoid(12)).toHaveLength(12)
    expect(nanoid(21)).toHaveLength(21)
  })

  it('defaults to 21 characters', () => {
    expect(nanoid()).toHaveLength(21)
  })

  it('only emits URL-safe characters', () => {
    for (let i = 0; i < 200; i++) {
      expect(nanoid(12)).toMatch(/^[A-Za-z0-9_-]{12}$/)
    }
  })

  it('does not collide across many calls', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 5000; i++) seen.add(nanoid(12))
    expect(seen.size).toBe(5000)
  })
})
