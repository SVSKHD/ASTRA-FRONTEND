// The Dhan connection card: an unreadable status says "unavailable" (never
// "disconnected"), the identity is masked and verified by Dhan's own answer, and
// Disconnect asks first and then shows the server's new state.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() }))
vi.mock('@/api/client', () => ({ aureon: api }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}))

import DhanSessionBar from './DhanSessionBar.vue'

const res = (data: unknown, status = 200) => ({
  data: status < 400 ? data : undefined,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status },
})

const SESSION = {
  client_id_set: true,
  api_key_configured: true,
  redirect_url: null,
  session_active: true,
  session_expires_at: null,
  session_expired: false,
  source: 'session',
  valid_until: new Date(Date.now() + 3_600_000).toISOString(),
  expires_soon: false,
  data_stale: false,
}
const ACCOUNT = {
  id: 'acc-1',
  broker: 'dhan',
  account_id: '1100123456',
  label: 'Main',
  mode: 'OBSERVE',
  is_active: true,
}

function serve(health: { supported: boolean; ok: boolean; detail?: string } | null) {
  api.GET.mockImplementation(async (path: string) => {
    if (path === '/api/v1/dhan/auth/status') return res(SESSION)
    if (path === '/api/trading/accounts') return res({ items: [ACCOUNT] })
    if (path === '/api/trading/accounts/{account_id}/health')
      return health ? res({ broker: 'dhan', checked_at: null, ...health }) : res({}, 500)
    return res({ detail: 'Not Found' }, 404)
  })
}

const stubs = { teleport: true }

describe('<DhanSessionBar />', () => {
  beforeEach(() => {
    api.GET.mockReset()
    api.DELETE.mockReset()
  })

  it('says unavailable with Retry when the status cannot be read', async () => {
    api.GET.mockResolvedValue(res({ detail: 'boom' }, 502))
    const w = mount(DhanSessionBar, { props: { admin: true, detailed: true }, global: { stubs } })
    await flushPromises()
    const card = w.get('[data-testid="dhan-connection"]')
    expect(card.attributes('data-state')).toBe('unavailable')
    expect(w.text()).toContain('Retry')
    expect(w.text()).not.toContain('Disconnect')
  })

  it('shows a verified, masked identity and never the full client id', async () => {
    serve({ supported: true, ok: true })
    const w = mount(DhanSessionBar, { props: { admin: true, detailed: true }, global: { stubs } })
    await flushPromises()
    expect(w.get('[data-testid="dhan-connection"]').attributes('data-state')).toBe('connected')
    const id = w.get('[data-testid="dhan-identity"]').text()
    expect(id).toContain('••••3456')
    expect(id).toContain('by Dhan')
    expect(w.html()).not.toContain('1100123456')
  })

  it('is invalid when Dhan refuses the stored session', async () => {
    serve({ supported: true, ok: false, detail: 'DH-901' })
    const w = mount(DhanSessionBar, { props: { admin: true, detailed: true }, global: { stubs } })
    await flushPromises()
    expect(w.get('[data-testid="dhan-connection"]').attributes('data-state')).toBe('invalid')
    expect(w.text()).toContain('DH-901')
    expect(w.text()).toContain('Reconnect')
  })

  it('disconnects only after confirming, and shows the state the server returns', async () => {
    serve({ supported: true, ok: true })
    api.DELETE.mockResolvedValue(res({ ...SESSION, source: 'none', session_active: false }))
    const w = mount(DhanSessionBar, { props: { admin: true, detailed: true }, global: { stubs } })
    await flushPromises()
    const btn = () => w.findAll('button').filter((b) => b.text() === 'Disconnect')
    await btn()[0].trigger('click')
    expect(api.DELETE).not.toHaveBeenCalled()
    await btn().at(-1)!.trigger('click')
    await flushPromises()
    expect(api.DELETE).toHaveBeenCalledWith('/api/v1/dhan/auth/session')
    expect(w.get('[data-testid="dhan-connection"]').attributes('data-state')).toBe('disconnected')
    expect(w.text()).toContain('the server forgot the Dhan session')
  })
})
