// The Aureon model picker: local, OpenRouter, Claude and Gemini models from the server's
// catalog (never from a provider itself), a per-chat pick, and the spend meter.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { routerKey } from 'vue-router'

const OR = 'google/gemini-2.5-flash-lite'
const get = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ aureon: { GET: get } }))

import AureonModelPicker from '@/components/AureonModelPicker.vue'
import { aureonAi, targetFor } from '@/ai/aureonChat'
import { useAppStore } from '@/stores/app'

function catalog(off: string | null = null) {
  return {
    default: off
      ? { provider: 'ollama', model: 'qwen2.5:3b' }
      : { provider: 'openrouter', model: OR },
    local_fallback_model: 'qwen2.5:3b',
    ollama_reachable: true,
    models: [
      { provider: 'ollama', id: 'qwen2.5:3b', label: 'qwen2.5:3b' },
      ...(off ? [] : [{ provider: 'openrouter', id: OR, label: OR }]),
    ],
    openrouter: { enabled: !off, unavailable_reason: off, research_external_allowed: false },
  }
}
const USAGE = {
  day: '2026-11-03',
  provider: 'openrouter',
  spent_usd: '0.125',
  limit_usd: '0.50',
  remaining_usd: '0.375',
  prompt_tokens: 900,
  completion_tokens: 100,
  calls: 7,
  failures: 1,
  cap_reached: false,
  available: true,
}

function serve(cat: unknown, usage: unknown = USAGE) {
  get.mockImplementation(async (path: string) => ({
    data: path === '/api/models/catalog' ? cat : path === '/api/ai/usage' ? usage : undefined,
  }))
}

describe('<AureonModelPicker />', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    get.mockReset()
    aureonAi.targets = {}
    aureonAi.pending = null
    aureonAi.catalog = null
    aureonAi.usage = null
    aureonAi.conversations = {}
    aureonAi.model = ''
  })

  it('offers local and OpenRouter models, defaults to the server pick, shows the meter', async () => {
    serve(catalog())
    const w = mount(AureonModelPicker)
    await flushPromises()
    expect(get).toHaveBeenCalledWith('/api/models/catalog')
    expect(w.find('[data-testid="provider-badge"]').text()).toBe('OpenRouter')
    expect(w.text()).toContain('private data stays local')
    expect(w.text()).toContain('falls back to qwen2.5:3b')
    const meter = w.find('[data-testid="usage-meter"]')
    expect(meter.text()).toContain('OpenRouter today: $0.1250 of $0.5000')
    expect(meter.find('[role="meter"]').attributes('aria-valuenow')).toBe('25')
    // The helpers stay on the local model.
    expect(aureonAi.model).toBe('qwen2.5:3b')
  })

  it('keeps the pick per chat', async () => {
    serve(catalog())
    const app = useAppStore()
    const a = app.newAiChat()
    mount(AureonModelPicker)
    await flushPromises()
    aureonAi.targets[String(a)] = { provider: 'ollama', model: 'qwen2.5:3b' }
    expect(targetFor(String(a))).toEqual({ provider: 'ollama', model: 'qwen2.5:3b' })
    const b = app.newAiChat()
    expect(targetFor(String(b))).toEqual({ provider: 'openrouter', model: OR })
  })

  it('is local-only, without a meter, when OpenRouter is off', async () => {
    serve(catalog('no_budget'))
    const w = mount(AureonModelPicker)
    await flushPromises()
    expect(w.find('[data-testid="provider-badge"]').text()).toBe('Local')
    expect(w.find('[data-testid="usage-meter"]').exists()).toBe(false)
    expect(w.find('[data-testid="providers-off"]').text()).toContain(
      'OpenRouter is off: OpenRouter has no daily budget.',
    )
  })

  it('still names OpenRouter when it is turned off, and leads to Settings', async () => {
    serve(catalog('disabled'))
    const push = vi.fn()
    const w = mount(AureonModelPicker, {
      global: { provide: { [routerKey as symbol]: { push } } },
    })
    await flushPromises()
    const off = w.find('[data-testid="providers-off"]')
    expect(off.text()).toContain('OpenRouter is off: OpenRouter is turned off on the server.')
    const select = w.findComponent({ name: 'Select' })
    expect(select.props('options')).toContainEqual(
      expect.objectContaining({
        group: 'OpenRouter',
        label: 'Off: OpenRouter is turned off on the server',
        disabled: true,
      }),
    )
    await off.find('button').trigger('click')
    expect(push).toHaveBeenCalledWith('/settings')
  })

  it('says when the cap is reached', async () => {
    serve(catalog(), { ...USAGE, spent_usd: '0.50', remaining_usd: '0', cap_reached: true })
    const w = mount(AureonModelPicker)
    await flushPromises()
    expect(w.find('[data-testid="usage-meter"]').text()).toContain(
      'cap reached, replies stay local',
    )
  })

  it('keeps OpenRouter models under OpenRouter, whatever their vendor', async () => {
    serve(catalog())
    const w = mount(AureonModelPicker)
    await flushPromises()
    const select = w.findComponent({ name: 'Select' })
    expect(select.props('options')).toContainEqual(
      expect.objectContaining({ value: `openrouter|${OR}`, group: 'OpenRouter' }),
    )
  })

  it('turns Think on per device', async () => {
    serve(catalog())
    aureonAi.think = false
    const w = mount(AureonModelPicker)
    await flushPromises()
    w.findComponent({ name: 'Switch' }).vm.$emit('update:modelValue', true)
    await flushPromises()
    expect(aureonAi.think).toBe(true)
    expect(w.text()).toContain("Think is on: the model's reasoning streams above each reply")
    aureonAi.think = false
  })
})

// backend docs/26: Claude and Gemini through their direct APIs, next to OpenRouter.
describe('<AureonModelPicker /> with four providers', () => {
  const CLAUDE = 'claude-test-model'
  const GEMINI = 'gemini-test-model'
  const m = (provider: string, id: string, over: Record<string, unknown> = {}) => ({
    provider,
    id,
    label: id,
    available: true,
    unavailable_reason: null,
    capabilities: ['chat', 'streaming'],
    privacy: provider === 'ollama' ? 'local' : 'external',
    ...over,
  })
  const p = (provider: string, over: Record<string, unknown> = {}) => ({
    provider,
    label: provider,
    enabled: true,
    configured: true,
    usable: true,
    unavailable_reason: null,
    default_model: null,
    allowed_models: [],
    daily_limit_usd: provider === 'ollama' ? null : '1.00',
    cost_source: provider === 'ollama' ? 'none' : 'configured_price',
    privacy: provider === 'ollama' ? 'local' : 'external',
    ...over,
  })
  const FOUR = {
    default: { provider: 'anthropic', model: CLAUDE },
    local_fallback_model: 'qwen2.5:3b',
    ollama_reachable: true,
    models: [
      m('ollama', 'qwen2.5:3b'),
      m('anthropic', CLAUDE),
      m('gemini', GEMINI, { available: false, unavailable_reason: 'no_pricing' }),
    ],
    openrouter: {
      enabled: false,
      unavailable_reason: 'disabled',
      research_external_allowed: false,
    },
    providers: [
      p('ollama', { default_model: 'qwen2.5:3b' }),
      p('openrouter', { enabled: false, usable: false, unavailable_reason: 'disabled' }),
      p('anthropic', { default_model: CLAUDE }),
      p('gemini', { default_model: GEMINI }),
    ],
    default_external_provider: 'anthropic',
    global_daily_limit_usd: '2.00',
  }
  const CLAUDE_USAGE = {
    ...USAGE,
    provider: 'anthropic',
    limit_usd: '1.00',
    spent_usd: '0.25',
    global_limit_usd: '2.00',
    global_spent_usd: '0.40',
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    get.mockReset()
    aureonAi.targets = {}
    aureonAi.pending = null
    aureonAi.catalog = null
    aureonAi.usage = null
    aureonAi.conversations = {}
    aureonAi.model = ''
    get.mockImplementation(async (path: string, init?: { params?: { query?: object } }) => ({
      data:
        path === '/api/models/catalog'
          ? FOUR
          : path === '/api/ai/usage' && init?.params?.query
            ? CLAUDE_USAGE
            : undefined,
    }))
  })

  it('offers four provider groups, with an unpriced model greyed out and why', async () => {
    const w = mount(AureonModelPicker)
    await flushPromises()
    const options = w.findComponent({ name: 'Select' }).props('options') as {
      value: string
      label: string
      group: string
      disabled?: boolean
    }[]
    expect([...new Set(options.map((o) => o.group))]).toEqual([
      'Local — Ollama',
      'Claude — Direct Anthropic API',
      'Gemini — Direct Google API',
      'OpenRouter',
    ])
    expect(options.find((o) => o.value === `anthropic|${CLAUDE}`)).toMatchObject({
      label: `${CLAUDE} (server default)`,
      disabled: false,
    })
    expect(options.find((o) => o.value === 'ollama|qwen2.5:3b')?.label).toBe(
      'qwen2.5:3b (local fallback)',
    )
    const gem = options.find((o) => o.value === `gemini|${GEMINI}`)!
    expect(gem.disabled).toBe(true)
    expect(gem.label).toContain('never used')
  })

  it('marks the pick external and shows its own spend and the shared cap', async () => {
    const w = mount(AureonModelPicker)
    await flushPromises()
    expect(w.get('[data-testid="provider-badge"]').text()).toBe('Claude')
    expect(w.get('[data-testid="privacy-badge"]').text()).toBe('External')
    expect(w.text()).toContain('Claude, direct API via the Aureon server')
    expect(w.text()).toContain('Server default: Claude · ' + CLAUDE)
    expect(get).toHaveBeenCalledWith('/api/ai/usage', {
      params: { query: { provider: 'anthropic' } },
    })
    expect(w.get('[data-testid="usage-meter"]').text()).toContain(
      'Claude today: $0.2500 of $1.00 · 7 calls · all external: $0.4000 of $2.00',
    )
  })

  it('stores the pick per chat, and a local pick is local only with no meter', async () => {
    const app = useAppStore()
    const chat = app.newAiChat()
    const w = mount(AureonModelPicker)
    await flushPromises()
    w.findComponent({ name: 'Select' }).vm.$emit('update:modelValue', 'ollama|qwen2.5:3b')
    await flushPromises()
    expect(aureonAi.targets[String(chat)]).toEqual({ provider: 'ollama', model: 'qwen2.5:3b' })
    expect(w.get('[data-testid="privacy-badge"]').text()).toBe('Local only')
    expect(w.text()).toContain('nothing leaves the server')
    // An unavailable model cannot be picked, even if the event arrives.
    w.findComponent({ name: 'Select' }).vm.$emit('update:modelValue', 'gemini|')
    expect(aureonAi.targets[String(chat)].provider).toBe('ollama')
  })

  it('lists every provider with local/external, status, default and cap', async () => {
    const w = mount(AureonModelPicker)
    await flushPromises()
    await w.get('[data-testid="providers-toggle"]').trigger('click')
    const row = (k: string) => w.get(`[data-testid="providers"] [data-provider="${k}"]`)
    expect(row('ollama').text()).toContain('local · available')
    expect(row('openrouter').text()).toContain('external · unavailable')
    expect(row('anthropic').text()).toContain(`default ${CLAUDE}`)
    expect(row('anthropic').text()).toContain('cap $1.00/day')
    expect(row('gemini').text()).toContain('GEMINI_MODEL_PRICES')
    expect(w.get('[data-testid="providers"]').text()).toContain('Local fallback: qwen2.5:3b')
  })
})
