// The trading panel: the Aureon sign-in gate, the always-visible mode badge,
// and every section mounting against a stubbed API (no network, no backend).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The first test pays for importing this whole view (and everything it pulls
// in). Alone that is about a second; under the full suite, with every file
// importing in parallel, it ran past the 5s default and failed the first test
// at random. The tests themselves are fast; only the cold import needs room.
vi.setConfig({ testTimeout: 20_000 })
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
// MT5 push mode: false = the bot never pushed (the page falls back to the pull view).
let mt5Pushed = false
const MT5_BOT_STATUS = () => ({
  state: mt5Pushed ? 'online' : 'stale',
  reasons: mt5Pushed ? [] : ['no push received yet'],
  last_heartbeat_at: mt5Pushed ? NOW : null,
  age_s: mt5Pushed ? 3 : null,
  stale_after_s: 90,
  push_id: mt5Pushed ? '33333333-3333-4333-8333-333333333333' : null,
  seq: mt5Pushed ? 12 : null,
  generated_at: mt5Pushed ? NOW : null,
  bot: mt5Pushed ? { version: '3.1.0', mode: 'ema5080' } : {},
  health: mt5Pushed ? { status: 'ok', mt5: { connected: true, terminal: 'CONNECTED' } } : {},
  halt: null,
  open_failures: mt5Pushed ? 1 : 0,
  server_time: NOW,
})
const MT5: Record<string, unknown> = {
  '/api/trading/mt5/market': {
    server_time: NOW,
    session: 'London',
    as_of: NOW,
    symbols: [
      {
        symbol: 'XAUUSD',
        open: true,
        session: 'London',
        bot_session: 'london',
        tick_age_s: '1.4',
        last_price: '2655.25',
        last_price_at: NOW,
        timeframe: 'M5',
        ema_periods: ['50', '80'],
        candles: [
          {
            t: NOW,
            o: '2650',
            h: '2656',
            l: '2649',
            c: '2655.25',
            v: null,
            ema: { '50': '2651', '80': '2650' },
          },
        ],
      },
    ],
  },
  '/api/trading/mt5/positions': {
    as_of: NOW,
    stale: false,
    items: [
      {
        symbol: 'XAUUSD',
        ticket: 101,
        direction: 'long',
        volume: '0.1',
        price_open: '2650.55',
        current: '2655.25',
        sl: '2648',
        tp: null,
        points: '4.7',
        opened_at: NOW,
        guardian: {
          phase: 'secured',
          leg_phase: 'B',
          profile: 'gold',
          secured_pts: '2',
          peak_pts: '5.6',
          bars: 7,
          frozen: false,
          sl: '2648',
          secured_level: '2652.5',
          peak: '2656.1',
          direction: 'long',
          entry: '2650.55',
          updated_at: NOW,
        },
      },
    ],
    guardian_orphans: {},
  },
  '/api/trading/mt5/signals': {
    items: [
      {
        id: 'e1',
        t: NOW,
        event: 'signal',
        kind: 'cross',
        symbol: 'XAUUSD',
        ticket: null,
        payload: { side: 'LONG' },
      },
      {
        id: 'e2',
        t: NOW,
        event: 'trail_update',
        kind: 'trail_update',
        symbol: 'XAUUSD',
        ticket: 101,
        payload: {},
      },
    ],
    total: 2,
    limit: 60,
    offset: 0,
    latest: { XAUUSD: { cross: { side: 'LONG' } } },
  },
  '/api/trading/mt5/failures': {
    open_count: 1,
    items: [
      {
        id: 1,
        kind: 'stale_ticks',
        symbol: 'XAGUSD',
        reason: 'market open but the last XAGUSD tick is 300 s old (limit 120 s)',
        first_seen: NOW,
        last_seen: NOW,
        count: 3,
        resolved_at: null,
        open: true,
      },
    ],
  },
  '/api/trading/mt5/strategy': {
    as_of: NOW,
    bot_version: '3.1.0',
    mode: 'ema5080',
    symbols: ['XAUUSD'],
    exec_tf: 'M5',
    timeframes: ['M5'],
    ema: { fast: 50, slow: 80 },
    params: { poll_seconds: 15, htf_align: false },
  },
  '/api/trading/mt5/report': {
    days: 7,
    performance: {
      source: 'calculated',
      exits_by_symbol: {
        XAUUSD: { exits: 2, wins: 1, losses: 1, net_points: '8.5', win_rate: '0.5' },
      },
      ema921e: null,
    },
    daily: [{ date: '2026-11-03', exits: 2, wins: 1, losses: 1, net_points: '8.5' }],
    ema921e_trades: [],
    backtests: [],
  },
}
const calls: string[] = []
const posts: { path: string; body: unknown }[] = []
// The stored risk policy (null = none yet) and what the next PUT answers.
let riskPolicy: Record<string, unknown> | null = null
let riskPutConflict = false
const puts: { path: string; body: Record<string, unknown> }[] = []
function put(path: string, body: Record<string, unknown>): [number, unknown] {
  puts.push({ path, body })
  if (riskPutConflict) {
    // Another admin saved meanwhile: the server refuses the stale form (Assembler V1.6.1).
    riskPolicy = { ...riskPolicy!, kill_switch: true, updated_at: '2026-11-08T10:00:00.000002Z' }
    return [
      409,
      { detail: { code: 'stale_policy', detail: 'the risk policy changed since it was read' } },
    ]
  }
  const { expected_updated_at: _seen, ...values } = body
  riskPolicy = { ...riskPolicy, ...values, updated_at: '2026-11-08T10:00:00.000001Z' }
  return [200, riskPolicy]
}

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
  // Phase 20: with the password and a one-approval policy it fills at once;
  // without, it files a trading.paper_intent request for the inbox (202).
  if (path.endsWith('/approve'))
    return (body as { password?: string }).password
      ? [200, INTENT('FILLED', { executions: [FILL] })]
      : [
          202,
          {
            approval_id: 'ap-paper',
            status: 'pending',
            kind: 'trading.paper_intent',
            target: 'intent',
            artifact_sha256: 'aa',
            expires_at: NOW,
            required_approvals: 1,
            received_approvals: 0,
          },
        ]
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
  if (path === '/api/trading/mt5/bot-status') return [200, MT5_BOT_STATUS()]
  if (path in MT5) return [200, MT5[path]]
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
  if (path.endsWith('/risk-policy'))
    return riskPolicy ? [200, riskPolicy] : [404, { detail: 'no risk policy' }]
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
  mt5Pushed = false
  calls.length = 0
  posts.length = 0
  puts.length = 0
  riskPolicy = null
  riskPutConflict = false
  ACCOUNT.mode = 'OBSERVE'
  vi.resetModules()
  vi.stubGlobal('EventSource', FakeES)
  vi.stubGlobal('fetch', async (req: Request) => {
    const url = new URL(req.url)
    calls.push(`${req.method} ${url.pathname}`)
    const [status, body] =
      req.method === 'POST' && !url.pathname.startsWith('/api/auth')
        ? post(url.pathname, JSON.parse((await req.text()) || '{}'))
        : req.method === 'PUT'
          ? put(url.pathname, JSON.parse((await req.text()) || '{}'))
          : route(url.pathname)
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

/** The sections are lazy chunks: let the dynamic imports and their fetches finish. */
async function settle() {
  for (let i = 0; i < 5; i++) await flushPromises()
}

/** The approve dialog is a teleported Modal: fill the password and submit. */
async function approveWithPassword(
  w: { findAll(s: string): { text(): string; trigger(e: string): Promise<void> }[] },
  password = 'hunter2',
) {
  await w
    .findAll('button')
    .find((b) => b.text().includes('Approve paper fill'))!
    .trigger('click')
  await settle()
  const pw = document.body.querySelector('input[aria-label="Password"]') as HTMLInputElement
  pw.value = password
  pw.dispatchEvent(new Event('input'))
  await settle()
  ;[...document.body.querySelectorAll('button')]
    .find((b) => b.textContent?.trim() === 'Approve and fill')!
    .click()
  await settle()
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
  const wrapper = mount(TradingView, { global: { plugins: [router] }, attachTo: document.body })
  mounted.push(wrapper)
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
    ['origins', 'No trades in this period.'],
    // The chart moved from /trading/market (now the Market Explorer) to /trading/charts.
    ['charts', 'Your watchlist is empty'],
    ['market', 'Market Explorer'],
    ['screener', 'Stock Screener'],
    ['options', 'Futures & Options'],
    ['watchlists', 'Watchlists'],
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

  it('shows the MT5 push dashboard once the bot has pushed (read-only)', async () => {
    mt5Pushed = true
    const w = await mountAt('/trading/mt5')
    await sees(w, 'ONLINE')
    await sees(w, 'Guardian: secured')
    await sees(w, 'Why: market open but the last XAGUSD tick')
    await sees(w, 'Trail update')
    await sees(w, 'EMA 50')
    expect(w.text()).toContain('ema5080')
    expect(w.text()).not.toContain('not connected to Aureon')
    expect(calls.every((c) => c.startsWith('GET '))).toBe(true)
  }, 20_000)

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
    await approveWithPassword(w)
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
    await approveWithPassword(w)
    await sees(w, 'Filled (simulated)')
    expect(posts).toEqual([
      {
        path: '/api/trading/order-intents/22222222-2222-4222-8222-222222222222/approve',
        body: { password: 'hunter2' },
      },
    ])
  })

  it('files a paper approval for the inbox without a password, and links there', async () => {
    ACCOUNT.mode = 'PAPER'
    const w = await mountAt('/trading/paper')
    await sees(w, 'Paper book')
    await w
      .findAll('button')
      .find((b) => b.text().includes('Approve paper fill'))!
      .trigger('click')
    await settle()
    ;[...document.body.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Send to the inbox')!
      .click()
    await sees(w, 'Waiting in the approval inbox (0 of 1 approvals).')
    expect(w.text()).toContain('Open in the approval inbox')
    expect(posts).toEqual([
      { path: '/api/trading/order-intents/22222222-2222-4222-8222-222222222222/approve', body: {} },
    ])
  })

  it('shows the admin approval inbox with a count on the Paper tab', async () => {
    ACCOUNT.mode = 'PAPER'
    const w = await mountAt('/trading/paper')
    await sees(w, 'Approval inbox')
    // The count is a badge on the Paper entry of the section nav.
    const paper = w.findAll('.tnav__item').find((b) => b.text().startsWith('Paper'))
    expect(paper?.find('.tnav__badge').text()).toBe('1')
    expect(paper?.find('.tnav__badge').attributes('aria-label')).toBe('1 waiting')
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

  const POLICY = {
    id: 'rp',
    broker_account_id: ACCOUNT.id,
    max_daily_loss: '5000',
    max_exposure: '200000',
    max_position_size: '1',
    max_drawdown_pct: '10',
    allowed_sessions: ['Asia', 'London', 'NY'],
    kill_switch: true,
    updated_at: '2026-11-08T09:00:00.123456Z',
  }
  it('saves the risk policy with the version it was loaded from', async () => {
    riskPolicy = { ...POLICY }
    const w = await mountAt('/trading/risk')
    await sees(w, 'ON — all rejected')
    await w.find('form.rk__form').trigger('submit')
    await sees(w, 'Saved. The change is audited on the server.')
    expect(puts).toHaveLength(1)
    expect(puts[0].body).toMatchObject({
      kill_switch: true,
      expected_updated_at: '2026-11-08T09:00:00.123456Z',
    })
  })

  it('sends no version for a first policy', async () => {
    const w = await mountAt('/trading/risk')
    await sees(w, 'No policy yet')
    for (const [label, value] of [
      ['5000', '5000'],
      ['200000', '200000'],
      ['1', '1'],
      ['10', '10'],
    ]) {
      const input = w.find(`input[placeholder="${label}"]`)
      await input.setValue(value)
    }
    await w.find('form.rk__form').trigger('submit')
    await sees(w, 'Saved.')
    expect(puts[0].body.expected_updated_at).toBeNull()
  })

  it('reloads instead of overwriting when the policy changed meanwhile (409)', async () => {
    riskPolicy = { ...POLICY, kill_switch: false }
    const w = await mountAt('/trading/risk')
    await sees(w, 'Kill switch')
    riskPutConflict = true
    await w.find('form.rk__form').trigger('submit')
    await sees(w, 'The risk policy changed since you opened it')
    expect(puts).toHaveLength(1) // never retried with the stale values
    await sees(w, 'ON — all rejected') // the other admin's kill switch is shown
  })

  it('sums positions exactly and labels the source', async () => {
    const w = await mountAt('/trading/orders')
    await sees(w, '+52.5')
    expect(w.text()).toContain('Broker-reported')
  })
})
