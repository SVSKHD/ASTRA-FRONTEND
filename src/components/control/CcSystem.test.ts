// The server page's AI providers card (backend docs/26): from the integrations summary,
// which is settings-derived, so a set key is labelled as not a connection test.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const api = vi.hoisted(() => ({ GET: vi.fn() }))
vi.mock('@/api/client', () => ({ aureon: api }))

import CcSystem from './CcSystem.vue'

const ok = (data: unknown, status = 200) => ({
  data: status < 400 ? data : undefined,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status },
})

const AI = {
  status: 'degraded',
  default_external_provider: 'anthropic',
  global_daily_limit_usd: '3.00',
  local_default: true,
  providers: {
    openrouter: {
      enabled: false,
      configured: false,
      usable: false,
      reason: 'disabled',
      default_model: null,
      daily_limit_usd: '0',
    },
    anthropic: {
      enabled: true,
      configured: true,
      usable: true,
      reason: null,
      default_model: 'claude-x',
      daily_limit_usd: '1.00',
    },
    gemini: {
      enabled: true,
      configured: true,
      usable: false,
      reason: 'no_pricing',
      default_model: 'gemini-x',
      daily_limit_usd: '1.00',
    },
  },
}

function serve(integrations: unknown, status = 200) {
  api.GET.mockImplementation(async (path: string) =>
    path === '/api/v1/system/integrations' ? ok(integrations, status) : ok({}, 404),
  )
}

describe('<CcSystem /> AI providers', () => {
  beforeEach(() => api.GET.mockReset())

  it('lists each provider from settings, with why one is not usable', async () => {
    serve({ ok: false, problems: [], integrations: { ai_providers: AI } })
    const w = mount(CcSystem)
    await flushPromises()
    const card = w.get('[data-testid="ai-providers"]')
    expect(card.text()).toContain('degraded')
    expect(card.text()).toContain('new chats use anthropic when usable · shared cap $3.00/day')
    const claude = card.get('[data-provider="anthropic"]').text()
    expect(claude).toContain('key set (not a connection test)')
    expect(claude).toContain('default claude-x · cap $1.00/day')
    expect(claude).toContain('usable')
    const gem = card.get('[data-provider="gemini"]').text()
    expect(gem).toContain('enabled, not usable')
    expect(gem).toContain('Gemini model has no price')
    expect(card.text()).toContain('no provider is called')
    w.unmount()
  })

  it('says so on a server without the summary', async () => {
    serve({ detail: 'Not Found' }, 404)
    const w = mount(CcSystem)
    await flushPromises()
    expect(w.get('[data-testid="ai-providers"]').text()).toContain('no integrations summary yet')
    w.unmount()
  })
})
