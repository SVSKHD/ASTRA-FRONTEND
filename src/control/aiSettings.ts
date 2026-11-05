// The AI provider settings (backend docs/26-ai-providers.md): which editor each
// key gets, the values the backend accepts, and the model price table. Pure, so
// every rule is tested without a server.
//
// Nothing here holds a stored value. The server masks every value it returns
// (`••••` plus the last four characters), so a form starts empty and a write
// replaces the value whole. That is why the price table is entered in full:
// the current prices cannot be read back, only whether each model is priced
// (the catalog marks an unpriced model `no_pricing`).

import type { AiProvider, ModelCatalog } from '@/ai/aureonChat'
import type { SettingRow } from '@/control/settings'

export type Editor = 'switch' | 'select' | 'prices' | 'text'

/** Values the backend accepts for the provider choices (docs/26 "Settings"). */
export const DEFAULT_EXTERNAL_CHOICES = ['openrouter', 'anthropic', 'gemini'] as const
export const AGENT_PROVIDER_CHOICES = [
  'auto',
  'ollama',
  'openrouter',
  'anthropic',
  'gemini',
] as const

/** The three agents whose provider is set per agent. */
export const PROVIDER_AGENTS = ['NEWS', 'VOICE', 'RESEARCH'] as const
export type ProviderAgent = (typeof PROVIDER_AGENTS)[number]

const CHOICE_LABEL: Record<string, string> = {
  auto: 'Auto — the default external provider when allowed, else local',
  ollama: 'Local — Ollama only',
  openrouter: 'OpenRouter',
  anthropic: 'Claude — direct Anthropic API',
  gemini: 'Gemini — direct Google API',
}

/** Settings categories that belong to one provider, and the provider. */
export const CATEGORY_PROVIDER: Record<string, AiProvider> = {
  openrouter: 'openrouter',
  anthropic: 'anthropic',
  gemini: 'gemini',
}

const PROVIDER_KEY = /^AGENT_(NEWS|VOICE|RESEARCH)_PROVIDER$/

/** The choices a select offers for this key, or null when it is not a select. */
export function choicesFor(key: string): { value: string; label: string }[] | null {
  const values =
    key === 'AI_DEFAULT_EXTERNAL_PROVIDER'
      ? DEFAULT_EXTERNAL_CHOICES
      : PROVIDER_KEY.test(key)
        ? AGENT_PROVIDER_CHOICES
        : null
  return values ? values.map((v) => ({ value: v, label: CHOICE_LABEL[v] ?? v })) : null
}

/** How a setting is edited. Unknown kinds stay a text field, as before. */
export function editorFor(row: Pick<SettingRow, 'key' | 'kind' | 'managed'>): Editor {
  if (row.kind === 'bool') return 'switch'
  if (row.kind === 'json_object' && row.key.endsWith('_MODEL_PRICES')) return 'prices'
  if (choicesFor(row.key)) return 'select'
  return 'text'
}

/** Extra words for one key, where the description alone would mislead. */
export function keyNote(key: string): string {
  if (key.endsWith('_MODEL_PRICES')) {
    return 'USD per million tokens. A model without a price is never used: its turns stay local. Saving replaces every price, so enter all of them. Copy current prices from the provider’s pricing page.'
  }
  if (key.endsWith('_API_KEY') && /^(ANTHROPIC|GEMINI|OPENROUTER)_/.test(key)) {
    return 'Stored encrypted on the server and never sent back. Use an API key from the provider’s console, not a subscription login.'
  }
  if (key === 'AI_EXTERNAL_DAILY_LIMIT_USD') {
    return 'Caps today’s total across every external provider. Leave it unset to rely on each provider’s own cap.'
  }
  if (key === 'AI_EXTERNAL_REQUESTS_PER_MINUTE') return '0 means no limit on this server.'
  if (key === 'AGENT_VOICE_PROVIDER') {
    return 'Only the text model is chosen here. Speech recognition and speech synthesis always run locally.'
  }
  if (key === 'AGENT_RESEARCH_PROVIDER') {
    return 'Trading text stays local unless AI_RESEARCH_EXTERNAL_ALLOWED is on. Research explanations from the worker go through OpenRouter only.'
  }
  if (key === 'AGENT_NEWS_PROVIDER')
    return 'Only public market news is sent to an external provider.'
  return ''
}

// --- the price table ----------------------------------------------------------------------

export interface PriceRow {
  model: string
  /** USD per million input tokens, as typed. */
  input: string
  /** USD per million output tokens, as typed. */
  output: string
}

const DECIMAL = /^\d+(\.\d+)?$/

/** A decimal the backend accepts: a finite number >= 0. */
export function isUsd(v: string): boolean {
  return DECIMAL.test(v.trim())
}

/** Why the table cannot be saved, or null when it can. */
export function priceError(rows: PriceRow[]): string | null {
  const used = rows.filter((r) => r.model.trim() || r.input.trim() || r.output.trim())
  if (!used.length) return 'Add at least one model with its prices.'
  const seen = new Set<string>()
  for (const r of used) {
    const id = r.model.trim()
    if (!id) return 'Every price needs a model id.'
    if (seen.has(id)) return `${id} is listed twice.`
    seen.add(id)
    if (!isUsd(r.input) || !isUsd(r.output)) {
      return `${id}: input and output must be numbers of 0 or more (USD per million tokens).`
    }
  }
  return null
}

/**
 * The exact value the backend stores: `{"<model>": {"input": "<usd>", "output": "<usd>"}}`,
 * prices as strings, keys sorted the way the server sorts them.
 */
export function serializePrices(rows: PriceRow[]): string {
  const out: Record<string, { input: string; output: string }> = {}
  for (const r of rows) {
    const id = r.model.trim()
    if (!id) continue
    out[id] = { input: r.input.trim(), output: r.output.trim() }
  }
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)))
  return JSON.stringify(sorted)
}

/**
 * The table's starting rows: the provider's default and allowed models from the
 * catalog (ids only — prices cannot be read back), each marked priced or not.
 */
export function priceSeed(
  catalog: ModelCatalog | null,
  provider: AiProvider,
): { rows: PriceRow[]; priced: Record<string, boolean> } {
  const info = catalog?.providers.find((p) => p.provider === provider)
  const ids = [
    ...new Set([
      ...(info?.defaultModel ? [info.defaultModel] : []),
      ...(info?.allowedModels ?? []),
    ]),
  ]
  const priced: Record<string, boolean> = {}
  for (const m of catalog?.models ?? []) {
    if (m.provider !== provider) continue
    priced[m.id] = m.available || m.unavailableReason !== 'no_pricing'
  }
  return {
    rows: (ids.length ? ids : ['']).map((model) => ({ model, input: '', output: '' })),
    priced,
  }
}

// --- provider state from the catalog --------------------------------------------------------

export interface ProviderState {
  enabled: boolean
  /** A key is set. Not a connection test: that is the Test button. */
  configured: boolean
  usable: boolean
  reason: string | null
  defaultModel: string | null
}

/** A provider category's live state, from the catalog (null when it is not a provider). */
export function providerState(
  catalog: ModelCatalog | null,
  category: string,
): ProviderState | null {
  const p = CATEGORY_PROVIDER[category]
  const info = p ? catalog?.providers.find((x) => x.provider === p) : undefined
  if (!info) return null
  return {
    enabled: info.enabled,
    configured: info.configured,
    usable: info.usable,
    reason: info.unavailableReason,
    defaultModel: info.defaultModel,
  }
}

/** Whether a provider's ENABLED switch is on now, when the catalog says so. */
export function enabledNow(catalog: ModelCatalog | null, key: string): boolean | null {
  const m = /^(OPENROUTER|ANTHROPIC|GEMINI)_ENABLED$/.exec(key)
  if (!m) return null
  return providerState(catalog, m[1].toLowerCase())?.enabled ?? null
}
