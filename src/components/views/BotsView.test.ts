// BotsView renders the seeded bots as cards, shows the zero-state with no bots,
// and drives the enable toggle through the store (paper/demo toggle instantly).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import BotsView from '@/components/views/BotsView.vue'
import { useAppStore } from '@/stores/app'
import { vHoverStyle } from '@/directives/hoverStyle'
import { seedBots } from '@/utils/bots'

const global = { directives: { 'hover-style': vHoverStyle } }

describe('<BotsView />', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  it('shows the connect-a-bot zero state when there are no bots', () => {
    const app = useAppStore()
    app.bots = []
    const wrapper = mount(BotsView, { global })
    expect(wrapper.text()).toContain('No bots connected')
  })

  it('renders a card per seeded bot with its symbol and mode', () => {
    const app = useAppStore()
    app.bots = seedBots(() => Math.floor(Math.random() * 1e9), Date.now())
    const wrapper = mount(BotsView, { global })
    expect(wrapper.text()).toContain('Aureon Hedge')
    expect(wrapper.text()).toContain('XAUUSD')
    expect(wrapper.text()).toContain('Good-day Sniper')
    // Daily-loss readout present.
    expect(wrapper.text()).toContain('of −$600')
  })

  it('toggling a paper bot enables it through the store', async () => {
    const app = useAppStore()
    app.bots = seedBots(() => Math.floor(Math.random() * 1e9), Date.now())
    const wrapper = mount(BotsView, { global })
    const toggles = wrapper.findAll('[role="switch"]')
    expect(toggles.length).toBe(2)
    await toggles[0].trigger('click')
    expect(app.bots[0].enabled).toBe(true)
    expect(app.bots[0].pending).toBe(true)
  })

  it('offers the kill switch only when a bot is enabled', async () => {
    const app = useAppStore()
    app.bots = seedBots(() => Math.floor(Math.random() * 1e9), Date.now())
    const wrapper = mount(BotsView, { global })
    expect(wrapper.text()).not.toContain('Stop all bots')
    app.bots = app.bots.map((b) => ({ ...b, enabled: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Stop all bots')
  })
})
