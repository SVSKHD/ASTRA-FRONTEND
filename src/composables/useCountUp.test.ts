// The count is only worth having if it lands exactly on the value and never
// runs on load — an approximate balance and a dashboard that performs on every
// mount are both worse than a number that simply changes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { COUNT_MS, countAt, easeOutCubic, useCountUp } from '@/composables/useCountUp'

/** Drives requestAnimationFrame by hand so the curve can be stepped. */
function fakeFrames() {
  const queue: FrameRequestCallback[] = []
  let now = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.push(cb)
    return queue.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  return {
    advance(ms: number) {
      now += ms
      const due = queue.splice(0, queue.length)
      for (const cb of due) cb(now)
    },
  }
}

function mountCount(source: { value: number }) {
  const holder: { value?: ReturnType<typeof useCountUp> } = {}
  const wrapper = mount(
    defineComponent({
      setup() {
        holder.value = useCountUp(() => source.value)
        return () => null
      },
    }),
  )
  return { wrapper, display: holder.value! }
}

afterEach(() => vi.unstubAllGlobals())

describe('the curve', () => {
  it('starts fast and settles', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })

  it('clamps rather than overshooting when a frame arrives late', () => {
    expect(easeOutCubic(1.4)).toBe(1)
    expect(countAt(0, 100, 2)).toBe(100)
  })

  it('walks from one value to the other', () => {
    expect(countAt(100, 200, 0)).toBe(100)
    expect(countAt(100, 200, 1)).toBe(200)
    expect(countAt(100, 200, 0.5)).toBeGreaterThan(150)
  })

  it('counts down as readily as up', () => {
    expect(countAt(200, 100, 0.5)).toBeLessThan(150)
  })
})

describe('useCountUp', () => {
  it('shows the value it was given, without counting up to it on mount', () => {
    const frames = fakeFrames()
    const source = ref(1200)
    const { wrapper, display } = mountCount(source)
    expect(display.value).toBe(1200)
    frames.advance(16)
    expect(display.value).toBe(1200)
    wrapper.unmount()
  })

  it('rolls to a new value and lands on it exactly', async () => {
    const frames = fakeFrames()
    const source = ref(0)
    const { wrapper, display } = mountCount(source)

    source.value = 1000
    await nextTick()
    frames.advance(COUNT_MS / 2)
    expect(display.value).toBeGreaterThan(0)
    expect(display.value).toBeLessThan(1000)

    frames.advance(COUNT_MS)
    // Assigned, not eased to: a balance that settles on 999.9998 is a balance
    // that prints as 1000.00 by luck.
    expect(display.value).toBe(1000)
    wrapper.unmount()
  })

  it('retargets mid-roll instead of finishing the old count first', async () => {
    const frames = fakeFrames()
    const source = ref(0)
    const { wrapper, display } = mountCount(source)

    source.value = 1000
    await nextTick()
    frames.advance(COUNT_MS / 4)
    source.value = 50
    await nextTick()
    frames.advance(COUNT_MS)
    expect(display.value).toBe(50)
    wrapper.unmount()
  })

  it('jumps straight to the value when motion is not wanted', async () => {
    fakeFrames()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const source = ref(0)
    const { wrapper, display } = mountCount(source)
    source.value = 900
    await nextTick()
    // No frame has been advanced: the value is simply there.
    expect(display.value).toBe(900)
    wrapper.unmount()
  })

  it('survives an environment with no frames to ask for', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    const source = ref(0)
    const { wrapper, display } = mountCount(source)
    source.value = 12
    await nextTick()
    expect(display.value).toBe(12)
    wrapper.unmount()
  })
})
