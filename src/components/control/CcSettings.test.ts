// The Settings page with the AI provider cards (backend docs/26): masked keys, the
// password before a secret changes, the server-run connection test, and the price table
// written in the backend's exact shape. Nothing typed is kept in the browser.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

const api = vi.hoisted(() => ({
  GET: vi.fn(),
  PUT: vi.fn(),
  POST: vi.fn(),
  DELETE: vi.fn(),
}))
vi.mock('@/api/client', () => ({ aureon: api }))

import CcSettings from '@/components/control/CcSettings.vue'
import { aureonAi } from '@/ai/aureonChat'

const row = (key: string, category: string, kind: string, over: Record<string, unknown> = {}) => ({
  key,
  category,
  description: key,
  kind,
  is_secret: kind === 'secret',
  requires_reauth: kind === 'secret',
  managed: false,
  is_set: false,
  masked: null,
  source: 'unset',
  ...over,
})

const SETTINGS = {
  categories: ['anthropic', 'ai', 'agents'],
  encryption_ready: true,
  tests: {},
  settings: [
    row('ANTHROPIC_ENABLED', 'anthropic', 'bool', {
      is_set: true,
      masked: '••••true',
      source: 'db',
    }),
    row('ANTHROPIC_API_KEY', 'anthropic', 'secret', {
      is_set: true,
      masked: '••••wxyz',
      source: 'db',
    }),
    row('ANTHROPIC_DEFAULT_MODEL', 'anthropic', 'str'),
    row('ANTHROPIC_DAILY_LIMIT_USD', 'anthropic', 'decimal'),
    row('ANTHROPIC_MODEL_PRICES', 'anthropic', 'json_object'),
    row('AI_DEFAULT_EXTERNAL_PROVIDER', 'ai', 'str'),
    row('AGENT_VOICE_PROVIDER', 'agents', 'str'),
  ],
}

const CATALOG = {
  default: { provider: 'ollama', model: 'qwen2.5:3b' },
  local_fallback_model: 'qwen2.5:3b',
  ollama_reachable: true,
  models: [
    {
      provider: 'anthropic',
      id: 'claude-b',
      label: 'claude-b',
      available: false,
      unavailable_reason: 'no_pricing',
      capabilities: ['chat'],
      privacy: 'external',
    },
  ],
  openrouter: { enabled: false, unavailable_reason: 'disabled', research_external_allowed: false },
  providers: [
    {
      provider: 'anthropic',
      label: 'Anthropic',
      enabled: true,
      configured: true,
      usable: true,
      unavailable_reason: null,
      default_model: 'claude-b',
      allowed_models: ['claude-b'],
      daily_limit_usd: '1.00',
      cost_source: 'configured_price',
      privacy: 'external',
    },
  ],
  default_external_provider: 'openrouter',
  global_daily_limit_usd: null,
}

function serve() {
  api.GET.mockImplementation(async (path: string) => ({
    data:
      path === '/api/v1/settings' ? SETTINGS : path === '/api/models/catalog' ? CATALOG : undefined,
    error: undefined,
    response: { status: 200, ok: true },
  }))
  api.PUT.mockResolvedValue({
    data: { ok: true },
    error: undefined,
    response: { status: 200, ok: true },
  })
  api.POST.mockResolvedValue({
    data: { category: 'anthropic', ok: true, detail: 'Anthropic key OK and default model found' },
    error: undefined,
    response: { status: 200, ok: true },
  })
}

async function mounted() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  const w = mount(CcSettings, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
  return w
}

const field = (w: ReturnType<typeof mount>, key: string) => w.get(`[data-key="${key}"]`)

describe('<CcSettings /> AI providers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    for (const f of Object.values(api)) f.mockReset()
    aureonAi.catalog = null
    localStorage.clear()
    sessionStorage.clear()
    serve()
  })

  it('shows the Anthropic card with its live state, never a key', async () => {
    const w = await mounted()
    const card = w.get('[data-category="anthropic"]')
    expect(card.text()).toContain('Claude — Anthropic API')
    expect(card.get('[data-testid="provider-state"]').text()).toBe(
      'Claude now: Enabled · key set (not tested) · default claude-b · usable',
    )
    const key = field(w, 'ANTHROPIC_API_KEY')
    expect(key.text()).toContain('••••wxyz')
    expect(key.get('input').attributes('type')).toBe('password')
    expect((key.get('input').element as HTMLInputElement).value).toBe('')
    w.unmount()
  })

  it('asks for the password before replacing a key, and keeps nothing typed', async () => {
    const w = await mounted()
    const key = field(w, 'ANTHROPIC_API_KEY')
    await key.get('input').setValue('sk-ant-new-key-1234567890')
    await key.get('form').trigger('submit')
    await flushPromises()
    expect(api.PUT).not.toHaveBeenCalled()
    const pass = document.body.querySelector<HTMLInputElement>('input[aria-label="Password"]')!
    pass.value = 'hunter2'
    pass.dispatchEvent(new Event('input'))
    await flushPromises()
    pass.closest('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/settings/{key}', {
      params: { path: { key: 'ANTHROPIC_API_KEY' } },
      body: { value: 'sk-ant-new-key-1234567890', password: 'hunter2' },
    })
    // Cleared after the send, and never written to browser storage.
    expect((field(w, 'ANTHROPIC_API_KEY').get('input').element as HTMLInputElement).value).toBe('')
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })
    expect(stored).not.toContain('sk-ant-new-key')
    expect(stored).not.toContain('hunter2')
    w.unmount()
  })

  it('runs the connection test on the server, not from the browser', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const w = await mounted()
    const test = w
      .get('[data-category="anthropic"]')
      .findAll('button')
      .find((b) => b.text() === 'Test')!
    await test.trigger('click')
    await flushPromises()
    expect(api.POST).toHaveBeenCalledWith('/api/v1/settings/{key}/test', {
      params: { path: { key: 'ANTHROPIC_API_KEY' } },
    })
    expect(w.text()).toContain('Anthropic key OK and default model found')
    expect(fetchSpy.mock.calls.some(([u]) => /anthropic\.com|googleapis/.test(String(u)))).toBe(
      false,
    )
    fetchSpy.mockRestore()
    w.unmount()
  })

  it('writes the price table as the backend JSON, after the catalog seeds the ids', async () => {
    const w = await mounted()
    const table = field(w, 'ANTHROPIC_MODEL_PRICES').get('[data-testid="price-table"]')
    expect(table.text()).toContain('no price — never used')
    const inputs = table.findAll('input')
    expect((inputs[0].element as HTMLInputElement).value).toBe('claude-b')
    await inputs[1].setValue('3')
    await inputs[2].setValue('15')
    await table.trigger('submit')
    await flushPromises()
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/settings/{key}', {
      params: { path: { key: 'ANTHROPIC_MODEL_PRICES' } },
      body: { value: '{"claude-b":{"input":"3","output":"15"}}' },
    })
    w.unmount()
  })

  it('does not send an invalid price', async () => {
    const w = await mounted()
    const table = field(w, 'ANTHROPIC_MODEL_PRICES').get('[data-testid="price-table"]')
    await table.findAll('input')[1].setValue('-2')
    await table.trigger('submit')
    await flushPromises()
    expect(api.PUT).not.toHaveBeenCalled()
    expect(table.text()).toContain('numbers of 0 or more')
    w.unmount()
  })

  it('turns a provider off with its switch and offers only allowed provider values', async () => {
    const w = await mounted()
    const sw = field(w, 'ANTHROPIC_ENABLED').findComponent({ name: 'Switch' })
    expect(sw.props('modelValue')).toBe(true)
    sw.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/settings/{key}', {
      params: { path: { key: 'ANTHROPIC_ENABLED' } },
      body: { value: 'false' },
    })
    const sel = field(w, 'AI_DEFAULT_EXTERNAL_PROVIDER').findComponent({ name: 'Select' })
    expect((sel.props('options') as { value: string }[]).map((o) => o.value)).toEqual([
      'openrouter',
      'anthropic',
      'gemini',
    ])
    expect(field(w, 'AGENT_VOICE_PROVIDER').text()).toContain('always run locally')
    w.unmount()
  })
})
