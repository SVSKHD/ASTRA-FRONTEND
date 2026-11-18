// Stock Signals against stubs of the backend's own API (Aureon docs/37): stored
// states and events in the table (sort, filter, expand), summary counts, the
// chart in a dialog (fullscreen, timeframe, cross / confirmation markers) and in
// a phone drawer, notifications (list, live stream event, read, deep link),
// alert preferences, the server watchlist, the portfolio map with the server's
// rebalance preview, market movers, and a failed read.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.setConfig({ testTimeout: 20_000 })

import TradingStockSignals from './TradingStockSignals.vue'
import { clearSeriesCache } from '@/trading/stockSignals/series'
import { resetSignalNotifications } from '@/trading/stockSignals/useSignalNotifications'
import { useUiStore } from '@/stores/ui'

// Three 15-minute candles ending at the last full quarter hour.
const Q = Math.floor(Date.now() / 900_000) * 900_000
const T = (i: number) => new Date(Q - (2 - i) * 900_000).toISOString()
const CLOSE = (i: number) => new Date(Q - (2 - i) * 900_000 + 900_000).toISOString()

const state = (id: number, symbol: string, st: string, over: Record<string, unknown> = {}) => ({
  instrument_id: id,
  symbol,
  name: `${symbol} Ltd`,
  exchange: 'NSE',
  segment: 'NSE_EQ',
  timeframe: '15m',
  state: st,
  last_price: '100.50',
  change_pct: '1.20',
  trend_score: '50',
  rvol: '1.10',
  rsi: '55.0',
  adx: '22.0',
  ema_fast: '100.40',
  ema_slow: '100.10',
  vwap: '100.00',
  vwap_distance_pct: '0.50',
  ema_spread_pct: '0.30',
  relative_pct: '0.40',
  missing_features: [],
  in_holdings: false,
  event_id: null,
  candle_close_at: CLOSE(2),
  reason: null,
  ...over,
})
const RELIANCE = state(1, 'RELIANCE', 'BULLISH_CONFIRMED', {
  trend_score: '82',
  in_holdings: true,
  event_id: 11,
})
const TCS = state(2, 'TCS', 'BEARISH_CONFIRMED', { trend_score: '64', change_pct: '-2.10' })
const INFY = state(3, 'INFY', 'BULLISH_PENDING', { trend_score: '40', event_id: 13 })
const EVENT = {
  id: 11,
  instrument_id: 1,
  symbol: 'RELIANCE',
  name: 'RELIANCE Ltd',
  exchange: 'NSE',
  timeframe: '15m',
  direction: 'bullish',
  state: 'BULLISH_CONFIRMED',
  crossed_at: CLOSE(0),
  confirmed_at: CLOSE(1),
  ema_fast: '100.4',
  ema_slow: '100.1',
  vwap: '100',
  last_price: '100.1',
  confirm_price: '100.6',
  confirm_vwap: '100.2',
  trend_score: '82',
  in_holdings: true,
  data_source: 'candles',
  data_as_of: CLOSE(2),
  metrics: {},
  created_at: CLOSE(0),
  updated_at: CLOSE(1),
}
const coverage = {
  boundary: null,
  data_as_of: CLOSE(2),
  evaluated: 1800,
  finished_at: CLOSE(2),
  history_wait_timed_out: false,
  illiquid: 10,
  run_id: 'r1',
  timeframe: '15m',
  unavailable: 5,
  universe_size: 2000,
}
const NOTE = {
  id: 501,
  kind: 'bullish_cross',
  event_id: 11,
  instrument_id: 1,
  timeframe: '15m',
  title: 'RELIANCE crossed up',
  body: 'EMA 8 crossed above EMA 32 at 100.10.',
  payload: { instrument: { id: 1, symbol: 'RELIANCE', exchange: 'NSE' }, signal_id: 11 },
  created_at: CLOSE(1),
  read_at: null,
}

let statesFail = false
let candlesFail = false
let prefs = {
  enabled: true,
  kinds: [] as string[],
  timeframes: [] as string[],
  all_market: false,
  confirmed_only: false,
}
const sent: { method: string; path: string; body: unknown }[] = []
const calls: URL[] = []

async function answer(req: Request): Promise<[number, unknown]> {
  const url = new URL(req.url)
  const p = url.pathname
  const q = url.searchParams
  calls.push(url)
  const B = '/api/trading/stock-signals'
  if (req.method !== 'GET') {
    const body = await req
      .clone()
      .json()
      .catch(() => null)
    sent.push({ method: req.method, path: p, body })
    if (p === `${B}/notifications/501/read`) return [200, { ...NOTE, read_at: CLOSE(2) }]
    if (p === `${B}/notifications/read-all`) return [200, { unread_count: 0 }]
    if (p === `${B}/notifications/preferences`) {
      prefs = body as typeof prefs
      return [200, prefs]
    }
    if (p === `${B}/rebalance-preview`)
      return [
        200,
        {
          timeframe: '15m',
          trades: [
            {
              side: 'BUY',
              symbol: 'INFY',
              instrument_id: 3,
              quantity: '5',
              price: '100.5',
              value: '502.5',
              charges: '1.2',
              reason: 'Bullish candidate below the maximum weight',
            },
          ],
          cash_before: '1000',
          cash_after: '496.3',
          cash_required: '503.7',
          cash_known: true,
          total_charges: '1.2',
          allocation_before: { RELIANCE: '100' },
          allocation_after: { RELIANCE: '67', INFY: '33' },
          review: [],
          notes: ['Charges: Dhan delivery schedule.'],
          inputs: {},
          charges_model: 'dhan-delivery',
          freshness: { holdings_as_of: CLOSE(2), cash_as_of: CLOSE(2), signals_as_of: CLOSE(2) },
          generated_at: CLOSE(2),
        },
      ]
    if (p === '/api/trading/watchlists/w1/items')
      return [201, { instrument_id: 2, instrument: null, position: 1, added_at: CLOSE(2) }]
    return [404, { detail: 'not found' }]
  }
  if (p === `${B}/states`) {
    if (statesFail) return [503, { detail: 'signal store unavailable' }]
    const rows = q.get('in_holdings') === 'true' ? [RELIANCE] : [RELIANCE, TCS, INFY]
    return [200, { items: rows, total: rows.length, limit: 200, offset: 0 }]
  }
  if (p === B) {
    const sym = q.get('symbol')
    const items = sym ? (sym === 'RELIANCE' ? [EVENT] : []) : [EVENT]
    return [200, { items, total: items.length, limit: 200, offset: 0 }]
  }
  if (p === `${B}/11`) return [200, { event: EVENT, current: RELIANCE }]
  if (p === `${B}/13`)
    return [
      200,
      {
        event: {
          ...EVENT,
          id: 13,
          instrument_id: 3,
          symbol: 'INFY',
          confirmed_at: null,
          state: 'BULLISH_PENDING',
        },
        current: INFY,
      },
    ]
  if (p === `${B}/trending`) {
    const items = q.get('direction') === 'bullish' ? [RELIANCE, INFY] : [TCS]
    return [200, { kind: 'trending', items, coverage, note: null }]
  }
  if (p === `${B}/market-movers`) {
    const k = q.get('kind')
    return [200, { kind: k, items: k === 'losers' ? [TCS] : [RELIANCE], coverage, note: null }]
  }
  if (p === `${B}/portfolio-map`)
    return [
      200,
      {
        timeframe: '15m',
        accounts: 1,
        holdings: [
          {
            instrument_id: 1,
            symbol: 'RELIANCE',
            isin: 'INE002A01018',
            exchange: 'NSE',
            quantity: '10',
            avg_cost: '90',
            last_price: '100.5',
            price_source: 'candle_close',
            price_as_of: CLOSE(2),
            invested: '900',
            current_value: '1005',
            unrealized_pnl: '105',
            unrealized_pnl_pct: '11.67',
            allocation_pct: '100',
            signal_state: 'BULLISH_CONFIRMED',
            ema_state: 'above',
            vwap_state: 'above',
            trend_score: '82',
            signal_as_of: CLOSE(2),
            classification: 'HOLD_CANDIDATE',
            reasons: ['Bullish but over the 20% maximum weight'],
            deep_link: '/trading/signals/11',
          },
        ],
        totals: { invested: '900', current: '1005', unrealized_pnl: '105', unpriced_holdings: '0' },
        available_cash: '1000',
        sector_exposure: { available: false, reason: 'no reliable sector source' },
        freshness: { holdings_as_of: CLOSE(2), cash_as_of: CLOSE(2), signals_as_of: CLOSE(2) },
        classification_counts: { HOLD_CANDIDATE: 1 },
        disclaimer: 'Information only, not advice.',
      },
    ]
  if (p === `${B}/notifications`) {
    const after = q.get('after_id')
    return [
      200,
      { items: after ? [] : [NOTE], unread_count: 1, next_before_id: null, last_id: 501 },
    ]
  }
  if (p === `${B}/notifications/preferences`) return [200, prefs]
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
          items: [{ instrument_id: 1, instrument: null, position: 0, added_at: T(0) }],
        },
      ],
    ]
  if (p === '/api/trading/candles') {
    const id = Number(q.get('instrument_id'))
    if (candlesFail) return [503, { detail: 'candle store unavailable' }]
    return [
      200,
      [0, 1, 2].map((i) => ({
        ts: T(i),
        open: '100',
        high: '101',
        low: '99',
        close: String(100 + i * 0.3 + id * 0),
        volume: '100',
        is_gap: false,
      })),
    ]
  }
  if (p === '/api/trading/indicators/compute')
    return [
      200,
      [0, 1, 2].flatMap((i) => [
        { name: 'ema:8', ts: T(i), values: { value: String(99.9 + i * 0.3) } },
        { name: 'ema:32', ts: T(i), values: { value: '100.1' } },
        { name: 'vwap', ts: T(i), values: { value: '100.0' } },
      ]),
    ]
  return [404, { detail: 'not found' }]
}

const streams: FakeES[] = []
class FakeES {
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  listeners = new Map<string, ((m: MessageEvent) => void)[]>()
  constructor(public url: string) {
    streams.push(this)
  }
  addEventListener(name: string, fn: (m: MessageEvent) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn])
  }
  emit(name: string, data: unknown, id = '') {
    for (const fn of this.listeners.get(name) ?? [])
      fn({ data: JSON.stringify(data), lastEventId: id } as MessageEvent)
  }
  close() {}
}

beforeEach(() => {
  statesFail = false
  candlesFail = false
  prefs = { enabled: true, kinds: [], timeframes: [], all_market: false, confirmed_only: false }
  sent.length = 0
  calls.length = 0
  streams.length = 0
  localStorage.clear()
  clearSeriesCache()
  resetSignalNotifications()
  vi.stubGlobal('EventSource', FakeES)
  vi.stubGlobal('fetch', async (req: Request) => {
    const [status, body] = await answer(req)
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
  document.documentElement.style.overflow = ''
  vi.unstubAllGlobals()
})

async function mountPage(path = '/trading/stock-signals', rows = 3) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trading/:section?', component: { template: '<div />' } }],
  })
  await router.push(path)
  const w = mount(TradingStockSignals, { global: { plugins: [router] }, attachTo: document.body })
  mounted.push(w)
  await flushPromises()
  if (rows)
    await vi.waitFor(() => expect(w.findAll('.stb__row')).toHaveLength(rows), { timeout: 8000 })
  return { w, router }
}
const syms = (w: ReturnType<typeof mount>) =>
  w.findAll('.stb__row').map((r) => r.find('.stb__sym').text())
const row = (w: ReturnType<typeof mount>, s: string) =>
  w.findAll('.stb__row').find((r) => r.find('.stb__sym').text() === s)!
const btn = (root: { findAll(s: string): DOMWrapper<Element>[] }, label: string) =>
  root.findAll('button').find((b) => b.text() === label || b.attributes('aria-label') === label)!
const bodyButton = (sel: string, text: string) =>
  [...document.body.querySelectorAll(`${sel} button`)].find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement

describe('Stock Signals on the backend engine', () => {
  it('shows the stored states, with the summary counted from them', async () => {
    const { w } = await mountPage()
    expect(
      Object.fromEntries(
        w.findAll('.stb__row').map((r) => [r.find('.stb__sym').text(), r.find('.sb').text()]),
      ),
    ).toEqual({
      RELIANCE: 'Bullish · confirmed',
      TCS: 'Bearish · confirmed',
      INFY: 'Bullish · awaiting VWAP',
    })
    const k = w.find('.ss__kpis').text()
    expect(k).toMatch(/Bullish confirmed\s*1/)
    expect(k).toMatch(/Bearish confirmed\s*1/)
    expect(k).toMatch(/Awaiting VWAP\s*1/)
    expect(k).toMatch(/New opportunities\s*1/) // INFY trending, not held
    expect(row(w, 'RELIANCE').find('.stb__held').text()).toBe('Held')
    const statesCall = calls.find((u) => u.pathname.endsWith('/states'))!
    expect(statesCall.searchParams.get('timeframe')).toBe('15m')
  })

  it('sorts, filters and searches', async () => {
    const { w } = await mountPage()
    expect(syms(w)).toEqual(['RELIANCE', 'TCS', 'INFY']) // by trend score
    await w
      .findAll('.stb__sort')
      .find((b) => b.text().startsWith('Stock'))!
      .trigger('click')
    expect(syms(w)).toEqual(['INFY', 'RELIANCE', 'TCS'])
    expect(
      w
        .findAll('th')
        .find((h) => h.text().startsWith('Stock'))!
        .attributes('aria-sort'),
    ).toBe('ascending')
    await w.find('.stb__tools input').setValue('tc')
    await flushPromises()
    expect(syms(w)).toEqual(['TCS'])
  })

  it('opens a row’s details on demand with the cross and VWAP confirmation apart', async () => {
    const { w } = await mountPage()
    const chev = row(w, 'RELIANCE').find('.c-x button')
    await chev.trigger('click')
    expect(chev.attributes('aria-expanded')).toBe('true')
    const d = w.find('.stb__detail').text()
    expect(d).toContain('▲ Bullish')
    expect(d).toContain('Confirmed at 100.6')
    expect(d).toContain('Hold')
    expect(d).toContain('over the 20% maximum weight')
    await chev.trigger('click')
    expect(w.find('.stb__detail').exists()).toBe(false)
  })

  it('opens the chart in a wide dialog with markers, fullscreen and a timeframe switch', async () => {
    const { w, router } = await mountPage()
    await btn(row(w, 'RELIANCE'), 'View chart for RELIANCE').trigger('click')
    await flushPromises()
    const dialog = document.body.querySelector('.ui-modal')!
    expect(dialog.classList.contains('ui-modal--wide')).toBe(true)
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(router.currentRoute.value.query).toMatchObject({ instrument: '1', ctf: '15m' })
    await vi.waitFor(() =>
      expect(
        dialog.querySelectorAll('g.cc__marker, .cc__markers *').length +
          (dialog.textContent?.includes('EMA 32') ? 1 : 0),
      ).toBeGreaterThan(0),
    )
    ;(dialog.querySelector('[aria-label="Fullscreen"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(document.body.querySelector('.ui-modal')!.classList.contains('ui-modal--full')).toBe(
      true,
    )
    const before = calls.length
    bodyButton('.ui-modal', '1H').click()
    await flushPromises()
    await vi.waitFor(() => {
      const fresh = calls.slice(before)
      expect(
        fresh.filter(
          (u) => u.searchParams.get('timeframe') === '1h' && u.pathname.startsWith('/api/trading/'),
        ).length,
      ).toBeGreaterThanOrEqual(3)
    })
    // 1h: the candles and lines for this stock, and its newest 1h event by symbol
    const fresh = calls.slice(before)
    expect(
      fresh.some(
        (u) =>
          u.pathname === '/api/trading/stock-signals' &&
          u.searchParams.get('symbol') === 'RELIANCE',
      ),
    ).toBe(true)
    expect(fresh.filter((u) => u.pathname.endsWith('/states'))).toHaveLength(0)
  })

  it('uses a bottom drawer on a phone', async () => {
    const { w } = await mountPage()
    useUiStore().vw = 400
    await flushPromises()
    await btn(row(w, 'TCS'), 'View chart for TCS').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.ui-sheet')).toBeTruthy()
    expect(document.body.querySelector('.ui-modal')).toBeNull()
  })

  it('lists notifications with an unread bell, takes a live one from the stream, and opens a chart from one', async () => {
    const { w, router } = await mountPage()
    await vi.waitFor(() => expect(w.find('.ss__badge').text()).toBe('1'))
    const feed = streams.find((s) => s.url.includes('/api/trading/stock-signals/stream'))!
    expect(feed).toBeTruthy()
    feed.emit(
      'notification',
      {
        ...NOTE,
        id: 502,
        kind: 'vwap_confirmed',
        title: 'INFY confirmed',
        payload: { instrument: { id: 3, symbol: 'INFY' }, signal_id: 13 },
      },
      '502',
    )
    await flushPromises()
    expect(w.find('.ss__badge').text()).toBe('2')
    await btn(w, 'Alerts (2)').trigger('click')
    await flushPromises()
    const items = w.findAll('.sa__item')
    expect(items.map((i) => i.find('b').text())).toEqual(['INFY', 'RELIANCE'])
    await items[1].find('.sa__open').trigger('click')
    await flushPromises()
    expect(
      sent.some((s) => s.method === 'PATCH' && s.path.endsWith('/notifications/501/read')),
    ).toBe(true)
    await vi.waitFor(() => expect(router.currentRoute.value.query.instrument).toBe('1'))
    expect(document.body.querySelector('.ui-modal')).toBeTruthy()
  })

  it('opens a notification’s deep link (?signal=)', async () => {
    const { router } = await mountPage('/trading/stock-signals?signal=13')
    await vi.waitFor(() =>
      expect(document.body.querySelector('.ui-modal')?.textContent).toContain('INFY'),
    )
    expect(router.currentRoute.value.query.instrument).toBe('3')
  })

  it('saves alert preferences', async () => {
    const { w } = await mountPage()
    await btn(w, 'Alerts (1)').trigger('click')
    await flushPromises()
    await btn(w, 'Preferences').trigger('click')
    await flushPromises()
    const confirmedOnly = w
      .findAll('.sa__prefs label')
      .find((l) => l.text().includes('Only VWAP-confirmed'))!
    await confirmedOnly.trigger('click')
    await btn(w, 'Save preferences').trigger('click')
    await flushPromises()
    await vi.waitFor(() =>
      expect(sent.find((s) => s.method === 'PUT')?.body).toMatchObject({ confirmed_only: true }),
    )
  })

  it('adds a stock to a server watchlist', async () => {
    const { w } = await mountPage()
    await btn(row(w, 'TCS'), 'Add TCS to a watchlist').trigger('click')
    await flushPromises()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Saved to your Aureon account'),
    )
    bodyButton('.ui-modal', 'Add').click()
    await flushPromises()
    await vi.waitFor(() =>
      expect(sent.find((s) => s.path === '/api/trading/watchlists/w1/items')?.body).toEqual({
        instrument_id: 2,
      }),
    )
  })

  it('shows the portfolio map and the server’s rebalance preview, ordering nothing', async () => {
    const { w } = await mountPage()
    await btn(w, 'Portfolio Map').trigger('click')
    await flushPromises()
    const tile = w.find('.pm__tile')
    expect(tile.text()).toContain('RELIANCE')
    expect(tile.text()).toContain('100%')
    expect(tile.classes()).toContain('t-bull')
    expect(w.find('.pm__cands').text()).toContain('INFY')
    await btn(w, 'Preview').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(w.find('.pm__table').text()).toContain('INFY'))
    expect(sent.find((s) => s.path.endsWith('/rebalance-preview'))?.body).toMatchObject({
      timeframe: '15m',
    })
    expect(sent.filter((s) => /order|intent/.test(s.path))).toHaveLength(0)
  })

  it('reads the market movers when the tab opens', async () => {
    const { w } = await mountPage()
    expect(calls.some((u) => u.pathname.endsWith('/market-movers'))).toBe(false)
    await btn(w, 'Market Movers').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(w.findAll('.mm__card')).toHaveLength(5))
    expect(w.text()).toContain('1800 of 2000 evaluated')
  })

  it('says so when the signals cannot be read', async () => {
    statesFail = true
    const { w } = await mountPage('/trading/stock-signals', 0)
    await vi.waitFor(() => expect(w.text()).toContain('Signals could not be loaded'), {
      timeout: 15000,
    })
    expect(w.text()).toContain('signal store unavailable')
  })
})
