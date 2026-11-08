// Registering the Dhan account from the Dhan operations page: the admin types
// their own Client ID, the list is checked first, the server's OBSERVE account is
// shown, errors are explained, and the page re-reads the account and session.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() }))
vi.mock('@/api/client', () => ({ aureon: api }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/trading/stream', () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  live: { quotes: {} },
}))
vi.mock('@/control/approvals', () => ({
  approvals: { items: [], loaded: true, error: '' },
}))

import CcDhanAccount from './CcDhanAccount.vue'
import CcDhan from './CcDhan.vue'

const res = (data: unknown, status = 200) => ({
  data: status < 400 ? data : undefined,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status },
})

const CREATED = {
  id: 'acc-1',
  broker: 'dhan',
  account_id: '1100123456',
  label: 'Dhan Primary',
  owner_user_id: 'u-1',
  mode: 'OBSERVE',
  mode_changed_at: null,
  base_currency: 'INR',
  is_active: true,
  created_at: '2026-11-08T10:00:00Z',
}
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

let accounts: unknown[] = []
const gets = () => api.GET.mock.calls.map(([p]) => p as string)

function serve() {
  api.GET.mockImplementation(async (path: string) => {
    if (path === '/api/trading/accounts') return res({ items: accounts, total: accounts.length, limit: 500, offset: 0 })
    if (path === '/api/v1/dhan/auth/status') return res(SESSION)
    if (path === '/api/trading/accounts/{account_id}/health') return res({ broker: 'dhan', supported: true, ok: true, checked_at: null })
    if (path === '/api/trading/accounts/{account_id}/funds') return res({ as_of: new Date().toISOString() })
    if (path === '/api/agents') return res({ agents: [] })
    if (path === '/api/v1/repairs/incidents' || path === '/api/v1/approvals') return res({ items: [] })
    return res({ detail: 'Not Found' }, 404)
  }) // prettier-ignore
}

const stubs = { teleport: true }

async function fill(w: VueWrapper, clientId: string) {
  await w.get('[data-testid="dhan-account-open"]').trigger('click')
  await flushPromises()
  await w.get('[data-testid="dhan-client-id"] input').setValue(clientId)
  await w.get('[data-testid="dhan-account-form"]').trigger('submit')
  await flushPromises()
}

describe('<CcDhanAccount />', () => {
  beforeEach(() => {
    api.GET.mockReset()
    api.POST.mockReset()
    accounts = []
    serve()
  })

  it('asks for the Client ID and registers the account in OBSERVE mode', async () => {
    api.POST.mockResolvedValue(res(CREATED, 201))
    const w = mount(CcDhanAccount, { global: { stubs } })
    await fill(w, ' 1100123456 ')
    // The list was read before posting.
    expect(gets()).toContain('/api/trading/accounts')
    expect(api.POST).toHaveBeenCalledWith('/api/trading/accounts', {
      body: {
        broker: 'dhan',
        account_id: '1100123456',
        label: 'Dhan Primary',
        base_currency: 'INR',
      },
    })
    expect(w.get('[data-testid="dhan-account-mode"]').text()).toContain('OBSERVE')
    expect(w.get('[data-testid="dhan-account-done"]').text()).toContain('••••3456')
    expect(w.text()).not.toContain('1100123456') // the full Client ID is not shown back
    expect(w.emitted('registered')?.[0]?.[0]).toEqual(CREATED)
  })

  it('requires the Client ID and sends nothing without it', async () => {
    const w = mount(CcDhanAccount, { global: { stubs } })
    await fill(w, '')
    expect(w.text()).toContain('Enter your Dhan Client ID.')
    expect(api.GET).not.toHaveBeenCalled()
    expect(api.POST).not.toHaveBeenCalled()
  })

  it('does not post when an active Dhan account already exists', async () => {
    accounts = [CREATED]
    const w = mount(CcDhanAccount, { global: { stubs } })
    await fill(w, '1100999999')
    expect(api.POST).not.toHaveBeenCalled()
    expect(w.get('[data-testid="dhan-account-message"]').text()).toContain('already registered')
    expect(w.emitted('exists')).toBeTruthy()
  })

  it.each([
    [409, { detail: 'account already registered' }, 'already registered'],
    [401, { detail: 'Not authenticated' }, 'Sign in again'],
    [403, { detail: 'admin only' }, 'Only an admin'],
    [500, { detail: 'boom' }, 'Aureon answered 500'],
  ])('explains a %i answer', async (status, body, text) => {
    api.POST.mockResolvedValue(res(body, status))
    const w = mount(CcDhanAccount, { global: { stubs } })
    await fill(w, '1100123456')
    expect(w.get('[data-testid="dhan-account-message"]').text()).toContain(text)
    expect(w.find('[data-testid="dhan-account-done"]').exists()).toBe(false)
  })

  it('puts a 422 validation error on its field', async () => {
    api.POST.mockResolvedValue(
      res({ detail: [{ loc: ['body', 'account_id'], msg: 'String should match pattern' }] }, 422),
    )
    const w = mount(CcDhanAccount, { global: { stubs } })
    await fill(w, '1100123456')
    expect(w.text()).toContain('String should match pattern')
  })

  it('offers no secret field: only the Client ID and a label are typed', async () => {
    const w = mount(CcDhanAccount, { global: { stubs } })
    await w.get('[data-testid="dhan-account-open"]').trigger('click')
    await flushPromises()
    const inputs = w.findAll('input')
    expect(inputs).toHaveLength(2)
    expect(inputs.every((i) => i.attributes('type') !== 'password')).toBe(true)
    expect(w.text()).toMatch(/No password, token or API key/)
  })
})

describe('<CcDhan /> registration', () => {
  beforeEach(() => {
    api.GET.mockReset()
    api.POST.mockReset()
    accounts = []
    serve()
  })

  it('offers registration only while no active Dhan account is registered', async () => {
    accounts = [CREATED]
    const w = mount(CcDhan, { global: { stubs } })
    await flushPromises()
    expect(w.find('[data-testid="dhan-account-register"]').exists()).toBe(false)
  })

  it('re-reads the accounts, session and health after registering', async () => {
    const w = mount(CcDhan, { global: { stubs } })
    await flushPromises()
    expect(w.find('[data-testid="dhan-account-register"]').exists()).toBe(true)
    api.POST.mockImplementation(async () => {
      accounts = [CREATED]
      return res(CREATED, 201)
    })
    api.GET.mockClear()
    await fill(w, '1100123456')
    await flushPromises()
    const after = gets()
    expect(after.filter((p) => p === '/api/trading/accounts').length).toBeGreaterThanOrEqual(3) // check, ops view, session bar
    expect(after).toContain('/api/v1/dhan/auth/status')
    expect(after).toContain('/api/trading/accounts/{account_id}/health')
    // The confirmation stays, with the server's mode; the session bar shows the account.
    expect(w.get('[data-testid="dhan-account-mode"]').text()).toContain('OBSERVE')
    expect(w.get('[data-testid="dhan-identity"]').text()).toContain('OBSERVE')
    // Nothing else was posted: no mode change, no order.
    expect(api.POST).toHaveBeenCalledTimes(1)
  })
})
