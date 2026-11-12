// The Settings page: a rail of categories, grouped cards, typed editors, the
// password before a secret changes, a guard on unsaved changes, search, and the AI
// category's spend strip. A secret's value is never rendered or kept.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const row = (key: string, category: string, kind: string, over: Record<string, unknown> = {}) => ({
  key,
  category,
  description: `${key} description`,
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
  categories: ['ai', 'agents', 'github'],
  encryption_ready: true,
  tests: {
    github: { ok: false, detail: 'token rejected', tested_at: '2026-11-12T09:00:00Z' },
  },
  settings: [
    row('ANTHROPIC_API_KEY', 'ai', 'secret'),
    row('AI_MODEL_MAIN', 'ai', 'str', { source: 'default' }),
    row('AI_EFFORT', 'ai', 'str', { source: 'default' }),
    row('AI_MONTHLY_BUDGET_USD', 'ai', 'decimal', {
      source: 'db',
      is_set: true,
      masked: '••••100',
    }),
    row('AI_DAILY_REPORT_CRON', 'ai', 'str', { source: 'default' }),
    row('AI_FUTURE_KNOB', 'ai', 'int'),
    row('AGENT_IMAGE_ENABLED', 'agents', 'bool', { source: 'env', masked: '••••true' }),
    row('GITHUB_TOKEN', 'github', 'secret', { is_set: true, masked: '••••wxyz', source: 'db' }),
  ],
}

const USAGE = {
  month_start: '2026-11-01T00:00:00+05:30',
  resets_at: '2026-12-01T00:00:00+05:30',
  spent_usd: '12.00',
  limit_usd: '100',
  remaining_usd: '88.00',
  calls: 40,
  configured: false,
  budgets: [
    { budget: 'investments', spent_usd: '5', limit_usd: '40', remaining_usd: '35' },
    { budget: 'business', spent_usd: '3', limit_usd: '30', remaining_usd: '27' },
    { budget: 'chat', spent_usd: '4', limit_usd: '20', remaining_usd: '16' },
    { budget: 'reserve', spent_usd: '0', limit_usd: '10', remaining_usd: '10' },
  ],
}

const res = (data: unknown, status = 200) => ({
  data: status < 400 ? data : undefined,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status },
})

function serve(settings: unknown = SETTINGS) {
  api.GET.mockImplementation(async (path: string) =>
    path === '/api/v1/settings'
      ? res(settings)
      : path === '/api/ai/usage'
        ? res(USAGE)
        : res(undefined, 404),
  )
  api.PUT.mockResolvedValue(res({ ok: true }))
  api.DELETE.mockResolvedValue(res({ ok: true }))
  api.POST.mockResolvedValue(res({ category: 'github', ok: true, detail: 'GitHub token OK' }))
}

let wrapper: ReturnType<typeof mount> | null = null
async function mounted(path = '/dev/settings') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      {
        path: '/dev/:module?',
        component: { components: { CcSettings }, template: '<CcSettings />' },
      },
      { path: '/elsewhere', component: { template: '<div>elsewhere</div>' } },
    ],
  })
  await router.push(path)
  const w = mount(
    { template: '<router-view />' },
    { attachTo: document.body, global: { plugins: [router] } },
  )
  wrapper = w
  await flushPromises()
  return { w, router }
}

const field = (w: ReturnType<typeof mount>, key: string) => w.get(`[data-key="${key}"]`)

describe('<CcSettings />', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    for (const f of Object.values(api)) f.mockReset()
    localStorage.clear()
    sessionStorage.clear()
    serve()
  })
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  it('lists categories in a rail with their last test and missing credentials', async () => {
    const { w } = await mounted()
    const cats = w.findAll('.cs__cat')
    expect(cats.map((c) => c.attributes('data-category'))).toEqual(['ai', 'agents', 'github'])
    expect(w.get('.cs__cat[data-category="ai"] .cs__cat-count').text()).toContain('1')
    expect(w.get('.cs__cat[data-category="github"] .cs__cat-dot').classes()).toContain('is-failed')
    // The first category opens, its cards in order, with "Other" for an unknown key.
    const titles = w.findAll('.cs__group .ui-card__title').map((t) => t.text())
    expect(titles).toEqual(['Credentials', 'Models', 'Budgets', 'Schedules', 'Other'])
    expect(w.findAll('[data-key="AI_FUTURE_KNOB"]').length).toBe(1)
  })

  it('shows the AI spend and says Claude is off without a key', async () => {
    const { w } = await mounted()
    expect(api.GET).toHaveBeenCalledWith('/api/ai/usage')
    expect(w.get('[data-testid="key-callout"]').text()).toContain('Claude is off')
    expect(w.get('[data-testid="budget"]').text()).toContain('$12.00')
  })

  it('never renders a secret: a mask, then an empty password field on Replace', async () => {
    const { w, router } = await mounted()
    await router.replace({ query: { category: 'github' } })
    await flushPromises()
    const f = field(w, 'GITHUB_TOKEN')
    expect(f.get('[data-testid="mask"]').text()).toBe('••••wxyz')
    expect(f.find('input').exists()).toBe(false)
    await f.get('[data-testid="replace"]').trigger('click')
    const input = f.get('input')
    expect(input.attributes('type')).toBe('password')
    expect((input.element as HTMLInputElement).value).toBe('')
    await input.setValue('ghp_new_secret_value_123')
    await f.get('[data-testid="save"]').trigger('click')
    await flushPromises()
    // A secret asks for the password first; nothing is sent until then.
    expect(api.PUT).not.toHaveBeenCalled()
    const pass = document.body.querySelector<HTMLInputElement>('input[aria-label="Password"]')!
    pass.value = 'hunter2'
    pass.dispatchEvent(new Event('input'))
    await flushPromises()
    pass.closest('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/settings/{key}', {
      params: { path: { key: 'GITHUB_TOKEN' } },
      body: { value: 'ghp_new_secret_value_123', password: 'hunter2' },
    })
    expect(w.html()).not.toContain('ghp_new_secret_value_123')
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })
    expect(stored).not.toContain('ghp_new')
    expect(stored).not.toContain('hunter2')
  })

  it('saves a number only once it changed, and only when it is valid', async () => {
    const { w } = await mounted()
    const f = field(w, 'AI_MONTHLY_BUDGET_USD')
    expect(f.find('[data-testid="save"]').exists()).toBe(false)
    expect(f.text()).toContain('USD')
    await f.get('input').setValue('abc')
    expect(f.get('[data-testid="save"]').attributes('disabled')).toBeDefined()
    expect(f.text()).toContain('0 or more')
    await f.get('input').setValue('150.50')
    expect(f.find('[data-testid="unsaved-dot"]').exists()).toBe(true)
    await f.get('[data-testid="save"]').trigger('click')
    await flushPromises()
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/settings/{key}', {
      params: { path: { key: 'AI_MONTHLY_BUDGET_USD' } },
      body: { value: '150.50' },
    })
  })

  it('previews a schedule in plain English and sends the cron as typed', async () => {
    const { w } = await mounted()
    const f = field(w, 'AI_DAILY_REPORT_CRON')
    await f.get('input').setValue('30 8 * * *')
    expect(f.get('[data-testid="cron-words"]').text()).toBe('Every day at 08:30 IST')
    await f.get('[data-testid="save"]').trigger('click')
    await flushPromises()
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/settings/{key}', {
      params: { path: { key: 'AI_DAILY_REPORT_CRON' } },
      body: { value: '30 8 * * *' },
    })
  })

  it('reverts to .env only after a second, explicit click', async () => {
    const { w } = await mounted()
    const f = field(w, 'AI_MONTHLY_BUDGET_USD')
    await f.get('[data-testid="revert"]').trigger('click')
    expect(api.DELETE).not.toHaveBeenCalled()
    expect(f.text()).toContain('cannot be brought back')
    await f.get('[data-testid="revert"]').trigger('click')
    await flushPromises()
    expect(api.DELETE).toHaveBeenCalledWith('/api/v1/settings/{key}', {
      params: { path: { key: 'AI_MONTHLY_BUDGET_USD' } },
    })
  })

  it('asks before leaving with unsaved changes, and stays or leaves as told', async () => {
    const { w, router } = await mounted()
    await field(w, 'AI_MODEL_MAIN').get('input').setValue('claude-sonnet-5-5')
    // Another category of the same page: the draft comes along, no question.
    await router.replace({ query: { category: 'agents' } })
    await flushPromises()
    expect(document.body.textContent).not.toContain('Leave with unsaved settings?')

    await router.push('/elsewhere').catch(() => {})
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/dev/settings')
    expect(document.body.textContent).toContain('Leave with unsaved settings?')
    expect(document.body.textContent).toContain('Main model')

    const discard = [...document.body.querySelectorAll('button')].find((b) =>
      /discard/i.test(b.textContent ?? ''),
    )!
    discard.click()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/elsewhere')
    expect(api.PUT).not.toHaveBeenCalled()
  })

  it('finds a setting by search and opens its category', async () => {
    const { w, router } = await mounted()
    await w.get('.cs__search input').setValue('github token')
    const hit = w.findAll('.cs__hit').find((h) => h.text().includes('GITHUB_TOKEN'))!
    await hit.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.category).toBe('github')
    expect(w.findAll('[data-key="GITHUB_TOKEN"]').length).toBe(1)
  })

  it('runs the connection test on the server, never from the browser', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { w, router } = await mounted()
    await router.replace({ query: { category: 'github' } })
    await flushPromises()
    await w.get('[data-testid="test-connection"]').trigger('click')
    await flushPromises()
    expect(api.POST).toHaveBeenCalledWith('/api/v1/settings/{key}/test', {
      params: { path: { key: 'GITHUB_TOKEN' } },
    })
    expect(w.get('[data-testid="test-result"]').text()).toBe('GitHub token OK')
    expect(fetchSpy.mock.calls.some(([u]) => /anthropic\.com|github\.com/.test(String(u)))).toBe(
      false,
    )
    fetchSpy.mockRestore()
  })

  it('disables writes and says why when encryption is not ready', async () => {
    serve({ ...SETTINGS, encryption_ready: false })
    const { w } = await mounted()
    expect(w.get('.cs__banner').text()).toContain('SETTINGS_MASTER_KEY')
    expect(field(w, 'AI_MODEL_MAIN').get('input').attributes('disabled')).toBeDefined()
  })

  it('offers a retry when the list cannot be loaded', async () => {
    api.GET.mockImplementation(async () => res({ detail: 'boom' }, 500))
    const { w } = await mounted()
    expect(w.get('.cs__error').text()).toContain('could not be loaded')
    serve()
    await w.get('.cs__error button').trigger('click')
    await flushPromises()
    expect(w.findAll('.cs__cat').length).toBe(3)
  })
})
