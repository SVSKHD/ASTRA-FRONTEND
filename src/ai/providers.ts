// The four providers the picker shows (backend docs/26-ai-providers.md), read from the
// server's catalog (GET /api/models/catalog), never assumed:
//
//   ollama      Local — Ollama, on the Aureon server (the default and the only fallback)
//   openrouter  OpenRouter, a gateway to many vendors' models
//   anthropic   Claude, through the direct Anthropic API
//   gemini      Gemini, through the direct Google API
//
// Every model id, every provider's state and every reason comes from the server.
// Nothing here says a model is usable: the catalog does (`available`), and a
// provider the server calls unusable lists no external models at all.

import type { AiProvider, CatalogModel, ModelCatalog, ProviderInfo } from './aureonChat'
import { AI_PROVIDERS, fallbackText } from './aureonChat'

/** The picker's group heading per provider. */
export const PROVIDER_GROUP: Record<AiProvider, string> = {
  ollama: 'Local — Ollama',
  openrouter: 'OpenRouter',
  anthropic: 'Claude — Direct Anthropic API',
  gemini: 'Gemini — Direct Google API',
}

/** The setting that holds a provider's prices (only the direct APIs are priced here). */
export const PRICE_SETTING: Partial<Record<AiProvider, string>> = {
  anthropic: 'ANTHROPIC_MODEL_PRICES',
  gemini: 'GEMINI_MODEL_PRICES',
}

/**
 * OpenRouter id prefixes per vendor. Only for filtering OpenRouter's price list in
 * the Cost Center; the picker groups by provider, not by vendor.
 */
export const VENDORS = [
  { key: 'claude', name: 'Claude', company: 'Anthropic', prefixes: ['anthropic/'] },
  { key: 'gpt', name: 'GPT', company: 'OpenAI', prefixes: ['openai/'] },
  { key: 'gemini', name: 'Gemini', company: 'Google', prefixes: ['google/'] },
] as const

/** The picker's group heading for a model. */
export function groupOf(m: Pick<CatalogModel, 'provider'>): string {
  return PROVIDER_GROUP[m.provider] ?? PROVIDER_GROUP.ollama
}

export interface ProviderRow {
  key: AiProvider
  /** The server's own label ("Anthropic", "Local (Ollama)"). */
  name: string
  group: string
  privacy: 'local' | 'external'
  enabled: boolean
  /** A key is set on the server. Not proof the key works: that is Settings → Test. */
  configured: boolean
  available: boolean
  /** Models the picker can select now. */
  models: number
  /** Models listed but not selectable (unpriced, for example). */
  blocked: number
  defaultModel: string | null
  dailyLimitUsd: string | null
  /** Why it is unavailable, in words, with what to do about it. */
  reason: string
}

function rowReason(p: ProviderInfo, selectable: number, blocked: number): string {
  if (p.provider === 'ollama') {
    if (!p.usable) return 'Ollama is not reachable from the server.'
    return selectable ? '' : 'No model is installed in Ollama yet.'
  }
  if (!p.usable) return `Off: ${fallbackText(p.unavailableReason ?? 'disabled', p.provider)}.`
  if (selectable) return ''
  const prices = PRICE_SETTING[p.provider]
  if (blocked && prices) return `No allowed model has a price. Add one to ${prices} in Settings.`
  return 'No model is on the server’s allowlist.'
}

/** One row per provider, local first: usable or not, how many models, and why. */
export function providerRows(catalog: ModelCatalog | null): ProviderRow[] {
  if (!catalog) return []
  const order = (p: AiProvider) => AI_PROVIDERS.indexOf(p)
  return [...catalog.providers]
    .sort((a, b) => order(a.provider) - order(b.provider))
    .map((p) => {
      const mine = catalog.models.filter((m) => m.provider === p.provider)
      const selectable = mine.filter((m) => m.available).length
      const blocked = mine.length - selectable
      return {
        key: p.provider,
        name: p.label,
        group: PROVIDER_GROUP[p.provider],
        privacy: p.privacy,
        enabled: p.enabled,
        configured: p.configured,
        available: p.usable && selectable > 0,
        models: selectable,
        blocked,
        defaultModel: p.defaultModel,
        dailyLimitUsd: p.dailyLimitUsd,
        reason: rowReason(p, selectable, blocked),
      }
    })
}

/** Why one model cannot be picked, in words ("" when it can). */
export function modelReason(m: CatalogModel): string {
  if (m.available) return ''
  if (m.unavailableReason === 'no_pricing') {
    return `No price set (${PRICE_SETTING[m.provider] ?? 'prices'}): an unpriced model is never used.`
  }
  return fallbackText(m.unavailableReason ?? 'unavailable', m.provider)
}
