import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }))
vi.mock('@/api/client', () => ({
  aureon: api,
  errorMessage: (_: unknown, f: string) => f,
  onApiSchema: () => () => {},
  onUnauthorized: () => () => {},
}))

import ModulesView from './ModulesView.vue'
import { moduleState, resetModules, type Manifest } from '@/modules/manifest'
import { tradingSession } from '@/trading/session'

const list = (path: string) => ({
  kind: 'list' as const,
  id: 'list',
  title: 'List',
  method: 'GET' as const,
  path,
  danger: 'none' as const,
  path_params: [],
  columns: [{ key: 'id', label: 'Id' }],
  items_path: '',
})
const MANIFEST: Manifest = {
  version: 1,
  schema_hash: 'h1',
  modules: [
    { key: 'scheduler', title: 'Scheduled jobs', views: [list('/api/scheduler/jobs')] },
    { key: 'agents', title: 'Agents', views: [list('/api/agents')] },
    { key: 'demo-notes', title: 'Demo notes', views: [list('/api/v1/demo/notes')] },
  ],
}
const Page = { template: '<div class="page" />' }

function setup(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/modules/:key?', component: ModulesView },
      { path: '/dev/agents', component: Page },
      { path: '/', component: Page },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: Page },
    ],
  })
  void router.push(path)
  return router
}

describe('<ModulesView />', () => {
  beforeEach(() => {
    localStorage.setItem('modules.seen', JSON.stringify(['scheduler', 'agents']))
    resetModules()
    moduleState.manifest = MANIFEST
    Object.assign(tradingSession, { checked: true, user: { uid: 'u' }, role: 'admin', error: '' })
    api.GET.mockResolvedValue({
      data: [],
      response: { ok: true, status: 200, headers: new Headers() },
    })
  })

  it('builds the nav from the manifest, with New and the custom page’s link', async () => {
    const router = setup('/modules')
    await router.isReady()
    const w = mount(ModulesView, { global: { plugins: [router] } })
    await flushPromises()
    const items = w.findAll('.mv__item')
    expect(items.map((i) => i.find('.mv__name').text())).toEqual([
      'Scheduled jobs',
      'Agents',
      'Demo notes New',
    ])
    expect(w.get('[data-testid="module-agents"]').attributes('href')).toBe('/dev/agents')
    expect(w.get('[data-testid="module-demo-notes"]').attributes('href')).toBe(
      '/modules/demo-notes',
    )
  })

  it('opens a custom page instead of the generic view, unless asked for generic', async () => {
    const router = setup('/modules/agents')
    await router.isReady()
    mount(ModulesView, { global: { plugins: [router] } })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/dev/agents')

    const r2 = setup('/modules/agents?generic=1')
    await r2.isReady()
    const w = mount(ModulesView, { global: { plugins: [r2] } })
    await flushPromises()
    expect(r2.currentRoute.value.path).toBe('/modules/agents')
    expect(w.text()).toContain('Agents')
  })

  it('renders a module with no custom page generically and marks it seen', async () => {
    const router = setup('/modules/demo-notes')
    await router.isReady()
    const w = mount(ModulesView, { global: { plugins: [router] } })
    await flushPromises()
    expect(api.GET).toHaveBeenCalledWith('/api/v1/demo/notes', {})
    expect(w.findComponent({ name: 'GenericList' }).exists()).toBe(true)
    expect(moduleState.seen).toContain('demo-notes')
  })
})
