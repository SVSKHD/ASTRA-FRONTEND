// The dock's contract: all nine sections are reachable as icon buttons (labels
// live in aria-label / hover tooltips, not visible text), the active one carries
// aria-current, clicking a section activates it, and the wheel rotates the
// carousel — wrapping around from the first section to the last.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FloatingDock from '@/components/FloatingDock.vue'
import { useUiStore } from '@/stores/ui'
import { TABS } from '@/tabs.config'

describe('<FloatingDock />', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders one icon button per section, labelled for a11y', () => {
    const wrapper = mount(FloatingDock)
    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBe(TABS.length)
    const labels = buttons.map((b) => b.attributes('aria-label'))
    expect(labels).toEqual(TABS.map((t) => t.label))
  })

  it('marks the active section with aria-current', () => {
    const ui = useUiStore()
    ui.setTab('tasks')
    const wrapper = mount(FloatingDock)
    const tasks = wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'Tasks')
    expect(tasks!.attributes('aria-current')).toBe('page')
  })

  it('clicking a section activates it', async () => {
    const ui = useUiStore()
    const wrapper = mount(FloatingDock)
    expect(ui.tab).toBe('overview')
    const trips = wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'Trips')
    await trips!.trigger('click')
    expect(ui.tab).toBe('trips')
  })

  // The wheel only turns the dock once the pointer has rested on it, so a page
  // scroll that drifts across the rail does not change tab.
  let clock = 1000
  beforeEach(() => {
    clock = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
  })
  afterEach(() => vi.restoreAllMocks())
  async function restOn(wrapper: ReturnType<typeof mount>) {
    await wrapper.find('nav').trigger('pointerenter')
    clock += 400
  }

  it('wheel rotates the carousel forward', async () => {
    const ui = useUiStore()
    const wrapper = mount(FloatingDock)
    expect(ui.tab).toBe('overview')
    await restOn(wrapper)
    await wrapper.find('nav').trigger('wheel', { deltaY: 120 })
    expect(ui.tab).toBe('todo') // overview → todo
  })

  it('wheel wraps backward from the first section to the last', async () => {
    const ui = useUiStore()
    const wrapper = mount(FloatingDock)
    expect(ui.tab).toBe('overview')
    await restOn(wrapper)
    await wrapper.find('nav').trigger('wheel', { deltaY: -120 })
    expect(ui.tab).toBe(TABS[TABS.length - 1].key) // overview → stocks
  })

  it('ignores a wheel that is only passing over the dock', async () => {
    const ui = useUiStore()
    const wrapper = mount(FloatingDock)
    await wrapper.find('nav').trigger('wheel', { deltaY: 120 })
    await wrapper.find('nav').trigger('pointerenter')
    await wrapper.find('nav').trigger('wheel', { deltaY: 120 })
    expect(ui.tab).toBe('overview')
  })

  it('ignores a second click while the icons are still moving', async () => {
    const ui = useUiStore()
    const wrapper = mount(FloatingDock)
    const byLabel = (l: string) =>
      wrapper.findAll('button').find((b) => b.attributes('aria-label') === l)!
    await byLabel('Todo').trigger('click')
    expect(ui.tab).toBe('todo')
    // The icons are mid-slide; this click was aimed at where an icon used to be.
    await byLabel('Goals').trigger('click')
    expect(ui.tab).toBe('todo')
  })

  it('does not treat a drag’s release as a click on whatever slid under it', async () => {
    const ui = useUiStore()
    const wrapper = mount(FloatingDock)
    const nav = wrapper.find('nav').element
    // Native events: test-utils cannot set clientY on a synthetic one.
    const fire = (type: string, clientY = 0) =>
      nav.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true }))
    fire('pointerdown', 200)
    fire('pointermove', 140)
    fire('pointerup')
    const rotated = ui.tab
    expect(rotated).not.toBe('overview')
    // Long after the icons settled, so only the drag guard can stop this click.
    clock += 2000
    const trips = wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'Trips')!
    await trips.trigger('click')
    expect(ui.tab).toBe(rotated)
  })
})
