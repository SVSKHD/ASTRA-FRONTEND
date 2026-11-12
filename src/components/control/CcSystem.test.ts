// The server page's Claude card (backend docs/26): from the integrations summary,
// which is built from settings and the usage table, so a set key is not called a
// working one, and the month's spend is shown against its cap.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const api = vi.hoisted(() => ({ GET: vi.fn() }))
vi.mock('@/api/client', () => ({ aureon: api }))

import CcSystem from './CcSystem.vue'
import { claudeSummary } from '@/control/integrations'

const ok = (data: unknown, status = 200) => ({
  data: status < 400 ? data : undefined,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status },
})

const CLAUDE = {
  configured: true,
  model_main: 'claude-opus-5-5',
  model_router: 'claude-haiku-5-5',
  month_spent_usd: '12.5',
  monthly_budget_usd: '100',
  status: 'ok',
}

function serve(integrations: unknown, status = 200) {
  api.GET.mockImplementation(async (path: string) =>
    path === '/api/v1/system/integrations' ? ok(integrations, status) : ok({}, 404),
  )
}

describe('<CcSystem /> Claude', () => {
  beforeEach(() => api.GET.mockReset())

  it('shows the models and the month against its cap, without calling Anthropic', async () => {
    serve({ ok: true, problems: [], integrations: { claude: CLAUDE } })
    const w = mount(CcSystem)
    await flushPromises()
    const card = w.get('[data-testid="claude"]')
    expect(card.text()).toContain('Ready')
    expect(card.get('[data-testid="claude-detail"]').text()).toBe(
      'main claude-opus-5-5 · router claude-haiku-5-5 · $12.50 of $100.00 this month',
    )
    expect(card.text()).toContain('Anthropic is not called')
    // No Ollama row any more: the server has no local model.
    expect(w.text()).not.toContain('Ollama')
    w.unmount()
  })

  it('says so on a server without the summary', async () => {
    serve({ detail: 'Not Found' }, 404)
    const w = mount(CcSystem)
    await flushPromises()
    expect(w.get('[data-testid="claude"]').text()).toContain('no integrations summary yet')
    w.unmount()
  })
})

describe('claudeSummary', () => {
  it('reads not set up, budget reached and a failed read', () => {
    expect(claudeSummary({ configured: false, status: 'not_configured' })).toMatchObject({
      state: 'Not set up',
      tone: 'neutral',
    })
    expect(claudeSummary({ ...CLAUDE, status: 'degraded', month_spent_usd: '100' })).toMatchObject({
      state: 'Budget reached',
      tone: 'warning',
    })
    expect(claudeSummary({ ...CLAUDE, model_router: null })!.detail).toContain('router off')
    expect(claudeSummary({ status: 'down', error: 'timeout after 5s' })).toMatchObject({
      state: 'Unreadable',
      tone: 'danger',
    })
    expect(claudeSummary(undefined)).toBeNull()
  })
})
