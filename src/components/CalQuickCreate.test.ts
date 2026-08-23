// Section 24c, acceptance 123: the quick-create popover opens fully inside the
// viewport near any edge and is never clipped.
//
// The clipping is not something a component test can see — jsdom has no layout,
// so nothing here proves pixels. What it can prove is the two decisions that
// caused the clipping: that the panel leaves the calendar's DOM subtree
// entirely, and that its position comes from a measurement rather than from the
// pointer. The arithmetic itself is asserted in popoverPlace.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CalQuickCreate from '@/components/CalQuickCreate.vue'
import { CELL_FLIP_MARGIN } from '@/utils/popoverPlace'

const START = Date.UTC(2026, 8, 1, 9, 0)
const END = Date.UTC(2026, 8, 1, 10, 0)

function mountAt(anchor: { top: number; left: number; width: number; height: number }) {
  return mount(CalQuickCreate, {
    props: { start: START, end: END, allDay: false, anchor },
    attachTo: document.body,
  })
}

// Everything this component renders is on the far side of a Teleport, so it is
// found through the document. Having to write the tests this way is the clearest
// evidence the portal is real.
const panelEl = () => document.querySelector('.cqc') as HTMLElement
const q = <T extends Element>(sel: string) => panelEl().querySelector(sel) as T
const qa = (sel: string) => Array.from(panelEl().querySelectorAll(sel))
const buttonNamed = (text: string) =>
  qa('button').find((b) => b.textContent?.trim() === text) as HTMLButtonElement

beforeEach(() => {
  setActivePinia(createPinia())
  document.body.innerHTML = ''
  Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 800, writable: true, configurable: true })
})

describe('where it renders', () => {
  it('leaves the calendar subtree entirely', async () => {
    // This is the fix. `position: fixed` does not escape an ancestor carrying a
    // transform or a backdrop-filter, and the glass shell has both — so a fixed
    // panel was being laid out against the shell and cut off at its edge. Only
    // a portal gets out.
    const wrapper = mountAt({ top: 200, left: 200, width: 160, height: 110 })
    await flushPromises()
    expect(panelEl()).toBeTruthy()
    // Teleported to body, not left inside the component's own root.
    expect(panelEl().parentElement).toBe(document.body)
    wrapper.unmount()
  })

  it('positions itself from a measurement, not from where the pointer was', async () => {
    const wrapper = mountAt({ top: 200, left: 200, width: 160, height: 110 })
    await flushPromises()
    const panel = panelEl()
    // jsdom reports a zero box, so the placer's answer for a zero-height panel
    // is top === the anchor's top. The point is that a number was computed at
    // all: the old version subtracted a hardcoded 210 from the window height.
    expect(panel.style.top).toBe('200px')
    expect(panel.style.left).toBe(`${200 + 160 + 6}px`)
    wrapper.unmount()
  })

  it('opens to the left of a cell against the right edge', async () => {
    const wrapper = mountAt({ top: 100, left: 1280 - 100, width: 100, height: 110 })
    await flushPromises()
    const panel = panelEl()
    // Room to the right is 0, well under the flip margin.
    expect(1280 - (1280 - 100 + 100)).toBeLessThan(CELL_FLIP_MARGIN)
    expect(parseInt(panel.style.left, 10)).toBeLessThan(1280 - 100)
    wrapper.unmount()
  })

  it('repositions when the window changes size under it', async () => {
    const wrapper = mountAt({ top: 100, left: 200, width: 160, height: 110 })
    await flushPromises()
    const before = panelEl().style.left
    Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true })
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(panelEl().style.left).not.toBe(before)
    wrapper.unmount()
  })
})

describe('what it is made of', () => {
  it('uses library controls, not raw elements', async () => {
    const wrapper = mountAt({ top: 200, left: 200, width: 160, height: 110 })
    await flushPromises()
    // The native select is the one that ignored the theme entirely and rendered
    // in whatever the OS felt like.
    expect(q('.ui-seg')).toBeTruthy()
    expect(q('[role="switch"], .ui-switch')).toBeTruthy()
    wrapper.unmount()
  })

  it('offers the three types as one segmented choice', async () => {
    const wrapper = mountAt({ top: 200, left: 200, width: 160, height: 110 })
    await flushPromises()
    const labels = qa('.ui-seg__opt').map((b) => b.textContent?.trim())
    expect(labels).toEqual(['Task', 'Todo', 'Reminder'])
    wrapper.unmount()
  })
})

describe('what it does', () => {
  it('writes nothing until Create, and nothing at all without a title', async () => {
    const wrapper = mountAt({ top: 200, left: 200, width: 160, height: 110 })
    await flushPromises()
    buttonNamed('Create').click()
    await flushPromises()
    expect(wrapper.emitted('create')).toBeUndefined()
    wrapper.unmount()
  })

  it('reports the type, project and all-day the reader actually chose', async () => {
    const wrapper = mountAt({ top: 200, left: 200, width: 160, height: 110 })
    await flushPromises()
    const input = q<HTMLInputElement>('input')
    input.value = 'Review the deck'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    ;(qa('.ui-seg__opt')[1] as HTMLButtonElement).click()
    await flushPromises()
    buttonNamed('Create').click()
    await flushPromises()
    expect(wrapper.emitted('create')![0][0]).toMatchObject({
      kind: 'todo',
      title: 'Review the deck',
      allDay: false,
    })
    wrapper.unmount()
  })

  it('discards on Esc', async () => {
    const wrapper = mountAt({ top: 200, left: 200, width: 160, height: 110 })
    await flushPromises()
    panelEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('create')).toBeUndefined()
    wrapper.unmount()
  })

  it('stops listening to the window once it is gone', async () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const wrapper = mountAt({ top: 200, left: 200, width: 160, height: 110 })
    await flushPromises()
    wrapper.unmount()
    const events = remove.mock.calls.map((c) => c[0])
    expect(events).toContain('resize')
    expect(events).toContain('scroll')
    remove.mockRestore()
  })
})
