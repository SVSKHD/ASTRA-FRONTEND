// The Aureon model picker: local + allowed OpenRouter models from the server's
// catalog (never from OpenRouter itself), a per-chat pick, and the spend meter.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

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
    expect(w.text()).toContain('OpenRouter is off: OpenRouter has no daily budget.')
  })

  it('says when the cap is reached', async () => {
    serve(catalog(), { ...USAGE, spent_usd: '0.50', remaining_usd: '0', cap_reached: true })
    const w = mount(AureonModelPicker)
    await flushPromises()
    expect(w.find('[data-testid="usage-meter"]').text()).toContain(
      'cap reached, replies stay local',
    )
  })
})
