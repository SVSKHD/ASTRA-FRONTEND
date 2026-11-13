// The Stocks tab: "Watchlists" (the named instrument lists that "Add to
// watchlist" writes to) by default, "My stocks" (tracked stocks with a thesis)
// and "All instruments" (the server's instrument master) one click away, with
// the choice remembered on this device.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h } from 'vue'
import StocksView from '@/components/views/StocksView.vue'
import AddToWatchlist from '@/components/trading/AddToWatchlist.vue'
import { vHoverStyle } from '@/directives/hoverStyle'
import { forgetInstruments } from '@/trading/resolve'
import { resetWatchlistStore } from '@/trading/watchlists'
import type { Instrument } from '@/trading/instruments'

vi.setConfig({ testTimeout: 20_000 })

// The explorer has its own tests; here it only has to appear.
vi.mock('@/components/trading/TradingExplorer.vue', () => ({
  __esModule: true,
  default: defineComponent({ render: () => h('div', { 'data-testid': 'explorer' }, 'EXPLORER') }),
}))

const RELIANCE: Instrument = {
  id: 1,
  broker: 'dhan',
  broker_instrument_id: 'NSE_EQ:2885',
  symbol: 'RELIANCE',
  exchange: 'NSE',
  segment: 'NSE_EQ',
  instrument_type: 'EQUITY',
  underlying: null,
  expiry: null,
  strike: null,
  option_type: null,
  lot_size: '1',
  tick_size: '0.05',
  currency: 'INR',
} as Instrument

class FakeES {
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

const mounted: { unmount(): void }[] = []
beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  resetWatchlistStore()
  forgetInstruments()
  vi.stubGlobal('EventSource', FakeES)
  vi.stubGlobal('fetch', async (req: Request) => {
    const url = new URL(req.url)
    let body: unknown = { detail: 'not found' }
    let status = 404
    if (url.pathname === '/api/trading/instruments') {
      const q = (url.searchParams.get('q') ?? '').toUpperCase()
      const items = [RELIANCE].filter((i) => i.symbol.includes(q))
      ;[status, body] = [200, { items, total: items.length, limit: 500, offset: 0 }]
    } else if (url.pathname === '/api/trading/quotes') {
      ;[status, body] = [200, []]
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
})
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
  localStorage.clear()
})

async function mountStocks() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/stocks')
  const w = mount(StocksView, {
    global: { plugins: [router], directives: { 'hover-style': vHoverStyle } },
    attachTo: document.body,
  })
  mounted.push(w)
  await flushPromises()
  return w
}

async function choose(w: ReturnType<typeof mount>, label: string) {
  await w
    .findAll('[role="radio"]')
    .find((b) => b.text() === label)!
    .trigger('click')
  await flushPromises()
}
async function sees(w: { text(): string }, text: string) {
  await vi.waitFor(() => expect(w.text()).toContain(text), { timeout: 5000, interval: 20 })
}

/** What the instrument detail's "Add to watchlist" does, through the real form. */
async function addFromExplorer(listName: string) {
  const form = mount(AddToWatchlist, { props: { instrument: RELIANCE } })
  mounted.push(form)
  await form.find('input[aria-label="New list name"]').setValue(listName)
  await form.find('form').trigger('submit')
  await flushPromises()
  expect(form.text()).toContain(`Added to ${listName}.`)
}

describe('<StocksView />', () => {
  // Regression: "Add to watchlist" wrote to the instrument watchlists
  // (src/trading/watchlists.ts) while the tab only ever rendered tracked stocks
  // (app.stocks), so the tab said "Your watchlist is empty." after every add.
  it('shows an instrument added with "Add to watchlist"', async () => {
    await addFromExplorer('Core')
    const w = await mountStocks()
    await sees(w, 'Core')
    await sees(w, 'RELIANCE')
    expect(w.findAll('.wl__item')).toHaveLength(1)
    expect(w.text()).not.toContain('No watchlists yet')
  })

  it('shows the add at once, while the tab is open (no reload)', async () => {
    const w = await mountStocks()
    await sees(w, 'No watchlists yet')
    await addFromExplorer('Banks')
    await sees(w, 'RELIANCE')
    expect(w.findAll('.wl__item')).toHaveLength(1)
  })

  it('points from an empty "My stocks" to the watchlists that have instruments', async () => {
    await addFromExplorer('Core')
    const w = await mountStocks()
    await choose(w, 'My stocks')
    expect(w.text()).toContain('No tracked stocks yet.')
    expect(w.text()).toContain('1 instrument is on your watchlists.')
    await w
      .findAll('button')
      .find((b) => b.text() === 'Open watchlists')!
      .trigger('click')
    await sees(w, 'RELIANCE')
    expect(localStorage.getItem('aureon.stocks.mode.v1')).toBe('watchlists')
  })

  it('switches to every instrument on request and back', async () => {
    const w = await mountStocks()
    await choose(w, 'All instruments')
    await vi.waitFor(() => expect(w.find('[data-testid="explorer"]').exists()).toBe(true))
    expect(localStorage.getItem('aureon.stocks.mode.v1')).toBe('market')

    await choose(w, 'My stocks')
    expect(w.find('[data-testid="explorer"]').exists()).toBe(false)
    expect(w.text()).toContain('No tracked stocks yet.')
  })

  it('remembers the last view on this device', async () => {
    localStorage.setItem('aureon.stocks.mode.v1', 'market')
    const w = await mountStocks()
    await vi.waitFor(() => expect(w.find('[data-testid="explorer"]').exists()).toBe(true))
  })
})
