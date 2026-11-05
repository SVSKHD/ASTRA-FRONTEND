// The AI provider settings (backend docs/26): editors, accepted values, and the price
// table in the backend's exact JSON shape.
import { describe, expect, it } from 'vitest'
import {
  choicesFor,
  editorFor,
  enabledNow,
  keyNote,
  priceError,
  priceSeed,
  providerState,
  serializePrices,
} from './aiSettings'
import type { ModelCatalog } from '@/ai/aureonChat'

const catalog: ModelCatalog = {
  default: { provider: 'ollama', model: 'qwen2.5:3b' },
  localFallbackModel: 'qwen2.5:3b',
  ollamaReachable: true,
  openrouterOff: 'disabled',
  models: [
    {
      provider: 'anthropic',
      id: 'claude-a',
      label: 'claude-a',
      available: true,
      unavailableReason: null,
      capabilities: ['chat'],
      privacy: 'external',
    },
    {
      provider: 'anthropic',
      id: 'claude-b',
      label: 'claude-b',
      available: false,
      unavailableReason: 'no_pricing',
      capabilities: ['chat'],
      privacy: 'external',
    },
  ],
  providers: [
    {
      provider: 'anthropic',
      label: 'Anthropic',
      enabled: true,
      configured: true,
      usable: true,
      unavailableReason: null,
      defaultModel: 'claude-a',
      allowedModels: ['claude-a', 'claude-b'],
      dailyLimitUsd: '1.00',
      costSource: 'configured_price',
      privacy: 'external',
    },
    {
      provider: 'gemini',
      label: 'Gemini',
      enabled: false,
      configured: false,
      usable: false,
      unavailableReason: 'disabled',
      defaultModel: null,
      allowedModels: [],
      dailyLimitUsd: '0',
      costSource: 'configured_price',
      privacy: 'external',
    },
  ],
  defaultExternalProvider: 'anthropic',
  globalDailyLimitUsd: null,
}

describe('editors', () => {
  it('gives each AI key the editor that fits it', () => {
    expect(editorFor({ key: 'ANTHROPIC_ENABLED', kind: 'bool', managed: false })).toBe('switch')
    expect(editorFor({ key: 'GEMINI_MODEL_PRICES', kind: 'json_object', managed: false })).toBe(
      'prices',
    )
    expect(editorFor({ key: 'AI_DEFAULT_EXTERNAL_PROVIDER', kind: 'str', managed: false })).toBe(
      'select',
    )
    expect(editorFor({ key: 'AGENT_NEWS_PROVIDER', kind: 'str', managed: false })).toBe('select')
    expect(editorFor({ key: 'ANTHROPIC_API_KEY', kind: 'secret', managed: false })).toBe('text')
    expect(editorFor({ key: 'ANTHROPIC_ALLOWED_MODELS', kind: 'csv', managed: false })).toBe('text')
  })

  it('offers only the values the backend accepts', () => {
    expect(choicesFor('AI_DEFAULT_EXTERNAL_PROVIDER')?.map((c) => c.value)).toEqual([
      'openrouter',
      'anthropic',
      'gemini',
    ])
    for (const a of ['NEWS', 'VOICE', 'RESEARCH']) {
      expect(choicesFor(`AGENT_${a}_PROVIDER`)?.map((c) => c.value)).toEqual([
        'auto',
        'ollama',
        'openrouter',
        'anthropic',
        'gemini',
      ])
    }
    // Workers that are not on the list keep their plain field.
    expect(choicesFor('AGENT_IMAGE_PROVIDER')).toBeNull()
    expect(choicesFor('OPENROUTER_IMAGE_MODEL')).toBeNull()
  })

  it('says that voice stays local and unpriced models are never used', () => {
    expect(keyNote('AGENT_VOICE_PROVIDER')).toContain('always run locally')
    expect(keyNote('ANTHROPIC_MODEL_PRICES')).toContain('never used')
    expect(keyNote('AGENT_RESEARCH_PROVIDER')).toContain('AI_RESEARCH_EXTERNAL_ALLOWED')
  })
})

describe('the price table', () => {
  it('serializes to the backend shape: strings, keys sorted, blanks dropped', () => {
    expect(
      serializePrices([
        { model: ' z-model ', input: '3', output: '15.5' },
        { model: 'a-model', input: '0.25', output: '1.25' },
        { model: '', input: '', output: '' },
      ]),
    ).toBe('{"a-model":{"input":"0.25","output":"1.25"},"z-model":{"input":"3","output":"15.5"}}')
  })

  it('refuses what the backend would refuse, and duplicates', () => {
    expect(priceError([{ model: '', input: '', output: '' }])).toMatch(/at least one/)
    expect(priceError([{ model: 'm', input: '-1', output: '2' }])).toMatch(/numbers of 0 or more/)
    expect(priceError([{ model: 'm', input: 'abc', output: '2' }])).toMatch(/numbers/)
    expect(priceError([{ model: '', input: '1', output: '2' }])).toMatch(/model id/)
    expect(
      priceError([
        { model: 'm', input: '1', output: '2' },
        { model: 'm', input: '1', output: '2' },
      ]),
    ).toMatch(/twice/)
    expect(priceError([{ model: 'm', input: '0', output: '2.5' }])).toBeNull()
  })

  it('starts from the catalog’s model ids, marking which are priced, never a price', () => {
    const seed = priceSeed(catalog, 'anthropic')
    expect(seed.rows).toEqual([
      { model: 'claude-a', input: '', output: '' },
      { model: 'claude-b', input: '', output: '' },
    ])
    expect(seed.priced).toEqual({ 'claude-a': true, 'claude-b': false })
    expect(priceSeed(catalog, 'gemini').rows).toEqual([{ model: '', input: '', output: '' }])
  })
})

describe('provider state', () => {
  it('reads enabled, key set and usability from the catalog, not from settings', () => {
    expect(providerState(catalog, 'anthropic')).toMatchObject({
      enabled: true,
      configured: true,
      usable: true,
    })
    expect(providerState(catalog, 'gemini')).toMatchObject({ usable: false, reason: 'disabled' })
    expect(providerState(catalog, 'dhan')).toBeNull()
    expect(enabledNow(catalog, 'ANTHROPIC_ENABLED')).toBe(true)
    expect(enabledNow(catalog, 'GEMINI_ENABLED')).toBe(false)
    expect(enabledNow(catalog, 'AGENT_NEWS_ENABLED')).toBeNull()
    expect(enabledNow(null, 'ANTHROPIC_ENABLED')).toBeNull()
  })
})
