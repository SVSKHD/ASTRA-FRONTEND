// The grid's virtualisation (section 19d, acceptance 94): a long list renders
// only the rows on screen, a short one is left to the browser.
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import GoalGrid from '@/components/goals/GoalGrid.vue'
import { VIRTUALISE_FROM } from '@/utils/gridRows'

// jsdom has neither layout nor a ResizeObserver, so the grid is given a width
// and a scroll viewport the way a browser would.
function stubLayout(width = 1240, height = 800) {
  // The virtualiser learns its viewport height from a ResizeObserver, so the
  // stub has to actually report one — an observer that never fires leaves it
  // believing the scroller is zero pixels tall and rendering no rows at all.
  const rect = { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0 }
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: (entries: { contentRect: typeof rect }[]) => void) {}
      observe() {
        this.cb([{ contentRect: rect }])
      }
      disconnect() {}
    },
  )
  // offsetWidth/offsetHeight live on HTMLElement.prototype in jsdom, and the
  // virtualiser reads exactly those — defining them on Element.prototype is
  // shadowed and silently reports a zero-sized viewport.
  const sizes = [
    [HTMLElement.prototype, 'offsetWidth', width],
    [HTMLElement.prototype, 'offsetHeight', height],
    [Element.prototype, 'clientWidth', width],
    [Element.prototype, 'clientHeight', height],
  ] as const
  const saved = sizes.map(
    ([target, prop]) => [target, prop, Object.getOwnPropertyDescriptor(target, prop)] as const,
  )
  for (const [target, prop, value] of sizes) {
    Object.defineProperty(target, prop, { configurable: true, get: () => value })
  }
  const savedRect = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect
  return () => {
    for (const [target, prop, descriptor] of saved) {
      if (descriptor) Object.defineProperty(target, prop, descriptor)
      else delete (target as unknown as Record<string, unknown>)[prop]
    }
    Element.prototype.getBoundingClientRect = savedRect
    vi.unstubAllGlobals()
  }
}

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, updatedAt: 0, title: `goal ${i + 1}` }))

function mountGrid(count: number) {
  return mount(GoalGrid, {
    props: { items: items(count) },
    slots: { default: '<div class="cell">{{ params.item.title }}</div>' },
    attachTo: document.body,
  })
}

describe('a short list', () => {
  it('renders every card and leaves the grid to the browser', () => {
    const restore = stubLayout()
    const wrapper = mountGrid(12)
    expect(wrapper.findAll('.cell')).toHaveLength(12)
    expect(wrapper.find('.ggrid__plain').exists()).toBe(true)
    expect(wrapper.find('.ggrid__runway').exists()).toBe(false)
    restore()
  })

  it('is still not virtualised exactly at the threshold', () => {
    const restore = stubLayout()
    const wrapper = mountGrid(VIRTUALISE_FROM)
    expect(wrapper.find('.ggrid__runway').exists()).toBe(false)
    restore()
  })

  it('renders nothing for an empty list without falling over', () => {
    const restore = stubLayout()
    const wrapper = mountGrid(0)
    expect(wrapper.findAll('.cell')).toHaveLength(0)
    restore()
  })
})

describe('a long list (acceptance 94)', () => {
  it('takes over past the threshold', async () => {
    const restore = stubLayout()
    const wrapper = mountGrid(200)
    await flushPromises()
    await nextTick()
    expect(wrapper.find('.ggrid__runway').exists()).toBe(true)
    expect(wrapper.find('.ggrid__plain').exists()).toBe(false)
    restore()
  })

  it('renders a handful of rows, not two hundred cards', async () => {
    const restore = stubLayout()
    const wrapper = mountGrid(200)
    // The virtualiser publishes its first range through a frame callback, so
    // this waits for it rather than assuming a tick is enough.
    await vi.waitFor(() => expect(wrapper.findAll('.cell').length).toBeGreaterThan(0))
    const rendered = wrapper.findAll('.cell').length
    // An 800px viewport holds ~4 rows of 196px, plus 2 rows of overscan, at
    // four columns — nowhere near the whole list.
    expect(rendered).toBeLessThan(60)
    restore()
  })

  it('gives the scroller the full height of the list, so the bar is honest', async () => {
    const restore = stubLayout()
    const wrapper = mountGrid(200)
    await flushPromises()
    await nextTick()
    const runway = wrapper.find('.ggrid__runway').element as HTMLElement
    // 200 cards over 4 columns = 50 rows of 196px.
    expect(parseInt(runway.style.height, 10)).toBeGreaterThan(5000)
    restore()
  })

  it('starts from the first card', async () => {
    const restore = stubLayout()
    const wrapper = mountGrid(200)
    await vi.waitFor(() => expect(wrapper.find('.cell').exists()).toBe(true))
    expect(wrapper.find('.cell').text()).toBe('goal 1')
    restore()
  })

  it('narrows to one column on mobile', async () => {
    const restore = stubLayout(390)
    const wrapper = mount(GoalGrid, {
      props: { items: items(200), mobile: true },
      slots: { default: '<div class="cell">{{ params.item.title }}</div>' },
      attachTo: document.body,
    })
    await flushPromises()
    await nextTick()
    expect((wrapper.vm as unknown as { columns: number }).columns).toBe(1)
    restore()
  })
})
