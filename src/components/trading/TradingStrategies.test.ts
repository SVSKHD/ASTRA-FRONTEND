// /trading/strategies against a stubbed API: the instrument picker replaces the
// comma-separated ids, validation and the backend's 422 are shown, a backtest
// is queued with the right body, and past runs and their results render.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.setConfig({ testTimeout: 20_000 })

const NOW = new Date().toISOString()
const INSTRUMENT = {
  id: 7,
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
}
const STRATEGIES = [
  {
    id: 'st',
    name: 'ema-9-21',
    description: 'Trend follower',
    is_active: false,
    created_at: NOW,
    versions: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        version: 2,
        code_ref: 'ema_pullback',
        params: { fast: 9, slow: 21, instrument_ids: [42], timeframes: ['1h'] },
        created_at: NOW,
      },
    ],
  },
]
const RUN = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  strategy_version_id: '11111111-1111-4111-8111-111111111111',
  instrument_id: 42,
  timeframe: '1h',
  period_start: NOW,
  period_end: NOW,
  params: { fast: 9, slow: 21 },
  costs: { spread_bps: '2' },
  status,
  metrics: {},
  error: null,
  created_at: NOW,
  started_at: null,
  finished_at: null,
  ...extra,
})
const DONE = RUN('r-done', 'done', {
  metrics: {
    trades: 4,
    wins: 3,
    losses: 1,
    win_rate: '0.75',
    net_pnl: '120.5',
    gross_profit: '150',
    gross_loss: '29.5',
    expectancy: '30.125',
    profit_factor: '5.08',
    max_drawdown: '29.5',
    fees: '4.2',
    spread_slippage_cost: '1.1',
    open_at_end: 0,
    fill: 'next bar open',
  },
})

type R = [number, unknown]
let createReply: () => R
let runsTotal = 1
const calls: string[] = []
const posts: { path: string; body: unknown }[] = []

class FakeES {
  readyState = 0
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

function get(url: URL): R {
  const p = url.pathname
  if (p === '/api/trading/strategies') return [200, STRATEGIES]
  if (p === '/api/trading/backtests')
    return [
      200,
      {
        items: [DONE, RUN('r-fail', 'failed', { error: 'no candles in period' })],
        total: runsTotal,
        limit: 20,
        offset: Number(url.searchParams.get('offset') ?? 0),
      },
    ]
  if (p === '/api/trading/backtests/r-done')
    return [200, { run: DONE, trades: [], trades_total: 4, source: 'simulated' }]
  if (p === '/api/trading/ai-analyses') return [200, []]
  if (p === '/api/trading/instruments')
    return [200, { items: [INSTRUMENT], total: 1, limit: 25, offset: 0 }]
  return [404, { detail: 'not found' }]
}

beforeEach(async () => {
  calls.length = 0
  posts.length = 0
  runsTotal = 2
  createReply = () => [
    201,
    { id: 'v3', version: 3, code_ref: 'ema_cross', params: {}, created_at: NOW },
  ]
  vi.resetModules()
  vi.stubGlobal('EventSource', FakeES)
  vi.stubGlobal('fetch', async (req: Request) => {
    const url = new URL(req.url)
    calls.push(`${req.method} ${url.pathname}${url.search}`)
    let res: R
    if (req.method === 'POST') {
      const body = JSON.parse((await req.text()) || '{}')
      posts.push({ path: url.pathname, body })
      res =
        url.pathname === '/api/trading/strategies'
          ? createReply()
          : url.pathname === '/api/trading/strategies/backtest'
            ? [202, { run_ids: ['r-new'] }]
            : [404, { detail: 'no' }]
    } else res = get(url)
    return new Response(JSON.stringify(res[1]), {
      status: res[0],
      headers: { 'content-type': 'application/json' },
    })
  })
})
const mounted: { unmount(): void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function sees(w: { text(): string }, text: string) {
  await vi.waitFor(() => expect(w.text()).toContain(text), { timeout: 8000, interval: 20 })
}

async function mountStrategies(admin = true) {
  const { tradingSession } = await import('@/trading/session')
  tradingSession.role = admin ? 'admin' : 'viewer'
  const C = (await import('./TradingStrategies.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/trading/strategies')
  const w = mount(C, { global: { plugins: [router] }, attachTo: document.body })
  mounted.push(w)
  for (let i = 0; i < 3; i++) await flushPromises()
  return w
}

type W = Awaited<ReturnType<typeof mountStrategies>>
const form = (w: W, title: string) => w.findAll('.ui-card').find((c) => c.text().includes(title))!
const button = (w: { findAll(s: string): { text(): string }[] }, text: string) =>
  w.findAll('button').find((b) => b.text().trim() === text) as unknown as {
    attributes(n: string): string | undefined
    trigger(e: string): Promise<void>
  }

/** Type into an InstrumentPicker and choose the search result. */
async function pickInstrument(scope: { find(s: string): { setValue(v: string): Promise<void> } }) {
  await scope.find('input[role="combobox"]').setValue('REL')
  await vi.waitFor(
    () =>
      expect(
        [...document.body.querySelectorAll('[role="option"]')].some((o) =>
          o.textContent?.includes('RELIANCE'),
        ),
      ).toBe(true),
    { timeout: 4000 },
  )
  const opt = [...document.body.querySelectorAll('[role="option"]')].find((o) =>
    o.textContent?.includes('RELIANCE'),
  ) as HTMLElement
  opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  opt.click()
  await flushPromises()
}

describe('TradingStrategies', () => {
  it('states that nothing here places a trade, and shows status read-only with versions', async () => {
    const w = await mountStrategies()
    await sees(w, 'ema-9-21')
    expect(w.text()).toContain('never places a trade')
    expect(w.text()).toContain('Disabled')
    expect(w.text()).toContain('no endpoint to switch a strategy on or off')
    expect(w.text()).toContain('v2 · EMA pullback')
    expect(w.text()).toContain('fast 9 · slow 21')
    expect(w.text()).toContain('Timeframes: 1h')
    // The version's instrument opens the chart.
    expect(w.find('a[aria-label="Open chart for instrument 42"]').attributes('href')).toBe(
      '/trading/charts?instrument=42&tf=1h',
    )
    // No enable/disable control exists.
    expect(w.findAll('button').some((b) => /enable|disable/i.test(b.text()))).toBe(false)
  })

  it('picks instruments as chips and saves a version with the params the backend reads', async () => {
    const w = await mountStrategies()
    await sees(w, 'New strategy version')
    const card = form(w, 'New strategy version')
    expect(card.text()).not.toContain('comma-separated')
    await card.find('input[placeholder="ema-9-21"]').setValue('ema-8-32')
    await pickInstrument(card)
    await sees(card, 'RELIANCE')
    expect(card.find('button[aria-label="Remove RELIANCE"]').exists()).toBe(true)
    await card.find('form').trigger('submit')
    await sees(w, 'Saved as version 3')
    expect(posts).toEqual([
      {
        path: '/api/trading/strategies',
        body: {
          name: 'ema-8-32',
          code_ref: 'ema_cross',
          params: { fast: 9, slow: 21, instrument_ids: [7], timeframes: ['15m'] },
        },
      },
    ])
  })

  it('shows validation errors and sends nothing', async () => {
    const w = await mountStrategies()
    await sees(w, 'New strategy version')
    const card = form(w, 'New strategy version')
    await card.find('form').trigger('submit')
    await sees(card, 'Give the strategy a name.')
    expect(card.text()).toContain('Pick at least one instrument to watch.')
    // fast ≥ slow: the Fast EMA field holds 9; make it 30 (slow is 21).
    await card.find('input[placeholder="ema-9-21"]').setValue('x')
    const fastInput = card
      .findAll('input')
      .find((i) => (i.element as HTMLInputElement).value === '9')!
    await fastInput.setValue('30')
    await sees(card, 'The slow EMA must be longer than the fast one.')
    expect(posts).toEqual([])
  })

  it("shows the backend's 422 detail", async () => {
    createReply = () => [
      422,
      {
        detail: [
          {
            loc: ['body', 'name'],
            msg: 'String should match pattern',
            type: 'string_pattern_mismatch',
          },
        ],
      },
    ]
    const w = await mountStrategies()
    await sees(w, 'New strategy version')
    const card = form(w, 'New strategy version')
    await card.find('input[placeholder="ema-9-21"]').setValue('ok-name')
    await pickInstrument(card)
    await card.find('form').trigger('submit')
    await sees(card, 'The server rejected it: name: String should match pattern')
  })

  it('queues a backtest for a version instrument and renders the results', async () => {
    const w = await mountStrategies(false)
    await sees(w, 'Run a backtest')
    expect(w.text()).not.toContain('New strategy version')
    const card = form(w, 'Run a backtest')
    await button(card, 'instrument 42').trigger('click')
    await card.find('form').trigger('submit')
    await sees(card, 'Queued 1 simulated run')
    expect(posts).toHaveLength(1)
    expect(posts[0].path).toBe('/api/trading/strategies/backtest')
    expect(posts[0].body).toMatchObject({
      strategy_version_id: '11111111-1111-4111-8111-111111111111',
      instrument_id: 42,
      timeframe: '15m',
      grid: {},
      costs: { spread_bps: '2', slippage_bps: '1', fee_bps: '3' },
    })
    // Past runs: the done one has a headline, the failed one its error.
    await sees(w, '4 trades · net +120.5 · win rate 75%')
    expect(w.text()).toContain('no candles in period')
    // Results.
    const results = w.findAll('button').filter((b) => b.text() === 'Results')
    await results[0].trigger('click')
    await sees(w, 'Profit factor')
    expect(w.text()).toContain('Gross profit')
    expect(w.text()).toContain('next bar open')
    expect(w.text()).toContain('Wins')
  })

  it('validates the backtest form before sending', async () => {
    const w = await mountStrategies(false)
    await sees(w, 'Run a backtest')
    const card = form(w, 'Run a backtest')
    await card.find('form').trigger('submit')
    await sees(card, 'Pick an instrument.')
    expect(posts).toEqual([])
  })

  it('pages through past runs', async () => {
    runsTotal = 45
    const w = await mountStrategies(false)
    await sees(w, 'Backtest runs')
    await sees(w, '1 / 3')
    await w.find('button[aria-label="Next page"]').trigger('click')
    await vi.waitFor(() => expect(calls).toContain('GET /api/trading/backtests?limit=20&offset=20'))
  })
})
