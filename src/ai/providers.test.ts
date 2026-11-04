// The five providers come from the server's catalog: Claude, GPT and Gemini are
// OpenRouter models grouped by vendor, available only when OpenRouter is on and the
// server allows at least one of their models.
import { describe, expect, it } from 'vitest'
import { groupOf, providerOf, providerRows } from './providers'
import type { ModelCatalog } from './aureonChat'

const catalog = (over: Partial<ModelCatalog> = {}): ModelCatalog => ({
  default: { provider: 'ollama', model: 'qwen2.5:3b' },
  localFallbackModel: 'qwen2.5:3b',
  ollamaReachable: true,
  openrouterOff: null,
  models: [
    { provider: 'ollama', id: 'qwen2.5:3b', label: 'qwen2.5:3b' },
    { provider: 'openrouter', id: 'anthropic/claude-sonnet', label: 'Claude Sonnet' },
    { provider: 'openrouter', id: 'google/gemini-flash', label: 'Gemini Flash' },
    { provider: 'openrouter', id: 'meta-llama/llama-4', label: 'Llama 4' },
  ],
  ...over,
})

describe('providers', () => {
  it('groups OpenRouter models by vendor from the id prefix', () => {
    expect(providerOf({ provider: 'openrouter', id: 'Anthropic/claude-x' })).toBe('claude')
    expect(providerOf({ provider: 'openrouter', id: 'openai/gpt-x' })).toBe('gpt')
    expect(providerOf({ provider: 'openrouter', id: 'meta-llama/x' })).toBe('openrouter')
    expect(providerOf({ provider: 'ollama', id: 'openai/looks-like-it' })).toBe('ollama')
    expect(groupOf({ provider: 'openrouter', id: 'google/gemini-flash' })).toBe(
      'Gemini (Google) · via OpenRouter',
    )
  })

  it('lists all five with availability and the reason when not', () => {
    const rows = Object.fromEntries(providerRows(catalog()).map((r) => [r.key, r]))
    expect(Object.keys(rows)).toEqual(['ollama', 'openrouter', 'claude', 'gpt', 'gemini'])
    expect(rows.ollama).toMatchObject({ available: true, models: 1 })
    expect(rows.openrouter).toMatchObject({ available: true, models: 3 })
    expect(rows.claude).toMatchObject({ available: true, models: 1 })
    expect(rows.gpt.available).toBe(false)
    expect(rows.gpt.reason).toMatch(/No GPT model is on the server's allowlist.*openai\//)
  })

  it('makes every OpenRouter vendor unavailable when OpenRouter is off, saying why', () => {
    const rows = providerRows(catalog({ openrouterOff: 'no_budget', ollamaReachable: false }))
    expect(rows.every((r) => !r.available)).toBe(true)
    expect(rows[0].reason).toBe('Ollama is not reachable from the server.')
    expect(rows.find((r) => r.key === 'claude')?.reason).toBe(
      'Needs OpenRouter, which is off: OpenRouter has no daily budget.',
    )
  })
})
