// Stock Signals against a stubbed API: the universe (holdings, a server
// watchlist, a screener pick), the table (sort, filter, expand), the chart in a
// dialog (fullscreen, timeframe) and in a phone drawer, alerts both absent and
// present (deep link to the chart), the watchlist action, the portfolio map and
// a failed read.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.setConfig({ testTimeout: 20_000 })

import TradingStockSignals from './TradingStockSignals.vue'
import { forgetInstruments } from '@/trading/resolve'
import { resetWatchlistStore } from '@/trading/watchlists'
import { clearStockSignalCaches } from '@/trading/stockSignals/useStockSignals'
import { resetSignalNotifications } from '@/trading/stockSignals/useSignalNotifications'
import { useUiStore } from '@/stores/ui'

const inst = (id: number, symbol: string, isin: string) => ({
  id,
  broker: 'dhan',
  broker_instrument_id: `NSE_EQ:${id}`,
  symbol,
  trading_symbol: symbol,
  name: `${symbol} Ltd`,
  display_name: null,
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
  isin,
  series: 'EQ',
  is_active: true,
})
const RELIANCE = inst(1, 'RELIANCE', 'INE002A01018')
const TCS = inst(2, 'TCS', 'INE467B01029')
const INFY = inst(3, 'INFY', 'INE009A01021')

// Three 15-minute bars ending now.
const NOW = Date.now()
const T = (i: number) =>
  new Date(Math.floor(NOW / 900_000) * 900_000 - (2 - i) * 900_000).toISOString()
/** close, ema8, ema32, vwap per bar. */
const SHAPES: Record<number, [number, number, number, number][]> = {
  1: [
    [100, 99, 100, 100],
    [101, 100.5, 100, 100],
    [102, 101, 100.2, 100.5],
  ], // bullish
  2: [
    [100, 101, 100, 100],
    [99, 99.5, 100, 99.8],
    [98, 99, 100, 99.5],
  ], // bearish
  3: [
    [100, 99, 100, 101],
    [100.2, 99.5, 100, 101],
    [100.5, 100.2, 100, 101],
  ], // pending
}
let candlesFail = false
let alertsLive = false
const posts: { path: string; body: unknown }[] = []
const calls: URL[] = []

async function answer(req: Request): Promise<[number, unknown]> {
  const url = new URL(req.url)
  const p = url.pathname
  const q = url.searchParams
  calls.push(url)
  if (req.method === 'POST') {
    const body = await req
      .clone()
      .json()
      .catch(() => null)
    posts.push({ path: p, body })
    if (p === '/api/trading/screener/run') {
      const dir = (body as { filters: { direction: string }[] }).filters[0].direction
      const items =
        dir === 'bullish'
          ? [
              {
                instrument: INFY,
                last: '100.5',
                change_pct: '1.2',
                indicators: {},
                signal: 'bullish_cross',
                crossed_at: T(2),
                data_as_of: T(2),
              },
            ]
          : []
      return [
        200,
        {
          as_of: T(2),
          candle: 'confirmed',
          timeframe: '15m',
          universe_size: 2000,
          total: items.length,
          items,
        },
      ]
    }
    if (p === '/api/trading/watchlists/w1/items')
      return [201, { instrument_id: 1, instrument: RELIANCE, position: 1, added_at: T(2) }]
    if (p === '/api/trading/stock-signals/events/read')
      return alertsLive ? [200, { unread: 0 }] : [404, {}]
  }
  if (p === '/api/trading/accounts')
    return [
      200,
      {
        items: [
          {
            id: 'acc1',
            broker: 'dhan',
            is_active: true,
            account_id: 'D1',
            label: 'Dhan',
            mode: 'live',
            base_currency: 'INR',
            created_at: T(0),
            mode_changed_at: null,
            owner_user_id: 'u',
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      },
    ]
  if (p === '/api/trading/accounts/acc1/holdings')
    return [
      200,
      {
        items: [
          {
            account_id: 'acc1',
            symbol: 'RELIANCE',
            isin: 'INE002A01018',
            quantity: '10',
            available_quantity: '10',
            avg_cost: '90',
            last_price: '102',
            source: 'broker',
          },
        ],
        total: 1,
        limit: 500,
        offset: 0,
      },
    ]
  if (p === '/api/trading/instruments') {
    const s = (q.get('q') ?? '').toUpperCase()
    const items = [RELIANCE, TCS, INFY].filter((i) => i.symbol.includes(s))
    return [200, { items, total: items.length, limit: 20, offset: 0 }]
  }
  if (p === '/api/trading/watchlists')
    return [
      200,
      [
        {
          id: 'w1',
          name: 'Core',
          description: null,
          created_at: T(0),
          updated_at: T(0),
          items: [{ instrument_id: 2, instrument: TCS, position: 0, added_at: T(0) }],
        },
      ],
    ]
  if (p === '/api/trading/candles') {
    const id = Number(q.get('instrument_id'))
    if (candlesFail && id === 2) return [503, { detail: 'candle store unavailable' }]
    return [
      200,
      (SHAPES[id] ?? []).map(([c], i) => ({
        ts: T(i),
        open: String(c),
        high: String(c),
        low: String(c),
        close: String(c),
        volume: '100',
        is_gap: false,
      })),
    ]
  }
  if (p === '/api/trading/indicators/compute') {
    const id = Number(q.get('instrument_id'))
    return [
      200,
      (SHAPES[id] ?? []).flatMap(([, e8, e32, vw], i) => [
        { name: 'ema:8', ts: T(i), values: { value: String(e8) } },
        { name: 'ema:32', ts: T(i), values: { value: String(e32) } },
        { name: 'vwap', ts: T(i), values: { value: String(vw) } },
      ]),
    ]
  }
  if (p === '/api/trading/stock-signals/events')
    return alertsLive
      ? [
          200,
          {
            items: [
              {
                id: 'e1',
                type: 'bullish_cross',
                instrument_id: 1,
                symbol: 'RELIANCE',
                timeframe: '15m',
                price: '101',
                at: T(1),
                detail: 'EMA 8 crossed above EMA 32',
                read: false,
              },
            ],
            total: 1,
            unread: 1,
          },
        ]
      : [404, { detail: 'Not Found' }]
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
  candlesFail = false
  alertsLive = false
  posts.length = 0
  calls.length = 0
  localStorage.clear()
  resetWatchlistStore()
  forgetInstruments()
  clearStockSignalCaches()
  resetSignalNotifications()
  vi.stubGlobal('EventSource', FakeES)
  vi.stubGlobal('fetch', async (req: Request) => {
    const [status, body] = await answer(req)
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
  setActivePinia(createPinia())
})
const mounted: { unmount(): void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.documentElement.style.overflow = ''
  vi.unstubAllGlobals()
})

async function mountPage(path = '/trading/stock-signals') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trading/:section?', component: { template: '<div />' } }],
  })
  await router.push(path)
  const w = mount(TradingStockSignals, { global: { plugins: [router] }, attachTo: document.body })
  mounted.push(w)
  await flushPromises()
  await vi.waitFor(() => expect(w.findAll('.stb__row')).toHaveLength(3), { timeout: 8000 })
  await vi.waitFor(() => expect(w.text()).not.toContain('Reading…'), { timeout: 8000 })
  return { w, router }
}
const rowText = (w: ReturnType<typeof mount>) =>
  w.findAll('.stb__row').map((r) => r.find('.stb__sym').text())
const btn = (root: { findAll(s: string): DOMWrapper<Element>[] }, label: string) =>
  root.findAll('button').find((b) => b.text() === label || b.attributes('aria-label') === label)

describe('Stock Signals', () => {
  it('reads holdings, a server watchlist and a screener pick, and classifies each', async () => {
    const { w } = await mountPage()
    const byStock = Object.fromEntries(
      w.findAll('.stb__row').map((r) => [r.find('.stb__sym').text(), r.find('.sb').text()]),
    )
    expect(byStock).toEqual({ RELIANCE: 'Bullish', TCS: 'Bearish', INFY: 'Pending' })
    const kpis = w.find('.ss__kpis').text()
    expect(kpis).toMatch(/Bullish confirmed\s*1/)
    expect(kpis).toMatch(/Bearish confirmed\s*1/)
    expect(kpis).toMatch(/Awaiting VWAP\s*1/)
    expect(w.find('.stb__held').text()).toBe('Held')
    // The holding was matched by ISIN, and the screener asked for EMA 8/32 crosses.
    const run = posts.find((x) => x.path === '/api/trading/screener/run')!.body as {
      filters: unknown[]
    }
    expect(run.filters[0]).toMatchObject({ type: 'ema_cross', fast: 8, slow: 32 })
  })

  it('sorts by a column, filters by signal and searches', async () => {
    const { w } = await mountPage()
    await w
      .findAll('.stb__sort')
      .find((b) => b.text().startsWith('Stock'))!
      .trigger('click')
    expect(rowText(w)).toEqual(['INFY', 'RELIANCE', 'TCS'])
    await w
      .findAll('.stb__sort')
      .find((b) => b.text().startsWith('Stock'))!
      .trigger('click')
    expect(rowText(w)).toEqual(['TCS', 'RELIANCE', 'INFY'])
    const th = w.findAll('th').find((h) => h.text().startsWith('Stock'))!
    expect(th.attributes('aria-sort')).toBe('descending')
    // search
    await w.find('.stb__tools input').setValue('tcs')
    await flushPromises()
    expect(rowText(w)).toEqual(['TCS'])
  })

  it('opens and closes a row’s details on demand, without new reads', async () => {
    const { w } = await mountPage()
    const before = calls.length
    const row = w.findAll('.stb__row').find((r) => r.text().includes('RELIANCE'))!
    const chevron = row.find('.c-x button')
    expect(chevron.attributes('aria-expanded')).toBe('false')
    await chevron.trigger('click')
    expect(chevron.attributes('aria-expanded')).toBe('true')
    const detail = w.find('.stb__detail')
    expect(detail.text()).toContain('EMA 8 is above EMA 32')
    expect(detail.text()).toContain('VWAP confirmation')
    expect(detail.text()).toContain('In your portfolio')
    expect(calls.length).toBe(before)
    await chevron.trigger('click')
    expect(w.find('.stb__detail').exists()).toBe(false)
  })

  it('opens the chart in a wide dialog with fullscreen, and a timeframe change re-reads only the chart', async () => {
    const { w, router } = await mountPage()
    const row = w.findAll('.stb__row').find((r) => r.text().includes('RELIANCE'))!
    await btn(row, 'View chart for RELIANCE')!.trigger('click')
    await flushPromises()
    const dialog = document.body.querySelector('.ui-modal')!
    expect(dialog).toBeTruthy()
    expect(dialog.classList.contains('ui-modal--wide')).toBe(true)
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(router.currentRoute.value.query.instrument).toBe('1')
    await vi.waitFor(() => expect(dialog.textContent).toContain('EMA 32'))
    ;(dialog.querySelector('[aria-label="Fullscreen"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(document.body.querySelector('.ui-modal')!.classList.contains('ui-modal--full')).toBe(
      true,
    )
    // 1h: one candles + one indicators read for this stock only
    const before = calls.length
    const oneH = [...document.body.querySelectorAll('.ui-modal button')].find(
      (b) => b.textContent?.trim() === '1H',
    ) as HTMLButtonElement
    oneH.click()
    await flushPromises()
    await vi.waitFor(() =>
      expect(
        calls.slice(before).filter((u) => u.searchParams.get('timeframe') === '1h').length,
      ).toBe(2),
    )
    expect(calls.slice(before).every((u) => u.searchParams.get('instrument_id') === '1')).toBe(true)
  })

  it('uses a bottom drawer on a phone', async () => {
    const { w } = await mountPage()
    useUiStore().vw = 400
    await flushPromises()
    const row = w.findAll('.stb__row').find((r) => r.text().includes('TCS'))!
    await btn(row, 'View chart for TCS')!.trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.ui-sheet')).toBeTruthy()
    expect(document.body.querySelector('.ui-modal')).toBeNull()
  })

  it('says alerts are not available when the monitor is absent, never showing samples', async () => {
    const { w } = await mountPage()
    await btn(w, 'Alerts')!.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Signal alerts are not on this server yet')
    expect(w.findAll('.sa__item')).toHaveLength(0)
  })

  it('lists real alerts with an unread bell, and a click marks it read and opens its chart', async () => {
    alertsLive = true
    const { w, router } = await mountPage()
    await vi.waitFor(() => expect(w.find('.ss__badge').text()).toBe('1'))
    await btn(w, 'Alerts (1)')!.trigger('click')
    await flushPromises()
    const item = w.find('.sa__item')
    expect(item.text()).toContain('RELIANCE')
    expect(item.text()).toContain('Bullish EMA 8/32 cross')
    await item.find('.sa__open').trigger('click')
    await flushPromises()
    expect(posts.some((x) => x.path === '/api/trading/stock-signals/events/read')).toBe(true)
    expect(router.currentRoute.value.query.instrument).toBe('1')
    expect(document.body.querySelector('.ui-modal')).toBeTruthy()
  })

  it('adds a stock to a server watchlist', async () => {
    const { w } = await mountPage()
    const row = w.findAll('.stb__row').find((r) => r.text().includes('RELIANCE'))!
    await btn(row, 'Add RELIANCE to a watchlist')!.trigger('click')
    await flushPromises()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Saved to your Aureon account'),
    )
    const add = [...document.body.querySelectorAll('.ui-modal button')].find(
      (b) => b.textContent?.trim() === 'Add',
    ) as HTMLButtonElement
    add.click()
    await flushPromises()
    await vi.waitFor(() =>
      expect(posts.find((x) => x.path === '/api/trading/watchlists/w1/items')?.body).toEqual({
        instrument_id: 1,
      }),
    )
  })

  it('maps holdings by weight and signal, with a preview that orders nothing', async () => {
    const { w } = await mountPage()
    await btn(w, 'Portfolio Map')!.trigger('click')
    await flushPromises()
    const tile = w.find('.pm__tile')
    expect(tile.text()).toContain('RELIANCE')
    expect(tile.text()).toContain('100.0%')
    expect(tile.classes()).toContain('t-bull')
    expect(w.text()).toContain('nothing is ordered')
    expect(w.find('.pm__cands').text()).toContain('INFY')
    expect(posts.filter((x) => x.path.includes('order'))).toHaveLength(0)
  })

  it('shows a failed read as no data with the reason, and keeps the rest', async () => {
    candlesFail = true
    const { w } = await mountPage()
    const tcs = w.findAll('.stb__row').find((r) => r.text().includes('TCS'))!
    expect(tcs.find('.sb').text()).toBe('No data')
    await tcs.find('.c-x button').trigger('click')
    expect(w.find('.stb__detail').text()).toContain('candle store unavailable')
    const rel = w.findAll('.stb__row').find((r) => r.text().includes('RELIANCE'))!
    expect(rel.find('.sb').text()).toBe('Bullish')
  })
})
