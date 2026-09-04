// The three numbers that make a save readable (section 41), each tested as the
// behaviour it buys rather than as the constant it is.
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import {
  CHECK_HOLD_MS,
  MIN_VISIBLE_MS,
  RING_DELAY_MS,
  useSaveState,
} from '@/composables/useSaveState'

/** The composable needs an owner for its unmount cleanup. */
function host() {
  let api!: ReturnType<typeof useSaveState>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useSaveState()
        return () => null
      },
    }),
  )
  return { api, wrapper }
}

/** Advance timers and let every awaited continuation run. */
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
  await nextTick()
}

describe('a save shows nothing until it is worth showing', () => {
  it('never shows a ring for a save that finishes in 80ms', async () => {
    vi.useFakeTimers()
    try {
      const { api, wrapper } = host()
      const run = api.run(() => new Promise((r) => setTimeout(() => r('id'), 80)))
      await advance(80)
      // The whole point: 80ms is instantaneous, and a loader about work that is
      // already done is a distraction.
      expect(api.state.value).not.toBe('working')
      await run
      // The confirmation still happens — it is the loader that is skipped, not
      // the answer.
      expect(api.state.value).toBe('done')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the ring once a save passes 150ms', async () => {
    vi.useFakeTimers()
    try {
      const { api, wrapper } = host()
      const run = api.run(() => new Promise((r) => setTimeout(() => r('id'), 1_000)))
      await advance(RING_DELAY_MS - 10)
      expect(api.state.value).toBe('idle')
      await advance(20)
      expect(api.state.value).toBe('working')
      await advance(1_000)
      await run
      expect(api.state.value).toBe('done')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('holds a ring it did show for at least 400ms, so it cannot flicker', async () => {
    vi.useFakeTimers()
    try {
      const { api, wrapper } = host()
      // Finishes at 190ms: 40ms after the ring appeared. Without the floor that
      // is a flash nobody can read, and a flash reads as a fault.
      const run = api.run(() => new Promise((r) => setTimeout(() => r('id'), 190)))
      await advance(200)
      expect(api.state.value).toBe('working')
      await advance(MIN_VISIBLE_MS - 60)
      expect(api.state.value).toBe('working')
      await advance(100)
      await run
      expect(api.state.value).toBe('done')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('how a save ends', () => {
  it('holds the check 600ms and then goes quiet', async () => {
    vi.useFakeTimers()
    try {
      const { api, wrapper } = host()
      await api.run(async () => 'id')
      expect(api.state.value).toBe('done')
      await advance(CHECK_HOLD_MS - 50)
      expect(api.state.value).toBe('done')
      await advance(100)
      expect(api.state.value).toBe('idle')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves a failure on screen until it is acknowledged', async () => {
    vi.useFakeTimers()
    try {
      const { api, wrapper } = host()
      const result = await api.run(async () => {
        throw new Error('refused')
      })
      expect(result).toBeUndefined()
      expect(api.state.value).toBe('failed')
      // Ten seconds later it is still there. The one state that must not
      // disappear on its own is the one that means it did not happen.
      await advance(10_000)
      expect(api.state.value).toBe('failed')
      api.acknowledge()
      expect(api.state.value).toBe('idle')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})
