// The rail's headline contract: every one of the nine tabs is present at once,
// there is no carousel/arrow control, and clicking a tab switches the active
// section. Mounted with just Pinia — the rail reads the ui/app/auth/lock stores.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import LeftRail from '@/components/LeftRail.vue'
import { useUiStore } from '@/stores/ui'
import { vHoverStyle } from '@/directives/hoverStyle'
import { TABS } from '@/tabs.config'

// The v-hover-style directive is registered globally in main.ts; supply it to
// the isolated mount so the rail renders without a "failed to resolve" warning.
const global = { directives: { 'hover-style': vHoverStyle } }

describe('<LeftRail />', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders every tab label simultaneously (no scroll, no carousel)', () => {
    const ui = useUiStore()
    ui.setRailCollapsed(false) // expanded → labels visible
    const wrapper = mount(LeftRail, { global })
    for (const t of TABS) {
      expect(wrapper.text()).toContain(t.label)
    }
  })

  it('has no previous/next carousel arrows', () => {
    const wrapper = mount(LeftRail, { global })
    const labels = wrapper.findAll('[aria-label]').map((n) => n.attributes('aria-label'))
    expect(labels.some((l) => /previous tab|next tab/i.test(l ?? ''))).toBe(false)
    expect(wrapper.text()).not.toContain('‹')
    expect(wrapper.text()).not.toContain('›')
  })

  it('clicking a tab activates it in the ui store', async () => {
    const ui = useUiStore()
    ui.setRailCollapsed(false)
    const wrapper = mount(LeftRail, { global })
    expect(ui.tab).toBe('overview')
    const finances = wrapper
      .findAll('button')
      .find((b) => b.attributes('aria-label') === 'Finances')
    expect(finances).toBeTruthy()
    await finances!.trigger('click')
    expect(ui.tab).toBe('finances')
  })

  it('marks the active tab with aria-current', () => {
    const ui = useUiStore()
    ui.setTab('tasks')
    const wrapper = mount(LeftRail, { global })
    const tasks = wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'Tasks')
    expect(tasks!.attributes('aria-current')).toBe('page')
  })
})
