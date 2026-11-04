// The five providers the picker shows — Ollama, OpenRouter, Claude, GPT, Gemini — read
// from the server's catalog (GET /api/models/catalog), never assumed.
//
// Claude, GPT and Gemini reach Aureon through OpenRouter (no separate keys, nothing new
// in the browser): an OpenRouter model id names its vendor before the slash
// ("anthropic/…", "openai/…", "google/…"). So a vendor is available exactly when
// OpenRouter is usable AND the server's allowlist (OPENROUTER_MODELS) holds at least one
// of its models. Only the vendor prefixes live here; every model id comes from the
// server.

import type { CatalogModel, ModelCatalog } from './aureonChat'
import { fallbackText } from './aureonChat'

export type ProviderKey = 'ollama' | 'openrouter' | 'claude' | 'gpt' | 'gemini'

interface VendorDef {
  key: Exclude<ProviderKey, 'ollama' | 'openrouter'>
  name: string
  company: string
  /** OpenRouter id prefixes for this vendor. */
  prefixes: string[]
}

export const VENDORS: VendorDef[] = [
  { key: 'claude', name: 'Claude', company: 'Anthropic', prefixes: ['anthropic/'] },
  { key: 'gpt', name: 'GPT', company: 'OpenAI', prefixes: ['openai/'] },
  { key: 'gemini', name: 'Gemini', company: 'Google', prefixes: ['google/'] },
]

/** Which provider row a catalog model belongs to. */
export function providerOf(m: Pick<CatalogModel, 'provider' | 'id'>): ProviderKey {
  if (m.provider === 'ollama') return 'ollama'
  const id = m.id.toLowerCase()
  return VENDORS.find((v) => v.prefixes.some((p) => id.startsWith(p)))?.key ?? 'openrouter'
}

/** The picker's group heading for a model. */
export function groupOf(m: Pick<CatalogModel, 'provider' | 'id'>): string {
  const p = providerOf(m)
  if (p === 'ollama') return 'Local · Ollama (this server)'
  if (p === 'openrouter') return 'Other models · via OpenRouter'
  const v = VENDORS.find((x) => x.key === p)!
  return `${v.name} (${v.company}) · via OpenRouter`
}

export interface ProviderRow {
  key: ProviderKey
  name: string
  via: string
  available: boolean
  models: number
  /** Why it is unavailable, in words, with what to do about it. */
  reason: string
}

/** One row per provider: usable or not, how many models, and why. */
export function providerRows(catalog: ModelCatalog | null): ProviderRow[] {
  if (!catalog) return []
  const count = (k: ProviderKey) => catalog.models.filter((m) => providerOf(m) === k).length
  const orOff = catalog.openrouterOff
  const orCount = catalog.models.filter((m) => m.provider === 'openrouter').length
  const rows: ProviderRow[] = []

  const local = count('ollama')
  rows.push({
    key: 'ollama',
    name: 'Ollama',
    via: 'local, on the Aureon server',
    available: catalog.ollamaReachable && local > 0,
    models: local,
    reason: !catalog.ollamaReachable
      ? 'Ollama is not reachable from the server.'
      : local
        ? ''
        : 'No model is installed in Ollama yet.',
  })

  rows.push({
    key: 'openrouter',
    name: 'OpenRouter',
    via: 'external, filtered by the server',
    available: !orOff && orCount > 0,
    models: orCount,
    reason: orOff
      ? `Off: ${fallbackText(orOff)}.`
      : orCount
        ? ''
        : 'No OpenRouter model is allowed (OPENROUTER_MODELS is empty).',
  })

  for (const v of VENDORS) {
    const n = count(v.key)
    rows.push({
      key: v.key,
      name: v.name,
      via: `${v.company}, via OpenRouter`,
      available: !orOff && n > 0,
      models: n,
      reason: orOff
        ? `Needs OpenRouter, which is off: ${fallbackText(orOff)}.`
        : n
          ? ''
          : `No ${v.name} model is on the server's allowlist. Add one (${v.prefixes[0]}…) to OPENROUTER_MODELS in Settings.`,
    })
  }
  return rows
}
