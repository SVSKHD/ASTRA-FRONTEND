import { describe, expect, it, vi } from 'vitest'
import { WriteQueue, debounce, resolveConflict, shouldBuffer } from '@/utils/syncGuard'

interface Doc {
  id: number
  title: string
  notes: string
  updatedAt: number
}
const doc = (over: Partial<Doc> = {}): Doc => ({
  id: 1,
  title: 'base',
  notes: 'base',
  updatedAt: 100,
  ...over,
})

describe('shouldBuffer', () => {
  it('buffers an item that is being edited or is dirty', () => {
    expect(shouldBuffer(1, new Set([1]), new Set())).toBe(true)
    expect(shouldBuffer(1, new Set(), new Set([1]))).toBe(true)
    expect(shouldBuffer(1, new Set([2]), new Set([3]))).toBe(false)
  })
})

describe('resolveConflict', () => {
  const base = doc({ updatedAt: 100 })

  it('keeps local and discards a remote unchanged since base', () => {
    const local = doc({ title: 'my edit', updatedAt: 150 })
    const remote = doc({ updatedAt: 100 }) // same as base
    const res = resolveConflict(base, local, remote, new Set(['title']))
    expect(res.merged.title).toBe('my edit')
    expect(res.hasConflict).toBe(false)
  })

  it('keeps local and discards when there is no buffered remote', () => {
    const local = doc({ title: 'my edit' })
    const res = resolveConflict(base, local, undefined, new Set(['title']))
    expect(res.merged.title).toBe('my edit')
    expect(res.hasConflict).toBe(false)
  })

  it('never overwrites a touched field, but adopts remote for untouched fields', () => {
    // User edited title; remote (newer) changed notes only.
    const local = doc({ title: 'my edit', notes: 'base', updatedAt: 150 })
    const remote = doc({ title: 'base', notes: 'remote note', updatedAt: 200 })
    const res = resolveConflict(base, local, remote, new Set(['title']))
    expect(res.merged.title).toBe('my edit') // touched → local wins
    expect(res.merged.notes).toBe('remote note') // untouched → remote applied
    expect(res.hasConflict).toBe(false) // no contended field
  })

  it('flags a conflict when remote changed a field the user was editing', () => {
    const local = doc({ title: 'my edit', updatedAt: 150 })
    const remote = doc({ title: 'their edit', updatedAt: 200 })
    const res = resolveConflict(base, local, remote, new Set(['title']))
    expect(res.merged.title).toBe('my edit') // local still wins
    expect(res.hasConflict).toBe(true)
  })
})

describe('WriteQueue', () => {
  it('serialises writes for the same id in enqueue order', async () => {
    const q = new WriteQueue()
    const log: string[] = []
    const make = (label: string, delay: number) => () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          log.push(label)
          resolve()
        }, delay),
      )
    // A slow first write must still land before a fast second one.
    const a = q.enqueue(1, make('a', 30))
    const b = q.enqueue(1, make('b', 1))
    await Promise.all([a, b])
    expect(log).toEqual(['a', 'b'])
  })

  it('runs different ids independently and survives a rejection', async () => {
    const q = new WriteQueue()
    const bad = q.enqueue(1, () => Promise.reject(new Error('boom'))).catch(() => 'caught')
    const good = q.enqueue(1, () => Promise.resolve('ok'))
    expect(await bad).toBe('caught')
    expect(await good).toBe('ok')
  })
})

describe('debounce', () => {
  it('coalesces rapid calls and force-flushes on demand', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 400)
    d.schedule()
    d.schedule()
    d.schedule()
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(fn).toHaveBeenCalledTimes(1)
    d.schedule()
    d.flush() // force before the timer
    expect(fn).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
