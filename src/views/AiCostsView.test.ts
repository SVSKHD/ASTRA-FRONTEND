// /ai/costs renders this month's Claude spend from GET /api/ai/usage: the month
// against its cap, four budget meters, a warning from 80 % — or says only admins see it.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() }))
vi.mock('@/api/client', () => ({
  aureon: api,
  errorMessage: (_: unknown, f: string) => f,
  onUnauthorized: () => () => {},
}))

import AiCostsView from './AiCostsView.vue'
import { tradingSession } from '@/trading/session'

const res = (data: unknown, status = 200) => ({
  data: status < 400 ? data : undefined,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status, headers: new Headers() },
})

const USAGE = {
  month_start: '2026-11-01T00:00:00+05:30',
  resets_at: '2026-12-01T00:00:00+05:30',
  spent_usd: '84.20',
  limit_usd: '100',
  remaining_usd: '15.80',
  calls: 412,
  configured: true,
  budgets: [
    { budget: 'reserve', spent_usd: '1.00', limit_usd: '10', remaining_usd: '9.00' },
    { budget: 'investments', spent_usd: '40.00', limit_usd: '40', remaining_usd: '0' },
    { budget: 'business', spent_usd: '25.00', limit_usd: '30', remaining_usd: '5.00' },
    { budget: 'chat', spent_usd: '18.20', limit_usd: '20', remaining_usd: '1.80' },
  ],
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/ai/costs', component: AiCostsView },
      { path: '/dev/settings', component: { template: '<div />' } },
    ],
  })
  await router.push('/ai/costs')
  const w = mount(AiCostsView, { global: { plugins: [router] } })
  await flushPromises()
  return { w, router }
}

describe('<AiCostsView />', () => {
  beforeEach(() => {
    api.GET.mockReset()
    Object.assign(tradingSession, {
      checked: true,
      user: { uid: 'u1', name: 'o', email: 'o@x', provider: 'aureon', initial: 'O', color: '#000' },
      role: 'admin',
      error: '',
    })
  })

  it('shows the month against its cap and each budget, warning from 80 %', async () => {
    api.GET.mockResolvedValue(res(USAGE))
    const { w } = await mountView()
    expect(api.GET).toHaveBeenCalledWith('/api/ai/usage')
    expect(w.get('[data-testid="month-spend"]').text()).toContain('$84.20')
    expect(w.get('[data-testid="month-spend"]').text()).toContain('of $100.00')
    // 84 % of the month: a warning, not yet the cap.
    expect(w.text()).toContain('Over 80 %')
    const order = w.findAll('[data-budget]').map((r) => r.attributes('data-budget'))
    expect(order).toEqual(['investments', 'business', 'chat', 'reserve'])
    expect(w.get('[data-budget="investments"]').classes()).toContain('is-over')
    expect(w.get('[data-budget="investments"]').text()).toContain('Cap reached')
    expect(w.get('[data-budget="business"]').classes()).toContain('is-warn')
    expect(w.get('[data-budget="reserve"]').classes()).toContain('is-ok')
    expect(w.text()).toContain('Calls')
    expect(w.text()).toContain('412')
  })

  it('says Claude is not set up when the key is missing', async () => {
    api.GET.mockResolvedValue(res({ ...USAGE, configured: false, spent_usd: '0' }))
    const { w } = await mountView()
    expect(w.get('[data-testid="not-configured"]').text()).toContain('ANTHROPIC_API_KEY')
  })

  it('tells a non-admin that spend is for admins', async () => {
    api.GET.mockResolvedValue(res({ detail: 'admin only' }, 403))
    const { w } = await mountView()
    expect(w.text()).toContain('Only admins see AI spend')
    expect(w.find('[data-testid="budget"]').exists()).toBe(false)
  })

  it('links to the caps in Settings', async () => {
    api.GET.mockResolvedValue(res(USAGE))
    const { w, router } = await mountView()
    const btn = w.findAll('button').find((b) => b.text().includes('Settings → AI'))!
    await btn.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/dev/settings?category=ai')
  })
})
