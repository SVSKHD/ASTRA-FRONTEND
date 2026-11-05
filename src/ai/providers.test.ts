// The four providers come from the server's catalog (backend docs/26): Local — Ollama,
// OpenRouter, Claude (direct Anthropic API) and Gemini (direct Google API). Nothing here
// decides that a model is usable; the server does.
import { describe, expect, it } from 'vitest'
import { groupOf, modelReason, providerRows } from './providers'
import type { CatalogModel, ModelCatalog, ProviderInfo } from './aureonChat'

const model = (over: Partial<CatalogModel>): CatalogModel => ({
  provider: 'ollama',
  id: 'qwen2.5:3b',
  label: 'qwen2.5:3b',
  available: true,
  unavailableReason: null,
  capabilities: ['chat', 'streaming'],
  privacy: 'local',
  ...over,
})

const prov = (provider: ProviderInfo['provider'], over: Partial<ProviderInfo> = {}) =>
  ({
    provider,
    label: provider,
    enabled: true,
    configured: true,
    usable: true,
    unavailableReason: null,
    defaultModel: null,
    allowedModels: [],
    dailyLimitUsd: provider === 'ollama' ? null : '1.00',
    costSource: provider === 'ollama' ? 'none' : 'configured_price',
    privacy: provider === 'ollama' ? 'local' : 'external',
    ...over,
  }) as ProviderInfo

const catalog = (over: Partial<ModelCatalog> = {}): ModelCatalog => ({
  default: { provider: 'ollama', model: 'qwen2.5:3b' },
  localFallbackModel: 'qwen2.5:3b',
  ollamaReachable: true,
  openrouterOff: 'no_budget',
  models: [
    model({}),
    model({ provider: 'anthropic', id: 'claude-a', label: 'claude-a', privacy: 'external' }),
    model({
      provider: 'gemini',
      id: 'gemini-a',
      label: 'gemini-a',
      privacy: 'external',
      available: false,
      unavailableReason: 'no_pricing',
    }),
  ],
  // Deliberately out of order: rows are always local first.
  providers: [
    prov('gemini', { defaultModel: 'gemini-a' }),
    prov('ollama'),
    prov('anthropic', { defaultModel: 'claude-a' }),
    prov('openrouter', { usable: false, unavailableReason: 'no_budget' }),
  ],
  defaultExternalProvider: 'anthropic',
  globalDailyLimitUsd: null,
  ...over,
})

describe('providers', () => {
  it('groups models by provider, with OpenRouter vendors staying under OpenRouter', () => {
    expect(groupOf({ provider: 'ollama' })).toBe('Local — Ollama')
    expect(groupOf({ provider: 'openrouter' })).toBe('OpenRouter')
    expect(groupOf({ provider: 'anthropic' })).toBe('Claude — Direct Anthropic API')
    expect(groupOf({ provider: 'gemini' })).toBe('Gemini — Direct Google API')
  })

  it('lists the four, local first, with status, privacy and the reason when not usable', () => {
    const rows = providerRows(catalog())
    expect(rows.map((r) => r.key)).toEqual(['ollama', 'openrouter', 'anthropic', 'gemini'])
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(by.ollama).toMatchObject({ available: true, models: 1, privacy: 'local' })
    expect(by.openrouter).toMatchObject({ available: false, privacy: 'external' })
    expect(by.openrouter.reason).toBe('Off: OpenRouter has no daily budget.')
    expect(by.anthropic).toMatchObject({ available: true, models: 1, defaultModel: 'claude-a' })
  })

  it('does not count an unpriced model as usable, and says how to fix it', () => {
    const gemini = providerRows(catalog()).find((r) => r.key === 'gemini')!
    expect(gemini).toMatchObject({ available: false, models: 0, blocked: 1 })
    expect(gemini.reason).toContain('GEMINI_MODEL_PRICES')
    const m = catalog().models[2]
    expect(modelReason(m)).toBe(
      'No price set (GEMINI_MODEL_PRICES): an unpriced model is never used.',
    )
    expect(modelReason(catalog().models[1])).toBe('')
  })

  it('says when the local server is unreachable', () => {
    const rows = providerRows(
      catalog({ providers: [prov('ollama', { usable: false, unavailableReason: 'unreachable' })] }),
    )
    expect(rows[0]).toMatchObject({
      available: false,
      reason: 'Ollama is not reachable from the server.',
    })
  })
})
