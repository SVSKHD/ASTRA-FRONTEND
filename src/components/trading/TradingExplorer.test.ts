// The Market Explorer against a stubbed API: server-side search, paging and
// broker / exchange / segment filters, the detail panel, add-to-watchlist,
// open-chart, and the empty and error states.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.setConfig({ testTimeout: 20_000 })

import TradingExplorer from './TradingExplorer.vue'
import { resetWatchlistStore, watchlistStore } from '@/trading/watchlists'
import { forgetInstruments } from '@/trading/resolve'

function inst(id: number, symbol: string, segment = 'NSE_EQ', extra: Record<string, unknown> = {}) {
  return {
    id,
    broker: 'dhan',
    broker_instrument_id: `${segment}:${1000 + id}`,
    symbol,
    exchange: segment.startsWith('BSE') ? 'BSE' : 'NSE',
    segment,
    instrument_type: 'EQUITY',
    underlying: null,
    expiry: null,
    strike: null,
    option_type: null,
    lot_size: '1',
    tick_size: '0.05',
    currency: 'INR',
    ...extra,
  }
}
// 120 instruments, one in five on BSE.
const ALL = Array.from({ length: 120 }, (_, n) =>
  inst(n + 1, `SYM${String(n + 1).padStart(3, '0')}`, n % 5 === 0 ? 'BSE_EQ' : 'NSE_EQ'),
)
ALL[0] = inst(1, 'RELIANCE', 'NSE_EQ')
ALL[1] = inst(2, 'TCS', 'BSE_EQ')

let mode: 'ok' | 'empty' | 'error' = 'ok'
const calls: URL[] = []

function answer(url: URL): [number, unknown] {
  const p = url.pathname
  const qp = url.searchParams
  if (p === '/api/trading/instruments') {
    if (mode === 'error') return [503, { detail: 'database unavailable' }]
    if (mode === 'empty') return [200, { items: [], total: 0, limit: 50, offset: 0 }]
    const q = (qp.get('q') ?? '').toUpperCase()
    const type = qp.get('instrument_type')
    const exch = qp.get('exchange')
    const seg = qp.get('segment')
    const rows = ALL.filter((i) => i.symbol.includes(q))
      .filter((i) => !type || i.instrument_type === type)
      .filter((i) => !exch || i.exchange === exch)
      .filter((i) => !seg || i.segment === seg)
      .filter((i) => i.broker === (qp.get('broker') ?? 'dhan'))
    const limit = Number(qp.get('limit'))
    const offset = Number(qp.get('offset'))
    return [200, { items: rows.slice(offset, offset + limit), total: rows.length, limit, offset }]
  }
  if (p === '/api/trading/quotes') {
    const refs = (qp.get('symbols') ?? '').split(',')
    // RELIANCE has a quote; the rest come back without one.
    return [
      200,
      refs
        .filter((r) => r === 'NSE_EQ:1001')
        .map((r) => ({
          symbol: r,
          last: '2950.5',
          bid: '2950.4',
          ask: '2950.6',
          volume: '123456',
          ts: new Date().toISOString(),
          source: 'broker',
        })),
    ]
  }
  if (p === '/api/trading/brokers') {
    return [
      200,
      [
        {
          broker: 'dhan',
          label: 'Dhan',
          configured: true,
          instruments: 120,
          segments: [
            { segment: 'BSE_EQ', instruments: 24 },
            { segment: 'NSE_EQ', instruments: 96 },
          ],
        },
        { broker: 'mt5', label: 'MT5', configured: false, instruments: 0, segments: [] },
      ],
    ]
  }
  if (p === '/api/trading/candles') return [200, []]
  if (p === '/api/trading/agents') return [200, []]
  return [404, { detail: 'not found' }]
}

class FakeES {
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

beforeEach(() => {
  mode = 'ok'
  calls.length = 0
  localStorage.clear()
  resetWatchlistStore()
  forgetInstruments()
  vi.stubGlobal('EventSource', FakeES)
  vi.stubGlobal('fetch', async (req: Request) => {
    const url = new URL(req.url)
    calls.push(url)
    const [status, body] = answer(url)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
  setActivePinia(createPinia())
})
const mounted: { unmount(): void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
})

async function mountExplorer() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trading/:section?', component: { template: '<div />' } }],
  })
  await router.push('/trading/market')
  const w = mount(TradingExplorer, { global: { plugins: [router] }, attachTo: document.body })
  mounted.push(w)
  await flushPromises()
  return { w, router }
}
async function sees(w: { text(): string }, text: string) {
  await vi.waitFor(() => expect(w.text()).toContain(text), { timeout: 5000, interval: 20 })
}
// The health strip's count-only probe (limit=1) is not the Explorer's search.
const instrumentCalls = () =>
  calls.filter(
    (u) => u.pathname === '/api/trading/instruments' && u.searchParams.get('limit') !== '1',
  )
const lastSearch = () => instrumentCalls().at(-1)!.searchParams
const body = () => document.body.textContent ?? ''

describe('Market Explorer', () => {
  it('searches on the server and pages through the results', async () => {
    const { w } = await mountExplorer()
    await sees(w, 'RELIANCE')
    expect(lastSearch().get('broker')).toBe('dhan')
    expect(lastSearch().get('limit')).toBe('50')
    expect(lastSearch().get('offset')).toBe('0')
    expect(w.text()).toContain('120 instruments')
    expect(w.text()).toContain('Rows 1–50 of 120')

    await w.find('button[aria-label="Next page"]').trigger('click')
    await sees(w, 'Rows 51–100 of 120')
    expect(lastSearch().get('offset')).toBe('50')

    await w.find('input[aria-label="Search instruments"]').setValue('tcs')
    await vi.waitFor(() => expect(lastSearch().get('q')).toBe('tcs'), { timeout: 3000 })
    await sees(w, 'Rows 1–1 of 1')
    // A new search goes back to the first page.
    expect(lastSearch().get('offset')).toBe('0')
  })

  it('asks for one instrument_type per kind, and says so for futures', async () => {
    const { w } = await mountExplorer()
    await sees(w, 'RELIANCE')
    await w
      .findAll('[role="radio"]')
      .find((b) => b.text() === 'Futures')!
      .trigger('click')
    await vi.waitFor(() => expect(lastSearch().get('instrument_type')).toBe('FUTIDX'))
    await sees(w, 'one contract type at a time')
    await w
      .findAll('[role="radio"]')
      .find((b) => b.text() === 'Equity')!
      .trigger('click')
    await vi.waitFor(() => expect(lastSearch().get('instrument_type')).toBe('EQUITY'))
  })

  it('filters exchange and segment on the server, across the whole master', async () => {
    const { w } = await mountExplorer()
    await sees(w, 'RELIANCE')
    await w
      .findAll('[role="radio"]')
      .find((b) => b.text() === 'BSE')!
      .trigger('click')
    await vi.waitFor(() => expect(lastSearch().get('exchange')).toBe('BSE'))
    // The count is the server's, for the whole master: 24 BSE rows, not a page slice.
    await sees(w, '24 instruments')
    expect(lastSearch().get('offset')).toBe('0')
    expect(w.text()).toContain('TCS')
    expect(w.text()).not.toContain('RELIANCE')
    expect(w.text()).not.toContain('this page only')
  })

  it('scopes the search to a broker, with counts from the server', async () => {
    const { w } = await mountExplorer()
    await sees(w, 'RELIANCE')
    await vi.waitFor(() =>
      expect(calls.some((u) => u.pathname === '/api/trading/brokers')).toBe(true),
    )
    expect(lastSearch().get('broker')).toBe('dhan')
    await sees(w, 'Dhan · 120 instruments')
  })

  it('shows % change as — with the reason, and a freshness badge on quoted rows', async () => {
    const { w } = await mountExplorer()
    await sees(w, '2,950.5')
    const row = w.findAll('[role="row"]').find((r) => r.text().includes('RELIANCE'))!
    const cells = row.findAll('[role="cell"]')
    const change = cells[7]
    expect(change.text()).toBe('—')
    expect(change.attributes('title')).toContain('§3')
    expect(row.text()).toMatch(/Fresh|Stale|Market closed/)
    // Quotes were asked for by Dhan reference, not by symbol.
    const quote = calls.find((u) => u.pathname === '/api/trading/quotes')!
    expect(quote.searchParams.get('symbols')).toContain('NSE_EQ:1001')
    const other = w.findAll('[role="row"]').find((r) => r.text().includes('SYM003'))!
    expect(other.text()).toContain('No quote')
  })

  it('opens details with Enter, adds to a new watchlist, opens the chart, and closes on Esc', async () => {
    const { w, router } = await mountExplorer()
    await sees(w, 'RELIANCE')
    const row = w.findAll('[role="row"]').find((r) => r.text().includes('RELIANCE'))!
    await row.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(body()).toContain('Security id')
    expect(body()).toContain('NSE_EQ:1001')
    expect(body()).toContain('Saved on this device only')

    const name = document.body.querySelector(
      'input[aria-label="New list name"]',
    ) as HTMLInputElement
    name.value = 'Banks'
    name.dispatchEvent(new Event('input'))
    await flushPromises()
    ;(
      document.body.querySelector('form[aria-label="Add to watchlist"]') as HTMLFormElement
    ).dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(body()).toContain('Added to Banks.')
    const lists = watchlistStore().lists
    expect(lists.map((l) => l.name)).toEqual(['Banks'])
    expect(lists[0].items.map((i) => i.id)).toEqual([1])

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(body()).not.toContain('Broker reference')

    await row.trigger('click')
    await flushPromises()
    ;[...document.body.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Open chart')!
      .click()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/trading/charts')
    expect(router.currentRoute.value.query.instrument).toBe('1')
  })

  it('says the master may not be synced when nothing comes back', async () => {
    mode = 'empty'
    const { w } = await mountExplorer()
    await sees(w, 'No instruments returned')
    expect(w.text()).toContain('The instrument master may not be synced')
    // The compact health strip does not call the master OK.
    expect(w.text()).not.toMatch(/Instrument master\s*✓/)
  })

  it('shows an API error with a retry that reloads', async () => {
    mode = 'error'
    const { w } = await mountExplorer()
    await sees(w, 'The instruments could not be loaded')
    expect(w.text()).toContain('database unavailable')
    mode = 'ok'
    await w
      .findAll('button')
      .find((b) => b.text() === 'Retry')!
      .trigger('click')
    await sees(w, 'RELIANCE')
  })
})
