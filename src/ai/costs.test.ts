// The Cost Center's arithmetic: estimates come only from catalog prices, the observed
// workload from billed history, and a missing endpoint is "not on this server", not zero.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() }))
vi.mock('@/api/client', () => ({
  aureon: api,
  errorMessage: (e: { detail?: unknown } | undefined, f: string) =>
    typeof e?.detail === 'string' ? e.detail : f,
}))

import {
  compare,
  costApi,
  dailySeries,
  estimateMonthly,
  observedWorkload,
  providerName,
  rollupByProvider,
  usedPct,
  usd,
  type PriceModel,
  type UsageHistory,
} from './costs'

const pm = (over: Partial<PriceModel>): PriceModel => ({
  provider: 'openrouter',
  model: 'anthropic/claude-sonnet',
  label: 'Claude Sonnet',
  vendor: 'anthropic',
  input_per_mtok: '3.00',
  output_per_mtok: '15.00',
  context_length: 200000,
  local: false,
  ...over,
})
const W = { jobsPerMonth: 300, callsPerJob: 3, inputTokens: 2000, outputTokens: 500 }

const res = (data: unknown, status = 200) => ({
  data: status < 400 ? data : undefined,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status, headers: new Headers() },
})

beforeEach(() => Object.values(api).forEach((f) => f.mockReset()))

describe('estimator', () => {
  it('multiplies calls by per-call cost from per-million prices', () => {
    // 900 calls × (2000 × 3 + 500 × 15) / 1e6 = 900 × 0.0135 = 12.15
    expect(estimateMonthly(pm({}), W)).toBeCloseTo(12.15, 6)
    expect(estimateMonthly(pm({ local: true, provider: 'ollama' }), W)).toBe(0)
    expect(estimateMonthly(pm({ input_per_mtok: null }), W)).toBeNull()
  })

  it('compares cheapest first, unpriced last', () => {
    const rows = compare(
      [
        pm({ model: 'a', input_per_mtok: null }),
        pm({ model: 'b' }),
        pm({ model: 'c', input_per_mtok: '0.10', output_per_mtok: '0.40' }),
        pm({ model: 'd', local: true }),
      ],
      W,
    )
    expect(rows.map((r) => r.model.model)).toEqual(['d', 'c', 'b', 'a'])
  })
})

const HISTORY: UsageHistory = {
  from: '2026-11-01',
  to: '2026-11-04',
  currency: 'USD',
  days: [
    {
      day: '2026-11-01',
      provider: 'openrouter',
      model: 'x',
      calls: 4,
      prompt_tokens: 4000,
      completion_tokens: 800,
      cost_usd: '0.020',
    },
    {
      day: '2026-11-01',
      provider: 'ollama',
      model: 'q',
      calls: 2,
      prompt_tokens: 2000,
      completion_tokens: 400,
      cost_usd: '0',
    },
    {
      day: '2026-11-03',
      provider: 'openrouter',
      model: 'x',
      calls: 6,
      prompt_tokens: 6000,
      completion_tokens: 1200,
      cost_usd: '0.030',
    },
  ],
  by_provider: [],
  by_model: [],
  by_agent: [],
  today: { calls: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: '0' },
  month: {
    month: '2026-11',
    calls: 12,
    prompt_tokens: 12000,
    completion_tokens: 2400,
    cost_usd: '0.05',
  },
}

describe('history', () => {
  it('fills every day of the range, summing providers', () => {
    expect(dailySeries(HISTORY)).toEqual([
      { day: '2026-11-01', cost: 0.02, calls: 6 },
      { day: '2026-11-02', cost: 0, calls: 0 },
      { day: '2026-11-03', cost: 0.03, calls: 6 },
      { day: '2026-11-04', cost: 0, calls: 0 },
    ])
  })

  it('seeds the estimator with the observed per-call workload', () => {
    expect(observedWorkload(HISTORY, 4)).toEqual({
      jobsPerMonth: 90,
      callsPerJob: 1,
      inputTokens: 1000,
      outputTokens: 200,
    })
    expect(observedWorkload({ ...HISTORY, days: [] }, 30)).toBeNull()
  })

  it('formats money and limits', () => {
    expect(usd('0.0041')).toBe('$0.0041')
    expect(usd('12.153')).toBe('$12.15')
    expect(usd(0)).toBe('$0')
    expect(usedPct('0.25', '1.00')).toBe(25)
    expect(usedPct('5', '0')).toBeNull()
  })
})

describe('costApi', () => {
  it('reports a server without the Cost Center as missing, not as zero', async () => {
    api.GET.mockResolvedValue(res({ detail: 'Not Found' }, 404))
    const r = await costApi.budget()
    expect(r).toMatchObject({ ok: false, missing: true, status: 404 })
  })

  it('asks for a version and a range, and writes budgets through the settings API', async () => {
    api.GET.mockResolvedValue(res({ version: 'or-20261104-abcd1234', models: [] }))
    await costApi.pricing('or-20261101-00000000')
    expect(api.GET).toHaveBeenCalledWith('/api/v1/ai/pricing', {
      params: { query: { version: 'or-20261101-00000000' } },
    })
    await costApi.history(7)
    expect(api.GET).toHaveBeenLastCalledWith('/api/v1/ai/usage/history', {
      params: { query: { days: 7 } },
    })
    api.PUT.mockResolvedValue(res({ key: 'AI_MONTHLY_BUDGET_USD' }))
    const ok = await costApi.setSetting('AI_MONTHLY_BUDGET_USD', '20')
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/settings/AI_MONTHLY_BUDGET_USD', {
      body: { value: '20' },
    })
    expect(ok.ok).toBe(true)
    api.PUT.mockResolvedValue(res({ detail: 'reauth required: enter your password' }, 403))
    expect((await costApi.setSetting('OPENROUTER_DAILY_LIMIT_USD', '5')).needsPassword).toBe(true)
  })
})

describe('rollupByProvider', () => {
  const item = (provider: string, over: Record<string, unknown> = {}) => ({
    agent: 'chat:general',
    provider,
    calls: 2,
    failures: 0,
    fallbacks: 0,
    local_only: 0,
    prompt_tokens: 10,
    completion_tokens: 5,
    cost_usd: '0.001',
    avg_latency_ms: 100,
    ...over,
  })
  it('sums agent rows per provider, local first, latency weighted by calls', () => {
    const r = rollupByProvider([
      item('gemini', { calls: 1, avg_latency_ms: 400, failures: 1 }),
      item('ollama', { local_only: 2, cost_usd: '0' }),
      item('gemini', { calls: 3, avg_latency_ms: 200, fallbacks: 2 }),
    ])
    expect(r.map((x) => x.provider)).toEqual(['ollama', 'gemini'])
    expect(r[1]).toMatchObject({
      calls: 4,
      succeeded: 3,
      failed: 1,
      fallbacks: 2,
      promptTokens: 20,
      avgLatencyMs: 250,
    })
    expect(r[1].costUsd).toBeCloseTo(0.002)
    expect(r[0].localOnly).toBe(2)
    expect(rollupByProvider([])).toEqual([])
  })
  it('names the four providers', () => {
    expect(['ollama', 'openrouter', 'anthropic', 'gemini', 'x'].map(providerName)).toEqual([
      'Local (Ollama)',
      'OpenRouter',
      'Claude (Anthropic)',
      'Gemini (Google)',
      'x',
    ])
  })
})
