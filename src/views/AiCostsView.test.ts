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
})
