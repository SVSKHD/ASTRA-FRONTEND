// The Dhan connection card: an unreadable status says "unavailable" (never
// "disconnected"), the identity is masked and verified by Dhan's own answer, and
// Disconnect asks first and then shows the server's new state.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() }))
const nav = vi.hoisted(() => ({ query: {} as Record<string, unknown>, replace: vi.fn() }))
vi.mock('@/api/client', () => ({ aureon: api }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: nav.query }),
  useRouter: () => ({ replace: nav.replace }),
}))

import DhanSessionBar from './DhanSessionBar.vue'
import { clearDhanReturn, pendingDhanReturn, rememberDhanReturn } from '@/control/dhanSession'

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
    api.POST.mockReset()
    api.DELETE.mockReset()
    nav.query = {}
    nav.replace.mockReset()
    clearDhanReturn()
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

  describe('finishing a Dhan login (Settings page)', () => {
    const props = { admin: true, detailed: true, finishCallback: true }
    const consumeCalls = () =>
      api.POST.mock.calls.filter(([path]) => path === '/api/v1/dhan/auth/consume')

    it('finishes the server-side handoff without ever seeing the tokenId', async () => {
      serve({ supported: true, ok: true })
      api.POST.mockResolvedValue(res(SESSION))
      nav.query = { dhan_login: 'ready', tab: 'dhan' }
      rememberDhanReturn(nav.query) // the router guard
      const w = mount(DhanSessionBar, { props, global: { stubs } })
      await flushPromises()
      expect(consumeCalls()).toEqual([['/api/v1/dhan/auth/consume', {}]])
      expect(w.text()).toContain('Logged in to Dhan.')
      expect(nav.replace).toHaveBeenCalledWith({ query: { tab: 'dhan' } })
      expect(pendingDhanReturn()).toBe(false)
    })

    it('resumes after the admin signed in to Aureon again (no query left)', async () => {
      serve({ supported: true, ok: true })
      rememberDhanReturn({ dhan_login: 'ready' })
      // First attempt: the Aureon session had ended.
      api.POST.mockResolvedValueOnce(res({ detail: 'not authenticated' }, 401))
      const first = mount(DhanSessionBar, { props, global: { stubs } })
      await flushPromises()
      expect(first.text()).toContain('Sign in again to finish the Dhan login')
      expect(pendingDhanReturn()).toBe(true) // kept for after the sign-in
      first.unmount()
      // Signed in again: the page mounts once more and finishes the same login.
      api.POST.mockResolvedValueOnce(res(SESSION))
      const second = mount(DhanSessionBar, { props, global: { stubs } })
      await flushPromises()
      expect(second.text()).toContain('Logged in to Dhan.')
      expect(consumeCalls()).toHaveLength(2)
      expect(pendingDhanReturn()).toBe(false)
    })

    it.each([
      ['login_expired', 409, 'expired', false],
      ['login_already_used', 409, 'already completed', false],
      ['dhan_client_mismatch', 403, 'different client id', false],
      ['dhan_login_other_user', 403, 'another Aureon account', true],
    ])(
      'explains %s and only keeps the login while it can still be finished',
      async (code, st, text, kept) => {
        serve({ supported: true, ok: true })
        rememberDhanReturn({ dhan_login: 'ready' })
        api.POST.mockResolvedValue(res({ detail: { code, detail: 'server words' } }, st))
        const w = mount(DhanSessionBar, { props, global: { stubs } })
        await flushPromises()
        expect(w.text()).toContain(text)
        expect(pendingDhanReturn()).toBe(kept)
      },
    )

    it('keeps the login when Dhan was briefly unreachable, so it can be retried', async () => {
      serve({ supported: true, ok: true })
      rememberDhanReturn({ dhan_login: 'ready' })
      api.POST.mockResolvedValue(
        res({ detail: { code: 'dhan_unavailable', detail: 'x', retry: true } }, 502),
      )
      const w = mount(DhanSessionBar, { props, global: { stubs } })
      await flushPromises()
      expect(w.text()).toContain('could not be reached')
      expect(pendingDhanReturn()).toBe(true)
    })

    it('shows the callback error and never calls consume for it', async () => {
      serve({ supported: true, ok: true })
      nav.query = { dhan_error: 'no_pending_login' }
      const w = mount(DhanSessionBar, { props, global: { stubs } })
      await flushPromises()
      expect(w.text()).toContain('No Dhan login was started from this browser')
      expect(consumeCalls()).toHaveLength(0)
    })

    it('still finishes a login from an older server that put the tokenId in the URL', async () => {
      serve({ supported: true, ok: true })
      api.POST.mockResolvedValue(res(SESSION))
      nav.query = { dhan_token_id: '7f3c2a10-9e8b-4d2c-a111-0123456789ab' }
      mount(DhanSessionBar, { props, global: { stubs } })
      await flushPromises()
      expect(consumeCalls()).toEqual([
        [
          '/api/v1/dhan/auth/consume',
          { body: { token_id: '7f3c2a10-9e8b-4d2c-a111-0123456789ab' } },
        ],
      ])
      expect(nav.replace).toHaveBeenCalledWith({ query: {} })
    })

    it('does nothing on a plain visit', async () => {
      serve({ supported: true, ok: true })
      mount(DhanSessionBar, { props, global: { stubs } })
      await flushPromises()
      expect(consumeCalls()).toHaveLength(0)
    })
  })
})
