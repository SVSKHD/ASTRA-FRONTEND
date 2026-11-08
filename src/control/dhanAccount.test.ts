import { describe, expect, it, vi } from 'vitest'
import {
  activeDhan,
  fieldErrors,
  payload,
  register,
  validate,
  type Account,
  type AccountsApi,
} from '@/control/dhanAccount'

const acct = (over: Partial<Account> = {}): Account => ({
  id: '00000000-0000-0000-0000-000000000001',
  broker: 'dhan',
  account_id: '1100123456',
  label: 'Dhan Primary',
  owner_user_id: '00000000-0000-0000-0000-000000000009',
  mode: 'OBSERVE',
  mode_changed_at: null,
  base_currency: 'INR',
  is_active: true,
  created_at: '2026-11-08T10:00:00Z',
  ...over,
})
const res = <T>(status: number, data?: T, error?: unknown) => ({
  data: status < 400 ? data : undefined,
  error,
  response: { ok: status < 400, status } as Response,
})

function api(listed: ReturnType<typeof res>, created?: ReturnType<typeof res>) {
  return {
    list: vi.fn(async () => listed),
    create: vi.fn(async () => created ?? res(500)),
  } as unknown as AccountsApi & { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
}

const draft = { clientId: ' 1100123456 ', label: '' }

describe('Dhan account registration', () => {
  it('checks the Client ID the way the server does', () => {
    expect(validate({ clientId: '', label: '' }).clientId).toMatch(/Enter your Dhan Client ID/)
    expect(validate({ clientId: '11 00', label: '' }).clientId).toMatch(/no spaces/)
    expect(validate({ clientId: 'x'.repeat(65), label: '' }).clientId).toMatch(/64/)
    expect(validate({ clientId: '1100123456', label: 'y'.repeat(101) }).label).toMatch(/100/)
    expect(validate({ clientId: '1100123456', label: 'Dhan Primary' })).toEqual({})
  })

  it('sends exactly broker, Client ID, label and INR, and nothing secret', () => {
    expect(payload(draft)).toEqual({
      broker: 'dhan',
      account_id: '1100123456',
      label: 'Dhan Primary',
      base_currency: 'INR',
    })
    expect(Object.keys(payload(draft)).sort()).toEqual([
      'account_id',
      'base_currency',
      'broker',
      'label',
    ])
  })

  it('finds only an active Dhan account', () => {
    expect(activeDhan([acct({ broker: 'mt5' }), acct({ is_active: false })])).toBeNull()
    expect(activeDhan([acct({ broker: 'mt5' }), acct()])?.broker).toBe('dhan')
  })

  it('registers when no active Dhan account exists and returns the server’s OBSERVE account', async () => {
    const a = api(
      res(200, { items: [acct({ is_active: false, account_id: 'OLD1' })] }),
      res(201, acct()),
    )
    const r = await register(a, draft)
    expect(r).toEqual({ kind: 'registered', account: acct() })
    expect(a.create).toHaveBeenCalledWith(payload(draft))
    if (r.kind === 'registered') expect(r.account.mode).toBe('OBSERVE')
  })

  it('does not post when an active Dhan account is already registered', async () => {
    const a = api(res(200, { items: [acct()] }))
    const r = await register(a, draft)
    expect(r.kind).toBe('exists')
    expect(a.create).not.toHaveBeenCalled()
  })

  it('does not post an invalid Client ID', async () => {
    const a = api(res(200, { items: [] }))
    const r = await register(a, { clientId: 'bad id', label: '' })
    expect(r.kind).toBe('invalid')
    expect(a.list).not.toHaveBeenCalled()
    expect(a.create).not.toHaveBeenCalled()
  })

  it('handles 409 already registered', async () => {
    const r = await register(
      api(res(200, { items: [] }), res(409, undefined, { detail: 'account already registered' })),
      draft,
    )
    expect(r.kind).toBe('exists')
    if (r.kind === 'exists') expect(r.text).toMatch(/already registered/)
  })

  it('handles 401 and 403 on the check and on the registration', async () => {
    for (const s of [401, 403]) {
      const onList = await register(api(res(s)), draft)
      expect(onList.kind).toBe('denied')
      const onCreate = await register(api(res(200, { items: [] }), res(s)), draft)
      expect(onCreate.kind).toBe('denied')
    }
    const r401 = await register(api(res(401)), draft)
    if (r401.kind === 'denied') expect(r401.text).toMatch(/Sign in again/)
    const r403 = await register(api(res(200, { items: [] }), res(403)), draft)
    if (r403.kind === 'denied') expect(r403.text).toMatch(/Only an admin/)
  })

  it('maps 422 validation errors to the fields', async () => {
    const body = {
      detail: [
        {
          loc: ['body', 'account_id'],
          msg: 'String should match pattern',
          type: 'string_pattern_mismatch',
        },
        { loc: ['body', 'label'], msg: 'too long', type: 'string_too_long' },
      ],
    }
    expect(fieldErrors(body)).toEqual({
      clientId: 'String should match pattern',
      label: 'too long',
    })
    const r = await register(api(res(200, { items: [] }), res(422, undefined, body)), draft)
    expect(r.kind).toBe('invalid')
    if (r.kind === 'invalid') expect(r.errors.clientId).toBe('String should match pattern')
  })

  it('reports an unreachable server or an unexpected answer without claiming success', async () => {
    const down = {
      list: vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
      create: vi.fn(),
    }
    expect((await register(down as unknown as AccountsApi, draft)).kind).toBe('failed')
    expect(down.create).not.toHaveBeenCalled()
    const r = await register(api(res(200, { items: [] }), res(500)), draft)
    expect(r.kind).toBe('failed')
  })
})
