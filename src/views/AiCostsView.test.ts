// /ai/costs renders from the server's numbers: budget, billed usage (admins), and the
// estimator over the versioned catalog — or says the Cost Center is not on the server.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() }))
vi.mock('@/api/client', () => ({
  aureon: api,
  errorMessage: (_: unknown, f: string) => f,
  onUnauthorized: () => () => {},
}))

import AiCostsView from './AiCostsView.vue'
import { tradingSession } from '@/trading/session'

const res = (data: unknown, status = 200) => ({
  data: status < 400 ? data : undefined,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status, headers: new Headers() },
})
const BUDGET = {
  currency: 'USD',
  daily_limit_usd: '2.00',
  monthly_limit_usd: '20.00',
  today_spent_usd: '0.50',
  month_spent_usd: '4.00',
  daily_remaining_usd: '1.50',
  monthly_remaining_usd: '16.00',
  daily_cap_reached: false,
  monthly_cap_reached: false,
  available: true,
}
const CATALOG = {
  version: 'or-20261104-abcd1234',
  fetched_at: '2026-11-04T04:41:00Z',
  source: 'openrouter',
  currency: 'USD',
  stale: false,
  models: [
    {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet',
      label: 'Claude Sonnet',
      vendor: 'anthropic',
      input_per_mtok: '3.00',
      output_per_mtok: '15.00',
      context_length: 200000,
      local: false,
    },
    {
      provider: 'ollama',
      model: 'qwen2.5:3b',
      label: 'qwen2.5:3b',
      vendor: 'local',
      input_per_mtok: '0',
      output_per_mtok: '0',
      context_length: null,
      local: true,
    },
  ],
}
const HISTORY = {
  from: '2026-11-01',
  to: '2026-11-02',
  currency: 'USD',
  days: [
    {
      day: '2026-11-01',
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet',
      calls: 3,
      prompt_tokens: 3000,
      completion_tokens: 600,
      cost_usd: '0.018',
    },
  ],
  by_provider: [
    {
      provider: 'openrouter',
      calls: 3,
      prompt_tokens: 3000,
      completion_tokens: 600,
      cost_usd: '0.018',
    },
  ],
  by_model: [
    {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet',
      calls: 3,
      prompt_tokens: 3000,
      completion_tokens: 600,
      cost_usd: '0.018',
    },
  ],
  by_agent: [
    {
      agent: 'chat:general',
      calls: 3,
      prompt_tokens: 3000,
      completion_tokens: 600,
      cost_usd: '0.018',
    },
  ],
  today: { calls: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: '0' },
  month: {
    month: '2026-11',
    calls: 3,
    prompt_tokens: 3000,
    completion_tokens: 600,
    cost_usd: '0.018',
  },
}

function serve(map: Record<string, unknown>) {
  api.GET.mockImplementation(async (path: string) =>
    path in map ? res(map[path]) : res({ detail: 'Not Found' }, 404),
  )
}
async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/ai/costs', component: AiCostsView },
      { path: '/settings', component: { template: '<div />' } },
    ],
  })
  await router.push('/ai/costs')
  const w = mount(AiCostsView, { global: { plugins: [router] } })
  await flushPromises()
  return w
}

describe('<AiCostsView />', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
    Object.assign(tradingSession, {
      checked: true,
      user: { uid: 'u1', name: 'o', email: 'o@x', provider: 'aureon', initial: 'O', color: '#000' },
      role: 'admin',
      error: '',
    })
  })

  it('says the Cost Center is not on the server when its endpoints are missing', async () => {
    serve({})
    const w = await mountView()
    expect(w.text()).toContain('The Cost Center is not on this server yet')
    expect(w.find('[data-testid="budget"]').exists()).toBe(false)
  })

  it('shows budget, billed usage and the catalog estimate, labelled apart', async () => {
    serve({
      '/api/v1/ai/budget': BUDGET,
      '/api/v1/ai/pricing': CATALOG,
      '/api/v1/ai/pricing/versions': [
        {
          version: CATALOG.version,
          fetched_at: CATALOG.fetched_at,
          source: 'openrouter',
          models_count: 2,
        },
      ],
      '/api/v1/ai/usage/history': HISTORY,
    })
    const w = await mountView()
    expect(api.GET).toHaveBeenCalledWith('/api/v1/ai/usage/history', {
      params: { query: { days: 30 } },
    })
    expect(w.get('[data-testid="budget"]').text()).toContain('$0.50 of $2.00')
    expect(w.get('[data-testid="budget"]').text()).toContain('$4.00 of $20.00')
    expect(w.text()).toContain('billed, as OpenRouter reported it')
    expect(w.text()).toContain('Chat (general)')
    expect(w.get('[data-testid="pricing-version"]').text()).toContain('or-20261104-abcd1234')
    const table = () => w.get('[data-testid="pricing-table"]').text()
    // 300 × 3 calls × (2000 × 3 + 500 × 15) / 1e6 = $12.15; local is free.
    expect(table()).toContain('$12.15')
    expect(table()).toContain('free (local)')
    await w.get('[data-testid="est-jobs"] input').setValue('600')
    expect(table()).toContain('$24.30')
    await w.get('[data-testid="est-observed"]').trigger('click')
    // Observed: 3 calls over 30 days → 3 jobs, 1000 in / 200 out per call.
    expect((w.get('[data-testid="est-in"] input').element as HTMLInputElement).value).toBe('1000')
  })

  it('keeps server-wide history from non-admins', async () => {
    tradingSession.role = 'user'
    serve({
      '/api/v1/ai/budget': BUDGET,
      '/api/v1/ai/pricing': CATALOG,
      '/api/v1/ai/pricing/versions': [],
    })
    const w = await mountView()
    expect(api.GET).not.toHaveBeenCalledWith('/api/v1/ai/usage/history', expect.anything())
    expect(w.text()).toContain('only admins see it')
    expect(w.find('[data-testid="budget-daily"]').exists()).toBe(false)
  })

  it('shows spend per provider today, the shared cap, and the admin window', async () => {
    const today = (provider: string, over: Record<string, unknown> = {}) => ({
      day: '2026-11-05',
      provider,
      spent_usd: '0.10',
      limit_usd: '1.00',
      remaining_usd: '0.90',
      prompt_tokens: 100,
      completion_tokens: 20,
      calls: 2,
      failures: 0,
      cap_reached: false,
      available: true,
      global_limit_usd: '3.00',
      global_spent_usd: '0.35',
      ...over,
    })
    const TODAY: Record<string, unknown> = {
      openrouter: today('openrouter'),
      anthropic: today('anthropic', { spent_usd: '0.25', calls: 3, failures: 1 }),
      gemini: today('gemini', { available: false, limit_usd: '0' }),
    }
    const WINDOW = {
      since: '2026-10-29T00:00:00Z',
      daily_limit_usd: '1.00',
      spent_today_usd: '0.10',
      items: [
        {
          agent: 'chat:general',
          provider: 'anthropic',
          calls: 4,
          failures: 1,
          fallbacks: 1,
          local_only: 0,
          prompt_tokens: 4000,
          completion_tokens: 800,
          cost_usd: '0.024',
          avg_latency_ms: 1000,
        },
        {
          agent: 'news',
          provider: 'anthropic',
          calls: 1,
          failures: 0,
          fallbacks: 0,
          local_only: 0,
          prompt_tokens: 500,
          completion_tokens: 100,
          cost_usd: '0.003',
          avg_latency_ms: 2000,
        },
        {
          agent: 'chat:general',
          provider: 'ollama',
          calls: 6,
          failures: 0,
          fallbacks: 0,
          local_only: 2,
          prompt_tokens: 600,
          completion_tokens: 60,
          cost_usd: '0',
          avg_latency_ms: 500,
        },
      ],
      providers: [
        {
          provider: 'anthropic',
          daily_limit_usd: '1.00',
          spent_today_usd: '0.25',
          reserved_usd: '0.05',
          calls_today: 3,
          failures_today: 1,
        },
      ],
      global_limit_usd: '3.00',
      global_spent_today_usd: '0.35',
    }
    api.GET.mockImplementation(
      async (path: string, init?: { params?: { query?: Record<string, unknown> } }) => {
        const q = init?.params?.query ?? {}
        if (path === '/api/ai/usage') return res(TODAY[String(q.provider ?? 'openrouter')])
        if (path === '/api/v1/ai/usage') return res(WINDOW)
        if (path === '/api/v1/ai/budget') return res(BUDGET)
        return res({ detail: 'Not Found' }, 404)
      },
    )
    const w = await mountView()
    expect(api.GET).toHaveBeenCalledWith('/api/ai/usage', {
      params: { query: { provider: 'anthropic' } },
    })
    expect(api.GET).toHaveBeenCalledWith('/api/v1/ai/usage', { params: { query: { days: 30 } } })
    const panel = w.get('[data-testid="provider-usage"]')
    expect(panel.get('[data-testid="global-cap"]').text()).toContain(
      '$0.35 of the shared $3.00 cap',
    )
    const claude = panel.get('li[data-provider="anthropic"]').text()
    expect(claude).toContain('$0.25 of $1.00')
    expect(claude).toContain('reserved $0.05')
    expect(claude).toContain('3 calls · 1 failed')
    // An unreadable counter is not shown as $0.
    const gem = panel.get('li[data-provider="gemini"]').text()
    expect(gem).toContain('unavailable of no budget — stays local')
    const row = (p: string) =>
      panel.get(`[data-testid="provider-window"] tr[data-provider="${p}"]`).text()
    // 5 calls, 1 failed, 1 fell back; latency weighted by calls: (4×1000 + 2000) / 5.
    expect(row('anthropic')).toMatch(/Claude \(Anthropic\)\s*4\s*1\s*1\s*0/)
    expect(row('anthropic')).toContain('4,500 / 900')
    expect(row('anthropic')).toContain('1.2 s')
    expect(row('ollama')).toMatch(/Local \(Ollama\)\s*6\s*0\s*0\s*2/)
  })

  it('reads an older server: OpenRouter only, no provider list', async () => {
    tradingSession.role = 'user'
    api.GET.mockImplementation(
      async (path: string, init?: { params?: { query?: Record<string, unknown> } }) => {
        if (path === '/api/ai/usage' && !init?.params?.query) {
          return res({
            day: '2026-11-05',
            provider: 'openrouter',
            spent_usd: '0.10',
            limit_usd: '1.00',
            remaining_usd: '0.90',
            prompt_tokens: 1,
            completion_tokens: 1,
            calls: 1,
            failures: 0,
            cap_reached: false,
            available: true,
          })
        }
        if (path === '/api/v1/ai/budget') return res(BUDGET)
        return res({ detail: [{ msg: 'unknown query' }] }, 422)
      },
    )
    const w = await mountView()
    const panel = w.get('[data-testid="provider-usage"]')
    expect(panel.findAll('li[data-provider]').map((l) => l.attributes('data-provider'))).toEqual([
      'openrouter',
    ])
    expect(panel.text()).toContain('no shared cap')
    expect(panel.find('[data-testid="provider-window"]').exists()).toBe(false)
  })
})
