// The trading panel: the Aureon sign-in gate, the always-visible mode badge,
// and every section mounting against a stubbed API (no network, no backend).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

const NOW = new Date().toISOString()
const ACCOUNT = {
  id: '11111111-1111-4111-8111-111111111111',
  broker: 'dhan',
  account_id: '1100003626',
  label: 'Main',
  mode: 'OBSERVE',
  base_currency: 'INR',
  is_active: true,
  created_at: NOW,
  mode_changed_at: null,
  owner_user_id: 'u',
}
const PAGE = (items: unknown[]) => ({ items, total: items.length, limit: 50, offset: 0 })

let signedIn = true
const calls: string[] = []
const posts: { path: string; body: unknown }[] = []

const INTENT = (status: string, extra: Record<string, unknown> = {}) => ({
  id: '22222222-2222-4222-8222-222222222222',
  broker_account_id: ACCOUNT.id,
  instrument_id: 42,
  signal_id: 's1',
  side: 'BUY',
  order_type: 'MARKET',
  quantity: '10',
  limit_price: null,
  product: null,
  validity: 'DAY',
  mode: 'PAPER',
  status,
  source: 'strategy',
  created_by: 'u',
  correlation_id: 'sig-s1-11111111',
  created_at: NOW,
  updated_at: NOW,
  events: [{ id: 1, event_type: 'CREATED', correlation_id: 'c', payload: {}, occurred_at: NOW }],
  risk_decisions: [
    {
      id: 7,
      broker_account_id: ACCOUNT.id,
      signal_id: 's1',
      order_intent_id: 'x',
      approved: true,
      reason: 'all checks passed',
      checks: [],
      inputs: {},
      created_at: NOW,
    },
  ],
  executions: [],
  ...extra,
})
const FILL = {
  id: 'e1',
  broker_account_id: ACCOUNT.id,
  instrument_id: 42,
  order_intent_id: 'x',
  broker_trade_id: 'paper-x',
  side: 'BUY',
  quantity: '10',
  price: '1000.2',
  fees: '4.21',
  currency: 'INR',
  executed_at: NOW,
  session: 'London',
  is_simulated: true,
  source: 'simulated',
}

function post(path: string, body: unknown): [number, unknown] {
  posts.push({ path, body })
  if (path === '/api/trading/order-intents') return [201, INTENT('PENDING_RISK')]
  if (path.endsWith('/approve')) return [200, INTENT('FILLED', { executions: [FILL] })]
  if (path.endsWith('/mode')) {
    ACCOUNT.mode = (body as { mode: string }).mode
    return [200, ACCOUNT]
  }
  return [404, { detail: 'not found' }]
}

function route(path: string): [number, unknown] {
  if (path === '/api/auth/me')
    return signedIn
      ? [200, { id: 'u', email: 'owner@spasta.online', role: 'admin', last_login_at: null }]
      : [401, { detail: 'not authenticated' }]
  if (path === '/api/trading/accounts') return [200, PAGE([ACCOUNT])]
  if (path === '/api/trading/agents')
    return [
      200,
      [
        {
          id: 'risk',
          name: 'Risk agent',
          state: 'idle',
          paused: false,
          last_heartbeat_at: NOW,
          details: { queue: 0 },
        },
      ],
    ]
  if (path === '/api/trading/signals')
    return [
      200,
      PAGE([
        {
          id: 's1',
          strategy_version_id: 'v1',
          instrument_id: 42,
          timeframe: '15m',
          candle_time: NOW,
          session: 'London',
          side: 'BUY',
          strength: null,
          inputs: { close: '101.5', ema_fast: '100.2', ema_slow: '99.8', code_ref: 'ema_cross' },
          created_at: NOW,
        },
      ]),
    ]
  if (path === '/api/trading/mt5/status')
    return [501, { detail: { code: 'not_supported', broker: 'mt5', operation: 'mt5_status' } }]
  if (path.endsWith('/health'))
    return [
      200,
      {
        broker: 'dhan',
        ok: true,
        supported: true,
        checked_at: NOW,
        detail: null,
        credentials_expire_at: null,
      },
    ]
  if (path.endsWith('/funds'))
    return [
      200,
      {
        account_id: '1',
        currency: 'INR',
        available: '98440.0',
        used_margin: '0',
        equity: null,
        as_of: NOW,
        source: 'broker',
      },
    ]
  if (path.endsWith('/positions'))
    return [
      200,
      PAGE([
        {
          account_id: '1',
          symbol: 'HDFCBANK',
          broker_instrument_id: 'NSE_EQ:1333',
          quantity: '-5',
          avg_price: '1650.5',
          currency: 'INR',
          last_price: '1640',
          unrealized_pnl: '52.5',
          realized_pnl: null,
          product: 'INTRADAY',
          source: 'broker',
        },
      ]),
    ]
  if (path.endsWith('/risk-policy')) return [404, { detail: 'no risk policy' }]
  if (path === '/api/trading/strategies')
    return [
      200,
      [
        {
          id: 'st',
          name: 'ema-9-21',
          description: null,
          is_active: true,
          created_at: NOW,
          versions: [
            {
              id: 'v1',
              version: 1,
              code_ref: 'ema_cross',
              params: { fast: 9, slow: 21 },
              created_at: NOW,
            },
          ],
        },
      ],
    ]
  if (path === '/api/trading/candles' || path === '/api/trading/indicators') return [200, []]
  if (path === '/api/trading/order-intents') return [200, PAGE([INTENT('PENDING_RISK')])]
  if (path === '/api/trading/executions')
    return [
      200,
      PAGE([
        FILL,
        { ...FILL, id: 'b1', is_simulated: false, source: 'broker', fees: '99.99', price: '7' },
      ]),
    ]
  if (path.endsWith('/paper/reconciliations'))
    return [
      200,
      PAGE([
        {
          id: 2,
          broker_account_id: ACCOUNT.id,
          ok: false,
          drift: [{}, {}],
          summary: {},
          created_at: NOW,
        },
        { id: 1, broker_account_id: ACCOUNT.id, ok: true, drift: [], summary: {}, created_at: NOW },
      ]),
    ]
  if (path.endsWith('/paper'))
    return [
      200,
      {
        account_id: ACCOUNT.id,
        mode: 'PAPER',
        currency: 'INR',
        starting_capital: '1000000',
        realized_pnl: '95.5',
        fees: '8.42',
        unrealized_pnl: '0',
        equity: '1000087.08',
        max_drawdown_pct: '0.001',
        positions: [],
        positions_as_of: NOW,
        reconciliation: { ok: true, drift: [], at: NOW },
        source: 'simulated',
      },
    ]
  return [200, PAGE([])]
}

class FakeES {
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {}
  addEventListener() {}
  close() {
    this.readyState = 2
  }
}

beforeEach(() => {
  signedIn = true
  calls.length = 0
  posts.length = 0
  ACCOUNT.mode = 'OBSERVE'
  vi.resetModules()
  vi.stubGlobal('EventSource', FakeES)
  vi.stubGlobal('fetch', async (req: Request) => {
    const url = new URL(req.url)
    calls.push(`${req.method} ${url.pathname}`)
    const [status, body] =
      req.method === 'POST' && !url.pathname.startsWith('/api/auth')
        ? post(url.pathname, JSON.parse((await req.text()) || '{}'))
        : route(url.pathname)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
  setActivePinia(createPinia())
})
afterEach(() => vi.unstubAllGlobals())

/** The sections are lazy chunks: let the dynamic imports and their fetches finish. */
async function settle() {
  for (let i = 0; i < 5; i++) await flushPromises()
}

/** Wait for text rather than for a number of ticks, so a loaded machine cannot flake it. */
async function sees(w: { text(): string }, text: string) {
  await vi.waitFor(() => expect(w.text()).toContain(text), { timeout: 8000, interval: 20 })
}

async function mountAt(path: string) {
  const TradingView = (await import('./TradingView.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/trading/:section?', component: TradingView },
      { path: '/', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  const wrapper = mount(TradingView, { global: { plugins: [router] } })
  await settle()
  return wrapper
}

describe('TradingView', () => {
  it('asks for an Aureon sign-in when there is no session', async () => {
    signedIn = false
    const w = await mountAt('/trading')
    await sees(w, 'Sign in to Aureon')
    expect(w.text()).not.toContain('Latest signals')
  })

  it('shows the mode badge and the overview once signed in', async () => {
    const w = await mountAt('/trading')
    await sees(w, 'Latest signals')
    await sees(w, 'The MT5 bot is not connected')
    expect(w.text()).toContain('DHAN Main: OBSERVE')
    expect(w.text()).toContain('BUY · instrument 42')
    expect(w.text()).toContain('The MT5 bot is not connected')
    expect(w.text()).toContain('Calculated')
    // Read-only: nothing but GETs were sent.
    expect(calls.every((c) => c.startsWith('GET '))).toBe(true)
  })

  const SECTIONS: [string, string][] = [
    ['dhan', 'Token valid'],
    ['mt5', 'not connected to Aureon'],
    ['market', 'Your watchlist is empty'],
    ['signals', 'Explain with AI'],
    ['strategies', 'ema-9-21'],
    ['orders', 'P&L on open positions'],
    ['paper', 'No account is in PAPER mode'],
    ['risk', 'No policy yet'],
    ['agents', 'Risk agent'],
  ]
  for (const [section, text] of SECTIONS) {
    it(`renders /trading/${section}`, async () => {
      const w = await mountAt(`/trading/${section}`)
      await sees(w, text)
    })
  }

  it('keeps Send to paper off without a PAPER account, and Approve live always off', async () => {
    const w = await mountAt('/trading/signals')
    await sees(w, 'Send to paper')
    const buttons = w.findAll('button').filter((b) => /Send to paper|Approve live/.test(b.text()))
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons.every((b) => b.attributes('disabled') !== undefined)).toBe(true)
    expect(posts).toEqual([])
  })

  it('sends a signal to paper, then an admin approves the simulated fill', async () => {
    ACCOUNT.mode = 'PAPER'
    const w = await mountAt('/trading/signals')
    await sees(w, 'Send to paper')
    const live = w.findAll('button').find((b) => b.text() === 'Approve live')
    expect(live?.attributes('disabled')).toBeDefined()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Send to paper')!
      .trigger('click')
    await sees(w, 'Paper BUY 1')
    await w.find('input[aria-label="Quantity"]').setValue('10')
    await w.find('form').trigger('submit')
    await sees(w, 'waiting for admin approval')
    expect(posts[0]).toEqual({
      path: '/api/trading/order-intents',
      body: {
        account_id: ACCOUNT.id,
        instrument_id: 42,
        side: 'BUY',
        order_type: 'MARKET',
        quantity: '10',
        signal_id: 's1',
        correlation_id: 'sig-s1-11111111',
      },
    })
    expect(w.text()).toContain('Risk: all checks passed')
    await w
      .findAll('button')
      .find((b) => b.text().includes('Approve paper fill'))!
      .trigger('click')
    await sees(w, 'Filled (simulated)')
    expect(w.text()).toContain('10 @ 1000.2 · fees 4.21 INR')
    expect(posts.map((p) => p.path)).toEqual([
      '/api/trading/order-intents',
      '/api/trading/order-intents/22222222-2222-4222-8222-222222222222/approve',
    ])
    // Nothing anywhere talks to a broker order endpoint, and LIVE was never requested.
    expect(posts.some((p) => JSON.stringify(p.body).includes('LIVE'))).toBe(false)
  })

  it('shows the paper book and lets an admin approve an intent there', async () => {
    ACCOUNT.mode = 'PAPER'
    const w = await mountAt('/trading/paper')
    await sees(w, 'Paper book')
    await sees(w, 'BUY 10 · instrument 42')
    expect(w.text()).toContain('1,000,087.08')
    expect(w.text()).toContain('Simulated')
    expect(w.text()).toContain('no drift')
    await w
      .findAll('button')
      .find((b) => b.text().includes('Approve paper fill'))!
      .trigger('click')
    await sees(w, 'Filled (simulated)')
    expect(posts.map((p) => p.path)).toEqual([
      '/api/trading/order-intents/22222222-2222-4222-8222-222222222222/approve',
    ])
  })

  it('shows the admin approval inbox with a count on the Paper tab', async () => {
    ACCOUNT.mode = 'PAPER'
    const w = await mountAt('/trading/paper')
    await sees(w, 'Approval inbox')
    await sees(w, 'Paper (1)')
    expect(w.text()).toContain('1 waiting')
    expect(w.text()).toContain('DHAN Main')
    expect(calls).toContain('GET /api/trading/order-intents')
    // Approve live exists only as a disabled control.
    const live = w.findAll('button').filter((b) => b.text() === 'Approve live')
    expect(live.length).toBeGreaterThan(0)
    expect(live.every((b) => b.attributes('disabled') !== undefined)).toBe(true)
  })

  it('lists simulated executions with charges and the reconciliation history', async () => {
    ACCOUNT.mode = 'PAPER'
    const w = await mountAt('/trading/paper')
    await sees(w, 'Simulated executions')
    await sees(w, '4.21 INR')
    // The broker fill is not part of the paper book.
    expect(w.text()).not.toContain('99.99')
    await sees(w, 'Drift in 2 item(s).')
    expect(w.text()).toContain('No drift: positions and the ledger agree.')
  })

  it('reloads the paper tab when the live stream reports a new risk decision', async () => {
    ACCOUNT.mode = 'PAPER'
    const w = await mountAt('/trading/paper')
    await sees(w, 'Paper book')
    const { live } = await import('@/trading/stream')
    const before = calls.filter((c) => c.endsWith('/paper')).length
    live.risks.unshift({
      id: 99,
      broker_account_id: ACCOUNT.id,
      signal_id: null,
      approved: true,
      reason: 'ok',
      created_at: NOW,
    })
    await vi.waitFor(
      () => expect(calls.filter((c) => c.endsWith('/paper')).length).toBeGreaterThan(before),
      { timeout: 4000, interval: 20 },
    )
  })

  it('lets an admin switch an account to PAPER, never to LIVE', async () => {
    const w = await mountAt('/trading/risk')
    await sees(w, 'Switch to PAPER')
    const liveBtn = w.findAll('button').find((b) => b.text() === 'Switch to LIVE')
    expect(liveBtn?.attributes('disabled')).toBeDefined()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Switch to PAPER')!
      .trigger('click')
    await sees(w, 'Now PAPER')
    expect(posts).toEqual([
      { path: `/api/trading/accounts/${ACCOUNT.id}/mode`, body: { mode: 'PAPER' } },
    ])
    await sees(w, 'DHAN Main: PAPER')
  })

  it('sums positions exactly and labels the source', async () => {
    const w = await mountAt('/trading/orders')
    await sees(w, '+52.5')
    expect(w.text()).toContain('Broker-reported')
  })
})
