// Item 10 of section 42: the offset is applied AFTER the data lands, not on
// mount. That timing is the entire feature — a restore against an empty page is
// clamped to nothing and silently lost — so it is what these tests are about.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useScrollMemory, readOffset, scrollKey } from '@/composables/useScrollMemory'
import { sessionWrite } from '@/composables/useTradeRoute'
import type { TabKey } from '@/types'

function host(tab: ReturnType<typeof ref<TabKey>>) {
  return mount(
    defineComponent({
      setup() {
        useScrollMemory(tab as never)
        return () => h('div')
      },
    }),
  )
}

/** The flag the views set, and the harness waits for, and this waits for. */
function paintReady() {
  const el = document.createElement('div')
  el.setAttribute('data-ready', 'true')
  document.body.appendChild(el)
  return el
}

let scrolledTo: number[] = []

beforeEach(() => {
  document.body.innerHTML = ''
  scrolledTo = []
  try {
    globalThis.sessionStorage?.clear()
  } catch {
    /* still runs where storage is refused */
  }
  window.scrollTo = ((options: { top?: number } | number) => {
    scrolledTo.push(typeof options === 'number' ? options : (options?.top ?? 0))
  }) as typeof window.scrollTo
  // jsdom has no rAF timing of its own worth waiting on.
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    fn(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

describe('a remembered offset waits for the data', () => {
  it('does not scroll while the tab is still loading', async () => {
    sessionWrite(scrollKey('finances'), '2400')
    const tab = ref<TabKey>('finances')
    const wrapper = host(tab)
    await nextTick()
    // Nothing is ready yet, so nothing has been scrolled: applying 2400 to a
    // page four hundred pixels tall is how the offset gets lost.
    expect(scrolledTo).toEqual([])
    wrapper.unmount()
  })

  it('applies it the moment the view says it has its data', async () => {
    sessionWrite(scrollKey('finances'), '2400')
    const tab = ref<TabKey>('finances')
    const wrapper = host(tab)
    await nextTick()
    paintReady()
    // The MutationObserver fires as a microtask.
    await new Promise((r) => setTimeout(r, 0))
    expect(scrolledTo).toContain(2400)
    wrapper.unmount()
  })

  it('sends a tab that was never scrolled to the top', async () => {
    const tab = ref<TabKey>('goals')
    const wrapper = host(tab)
    await nextTick()
    expect(scrolledTo).toEqual([0])
    wrapper.unmount()
  })
})

describe('leaving a tab', () => {
  it('parks where it actually is, not where the throttle last got to', async () => {
    const tab = ref<TabKey>('finances')
    const wrapper = host(tab)
    await nextTick()
    Object.defineProperty(window, 'scrollY', { value: 1234, configurable: true })
    tab.value = 'goals'
    await nextTick()
    expect(readOffset('finances')).toBe(1234)
    wrapper.unmount()
  })

  it('reads back nothing for a tab with no stored offset', () => {
    expect(readOffset('trades')).toBe(0)
    sessionWrite(scrollKey('trades'), 'not a number')
    expect(readOffset('trades')).toBe(0)
  })
})
