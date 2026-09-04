// Item 4 of section 42, as a test rather than as a screenshot of a devtools
// panel: does typing in the form re-render the rest of the tab, and does the
// desk's per-second countdown re-render its parent?
//
// Both are answered by counting the PARENT's render function calls. That is
// the number the performance panel would show, and unlike the panel it fails a
// build when somebody reintroduces the coupling.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SessionDesk from '@/components/trades/SessionDesk.vue'
import TradeForm from '@/components/trades/TradeForm.vue'
import { DEFAULT_LOGGER_SETTINGS } from '@/utils/tradeMath'
import { DEFAULT_COLLECTIONS, DEFAULT_WATCH_SETTINGS } from '@/utils/collections'

const settings = { ...DEFAULT_LOGGER_SETTINGS, ...DEFAULT_COLLECTIONS, ...DEFAULT_WATCH_SETTINGS }
const broker = { zone: 'Europe/Athens', offsetMinutes: 180 }

/**
 * A parent that counts its own renders and holds the child plus a stand-in for
 * everything else on the tab — the calendar, the table, the timeline. If the
 * count moves, the whole tab was rebuilt.
 */
function countingParent(child: unknown, props: Record<string, unknown>) {
  const renders = { n: 0 }
  const Parent = defineComponent({
    setup() {
      return () => {
        renders.n += 1
        return h('div', [
          h(child as never, props),
          h('section', { 'data-role': 'the rest of the tab' }, 'calendar, table, timeline'),
        ])
      }
    },
  })
  return { Parent, renders }
}

describe('typing in the form leaves the rest of the tab alone', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('does not re-render the parent on a keystroke in Entry', async () => {
    const { Parent, renders } = countingParent(TradeForm, { settings })
    const wrapper = mount(Parent)
    expect(renders.n).toBe(1)

    const entry = wrapper.find('[data-field="entry"] input')
    expect(entry.exists()).toBe(true)
    for (const value of ['2', '24', '240', '2400']) {
      await entry.setValue(value)
      await nextTick()
    }

    // Four keystrokes, no second render: the form's state is its own, and the
    // preview beside it is a computed rather than a write to anything shared.
    expect(renders.n).toBe(1)
    wrapper.unmount()
  })
})

describe('the desk owns its own second hand', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('ticks without re-rendering the tab around it', async () => {
    vi.useFakeTimers()
    try {
      const { Parent, renders } = countingParent(SessionDesk, {
        broker,
        bounds: settings.sessionBounds,
        signals: [],
      })
      const wrapper = mount(Parent)
      expect(renders.n).toBe(1)
      const before = wrapper.find('.desk__countdown').text()

      // Five seconds of ticking. This used to be five rebuilds of the tab's
      // whole template, because the countdown was a prop the parent passed down.
      vi.advanceTimersByTime(5_000)
      await nextTick()

      expect(wrapper.find('.desk__countdown').text()).not.toBe(before)
      expect(renders.n).toBe(1)
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})
