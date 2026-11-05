// /agents-hub shows only what the server reports: its tools (grouped, with approval
// needs), MCP as unsupported when it says so, connected services, policies, runs,
// approvals waiting and the audit trail — and keeps working without the registry.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() }))
vi.mock('@/api/client', () => ({
  aureon: api,
  errorMessage: (_: unknown, f: string) => f,
  onUnauthorized: () => () => {},
}))

import AgentsHubView from './AgentsHubView.vue'
import { tradingSession } from '@/trading/session'

const ok = (data: unknown, status = 200) => ({
  data: status < 400 ? data : undefined,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status, headers: new Headers() },
})
const CAPS = {
  mcp: { supported: false, servers: [] },
  tools: [
    {
      id: 'ollama',
      name: 'Ollama',
      kind: 'agent',
      status: 'ready',
      detail: null,
      requires_approval: false,
    },
    {
      id: 'imaging',
      name: 'Imaging',
      kind: 'agent',
      status: 'paused',
      detail: 'paused by an admin',
      requires_approval: false,
    },
    {
      id: 'pr.merge',
      name: 'Merge a pull request',
      kind: 'operation',
      status: 'ready',
      detail: null,
      requires_approval: true,
    },
  ],
  services: [
    { id: 'github', name: 'GitHub', connected: true, detail: 'as svskhd' },
    { id: 'dhan', name: 'Dhan', connected: false, detail: 'no session' },
  ],
}
const BASE: Record<string, unknown> = {
  '/api/v1/approvals/inbox': {
    items: [
      {
        id: 'ap1',
        kind: 'pr.merge',
        target: 'svskhd/astra#9',
        summary: 'Merge #9',
        risk_level: 'high',
        received_approvals: 0,
        required_approvals: 1,
        created_at: '2026-11-04T10:00:00Z',
      },
    ],
    total: 1,
    reauth_stamp_expires_at: null,
  },
  '/api/v1/approvals/policies': [
    {
      id: 1,
      kind_pattern: 'pr.merge',
      required_approvals: 1,
      require_reauth: true,
      allow_self_approval: false,
      expiry_seconds: 3600,
      risk_level: 'high',
      enabled: true,
      description: null,
    },
  ],
  '/api/agents': { agents: [{ id: 'ollama', name: 'Ollama', state: 'idle', paused: false }] },
  '/api/agents/{agent_id}/runs': {
    items: [
      {
        id: 5,
        task: 'chat',
        status: 'succeeded',
        attempt: 1,
        started_at: '2026-11-04T09:00:00Z',
        duration_ms: 2300,
        error: null,
      },
    ],
    total: 1,
  },
  '/api/code/tasks': {
    items: [
      {
        id: 't1',
        title: 'Rename a',
        repo: 'astra',
        kind: 'change',
        status: 'ready',
        created_at: '2026-11-04T08:00:00Z',
      },
    ],
    total: 1,
  },
  '/api/v1/audit/events': {
    items: [
      {
        id: 9,
        event_type: 'code_task_approved',
        actor_email: 'o@x',
        created_at: '2026-11-04T07:00:00Z',
        details: { task: 't0', repo: 'astra' },
      },
    ],
    total: 1,
  },
}
function serve(extra: Record<string, unknown>) {
  const map = { ...BASE, ...extra }
  api.GET.mockImplementation(async (path: string) =>
    path in map ? ok(map[path]) : ok({ detail: 'Not Found' }, 404),
  )
}
async function mountHub() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/agents-hub', component: AgentsHubView },
      { path: '/dev/inbox', component: { template: '<div />' } },
      { path: '/code-aureon', component: { template: '<div />' } },
    ],
  })
  await router.push('/agents-hub')
  const w = mount(AgentsHubView, { global: { plugins: [router] } })
  await flushPromises()
  await flushPromises()
  return { w, router }
}

describe('<AgentsHubView />', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
    Object.assign(tradingSession, {
      checked: true,
      user: { uid: 'u1', name: 'o', email: 'o@x', provider: 'aureon', initial: 'O', color: '#000' },
      role: 'admin',
      error: '',
    })
  })

  it('lists the tools the server reports, with MCP as unsupported', async () => {
    serve({ '/api/v1/capabilities': CAPS })
    const { w } = await mountHub()
    const reg = w.get('[data-testid="tool-registry"]')
    expect(reg.get('[data-testid="mcp-status"]').text()).toContain('MCP not supported')
    expect(reg.text()).toContain('Agents')
    expect(reg.text()).toContain('Operations that need approval')
    expect(reg.get('[data-testid="tool-pr.merge"]').text()).toContain('Needs approval')
    expect(reg.get('[data-testid="tool-imaging"]').text()).toContain('paused')
    expect(w.get('[data-testid="services"]').text()).toContain('Not connected')
  })

  it('shows policies, runs, collaboration tasks, approvals and audit', async () => {
    serve({ '/api/v1/capabilities': CAPS })
    const { w, router } = await mountHub()
    expect(w.get('[data-testid="permissions"]').text()).toContain(
      'password again · not by the requester · expires after 60 min',
    )
    expect(w.get('[data-testid="history"]').text()).toContain('took 2.3 s')
    expect(w.get('[data-testid="collab"]').text()).toContain('waiting for your review')
    expect(w.get('[data-testid="audit"]').text()).toContain('code task approved')
    const approvals = w.get('[data-testid="approvals"]')
    expect(approvals.text()).toContain('Merge #9')
    await approvals.get('button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/dev/inbox?id=ap1')
  })

  it('says the registry is missing on an older server, and the rest still works', async () => {
    serve({})
    const { w } = await mountHub()
    expect(w.text()).toContain('The tool registry is not on this server yet')
    expect(w.find('[data-testid="tool-registry"]').exists()).toBe(false)
    expect(w.get('[data-testid="approvals"]').text()).toContain('Merge #9')
  })

  it('is for admins', async () => {
    tradingSession.role = 'user'
    serve({})
    const { w } = await mountHub()
    expect(w.text()).toContain('Admins only')
    expect(api.GET).not.toHaveBeenCalledWith('/api/v1/approvals/inbox', expect.anything())
  })

  it('sets the News, Voice and Research providers through the settings API', async () => {
    const row = (key: string) => ({
      key,
      category: 'agents',
      description: key,
      kind: 'str',
      is_secret: false,
      requires_reauth: false,
      managed: false,
      is_set: false,
      masked: null,
      source: 'default',
    })
    serve({
      '/api/v1/settings': {
        categories: ['agents'],
        encryption_ready: true,
        tests: {},
        settings: [
          row('AGENT_NEWS_PROVIDER'),
          row('AGENT_NEWS_MODEL'),
          row('AGENT_VOICE_PROVIDER'),
          row('AGENT_RESEARCH_PROVIDER'),
          row('AGENT_IMAGE_ENABLED'),
          row('OPENROUTER_IMAGE_MODEL'),
        ],
      },
    })
    api.PUT.mockResolvedValue(ok({ key: 'AGENT_NEWS_PROVIDER' }))
    const { w } = await mountHub()
    const card = w.get('[data-testid="agent-providers"]')
    expect(card.findAll('[data-agent]').map((s) => s.attributes('data-agent'))).toEqual([
      'NEWS',
      'VOICE',
      'RESEARCH',
    ])
    // The image worker stays OpenRouter-only: no provider choice is added for it.
    expect(card.text()).not.toContain('OPENROUTER_IMAGE_MODEL')
    expect(card.get('[data-agent="VOICE"]').text()).toContain('always run locally')
    const select = card.get('[data-key="AGENT_NEWS_PROVIDER"]').findComponent({ name: 'Select' })
    expect((select.props('options') as { value: string }[]).map((o) => o.value)).toEqual([
      'auto',
      'ollama',
      'openrouter',
      'anthropic',
      'gemini',
    ])
    select.vm.$emit('update:modelValue', 'gemini')
    await flushPromises()
    await card.get('[data-key="AGENT_NEWS_PROVIDER"] form').trigger('submit')
    await flushPromises()
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/settings/{key}', {
      params: { path: { key: 'AGENT_NEWS_PROVIDER' } },
      body: { value: 'gemini' },
    })
  })

  it('keeps working on a server without the settings manager', async () => {
    serve({})
    const { w } = await mountHub()
    expect(w.get('[data-testid="agent-providers"]').text()).toContain('no settings manager yet')
  })
})
