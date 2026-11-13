// The Stocks tab: your watchlists (the lists "Add to watchlist" writes to) as
// tabs, each stock with its price, today's change (from the last daily close)
// and your thesis's target; Explore (the server's instrument master) one click
// away, with the choice remembered on this device.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h } from 'vue'
import StocksView from '@/components/views/StocksView.vue'
import AddToWatchlist from '@/components/trading/AddToWatchlist.vue'
import { vHoverStyle } from '@/directives/hoverStyle'
import { forgetInstruments } from '@/trading/resolve'
import { forgetDayHistory } from '@/trading/dayHistory'
import { useAppStore } from '@/stores/app'
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
  forgetDayHistory()
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
      const ts = new Date().toISOString()
      ;[status, body] = [
        200,
        [
          {
            symbol: 'NSE_EQ:2885',
            last: '110',
            bid: null,
            ask: null,
            volume: '1',
            ts,
            source: 'broker',
          },
        ],
      ]
    } else if (url.pathname === '/api/trading/candles') {
      // Yesterday closed at 100; today's bar is still open.
      const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
      const bar = (n: number, close: string, closed: boolean) => ({
        ts: day(n),
        open: close,
        high: close,
        low: close,
        close,
        volume: '1',
        is_closed: closed,
        is_gap: false,
      })
      ;[status, body] = [200, [bar(2, '95', true), bar(1, '100', true), bar(0, '110', false)]]
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
    expect(w.findAll('[data-stock-row]')).toHaveLength(1)
  })

  it('shows the add at once, while the tab is open (no reload)', async () => {
    const w = await mountStocks()
    await sees(w, 'Start a watchlist')
    await addFromExplorer('Banks')
    await sees(w, 'RELIANCE')
    expect(w.findAll('[data-stock-row]')).toHaveLength(1)
  })

  it("shows the price and today's change against the last daily close", async () => {
    await addFromExplorer('Core')
    const w = await mountStocks()
    await sees(w, '110')
    // 110 against yesterday's close of 100: +10.00%.
    await sees(w, '+10.00%')
    await sees(w, '1 up')
  })

  it("puts your thesis's target on the stock's row, and lists theses on no list", async () => {
    await addFromExplorer('Core')
    const app = useAppStore()
    const base = {
      name: '',
      why: '',
      watchPrice: 0,
      tag: '',
      noteIds: [],
      createdAt: 0,
      updatedAt: 0,
    }
    app.stocks = [
      { ...base, id: 1, symbol: 'RELIANCE', targetPrice: 3200 },
      { ...base, id: 2, symbol: 'TCS', targetPrice: 4600, why: 'Margins recover' },
    ]
    const w = await mountStocks()
    await sees(w, 'Target ₹3,200')
    expect(w.text()).toContain('Tracked, not on a list')
    expect(w.text()).toContain('Margins recover')
  })

  it('switches to Explore on request and back, remembered on this device', async () => {
    const w = await mountStocks()
    await choose(w, 'Explore')
    await vi.waitFor(() => expect(w.find('[data-testid="explorer"]').exists()).toBe(true))
    expect(localStorage.getItem('aureon.stocks.mode.v2')).toBe('explore')
    await choose(w, 'Watchlist')
    expect(w.find('[data-testid="explorer"]').exists()).toBe(false)
  })

  it('opens on the last view', async () => {
    localStorage.setItem('aureon.stocks.mode.v2', 'explore')
    const w = await mountStocks()
    await vi.waitFor(() => expect(w.find('[data-testid="explorer"]').exists()).toBe(true))
  })
})
