// Leaving Settings for a tab must not be blocked when nothing was changed. The
// unsaved-changes guard blocks leaving while any setting has a draft, so an
// editor that creates a draft by merely loading its value would trap the page:
// every tab click cancelled. Every editor type is here, with the real values the
// server sends.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

const api = vi.hoisted(() => ({ GET: vi.fn(), PUT: vi.fn(), POST: vi.fn(), DELETE: vi.fn() }))
vi.mock('@/api/client', () => ({ aureon: api }))

import CcSettings from '@/components/control/CcSettings.vue'

const row = (key: string, category: string, kind: string, value: string | null, over = {}) => ({
  key,
  category,
  description: key,
  kind,
  is_secret: kind === 'secret',
  requires_reauth: kind === 'secret',
  managed: false,
  is_set: value !== null,
  masked: value === null ? null : `••••${value.slice(-4)}`,
  source: value === null ? 'unset' : 'db',
  value: kind === 'secret' ? null : value,
  ...over,
})

const SETTINGS = {
  categories: ['ai', 'agents', 'dhan'],
  encryption_ready: true,
  tests: {},
  settings: [
    row('ANTHROPIC_API_KEY', 'ai', 'secret', 'sk-ant-xxxx'),
    row('AI_MODEL_MAIN', 'ai', 'str', 'claude-opus-5-5'),
    row('AI_MODEL_ROUTER', 'ai', 'str', ''),
    row('AI_EFFORT', 'ai', 'str', 'medium'),
    row('AI_MAX_STEPS', 'ai', 'int', '8'),
    row('AI_MONTHLY_BUDGET_USD', 'ai', 'decimal', '100.50'),
    row(
      'AI_AGENT_BUDGETS_USD',
      'ai',
      'json_object',
      '{"investments":40,"business":30,"chat":20,"reserve":10}',
    ),
    row('AI_MODEL_PRICES', 'ai', 'json_object', '{"claude-opus-5-5":{"input":"4","output":"20"}}'),
    row('AI_DAILY_REPORT_CRON', 'ai', 'str', '30 8 * * *'),
    row('AI_WEEKLY_REVIEW_CRON', 'ai', 'str', ''),
    row('AGENT_IMAGE_ENABLED', 'agents', 'bool', 'true'),
    row('DHAN_BASE_URL', 'dhan', 'url', 'https://api.dhan.co'),
    row('DHAN_FEED_INSTRUMENTS', 'dhan', 'csv', 'NSE_EQ:1333, NSE_EQ:11536'),
    row('DHAN_HTTP_TIMEOUT', 'dhan', 'float', '10.0'),
    row('DHAN_FEED_MODE', 'dhan', 'str', 'quote'),
    row('DHAN_EXTRA', 'dhan', 'json_list', '["a","b"]'),
  ],
}

const res = (data: unknown, status = 200) => ({
  data: status < 400 ? data : undefined,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status },
})

let w: ReturnType<typeof mount> | null = null
beforeEach(() => {
  setActivePinia(createPinia())
  for (const f of Object.values(api)) f.mockReset()
  api.GET.mockImplementation(async (path: string) =>
    path === '/api/v1/settings' ? res(SETTINGS) : res(undefined, 404),
  )
})
afterEach(() => {
  w?.unmount()
  w = null
  document.body.innerHTML = ''
})

async function mountAt(category: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/settings', component: { components: { CcSettings }, template: '<CcSettings />' } },
    ],
  })
  await router.push(`/settings?category=${category}`)
  w = mount(
    { template: '<router-view />' },
    { attachTo: document.body, global: { plugins: [router] } },
  )
  await flushPromises()
  await flushPromises()
  return router
}

describe('leaving Settings untouched', () => {
  for (const category of ['ai', 'agents', 'dhan']) {
    it(`goes to a tab from ${category} with nothing changed`, async () => {
      const router = await mountAt(category)
      // No setting may hold a draft from just being shown.
      const dirty = w!
        .findAll('[data-testid="unsaved-dot"]')
        .map((d) => d.element.closest('[data-key]')?.getAttribute('data-key'))
      expect(dirty).toEqual([])
      await router.push('/')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/')
      expect(document.body.textContent).not.toContain('Leave with unsaved settings?')
    })
  }
})
