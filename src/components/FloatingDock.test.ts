// The dock's contract: all nine sections are reachable as icon buttons (labels
// live in aria-label / hover tooltips, not visible text), the active one carries
// aria-current, clicking a section activates it, and the wheel rotates the
// carousel — wrapping around from the first section to the last.
import { beforeEach, describe, expect, it } from 'vitest'
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

  it('wheel rotates the carousel forward', async () => {
    const ui = useUiStore()
    const wrapper = mount(FloatingDock)
    expect(ui.tab).toBe('overview')
    await wrapper.find('nav').trigger('wheel', { deltaY: 120 })
    expect(ui.tab).toBe('todo') // overview → todo
  })

  it('wheel wraps backward from the first section to the last', async () => {
    const ui = useUiStore()
    const wrapper = mount(FloatingDock)
    expect(ui.tab).toBe('overview')
    await wrapper.find('nav').trigger('wheel', { deltaY: -120 })
    expect(ui.tab).toBe(TABS[TABS.length - 1].key) // overview → stocks
  })
})
