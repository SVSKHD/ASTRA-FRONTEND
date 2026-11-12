// The Stocks tab: "My stocks" (the watchlist) by default, and "All instruments"
// (the server's instrument master, every broker symbol) one click away, with the
// choice remembered on this device.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import StocksView from '@/components/views/StocksView.vue'
import { vHoverStyle } from '@/directives/hoverStyle'

// The explorer has its own tests; here it only has to appear.
vi.mock('@/components/trading/TradingExplorer.vue', () => ({
  __esModule: true,
  default: defineComponent({ render: () => h('div', { 'data-testid': 'explorer' }, 'EXPLORER') }),
}))

const global = { directives: { 'hover-style': vHoverStyle } }

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})
afterEach(() => localStorage.clear())

async function choose(w: ReturnType<typeof mount>, label: string) {
  await w
    .findAll('[role="radio"]')
    .find((b) => b.text() === label)!
    .trigger('click')
  await flushPromises()
  await vi.waitFor(() => expect(w.html()).toBeTruthy())
}

describe('<StocksView />', () => {
  it('shows the watchlist first and every instrument on request', async () => {
    const w = mount(StocksView, { global })
    expect(w.text()).toContain('Your watchlist is empty.')
    expect(w.find('[data-testid="explorer"]').exists()).toBe(false)

    await choose(w, 'All instruments')
    await vi.waitFor(() => expect(w.find('[data-testid="explorer"]').exists()).toBe(true))
    expect(w.text()).not.toContain('Your watchlist is empty.')
    expect(localStorage.getItem('aureon.stocks.mode.v1')).toBe('market')

    await choose(w, 'My stocks')
    expect(w.text()).toContain('Your watchlist is empty.')
  })

  it('remembers the last view on this device', async () => {
    localStorage.setItem('aureon.stocks.mode.v1', 'market')
    const w = mount(StocksView, { global })
    await flushPromises()
    await vi.waitFor(() => expect(w.find('[data-testid="explorer"]').exists()).toBe(true))
  })
})
