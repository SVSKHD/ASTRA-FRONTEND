// The AI Cost Center's data: the server's versioned pricing catalog, actual usage, and
// the budget — plus the estimator, which is arithmetic on the catalog and nothing else.
//
// Backend docs/26-ai-cost-center.md:
//   GET  /api/v1/ai/pricing[?version=]   versioned catalog (OpenRouter prices per million
//                                         tokens; local Ollama models at 0)
//   GET  /api/v1/ai/pricing/versions     the stored versions, newest first
//   POST /api/v1/ai/pricing/refresh      admin: fetch OpenRouter's prices now
//   GET  /api/v1/ai/usage/history?days=  admin: ACTUAL usage, from what OpenRouter reported
//                                         as billed for each reply
//   GET  /api/v1/ai/budget               daily cap (enforced) and monthly budget
//
// Backend docs/26-ai-providers.md adds per-provider usage:
//   GET  /api/ai/usage?provider=         today's spend of one external provider against its
//                                         cap, and the total against the shared cap
//   GET  /api/v1/ai/usage?days=          admin: calls per agent and provider (failures,
//                                         fallbacks, local-only, tokens, cost, latency) and
//                                         today's spend, reservations and cap per provider
//
// These are newer than the generated client, so they go through it untyped
// (modules/request.ts: same cookies, CSRF and 401 handling). A server without them
// answers 404, and the page says the Cost Center is not on that server yet rather than
// inventing numbers. Money stays as decimal strings until it is drawn.

import { callView } from '@/modules/request'

export interface PriceModel {
  provider: 'openrouter' | 'ollama' | 'anthropic' | 'gemini'
  model: string
  label: string
  vendor: string
  input_per_mtok: string | null
  output_per_mtok: string | null
  context_length: number | null
  local: boolean
}
export interface PricingCatalog {
  version: string | null
  fetched_at: string | null
  source: string
  currency: string
  stale: boolean
  models: PriceModel[]
}
export interface PricingVersion {
  version: string
  fetched_at: string
  source: string
  models_count: number
}
export interface UsageTotals {
  calls: number
  prompt_tokens: number
  completion_tokens: number
  cost_usd: string
}
export interface UsageDay extends UsageTotals {
  day: string
  provider: string
  model: string
}
export interface UsageHistory {
  from: string
  to: string
  currency: string
  days: UsageDay[]
  by_provider: (UsageTotals & { provider: string })[]
  by_model: (UsageTotals & { provider: string; model: string })[]
  by_agent: (UsageTotals & { agent: string })[]
  today: UsageTotals
  month: UsageTotals & { month: string }
}
export interface AiBudget {
  currency: string
  daily_limit_usd: string
  monthly_limit_usd: string
  today_spent_usd: string
  month_spent_usd: string
  daily_remaining_usd: string
  monthly_remaining_usd: string | null
  daily_cap_reached: boolean
  monthly_cap_reached: boolean
  available: boolean
}

/** One agent × provider row of GET /api/v1/ai/usage (money as decimal strings). */
export interface AgentUsage {
  agent: string
  provider: string
  calls: number
  failures: number
  fallbacks: number
  local_only: number
  prompt_tokens: number
  completion_tokens: number
  cost_usd: string
  avg_latency_ms: number
}
/** Today's spend of one external provider; null = its counter could not be read. */
export interface ProviderSpend {
  provider: string
  daily_limit_usd: string
  spent_today_usd: string | null
  reserved_usd: string | null
  calls_today: number | null
  failures_today: number | null
}
export interface ProviderUsage {
  since: string
  /** OpenRouter's cap and spend, as before docs/26. */
  daily_limit_usd: string
  spent_today_usd: string | null
  items: AgentUsage[]
  /** Absent on a server from before docs/26. */
  providers?: ProviderSpend[]
  global_limit_usd?: string | null
  global_spent_today_usd?: string | null
}
/** GET /api/ai/usage?provider= (any signed-in user). */
export interface TodayUsage {
  day: string
  provider: string
  spent_usd: string
  limit_usd: string
  remaining_usd: string
  prompt_tokens: number
  completion_tokens: number
  calls: number
  failures: number
  cap_reached: boolean
  available: boolean
  global_limit_usd?: string | null
  global_spent_usd?: string | null
}

/** A read that may not exist on this server yet. */
export type Maybe<T> =
  { ok: true; data: T } | { ok: false; missing: boolean; error: string; status: number }

async function read<T>(path: string, query?: Record<string, unknown>): Promise<Maybe<T>> {
  const r = await callView({ method: 'GET', path }, { query })
  if (r.ok) return { ok: true, data: r.data as T }
  return { ok: false, missing: r.status === 404, error: r.error, status: r.status }
}

export const costApi = {
  pricing: (version?: string) =>
    read<PricingCatalog>('/api/v1/ai/pricing', version ? { version } : undefined),
  versions: () => read<PricingVersion[]>('/api/v1/ai/pricing/versions'),
  history: (days: number) => read<UsageHistory>('/api/v1/ai/usage/history', { days }),
  budget: () => read<AiBudget>('/api/v1/ai/budget'),
  /** Admin: per agent and provider over the last `days` (1–90). */
  providerUsage: (days: number) =>
    read<ProviderUsage>('/api/v1/ai/usage', { days: Math.min(90, Math.max(1, days)) }),
  /** Today's spend of one external provider. OpenRouter sends no query, as before. */
  today: (provider: 'openrouter' | 'anthropic' | 'gemini') =>
    read<TodayUsage>('/api/ai/usage', provider === 'openrouter' ? undefined : { provider }),
  async refreshPricing(): Promise<Maybe<PricingCatalog>> {
    const r = await callView({ method: 'POST', path: '/api/v1/ai/pricing/refresh' })
    return r.ok
      ? { ok: true, data: r.data as PricingCatalog }
      : { ok: false, missing: r.status === 404, error: r.error, status: r.status }
  },
  /** Change a budget setting through the settings API (applied without a restart). */
  async setSetting(key: 'OPENROUTER_DAILY_LIMIT_USD' | 'AI_MONTHLY_BUDGET_USD', value: string) {
    const r = await callView(
      { method: 'PUT', path: '/api/v1/settings/{key}' },
      { params: { key }, body: { value } },
    )
    // A setting that needs the admin's password is changed on /settings, which asks for it.
    return { ok: r.ok, error: r.error, needsPassword: !r.ok && /re-?auth|password/i.test(r.error) }
  },
}

// ---- numbers ------------------------------------------------------------------------------

export const num = (v: string | number | null | undefined): number => {
  const n = typeof v === 'number' ? v : Number(v ?? NaN)
  return Number.isFinite(n) ? n : 0
}

export function usd(v: string | number | null | undefined): string {
  const n = num(v)
  if (n === 0) return '$0'
  if (n < 0.01) return `$${n.toFixed(4)}`
  if (n < 100) return `$${n.toFixed(2)}`
  return `$${Math.round(n).toLocaleString('en-US')}`
}

/** Per-million price as shown: "$3.00", "free (local)", "—" when unknown. */
export function perM(m: PriceModel, side: 'input' | 'output'): string {
  if (m.local) return 'free (local)'
  const v = side === 'input' ? m.input_per_mtok : m.output_per_mtok
  return v == null ? '—' : usd(v)
}

export interface EstimateInput {
  jobsPerMonth: number
  callsPerJob: number
  inputTokens: number
  outputTokens: number
}

/** Monthly cost of a workload on one model, from catalog prices. null when unpriced. */
export function estimateMonthly(m: PriceModel, w: EstimateInput): number | null {
  if (m.local) return 0
  if (m.input_per_mtok == null || m.output_per_mtok == null) return null
  const calls = Math.max(0, w.jobsPerMonth) * Math.max(0, w.callsPerJob)
  const perCall =
    (Math.max(0, w.inputTokens) * num(m.input_per_mtok) +
      Math.max(0, w.outputTokens) * num(m.output_per_mtok)) /
    1_000_000
  return calls * perCall
}

/** Every catalog model's estimate, cheapest first; unpriced models last. */
export function compare(models: PriceModel[], w: EstimateInput) {
  return models
    .map((m) => ({ model: m, monthly: estimateMonthly(m, w) }))
    .sort((a, b) => (a.monthly ?? Infinity) - (b.monthly ?? Infinity))
}

/** The workload the last N days actually had, per call — to seed the estimator. */
export function observedWorkload(h: UsageHistory, days: number): EstimateInput | null {
  const calls = h.days.reduce((s, d) => s + d.calls, 0)
  if (!calls) return null
  const pin = h.days.reduce((s, d) => s + d.prompt_tokens, 0)
  const pout = h.days.reduce((s, d) => s + d.completion_tokens, 0)
  return {
    jobsPerMonth: Math.round((calls / Math.max(1, days)) * 30),
    callsPerJob: 1,
    inputTokens: Math.round(pin / calls),
    outputTokens: Math.round(pout / calls),
  }
}

/** Spend per day, summed over providers and models, oldest first, empty days as 0. */
export function dailySeries(h: UsageHistory): { day: string; cost: number; calls: number }[] {
  const by = new Map<string, { cost: number; calls: number }>()
  for (const d of h.days) {
    const cur = by.get(d.day) ?? { cost: 0, calls: 0 }
    cur.cost += num(d.cost_usd)
    cur.calls += d.calls
    by.set(d.day, cur)
  }
  const out: { day: string; cost: number; calls: number }[] = []
  const start = Date.parse(`${h.from}T00:00:00Z`)
  const end = Date.parse(`${h.to}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return out
  for (let t = start; t <= end; t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10)
    out.push({ day, ...(by.get(day) ?? { cost: 0, calls: 0 }) })
  }
  return out
}

/** What share of a limit is used (0..100), or null with no limit. */
export function usedPct(spent: string, limit: string): number | null {
  const l = num(limit)
  if (l <= 0) return null
  return Math.min(100, Math.round((num(spent) / l) * 100))
}

// ---- per provider (docs/26) -----------------------------------------------------------------

export interface ProviderRollup {
  provider: string
  calls: number
  succeeded: number
  failed: number
  fallbacks: number
  localOnly: number
  promptTokens: number
  completionTokens: number
  costUsd: number
  /** Weighted by calls; null when there were none. */
  avgLatencyMs: number | null
}

/**
 * The agent rows summed per provider, local first. Only what the server counted: a
 * provider with no calls in the window has no row.
 */
export function rollupByProvider(items: AgentUsage[]): ProviderRollup[] {
  const by = new Map<string, ProviderRollup & { latencySum: number }>()
  for (const i of items) {
    const r = by.get(i.provider) ?? {
      provider: i.provider,
      calls: 0,
      succeeded: 0,
      failed: 0,
      fallbacks: 0,
      localOnly: 0,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      avgLatencyMs: null,
      latencySum: 0,
    }
    r.calls += i.calls
    r.failed += i.failures
    r.succeeded = r.calls - r.failed
    r.fallbacks += i.fallbacks
    r.localOnly += i.local_only
    r.promptTokens += i.prompt_tokens
    r.completionTokens += i.completion_tokens
    r.costUsd += num(i.cost_usd)
    r.latencySum += i.avg_latency_ms * i.calls
    r.avgLatencyMs = r.calls ? Math.round(r.latencySum / r.calls) : null
    by.set(i.provider, r)
  }
  const order = ['ollama', 'openrouter', 'anthropic', 'gemini']
  const rank = (p: string) => (order.includes(p) ? order.indexOf(p) : order.length)
  return [...by.values()]
    .map(({ latencySum: _, ...r }) => r)
    .sort((a, b) => rank(a.provider) - rank(b.provider) || a.provider.localeCompare(b.provider))
}

/** "Local (Ollama)", "OpenRouter", "Claude (Anthropic)", "Gemini (Google)", else as sent. */
export function providerName(p: string): string {
  return (
    {
      ollama: 'Local (Ollama)',
      openrouter: 'OpenRouter',
      anthropic: 'Claude (Anthropic)',
      gemini: 'Gemini (Google)',
    }[p] ?? p
  )
}
