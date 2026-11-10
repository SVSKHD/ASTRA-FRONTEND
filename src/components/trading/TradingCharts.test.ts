// /trading/charts against a stubbed API: the deep link, server indicator rows vs the
// browser's, the unconfirmed last candle, and the error / empty / stale states.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 20_000 })
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { STUDIES_KEY } from '@/trading/studies'
import { WATCHLISTS_KEY, resetWatchlistStore } from '@/trading/watchlists'

const FIVE_MIN = 5 * 60_000
const T0 = Date.parse('2026-11-10T03:45:00Z')
const CANDLES = Array.from({ length: 60 }, (_, i) => {
  const c = (100 + i * 0.25).toFixed(2)
  return {
    ts: new Date(T0 + i * FIVE_MIN).toISOString(),
    open: c,
    high: (Number(c) + 1).toFixed(2),
    low: (Number(c) - 1).toFixed(2),
    close: c,
    volume: '500',
    oi: null,
    is_gap: false,
    session: 'NSE',
    source: 'broker',
  }
})
const LAST = Date.parse(CANDLES[59].ts)

let candleStatus = 200
let candleBody: unknown = CANDLES
/** The server's clock, sent as the Date header. */
let serverDate = LAST + 10 * FIVE_MIN
let indicatorRows: Record<string, unknown[]> = {}
const urls: URL[] = []

class FakeES {
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

beforeEach(() => {
  candleStatus = 200
  candleBody = CANDLES
  serverDate = LAST + 10 * FIVE_MIN
  indicatorRows = {}
  urls.length = 0
  localStorage.clear()
  resetWatchlistStore()
  vi.stubGlobal('EventSource', FakeES)
  vi.stubGlobal('fetch', async (req: Request) => {
    const url = new URL(req.url)
    urls.push(url)
    let status = 200
    let body: unknown = []
    if (url.pathname === '/api/trading/candles') {
      status = candleStatus
      body = candleBody
    } else if (url.pathname === '/api/trading/indicators') {
      body = indicatorRows[url.searchParams.get('name') ?? ''] ?? []
    } else if (url.pathname === '/api/trading/signals') {
      body = {
        items: [
          {
            id: 's1',
            strategy_version_id: 'v1',
            instrument_id: 7,
            timeframe: '5m',
            candle_time: CANDLES[40].ts,
            session: 'NSE',
            side: 'BUY',
            strength: null,
            inputs: {},
            created_at: CANDLES[41].ts,
          },
        ],
        total: 1,
        limit: 200,
        offset: 0,
      }
    } else if (url.pathname === '/api/trading/instruments') {
      body = { items: [], total: 0, limit: 25, offset: 0 }
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', date: new Date(serverDate).toUTCString() },
    })
  })
  setActivePinia(createPinia())
})
const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
  localStorage.clear()
})

async function mountAt(path: string) {
  const TradingCharts = (await import('./TradingCharts.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trading/:section?', component: { template: '<div />' } }],
  })
  await router.push(path)
  const w = mount(TradingCharts, { global: { plugins: [router] }, attachTo: document.body })
  mounted.push(w)
  for (let i = 0; i < 6; i++) await flushPromises()
  return { w, router }
}
async function sees(w: VueWrapper, text: string) {
  await vi.waitFor(() => expect(w.text()).toContain(text), { timeout: 8000, interval: 20 })
}
const called = (path: string) => urls.filter((u) => u.pathname === path)

describe('TradingCharts', () => {
  it('opens the instrument and timeframe from the deep link', async () => {
    const { w } = await mountAt('/trading/charts?instrument=7&tf=5m')
    await sees(w, 'Instrument #7 · 5m')
    const c = called('/api/trading/candles')[0]
    expect(c.searchParams.get('instrument_id')).toBe('7')
    expect(c.searchParams.get('timeframe')).toBe('5m')
    expect(w.findAll('rect.cc__up, rect.cc__down').length).toBe(60)
    // the strategy's BUY signal sits on its candle
    expect(w.findAll('g.cc__marker').map((m) => m.text())).toEqual(['B'])
    expect(w.text()).toContain('1 strategy signal on this timeframe')
  })

  it('ignores a timeframe the backend does not have', async () => {
    const { w } = await mountAt('/trading/charts?instrument=7&tf=2h')
    await sees(w, 'Instrument #7 · 15m')
  })

  it('changes timeframe through the URL', async () => {
    const { w, router } = await mountAt('/trading/charts?instrument=7&tf=5m')
    await sees(w, '· 5m')
    const tf = w.find('[aria-label="Timeframe"]')
    await tf
      .findAll('button')
      .find((b) => b.text() === '1h')!
      .trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/trading/charts?instrument=7&tf=1h')
    await vi.waitFor(() =>
      expect(
        called('/api/trading/candles').some((u) => u.searchParams.get('timeframe') === '1h'),
      ).toBe(true),
    )
  })

  it('uses stored server rows when the name matches, and the browser otherwise', async () => {
    localStorage.setItem(
      STUDIES_KEY,
      JSON.stringify({
        name: 'current',
        studies: [
          { kind: 'ema', params: [9], color: 'accent', visible: true },
          { kind: 'ema', params: [8], color: 'warning', visible: true },
        ],
        cross: null,
      }),
    )
    indicatorRows['ema:9'] = CANDLES.slice(8).map((c) => ({
      name: 'ema:9',
      ts: c.ts,
      values: { value: '123.45670000' },
    }))
    const { w } = await mountAt('/trading/charts?instrument=7&tf=5m')
    await vi.waitFor(() =>
      expect(w.findAll('.tc__study').map((s) => s.text())).toEqual([
        'EMA 9 server',
        'EMA 8 browser',
      ]),
    )
    const names = called('/api/trading/indicators').map((u) => u.searchParams.get('name'))
    expect(names).toEqual(['ema:9'])
    // the legend shows the server's own string (grouped, not re-rounded)
    expect(w.find('.cc__legend').text()).toContain('123.4567')
  })

  it('marks the newest candle unconfirmed while its period has not ended (server clock)', async () => {
    serverDate = LAST + 2 * 60_000
    const { w } = await mountAt('/trading/charts?instrument=7&tf=5m')
    await sees(w, 'The newest candle is unconfirmed')
    expect(w.findAll('g.cc__live')).toHaveLength(1)
  })

  it('marks EMA crossovers, confirmed on closed candles', async () => {
    localStorage.setItem(
      STUDIES_KEY,
      JSON.stringify({
        name: 'current',
        studies: [
          { kind: 'ema', params: [8], color: 'accent', visible: true },
          { kind: 'ema', params: [32], color: 'warning', visible: true },
        ],
        cross: [0, 1],
      }),
    )
    // falling, then rising: one bullish cross of EMA 8 over EMA 32
    candleBody = CANDLES.map((c, i) => {
      const v = (i < 40 ? 120 - i : 80 + (i - 40) * 3).toFixed(2)
      return {
        ...c,
        open: v,
        close: v,
        high: (Number(v) + 1).toFixed(2),
        low: (Number(v) - 1).toFixed(2),
      }
    })
    const { w } = await mountAt('/trading/charts?instrument=7&tf=5m')
    await sees(w, 'EMA 8/32 crossovers (calculated in the browser)')
    expect(w.text()).toContain('↑ Bullish')
    expect(w.text()).toContain('confirmed (closed candle)')
  })

  it('says when the newest candle is stale', async () => {
    serverDate = LAST + 50 * FIVE_MIN
    const { w } = await mountAt('/trading/charts?instrument=7&tf=5m')
    await sees(w, 'Stale: the newest 5m candle')
  })

  it('shows an empty state when no candles are stored', async () => {
    candleBody = []
    const { w } = await mountAt('/trading/charts?instrument=7&tf=5m')
    await sees(w, 'No candles stored for this timeframe')
  })

  it('shows the error, with a retry, when candles fail to load', async () => {
    candleStatus = 500
    candleBody = { detail: 'database unavailable' }
    const { w } = await mountAt('/trading/charts?instrument=7&tf=5m')
    await sees(w, 'Candles could not be loaded: database unavailable')
    expect(w.find('[role="alert"]').text()).toContain('Candles unavailable')
    candleStatus = 200
    candleBody = CANDLES
    await w
      .findAll('button')
      .find((b) => b.text() === 'Try again')!
      .trigger('click')
    await vi.waitFor(() => expect(w.findAll('rect.cc__up, rect.cc__down').length).toBe(60))
  })

  it('keeps the chart but says it is stale when a refresh fails', async () => {
    const { w } = await mountAt('/trading/charts?instrument=7&tf=5m')
    await vi.waitFor(() => expect(w.findAll('rect.cc__up, rect.cc__down').length).toBe(60))
    candleStatus = 500
    candleBody = { detail: 'database unavailable' }
    await w.find('[aria-label="Reload candles"]').trigger('click')
    await sees(w, 'Stale: showing candles loaded at')
    expect(w.findAll('rect.cc__up, rect.cc__down').length).toBe(60)
  })

  it('opens the first watchlist instrument when there is no deep link, and keeps the lists', async () => {
    const lists = [
      {
        id: 'wl_1',
        name: 'Banks',
        items: [{ id: 11, symbol: 'HDFCBANK', broker: 'dhan', added_at: CANDLES[0].ts }],
      },
    ]
    localStorage.setItem(WATCHLISTS_KEY, JSON.stringify(lists))
    const { w, router } = await mountAt('/trading/charts')
    await sees(w, 'HDFCBANK · 15m')
    expect(router.currentRoute.value.query.instrument).toBe('11')
    expect(w.find('[aria-label="From your watchlists"]').text()).toContain('HDFCBANK')
    expect(JSON.parse(localStorage.getItem(WATCHLISTS_KEY)!)).toEqual(lists)
  })

  it('asks for an instrument when there is nothing to open', async () => {
    const { w } = await mountAt('/trading/charts')
    await sees(w, 'Pick an instrument to chart')
    expect(called('/api/trading/candles')).toHaveLength(0)
    expect(w.text()).toContain('Add Indicator')
  })
})
