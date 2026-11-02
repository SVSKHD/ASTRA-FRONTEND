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
  vi.resetModules()
  vi.stubGlobal('EventSource', FakeES)
  vi.stubGlobal('fetch', async (req: Request) => {
    const url = new URL(req.url)
    calls.push(`${req.method} ${url.pathname}`)
    const [status, body] = route(url.pathname)
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
    ['risk', 'No policy yet'],
    ['agents', 'Risk agent'],
  ]
  for (const [section, text] of SECTIONS) {
    it(`renders /trading/${section}`, async () => {
      const w = await mountAt(`/trading/${section}`)
      await sees(w, text)
    })
  }

  it('keeps approval controls disabled', async () => {
    const w = await mountAt('/trading/signals')
    await sees(w, 'Send to paper')
    const buttons = w.findAll('button').filter((b) => /Send to paper|Approve live/.test(b.text()))
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons.every((b) => b.attributes('disabled') !== undefined)).toBe(true)
  })

  it('sums positions exactly and labels the source', async () => {
    const w = await mountAt('/trading/orders')
    await sees(w, '+52.5')
    expect(w.text()).toContain('Broker-reported')
  })
})
