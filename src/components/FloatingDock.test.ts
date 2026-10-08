// The dock's contract: the open section sits in the fixed middle tile; picking
// another scrolls the column until it is in the tile and only then changes the
// tab; the column is a ring (there is always a section either side); the wheel
// turns it only once the pointer has rested on the dock; and the "All
// sections" menu reaches every section by name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FloatingDock from '@/components/FloatingDock.vue'
import { useUiStore } from '@/stores/ui'
import { TABS } from '@/tabs.config'

type Wrapper = ReturnType<typeof mount>

// The section in the middle tile, and the visible column top to bottom.
const centre = (w: Wrapper) => w.find('button.dock-item.is-centre').attributes('aria-label')
const column = (w: Wrapper) =>
  w
    .findAll('button.dock-item')
    .filter((b) => !b.classes().includes('is-edge'))
    .map((b) => b.attributes('aria-label'))
const byLabel = (w: Wrapper, label: string) =>
  w.findAll('button.dock-item').find((b) => b.attributes('aria-label') === label)!

describe('<FloatingDock />', () => {
  let clock = 1000
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    clock = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('puts the open section in the middle, with neighbours either side', () => {
    const ui = useUiStore()
    ui.setTab('goals')
    const wrapper = mount(FloatingDock)
    expect(centre(wrapper)).toBe('Goals')
    const col = column(wrapper)
    expect(col).toHaveLength(7)
    expect(col[3]).toBe('Goals')
    expect(byLabel(wrapper, 'Goals').attributes('aria-current')).toBe('page')
  })

  it('wraps round: the first section still has neighbours above it', () => {
    const wrapper = mount(FloatingDock)
    expect(centre(wrapper)).toBe('Overview')
    expect(column(wrapper).slice(0, 3)).toEqual(TABS.slice(-3).map((t) => t.label))
  })

  it('clicking a section scrolls it into the tile, then opens it', async () => {
    const ui = useUiStore()
    const wrapper = mount(FloatingDock)
    await byLabel(wrapper, 'Tasks').trigger('click')
    // The column has moved; the content has not changed yet.
    expect(centre(wrapper)).toBe('Tasks')
    expect(ui.tab).toBe('overview')
    vi.advanceTimersByTime(400)
    expect(ui.tab).toBe('tasks')
  })

  it('a second pick before the column settles opens only the last one', async () => {
    const ui = useUiStore()
    const wrapper = mount(FloatingDock)
    await byLabel(wrapper, 'Todo').trigger('click')
    vi.advanceTimersByTime(200)
    await byLabel(wrapper, 'Tasks').trigger('click')
    vi.advanceTimersByTime(200)
    expect(ui.tab).toBe('overview')
    vi.advanceTimersByTime(300)
    expect(ui.tab).toBe('tasks')
  })

  it('the wheel scrolls only after the pointer has rested on the dock', async () => {
    const ui = useUiStore()
    const wrapper = mount(FloatingDock)
    const nav = wrapper.find('nav')
    await nav.trigger('wheel', { deltaY: 120 })
    expect(centre(wrapper)).toBe('Overview')

    await nav.trigger('pointerenter')
    clock += 400
    await nav.trigger('wheel', { deltaY: 120 })
    expect(centre(wrapper)).toBe('Todo')
    vi.advanceTimersByTime(400)
    expect(ui.tab).toBe('todo')
  })

  it('the All sections menu scrolls a far section into the tile and opens it', async () => {
    const ui = useUiStore()
    const wrapper = mount(FloatingDock, { attachTo: document.body })
    await wrapper.find('button.dock-more').trigger('click')
    const items = wrapper.findAll('[role="menuitem"]')
    expect(items.map((b) => b.text())).toEqual(TABS.map((t) => t.label))
    await items.find((b) => b.text() === 'Trips')!.trigger('click')
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    // Walked there a slot at a time, then opened.
    vi.advanceTimersByTime(2000)
    await wrapper.vm.$nextTick()
    expect(centre(wrapper)).toBe('Trips')
    expect(ui.tab).toBe('trips')
    wrapper.unmount()
  })

  it('a tab opened elsewhere scrolls the column to it', async () => {
    const ui = useUiStore()
    const wrapper = mount(FloatingDock)
    ui.setTab('reminders')
    await wrapper.vm.$nextTick()
    vi.advanceTimersByTime(2000)
    await wrapper.vm.$nextTick()
    expect(centre(wrapper)).toBe('Reminders')
  })

  it('Escape and a click outside both close the menu', async () => {
    const wrapper = mount(FloatingDock, { attachTo: document.body })
    await wrapper.find('button.dock-more').trigger('click')
    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)

    await wrapper.find('button.dock-more').trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
