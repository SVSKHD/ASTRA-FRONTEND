import { describe, expect, it } from 'vitest'
import {
  deriveOnline,
  deriveSyncing,
  pendingKeysBetween,
  signatureOf,
  stableStringify,
} from '@/utils/sync'

describe('stableStringify', () => {
  it('is independent of key order', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }))
  })

  it('distinguishes different values', () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }))
  })

  it('handles nested objects and arrays', () => {
    expect(stableStringify({ x: [{ b: 1, a: 2 }] })).toBe(stableStringify({ x: [{ a: 2, b: 1 }] }))
  })
})

describe('signatureOf / pendingKeysBetween', () => {
  const acked = signatureOf({
    todo: [{ id: 1, text: 'a' } as never, { id: 2, text: 'b' } as never],
    finance: [{ id: 5, amount: 10 } as never],
  })

  it('reports nothing pending when current equals acked', () => {
    const current = signatureOf({
      todo: [{ id: 1, text: 'a' } as never, { id: 2, text: 'b' } as never],
      finance: [{ id: 5, amount: 10 } as never],
    })
    expect(pendingKeysBetween(current, acked).size).toBe(0)
  })

  it('flags an edited item', () => {
    const current = signatureOf({
      todo: [{ id: 1, text: 'CHANGED' } as never, { id: 2, text: 'b' } as never],
      finance: [{ id: 5, amount: 10 } as never],
    })
    expect([...pendingKeysBetween(current, acked)]).toEqual(['todo:1'])
  })

  it('flags a newly created item', () => {
    const current = signatureOf({
      todo: [
        { id: 1, text: 'a' } as never,
        { id: 2, text: 'b' } as never,
        { id: 9, text: 'new' } as never,
      ],
      finance: [{ id: 5, amount: 10 } as never],
    })
    expect(pendingKeysBetween(current, acked).has('todo:9')).toBe(true)
  })

  it('flags a locally deleted item', () => {
    const current = signatureOf({
      todo: [{ id: 1, text: 'a' } as never],
      finance: [{ id: 5, amount: 10 } as never],
    })
    expect(pendingKeysBetween(current, acked).has('todo:2')).toBe(true)
  })
})

describe('deriveOnline', () => {
  it('is online only when the browser is online and not serving from cache', () => {
    expect(deriveOnline(true, false)).toBe(true)
    expect(deriveOnline(true, true)).toBe(false) // connected-but-dead network
    expect(deriveOnline(false, false)).toBe(false)
  })
})

describe('deriveSyncing', () => {
  it('is syncing only with pending writes while online', () => {
    expect(deriveSyncing(3, true)).toBe(true)
    expect(deriveSyncing(0, true)).toBe(false)
    expect(deriveSyncing(3, false)).toBe(false) // offline with pending = not syncing
  })
})
