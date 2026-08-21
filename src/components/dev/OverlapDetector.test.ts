// Section 21c's detector, against a laid-out page.
//
// jsdom does no layout, so every box it reports is zero — which makes it a poor
// place to test geometry, and a fine place to test the two things that are not
// geometry: that the panel is development-only, and that it says what it found
// in words somebody can act on. The measuring itself is tested in
// utils/overlap.test.ts, where the boxes are real numbers.
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import OverlapDetector from '@/components/dev/OverlapDetector.vue'

// Give jsdom a layout to read. Without this every rect is 0×0 and every element
// is skipped as "not laid out yet".
function layout(boxes: Record<string, [number, number, number, number]>) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const key = (this as HTMLElement).dataset?.box
    const [left, top, width, height] = (key && boxes[key]) || [0, 0, 0, 0]
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect
  })
}

describe('the panel', () => {
  it('exists in development', () => {
    const wrapper = mount(OverlapDetector)
    expect(wrapper.find('.odet').exists()).toBe(import.meta.env.DEV)
  })

  it('says nothing until it is asked', () => {
    const wrapper = mount(OverlapDetector)
    expect(wrapper.text()).toContain('data-overlap-ok')
    expect(wrapper.find('.odet__summary').exists()).toBe(false)
  })
})

describe('what it reports', () => {
  it('names the two things sitting on each other', async () => {
    document.body.innerHTML = `
      <div id="page">
        <span data-box="title">A title</span>
        <span data-box="badge">Badge</span>
      </div>`
    layout({ title: [0, 0, 200, 20], badge: [180, 4, 60, 20] })
    const wrapper = mount(OverlapDetector, { props: { root: '#page' } })
    await wrapper.find('.odet__btn').trigger('click')
    const rows = wrapper.findAll('.odet__row')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('20×16px')
    expect(rows[0].text()).toContain('A title')
    expect(rows[0].text()).toContain('Badge')
    vi.restoreAllMocks()
  })

  it('says so plainly when the page lays out correctly', async () => {
    document.body.innerHTML = `
      <div id="page">
        <span data-box="a">One</span>
        <span data-box="b">Two</span>
      </div>`
    layout({ a: [0, 0, 200, 20], b: [0, 24, 200, 20] })
    const wrapper = mount(OverlapDetector, { props: { root: '#page' } })
    await wrapper.find('.odet__btn').trigger('click')
    expect(wrapper.find('.odet__clean').exists()).toBe(true)
    vi.restoreAllMocks()
  })

  it('leaves a deliberate stack alone when it says so', async () => {
    // The escape hatch: some things are meant to sit on each other.
    document.body.innerHTML = `
      <div id="page" >
        <div data-overlap-ok>
          <span data-box="under">Underneath</span>
          <span data-box="over">On top</span>
        </div>
      </div>`
    layout({ under: [0, 0, 200, 40], over: [10, 10, 100, 20] })
    const wrapper = mount(OverlapDetector, { props: { root: '#page' } })
    await wrapper.find('.odet__btn').trigger('click')
    expect(wrapper.find('.odet__clean').exists()).toBe(true)
    vi.restoreAllMocks()
  })

  it('ignores a wrapper with no words of its own', async () => {
    // Otherwise every ancestor of every word is a candidate and the report is
    // the DOM tree.
    document.body.innerHTML = `
      <div id="page">
        <div data-box="wrap"><span data-box="word">Only this holds text</span></div>
      </div>`
    layout({ wrap: [0, 0, 200, 40], word: [0, 0, 200, 20] })
    const wrapper = mount(OverlapDetector, { props: { root: '#page' } })
    await wrapper.find('.odet__btn').trigger('click')
    expect(wrapper.find('.odet__summary').text()).toContain('1 boxes')
    vi.restoreAllMocks()
  })
})
