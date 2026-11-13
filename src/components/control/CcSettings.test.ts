// The Settings page, built from the base kit like the Todos tab: Tabs for the
// categories, an Accordion per group, a FormField per setting, Alerts for page
// states. Typed values save with Save; picks (a model, the effort, a switch) apply
// at once. A secret's value is never rendered or kept.
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
import { warningEntries } from '@/services/warnings'

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
    row('AI_MODEL_MAIN', 'ai', 'str', { source: 'default', is_set: true, masked: '••••-5-5' }),
    row('AI_MODEL_ROUTER', 'ai', 'str', { source: 'default', is_set: true, masked: '••••-5-5' }),
    row('AI_EFFORT', 'ai', 'str', { source: 'default', is_set: true, masked: '••••dium' }),
    row('AI_MONTHLY_BUDGET_USD', 'ai', 'decimal', {
      source: 'db',
      is_set: true,
      masked: '••••100',
      value: '100',
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
const tabLabels = (w: ReturnType<typeof mount>) =>
  w.findAll('[role="tab"]').map((t) => t.text().trim())
const warnings = () => warningEntries.map((x) => `${x.title ?? ''} ${x.message}`).join(' | ')

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

  it('opens on an overview of Dashboard-style blocks, which are the navigation', async () => {
    const { w } = await mounted()
    expect(w.find('.panel-header__title').text()).toBe('Settings')
    // One block per category, as tabs: the first is selected and controls the panel.
    const blocks = w.findAll('[data-testid="settings-overview"] [role="tab"]')
    expect(blocks.map((b) => b.attributes('data-category'))).toEqual(['ai', 'agents', 'github'])
    expect(blocks[0].attributes('aria-selected')).toBe('true')
    expect(w.get('[role="tabpanel"]').attributes('aria-labelledby')).toBe(
      blocks[0].attributes('id'),
    )
    // AI has no key: the block says so, and counts what is missing.
    expect(blocks[0].get('[data-testid="block-figure"]').text()).toBe('Off')
    expect(blocks[0].get('[data-testid="block-hint"]').text()).toBe('1 missing')
    // GitHub's token is set and its last test failed.
    expect(blocks[2].get('[data-testid="block-hint"]').text()).toBe('Test failed')
    expect(blocks[2].classes()).toContain('is-bad')
    const groups = w.findAll('.cs__group').map((g) => g.attributes('data-group'))
    expect(groups).toEqual(['Credentials', 'Models', 'Budgets', 'Schedules', 'Other'])
    expect(w.findAll('[data-key="AI_FUTURE_KNOB"]').length).toBe(1)
    // Each setting is a FormField: its label is tied to its control.
    expect(field(w, 'AI_MONTHLY_BUDGET_USD').find('.ui-ff__label').text()).toContain(
      'Monthly budget',
    )
  })

  it('shows the spend by budget, and says Claude is off through an Alert', async () => {
    const { w } = await mounted()
    expect(api.GET).toHaveBeenCalledWith('/api/ai/usage')
    const card = w.get('[data-testid="budget"]')
    expect(card.text()).toContain('Spend by budget')
    expect(card.text()).toContain('$5.00 / $40.00')
    expect(warnings()).toContain('Claude is off')
  })

  it('puts the month’s spend on the AI block once the key is set, and moves with the arrows', async () => {
    serve({
      ...SETTINGS,
      settings: SETTINGS.settings.map((r) =>
        r.key === 'ANTHROPIC_API_KEY'
          ? { ...r, is_set: true, masked: '••••x9Qa', source: 'db' }
          : r,
      ),
    })
    const { w, router } = await mounted()
    const ai = w.get('[data-category="ai"][role="tab"]')
    expect(ai.get('[data-testid="block-figure"]').text()).toBe('$12.00')
    expect(ai.get('[data-testid="block-figure"]').classes()).toContain('ui-mono')
    expect(ai.text()).toContain('of $100.00 this month')
    expect(ai.get('[data-testid="block-hint"]').text()).toBe('12%')
    // Arrow keys move along the blocks, like any tablist.
    await w.get('[data-testid="settings-overview"]').trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(router.currentRoute.value.query.category).toBe('agents')
  })

  it('offers only the valid models, says which is in use, and applies a pick at once', async () => {
    const { w } = await mounted()
    const f = field(w, 'AI_MODEL_MAIN')
    expect(f.get('[data-testid="model-now"]').text()).toContain('In use: Opus 5.5 (server default)')
    const select = f.findComponent({ name: 'Select' })
    const values = (select.props('options') as { value: string }[]).map((o) => o.value)
    expect(values).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'])
    // The router can be switched off; the main model cannot.
    const router = field(w, 'AI_MODEL_ROUTER').findComponent({ name: 'Select' })
    expect((router.props('options') as { value: string }[]).map((o) => o.value)).toContain('')

    select.vm.$emit('update:modelValue', 'claude-sonnet-5-5')
    await flushPromises()
    // One step: no Save button, the pick is sent.
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/settings/{key}', {
      params: { path: { key: 'AI_MODEL_MAIN' } },
      body: { value: 'claude-sonnet-5-5' },
    })
    // Picking what is already in use sends nothing.
    api.PUT.mockClear()
    select.vm.$emit('update:modelValue', 'claude-opus-5-5')
    await flushPromises()
    expect(api.PUT).not.toHaveBeenCalled()
  })

  it('applies the thinking effort and a switch at once', async () => {
    const { w, router } = await mounted()
    const effort = field(w, 'AI_EFFORT').findComponent({ name: 'SegmentedControl' })
    expect(effort.props('modelValue')).toBe('medium')
    effort.vm.$emit('update:modelValue', 'high')
    await flushPromises()
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/settings/{key}', {
      params: { path: { key: 'AI_EFFORT' } },
      body: { value: 'high' },
    })
    await router.replace({ query: { category: 'agents' } })
    await flushPromises()
    const sw = field(w, 'AGENT_IMAGE_ENABLED').findComponent({ name: 'Switch' })
    expect(sw.props('modelValue')).toBe(true)
    sw.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/settings/{key}', {
      params: { path: { key: 'AGENT_IMAGE_ENABLED' } },
      body: { value: 'false' },
    })
  })

  it('never renders a secret: a mask, then an empty password field on Replace', async () => {
    const { w, router } = await mounted()
    await router.replace({ query: { category: 'github' } })
    await flushPromises()
    const f = field(w, 'GITHUB_TOKEN')
    expect(f.get('[data-testid="mask"]').text()).toBe('••••wxyz')
    expect(f.findAll('input').length).toBe(0)
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

  it('saves a typed number only once it changed, with its unit, from a NumberInput', async () => {
    const { w } = await mounted()
    const f = field(w, 'AI_MONTHLY_BUDGET_USD')
    expect(f.findAll('[data-testid="save"]').length).toBe(0)
    expect(f.text()).toContain('USD')
    // The editor starts from the value in use; it is not repeated under it.
    expect((f.get('input').element as HTMLInputElement).value).toBe('100')
    expect(f.findAll('[data-testid="value-in-use"]').length).toBe(0)
    await f.get('input').setValue('150.5')
    expect(f.find('[data-testid="unsaved-dot"]').exists()).toBe(true)
    // While a change is unsaved, the value in use shows beside it to compare.
    expect(f.get('[data-testid="value-in-use"]').text()).toBe('100')
    await f.get('[data-testid="save"]').trigger('click')
    await flushPromises()
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/settings/{key}', {
      params: { path: { key: 'AI_MONTHLY_BUDGET_USD' } },
      body: { value: '150.5' },
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
    expect(f.text()).toContain('Copy the value above first')
    await f.get('[data-testid="revert"]').trigger('click')
    await flushPromises()
    expect(api.DELETE).toHaveBeenCalledWith('/api/v1/settings/{key}', {
      params: { path: { key: 'AI_MONTHLY_BUDGET_USD' } },
    })
  })

  it('asks before leaving with unsaved changes, and leaves when told to discard', async () => {
    const { w, router } = await mounted()
    await field(w, 'AI_DAILY_REPORT_CRON').get('input').setValue('0 9 * * *')
    // Another category of the same page: the draft comes along, no question.
    await router.replace({ query: { category: 'agents' } })
    await flushPromises()
    expect(document.body.textContent).not.toContain('Leave with unsaved settings?')

    await router.push('/elsewhere').catch(() => {})
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/dev/settings')
    expect(document.body.textContent).toContain('Leave with unsaved settings?')
    expect(document.body.textContent).toContain('Daily report')

    const discard = [...document.body.querySelectorAll('button')].find((b) =>
      /discard/i.test(b.textContent ?? ''),
    )!
    discard.click()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/elsewhere')
    expect(api.PUT).not.toHaveBeenCalled()
  })

  it('opens search from the header and jumps to a setting', async () => {
    const { w, router } = await mounted()
    expect(w.find('.cs__search').exists()).toBe(false)
    await w.get('[data-testid="search-toggle"]').trigger('click')
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
    expect(warnings()).toContain('SETTINGS_MASTER_KEY')
    expect(field(w, 'AI_DAILY_REPORT_CRON').get('input').attributes('disabled')).toBeDefined()
  })

  it('offers a retry when the list cannot be loaded', async () => {
    api.GET.mockImplementation(async () => res({ detail: 'boom' }, 500))
    const { w } = await mounted()
    expect(w.text()).toContain('Settings could not be loaded')
    serve()
    const retry = w.findAll('button').find((b) => b.text() === 'Retry')!
    await retry.trigger('click')
    await flushPromises()
    expect(tabLabels(w).length).toBe(3)
  })

  it('reveals a secret only after the password, as code, and hides it again', async () => {
    const { w } = await mounted('/dev/settings?category=github')
    const f = field(w, 'GITHUB_TOKEN')
    // Before Reveal: only the mask, in the secret's own field; no code block.
    expect(f.find('[data-testid="value-code"]').exists()).toBe(false)
    expect(f.get('[data-testid="mask"]').text()).toBe('••••wxyz')
    await f.get('[data-testid="reveal"]').trigger('click')
    expect(api.POST).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Show GitHub token')
    api.POST.mockResolvedValue(
      res({
        key: 'GITHUB_TOKEN',
        env: null,
        db: 'ghp_full',
        db_present: true,
        expected: 'ghp_full',
        live: 'ghp_full',
      }),
    )
    const pw = document.body.querySelector('input[type="password"]') as HTMLInputElement
    pw.value = 'pw'
    pw.dispatchEvent(new Event('input'))
    await flushPromises()
    const form = document.body.querySelector('form') as HTMLFormElement
    form.dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(api.POST).toHaveBeenCalledWith('/api/v1/settings/{key}/reveal', {
      params: { path: { key: 'GITHUB_TOKEN' } },
      body: { password: 'pw' },
    })
    expect(f.get('[data-testid="value-code"]').text()).toBe('ghp_full')
    await f.get('[data-testid="hide"]').trigger('click')
    expect(f.text()).not.toContain('ghp_full')
  })

  it('edits any non-secret as text, starting from the exact value in use', async () => {
    const { w } = await mounted()
    const f = field(w, 'AI_MONTHLY_BUDGET_USD')
    await f.get('[data-testid="edit-as-text"]').trigger('click')
    const raw = f.get('[data-testid="raw-editor"] textarea')
    expect((raw.element as HTMLTextAreaElement).value).toBe('100')
    await raw.setValue('100')
    expect(f.find('[data-testid="save"]').exists()).toBe(false) // unchanged: nothing to save
    await raw.setValue('125')
    await f.get('[data-testid="save"]').trigger('click')
    await flushPromises()
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/settings/{key}', {
      params: { path: { key: 'AI_MONTHLY_BUDGET_USD' } },
      body: { value: '125' },
    })
  })

  it('opens Diagnose from the header and keeps it in the URL', async () => {
    const { w, router } = await mounted()
    await w.get('[data-testid="diagnose-toggle"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.diagnose).toBe('1')
    expect(api.GET).toHaveBeenCalledWith('/api/v1/settings/diagnostics')
    expect(w.find('[data-testid="settings-diagnostics"]').exists()).toBe(true)
  })
})
