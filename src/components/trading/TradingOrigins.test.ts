// /trading/origins against a stubbed API: badges per origin, the comparison
// card, chips ↔ URL query ↔ request, and the loading / empty / error states.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

const NOW = new Date().toISOString()
const S = (net: string, trades: number, extra: Record<string, unknown> = {}) => ({
  trades,
  wins: trades ? 1 : 0,
  losses: trades > 1 ? trades - 1 : 0,
  win_rate: trades ? '0.5' : null,
  net,
  gross_profit: '0',
  gross_loss: '0',
  avg_r: trades ? '0.8' : null,
  max_drawdown: '12.5',
  avg_duration_s: 3600,
  ...extra,
})
const STATS = (ok = true) => ({
  from: NOW,
  to: NOW,
  currency: 'USD',
  account_total_net: '95.5',
  origins: {
    all: S('95.5', 5),
    manual: S('140.25', 3),
    managed: S('40', 1),
    bot: S('-44.75', 2),
    unknown: S('0', 0),
  },
  by_session: { manual: { london: S('140.25', 3) }, bot: { ny: S('-44.75', 2) }, all: {} },
  buckets: [{ start: '2026-11-03T00:00:00Z', manual: S('140.25', 3), bot: S('-44.75', 2) }],
  check: { split_sum_net: ok ? '95.5' : '90', account_total_net: '95.5', ok },
})
const TRADE = (id: number, origin: string, touched = false) => ({
  acct: 'a1',
  position_id: id,
  symbol: 'XAUUSD',
  side: 'buy',
  volume: '0.1',
  entry_time: NOW,
  entry_price: '2650.5',
  exit_time: NOW,
  exit_price: '2655',
  initial_sl: '2640',
  tp: null,
  profit: '45',
  commission: '-0.7',
  swap: '0',
  net: '44.3',
  origin,
  guardian_touched: touched,
  open_reason: 'client',
  close_reason: 'tp',
  close_actor: 'broker',
  duration_s: 4320,
  r_multiple: '0.43',
  session: 'london',
  comment: '',
  magic: 0,
  status: 'closed',
})
const POS = (ticket: number, origin: string, touched = false) => ({
  ticket,
  position_id: ticket,
  symbol: 'XAUUSD',
  side: 'sell',
  volume: '0.2',
  price_open: '2660',
  price_current: '2655',
  sl: '2670',
  tp: null,
  profit: '100',
  swap: '0',
  time: NOW,
  origin,
  guardian_touched: touched,
})

type R = [number, unknown]
let routes: Record<string, () => R>
const calls: URL[] = []

function defaults(): Record<string, () => R> {
  return {
    '/api/trading/mt5/trades/stats': () => [200, STATS()],
    '/api/trading/mt5/trades': () => [
      200,
      { items: [TRADE(1, 'manual'), TRADE(2, 'bot'), TRADE(3, 'manual', true)], total: 3 },
    ],
    '/api/trading/mt5/positions/open': () => [
      200,
      {
        as_of: NOW,
        items: [POS(11, 'manual'), POS(12, 'bot'), POS(13, 'manual', true), POS(14, 'unknown')],
      },
    ],
    '/api/trading/mt5/trades/gaps': () => [200, { items: [] }],
    '/api/trading/dhan/orders/origins': () => [
      200,
      {
        items: [
          {
            order_id: 'd1',
            correlation_id: 'aureon-1',
            tag: null,
            symbol: 'HDFCBANK',
            side: 'BUY',
            qty: '5',
            price: '1650.5',
            status: 'TRADED',
            origin: 'aureon',
            placed_at: NOW,
          },
        ],
      },
    ],
  }
}

class FakeES {
  readyState = 0
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

beforeEach(() => {
  routes = defaults()
  calls.length = 0
  vi.stubGlobal('EventSource', FakeES)
  vi.stubGlobal('fetch', async (req: Request) => {
    const url = new URL(req.url)
    calls.push(url)
    if (req.method !== 'GET') throw new Error(`unexpected ${req.method} ${url.pathname}`)
    const [status, body] = routes[url.pathname]?.() ?? [404, { detail: 'not found' }]
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
})
const mounted: { unmount(): void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
})

async function sees(w: { text(): string }, text: string) {
  await vi.waitFor(() => expect(w.text()).toContain(text), { timeout: 8000, interval: 20 })
}

async function mountAt(path: string) {
  const TradingOrigins = (await import('./TradingOrigins.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trading/:section?', component: TradingOrigins }],
  })
  await router.push(path)
  const w = mount(TradingOrigins, { global: { plugins: [router] }, attachTo: document.body })
  mounted.push(w)
  for (let i = 0; i < 3; i++) await flushPromises()
  return { w, router }
}

const lastCall = (path: string) => [...calls].reverse().find((u) => u.pathname === path)

describe('TradingOrigins', () => {
  it('renders an origin badge per row in positions and the journal', async () => {
    const { w } = await mountAt('/trading/origins')
    await sees(w, 'Trade journal')
    await sees(w, 'Open positions')
    await sees(w, 'Guardian-managed')
    await sees(w, 'HDFCBANK')
    const badges = () => w.findAll('.ui-table .ui-badge').map((b) => b.text().replace(/^\S\s*/, ''))
    await vi.waitFor(() => expect(badges().length).toBe(4 + 3 + 1))
    // Positions: manual, bot, manual+guardian, unknown; journal: manual, bot, manual+guardian; Dhan.
    expect(badges()).toEqual([
      'My trade',
      'Bot',
      'Guardian-managed',
      'Unknown',
      'My trade',
      'Bot',
      'Guardian-managed',
      'Aureon',
    ])
    const text = w.text()
    expect(text).toContain('Take profit')
    expect(text).toContain('1h12m')
    expect(text).toContain('0.43R')
    // Read-only: nothing but GETs (the fetch stub throws otherwise) and no action buttons.
    const labels = w.findAll('button').map((b) => b.text())
    expect(labels.some((l) => /close|modify|place|approve|buy|sell/i.test(l))).toBe(false)
  })

  it('maps chips to the URL query and the trades request', async () => {
    const { w, router } = await mountAt('/trading/origins?origin=bot')
    await sees(w, 'Trade journal')
    await vi.waitFor(() =>
      expect(lastCall('/api/trading/mt5/trades')?.searchParams.get('origin')).toBe('bot'),
    )
    expect(lastCall('/api/trading/dhan/orders/origins')?.searchParams.get('origin')).toBe('aureon')
    // The open-positions table is filtered to bot rows.
    await sees(w, 'Open positions')
    await vi.waitFor(() =>
      expect(
        w
          .findAll('table')
          .find((t) => t.find('caption').text().includes('Open positions'))
          ?.findAll('tbody tr').length,
      ).toBe(1),
    )

    const chip = w.findAll('[role="radio"]').find((b) => b.text() === 'Guardian-managed')!
    await chip.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.query.origin).toBe('managed'))
    await vi.waitFor(() =>
      expect(lastCall('/api/trading/mt5/trades')?.searchParams.get('origin')).toBe('managed'),
    )

    await w
      .findAll('[role="radio"]')
      .find((b) => b.text() === 'All')!
      .trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.query.origin).toBeUndefined())
    await vi.waitFor(() =>
      expect(lastCall('/api/trading/mt5/trades')?.searchParams.get('origin')).toBe('all'),
    )
  })

  it('sends the bucket and period from the query to the stats request', async () => {
    await mountAt('/trading/origins?bucket=week&period=30')
    await vi.waitFor(() => {
      const q = lastCall('/api/trading/mt5/trades/stats')!.searchParams
      expect(q.get('bucket')).toBe('week')
      const days = (Date.parse(q.get('to')!) - Date.parse(q.get('from')!)) / 86_400_000
      expect(Math.round(days)).toBe(30)
    })
  })

  it('compares my trading with the bot and shows the split check', async () => {
    const { w } = await mountAt('/trading/origins')
    await sees(w, 'You did better by 185 USD.')
    const check = w.find('[data-test="split-check"]')
    expect(check.text()).toContain('ok')
    expect(check.classes()).not.toContain('oc__bad')
    expect(w.text()).toContain('+140.25')
    expect(w.text()).toContain('-44.75')
  })

  it('marks a failed split check red', async () => {
    routes['/api/trading/mt5/trades/stats'] = () => [200, STATS(false)]
    const { w } = await mountAt('/trading/origins')
    await sees(w, 'MISMATCH')
    expect(w.find('[data-test="split-check"]').classes()).toContain('oc__bad')
  })

  it('shows a notice for recent deal-history gaps only', async () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString()
    routes['/api/trading/mt5/trades/gaps'] = () => [
      200,
      {
        items: [
          { acct: 'a1', detected_at: NOW, missing: 3, tickets: [1, 2, 3], kind: 'count' },
          { acct: 'a1', detected_at: old, missing: 9, tickets: [], kind: 'count' },
        ],
      },
    ]
    const { w } = await mountAt('/trading/origins')
    await sees(w, '1 gap(s) in the pushed deal history')
    expect(w.text()).toContain('3 deal(s) missing')
  })

  it('shows no gap notice when there are none', async () => {
    const { w } = await mountAt('/trading/origins')
    await sees(w, 'Trade journal')
    expect(w.find('[data-test="gaps"]').exists()).toBe(false)
  })

  it('shows empty states', async () => {
    routes['/api/trading/mt5/trades/stats'] = () => [
      200,
      { ...STATS(), origins: { all: S('0', 0), manual: S('0', 0), bot: S('0', 0) }, buckets: [] },
    ]
    routes['/api/trading/mt5/trades'] = () => [200, { items: [], total: 0 }]
    routes['/api/trading/mt5/positions/open'] = () => [200, { items: [], as_of: NOW }]
    routes['/api/trading/dhan/orders/origins'] = () => [200, { items: [] }]
    const { w } = await mountAt('/trading/origins')
    await sees(w, 'No trades for this filter and period.')
    expect(w.text()).toContain('No open position for this filter.')
    expect(w.text()).toContain('Neither you nor the bot closed a trade in this period.')
    expect(w.text()).toContain('No Dhan orders for this filter and period.')
  })

  it('shows loading states while requests are pending', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}))
    const { w } = await mountAt('/trading/origins')
    expect(w.text()).toContain('Loading stats…')
    expect(w.text()).toContain('Loading trades…')
    expect(w.text()).toContain('Loading positions…')
    expect(w.text()).toContain('Comparing…')
  })

  it('shows error states with a retry', async () => {
    const boom = (): R => [500, { detail: 'database is down' }]
    routes['/api/trading/mt5/trades/stats'] = boom
    routes['/api/trading/mt5/trades'] = boom
    routes['/api/trading/mt5/positions/open'] = boom
    routes['/api/trading/dhan/orders/origins'] = () => [404, { detail: 'Not Found' }]
    const { w } = await mountAt('/trading/origins')
    await sees(w, 'Could not load the stats: database is down')
    expect(w.text()).toContain('Could not load the journal: database is down')
    expect(w.text()).toContain('Could not load open positions: database is down')
    expect(w.text()).toContain('Could not load the comparison: database is down')
    expect(w.text()).toContain('Dhan order origins are not available')

    routes = defaults()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Try again')!
      .trigger('click')
    await sees(w, 'You did better by')
  })
})
