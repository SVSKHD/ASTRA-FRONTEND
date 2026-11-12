// /trading/screener against a stubbed API.
//
// While the backend has no screener endpoint (the real state of the contract),
// Run is disabled with an honest message, nothing is POSTed, and the filters
// still produce the docs §6 request. The results table is exercised with
// FIXTURE responses defined here, in the test only — the screen never ships
// sample results. The "gate open" block mocks the gate to prove the table
// lights up once the contract has the path.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { ScreenerResponse } from '@/trading/screener'

vi.setConfig({ testTimeout: 20_000 })

const NOW = new Date().toISOString()
const INSTRUMENT = (id: number, symbol: string, extra: Record<string, unknown> = {}) => ({
  id,
  broker: 'dhan',
  broker_instrument_id: `NSE_EQ:${id}`,
  symbol,
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
  ...extra,
})
/** A fixture response, shaped like docs §6. Test-only data. */
const FIXTURE = (): ScreenerResponse => ({
  as_of: NOW,
  candle: 'confirmed',
  timeframe: '15m',
  universe_size: 1800,
  total: 2,
  items: [
    {
      instrument: INSTRUMENT(7, 'FIXTUREA') as never,
      last: '1234.5',
      change_pct: '1.25',
      indicators: { 'ema:8': '1230.12', 'ema:32': '1220.5' },
      signal: 'bullish_cross',
      crossed_at: NOW,
      data_as_of: NOW,
    },
    {
      instrument: INSTRUMENT(9, 'FIXTUREB') as never,
      last: null,
      change_pct: null,
      indicators: {},
      signal: null,
      crossed_at: null,
      data_as_of: NOW,
    },
  ],
})

type R = [number, unknown, Record<string, string>?]
let screenerReply: () => R
/** When set, the screener POST never gets an answer (the network failed). */
let screenerThrows = false
const posts: { path: string; body: unknown }[] = []

class FakeES {
  readyState = 0
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

beforeEach(() => {
  posts.length = 0
  screenerReply = () => [200, FIXTURE()]
  screenerThrows = false
  localStorage.clear()
  vi.resetModules()
  vi.stubGlobal('EventSource', FakeES)
  vi.stubGlobal('fetch', async (req: Request) => {
    const url = new URL(req.url)
    let status = 200
    let body: unknown = { items: [], total: 0, limit: 50, offset: 0 }
    let headers: Record<string, string> = {}
    if (req.method === 'POST') {
      posts.push({ path: url.pathname, body: JSON.parse((await req.text()) || '{}') })
      if (url.pathname === '/api/trading/screener/run' && screenerThrows)
        throw new TypeError('Failed to fetch')
      ;[status, body, headers = {}] =
        url.pathname === '/api/trading/screener/run' ? screenerReply() : [404, { detail: 'no' }]
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })
  })
})
const mounted: { unmount(): void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
  vi.doUnmock('@/trading/screener')
  document.body.innerHTML = ''
})

async function sees(w: { text(): string }, text: string) {
  await vi.waitFor(() => expect(w.text()).toContain(text), { timeout: 8000, interval: 20 })
}

function seedWatchlists() {
  localStorage.setItem(
    'aureon.trading.watchlists.v2',
    JSON.stringify([
      { id: 'wl_1', name: 'Banks', items: [{ id: 3, symbol: 'X', broker: 'dhan', added_at: NOW }] },
    ]),
  )
}

async function mountScreener(path = '/trading/screener') {
  const C = (await import('./TradingScreener.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trading/:section?', component: C }],
  })
  await router.push(path)
  const w = mount(C, { global: { plugins: [router] }, attachTo: document.body })
  mounted.push(w)
  for (let i = 0; i < 3; i++) await flushPromises()
  return { w, router }
}

const button = (w: { findAll(s: string): { text(): string }[] }, text: string) =>
  w.findAll('button').find((b) => b.text().trim() === text) as unknown as {
    attributes(n: string): string | undefined
    trigger(e: string): Promise<void>
  }

/** The request the screen would send, read from its "Show request" preview. */
async function shownRequest(w: Awaited<ReturnType<typeof mountScreener>>['w']) {
  if (!w.find('pre').exists()) await button(w, 'Show request').trigger('click')
  const text = w.find('pre').text()
  return JSON.parse(text.slice(text.indexOf('\n') + 1))
}

/** Open the "Add filter" menu (portalled to the body) and pick an item. */
async function addFilter(w: Awaited<ReturnType<typeof mountScreener>>['w'], label: string) {
  await button(w, 'Add filter').trigger('click')
  await flushPromises()
  const item = [...document.body.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  )!
  item.click()
  await flushPromises()
}

describe('TradingScreener — endpoint absent (gate mocked shut)', () => {
  // The contract has the endpoint now; an older server would not, and the screen
  // must still say so honestly.
  beforeEach(() => {
    vi.doMock('@/trading/screener', async (orig) => ({
      ...(await orig<typeof import('@/trading/screener')>()),
      SCREENER_AVAILABLE: false,
    }))
  })
  afterEach(() => {
    vi.doUnmock('@/trading/screener')
  })

  it('disables Run with an honest message pointing at §6, and POSTs nothing', async () => {
    const { w } = await mountScreener()
    await sees(w, 'Screening is not available yet')
    expect(w.text()).toContain('docs/market-terminal.md §6')
    expect(w.text()).toContain('/api/trading/screener/run')
    expect(w.text()).toContain('No results are calculated here and no sample results are shown')
    const run = button(w, 'Run screener')
    expect(run.attributes('disabled')).toBeDefined()
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(posts).toEqual([])
    // No results table, no rows: only the explanation.
    expect(w.find('table').exists()).toBe(false)
    expect(w.text()).toContain('No results to show')
  })

  it('turns filter interactions into the docs §6 request', async () => {
    const { w } = await mountScreener()
    // Markets: add BSE and Futures.
    const check = (label: string) =>
      w
        .findAll('label.ui-check')
        .find((l) => l.text().trim() === label)!
        .find('input')
    await check('BSE').setValue(true)
    await check('Futures').setValue(true)
    // Live candle.
    await w
      .findAll('button')
      .find((b) => b.text().includes('Live candle'))!
      .trigger('click')
    // Add an RSI filter and set its level to 25.
    await addFilter(w, 'RSI threshold')
    const filters = w.findAll('.sc__filter')
    expect(filters).toHaveLength(2)
    const rsiInputs = filters[1].findAll('input')
    await rsiInputs[rsiInputs.length - 1].setValue('25')
    // Within N bars on the default EMA 8/32 crossover → 5.
    const crossInputs = filters[0].findAll('input')
    await crossInputs[crossInputs.length - 1].setValue('5')

    const req = await shownRequest(w)
    expect(req).toEqual({
      universe: { exchange: ['NSE', 'BSE'], kind: ['equity', 'future'], watchlist_id: null },
      timeframe: '15m',
      candle: 'live',
      filters: [
        { type: 'ema_cross', fast: 8, slow: 32, direction: 'bullish', within_bars: 5 },
        { type: 'rsi', period: 14, op: '<', value: 25 },
      ],
      sort: { field: 'change_pct', dir: 'desc' },
      limit: 50,
      offset: 0,
    })
    expect(w.text()).toContain('RSI 14 < 25')
  })

  it('shows validation errors (fast ≥ slow) and blocks Copy request', async () => {
    const { w } = await mountScreener()
    const inputs = w.findAll('.sc__filter')[0].findAll('input')
    await inputs[0].setValue('40') // fast 40 > slow 32
    await sees(w, 'The fast period must be shorter than the slow one.')
    expect(button(w, 'Copy request').attributes('disabled')).toBeDefined()
    // Removing the only filter: "Add at least one filter."
    await w.find('button[aria-label^="Remove filter 1"]').trigger('click')
    await sees(w, 'Add at least one filter.')
  })

  it('copies the request for the backend', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const { w } = await mountScreener()
    await button(w, 'Copy request').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledOnce()
    const text = (writeText.mock.calls[0] as unknown as [string])[0]
    expect(text.startsWith('POST /api/trading/screener/run')).toBe(true)
    await sees(w, 'Request copied')
  })

  it('preselects the universe from a ?watchlist= deep link', async () => {
    seedWatchlists()
    const { w } = await mountScreener('/trading/screener?watchlist=wl_1')
    await sees(w, 'Banks (1)')
    expect((await shownRequest(w)).universe.watchlist_id).toBe('wl_1')
  })

  it('says so when the linked watchlist is not on this device', async () => {
    const { w } = await mountScreener('/trading/screener?watchlist=wl_gone')
    await sees(w, 'The watchlist in this link is not saved on this device.')
    expect((await shownRequest(w)).universe.watchlist_id).toBeNull()
  })
})

describe('ScreenerResults (fixture data, test only)', () => {
  async function mountResults() {
    seedWatchlists()
    const C = (await import('./ScreenerResults.vue')).default
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
    })
    await router.push('/trading/screener')
    const w = mount(C, {
      props: { response: FIXTURE() },
      global: { plugins: [router] },
      attachTo: document.body,
    })
    mounted.push(w)
    await flushPromises()
    return { w, router }
  }

  it('renders values, and "—" for absent fields', async () => {
    const { w } = await mountResults()
    const rows = w.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    const a = rows[0].findAll('td').map((c) => c.text())
    expect(a[0]).toContain('FIXTUREA')
    expect(a[1]).toBe('NSE')
    expect(a[2]).toBe('1,234.5')
    expect(a[3]).toBe('+1.25%')
    expect(a[4]).toBe('15m')
    expect(a[5]).toContain('EMA 8')
    expect(a[5]).toContain('1,230.12')
    expect(a[6]).toContain('Bullish cross')
    expect(a[7]).not.toBe('—')
    const b = rows[1].findAll('td').map((c) => c.text())
    expect(b[2]).toBe('—')
    expect(b[3]).toBe('—')
    expect(b[5]).toBe('—')
    expect(b[6]).toBe('—')
    expect(b[7]).toBe('—')
  })

  it('opens the chart at the screened timeframe', async () => {
    const { w } = await mountResults()
    const link = w.find('a[aria-label="Open chart for FIXTUREA"]')
    expect(link.attributes('href')).toBe('/trading/charts?instrument=7&tf=15m')
  })

  it('adds a row to a watchlist on this device', async () => {
    const { w } = await mountResults()
    await w
      .findAll('tbody tr')[0]
      .findAll('button')
      .find((b) => b.text().includes('Add to watchlist'))!
      .trigger('click')
    await flushPromises()
    ;[...document.body.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Add to Banks')!
      .click()
    await flushPromises()
    await sees(w, 'Added FIXTUREA to Banks')
    const { watchlistStore } = await import('@/trading/watchlists')
    expect(watchlistStore().lists[0].items.map((i) => i.id)).toEqual([3, 7])
  })
})

describe('TradingScreener — gate open (mocked contract)', () => {
  beforeEach(() => {
    vi.doMock('@/trading/screener', async (orig) => ({
      ...(await orig<typeof import('@/trading/screener')>()),
      SCREENER_AVAILABLE: true,
    }))
  })

  it('runs the request and renders the server results', async () => {
    const { w } = await mountScreener()
    expect(w.text()).not.toContain('Screening is not available yet')
    const run = button(w, 'Run screener')
    expect(run.attributes('disabled')).toBeUndefined()
    await w.find('form').trigger('submit')
    await sees(w, 'FIXTUREA')
    expect(posts).toHaveLength(1)
    expect(posts[0].path).toBe('/api/trading/screener/run')
    expect(posts[0].body).toMatchObject({ timeframe: '15m', candle: 'confirmed', offset: 0 })
    expect(w.text()).toContain('2 of 1800 instruments')
  })

  it('shows the server error and retries', async () => {
    screenerReply = () => [503, { detail: 'screener worker is down' }]
    const { w } = await mountScreener()
    await w.find('form').trigger('submit')
    await sees(w, 'screener worker is down')
    screenerReply = () => [200, FIXTURE()]
    await button(w, 'Retry').trigger('click')
    await sees(w, 'FIXTUREA')
    expect(posts).toHaveLength(2)
  })

  /** Submit, then wait until the run finished (the loading line is gone). */
  async function submit(w: Awaited<ReturnType<typeof mountScreener>>['w']) {
    await w.find('form').trigger('submit')
    await vi.waitFor(() => expect(w.text()).not.toContain('Screening…'), { timeout: 8000 })
    await flushPromises()
  }
  const failureText = (w: Awaited<ReturnType<typeof mountScreener>>['w']) =>
    w.find('[data-testid="screener-failure"]').text()

  it('401: says the session ended and offers no retry', async () => {
    screenerReply = () => [401, { detail: 'not authenticated' }]
    const { w } = await mountScreener()
    await submit(w)
    expect(failureText(w)).toContain('Signed out')
    expect(failureText(w)).toContain('Your Aureon session ended. Sign in again.')
    expect(button(w, 'Retry')).toBeUndefined()
    expect(w.find('table').exists()).toBe(false)
  })

  it('403: says the account is not allowed, with the server reason', async () => {
    screenerReply = () => [403, { detail: 'screener is admin-only' }]
    const { w } = await mountScreener()
    await submit(w)
    expect(failureText(w)).toContain('Not allowed')
    expect(failureText(w)).toContain('screener is admin-only')
    expect(button(w, 'Retry')).toBeUndefined()
  })

  it('404: says this server does not have the endpoint (contract mismatch)', async () => {
    screenerReply = () => [404, { detail: 'Not Found' }]
    const { w } = await mountScreener()
    await submit(w)
    expect(failureText(w)).toContain('The screener is not on this server')
    expect(failureText(w)).toContain('older than the contract')
  })

  it('422: puts the server complaint on the filter it names, until the filter changes', async () => {
    screenerReply = () => [
      422,
      {
        detail: [
          {
            loc: ['body', 'filters', 0, 'within_bars'],
            msg: 'Input should be less than or equal to 50',
            type: 'less_than_equal',
          },
        ],
      },
    ]
    const { w } = await mountScreener()
    await submit(w)
    expect(failureText(w)).toContain('The server rejected these filters')
    const first = () => w.findAll('.sc__filter')[0]
    expect(first().text()).toContain(
      'Server: within_bars: Input should be less than or equal to 50',
    )
    expect(button(w, 'Retry')).toBeUndefined()
    const inputs = first().findAll('input')
    await inputs[inputs.length - 1].setValue('2')
    await flushPromises()
    expect(first().text()).not.toContain('Server:')
  })

  it('429: says when to try again, and Retry runs it again', async () => {
    screenerReply = () => [429, { detail: 'slow down' }, { 'retry-after': '30' }]
    const { w } = await mountScreener()
    await submit(w)
    expect(failureText(w)).toContain('Too many runs')
    expect(failureText(w)).toContain('slow down')
    screenerReply = () => [200, FIXTURE()]
    await button(w, 'Retry').trigger('click')
    await sees(w, 'FIXTUREA')
    expect(posts).toHaveLength(2)
  })

  it('network failure: says Aureon is unreachable and can retry', async () => {
    screenerThrows = true
    const { w } = await mountScreener()
    await submit(w)
    expect(failureText(w)).toContain('Aureon is unreachable')
    screenerThrows = false
    await button(w, 'Retry').trigger('click')
    await sees(w, 'FIXTUREA')
  })

  it('a 200 that is not a result page is an error, not an empty table', async () => {
    screenerReply = () => [200, { ok: true }]
    const { w } = await mountScreener()
    await submit(w)
    expect(failureText(w)).toContain('not a result page')
    expect(w.text()).not.toContain('Nothing matched')
  })

  it('shows an honest empty state when nothing matched', async () => {
    screenerReply = () => [200, { ...FIXTURE(), total: 0, items: [] }]
    const { w } = await mountScreener()
    await submit(w)
    expect(w.text()).toContain('Nothing matched')
    expect(w.text()).toContain('No instrument out of 1800 met every filter')
    expect(w.find('table').exists()).toBe(false)
    expect(w.find('nav[aria-label="Pagination"]').exists()).toBe(false)
  })

  it('sorts on the server: a new direction re-runs from page 1', async () => {
    const { w } = await mountScreener()
    await submit(w)
    await sees(w, 'FIXTUREA')
    await w
      .findAll('button')
      .find((b) => b.text().includes('Low → high'))!
      .trigger('click')
    await vi.waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1].body).toMatchObject({ sort: { field: 'change_pct', dir: 'asc' }, offset: 0 })
  })

  it('pages on the server: Next asks for the next offset', async () => {
    screenerReply = () => [200, { ...FIXTURE(), total: 120 }]
    const { w } = await mountScreener()
    await submit(w)
    expect(w.find('nav[aria-label="Pagination"]').text()).toContain('1 / 3')
    await w.find('button[aria-label="Next page"]').trigger('click')
    await vi.waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1].body).toMatchObject({ limit: 50, offset: 50 })
    await vi.waitFor(() => expect(w.find('nav[aria-label="Pagination"]').text()).toContain('2 / 3'))
  })

  it('Refresh re-runs the same page', async () => {
    const { w } = await mountScreener()
    await submit(w)
    await sees(w, 'FIXTUREA')
    await button(w, 'Refresh').trigger('click')
    await vi.waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1].body).toEqual(posts[0].body)
  })

  it('marks results stale when the filters change, and Reset filters restores the defaults', async () => {
    const { w } = await mountScreener()
    await submit(w)
    await sees(w, 'FIXTUREA')
    expect(w.text()).not.toContain('These results are from different filters')
    await addFilter(w, 'RSI threshold')
    await sees(w, 'These results are from different filters')
    await button(w, 'Reset filters').trigger('click')
    await flushPromises()
    expect(w.findAll('.sc__filter')).toHaveLength(1)
    expect(w.text()).not.toContain('These results are from different filters')
    // Resetting the filters does not run anything by itself.
    expect(posts).toHaveLength(1)
  })

  it('keeps the newest run when an older reply arrives late', async () => {
    let release!: () => void
    const late = new Promise<void>((r) => (release = r))
    let n = 0
    const fetchImpl = globalThis.fetch
    vi.stubGlobal('fetch', async (req: Request) => {
      if (req.method === 'POST' && n++ === 0) await late
      return fetchImpl(req)
    })
    // Run 2 reaches the stub first (posts.length 1); held-back run 1 arrives second.
    screenerReply = () => [
      200,
      posts.length === 2 ? { ...FIXTURE(), total: 99 } : { ...FIXTURE(), total: 2 },
    ]
    const { w } = await mountScreener()
    void w.find('form').trigger('submit') // run 1: held back
    await flushPromises()
    await w.find('form').trigger('submit') // run 2: answers at once
    await sees(w, '2 of 1800 instruments')
    release()
    await flushPromises()
    await flushPromises()
    expect(w.text()).toContain('2 of 1800 instruments')
    expect(w.text()).not.toContain('99 of 1800')
  })
})
