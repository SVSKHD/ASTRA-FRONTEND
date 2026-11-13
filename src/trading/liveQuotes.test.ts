// Stream quotes reach a table at most once per interval, only for its rows, and
// a change of rows is applied at once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useLiveQuotes } from '@/trading/liveQuotes'
import { live, type StreamQuote } from '@/trading/stream'

const tick = (id: number, ltp: string): StreamQuote => ({
  instrument_id: id,
  ref: `NSE_EQ:${id}`,
  ltp,
  ltt: null,
  volume: null,
  stale: false,
  received_at: new Date().toISOString(),
  source: 'broker',
})

beforeEach(() => {
  vi.useFakeTimers()
  for (const k of Object.keys(live.quotes)) delete live.quotes[Number(k)]
})
afterEach(() => vi.useRealTimers())

describe('useLiveQuotes', () => {
  it('batches ticks to one update per interval and ignores other instruments', async () => {
    const ids = ref([1, 2])
    const scope = effectScope()
    const q = scope.run(() => useLiveQuotes(() => ids.value, 1000))!
    const first = q.value
    expect(first.size).toBe(0)

    live.quotes[3] = tick(3, '1') // not on this table
    await nextTick()
    vi.advanceTimersByTime(1000)
    expect(q.value).toBe(first)

    live.quotes[1] = tick(1, '10')
    await nextTick()
    live.quotes[1] = tick(1, '11')
    await nextTick()
    live.quotes[2] = tick(2, '20')
    await nextTick()
    expect(q.value).toBe(first) // nothing yet
    vi.advanceTimersByTime(1000)
    expect(q.value.get(1)?.ltp).toBe('11')
    expect(q.value.get(2)?.ltp).toBe('20')

    ids.value = [3]
    await nextTick()
    expect([...q.value.keys()]).toEqual([3]) // a new page is shown at once
    scope.stop()
  })
})
