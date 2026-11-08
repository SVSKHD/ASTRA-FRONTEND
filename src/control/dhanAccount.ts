// Registering the Dhan account (POST /api/trading/accounts) from the Dhan
// operations page.
//
// The admin types their own Dhan Client ID. The browser never reads it from the
// server's settings (DHAN_CLIENT_ID stays on the server) and no token, key or
// secret is involved: registration only records which account Aureon watches.
// The server creates every account in OBSERVE mode (read-only: no order is
// placed); this page shows that mode from the server's answer and never changes
// it.
//
// Before posting, the account list is read again: if an active Dhan account is
// already registered, nothing is sent. The server is still the judge (409 when
// the same Client ID is registered, even inactive).
import type { components } from '@/api/client'

export type Account = components['schemas']['AccountOut']

/** The server's rule for `account_id` (AccountCreate), checked before sending. */
const ACCOUNT_ID = /^[A-Za-z0-9._:-]+$/
export const CLIENT_ID_MAX = 64
export const LABEL_MAX = 100
export const DEFAULT_LABEL = 'Dhan Primary'
export const BASE_CURRENCY = 'INR'

export interface Draft {
  clientId: string
  label: string
}

export type FieldErrors = Partial<Record<keyof Draft, string>>

/** What the admin typed, checked the way the server will check it. */
export function validate(d: Draft): FieldErrors {
  const e: FieldErrors = {}
  const id = d.clientId.trim()
  if (!id) e.clientId = 'Enter your Dhan Client ID.'
  else if (id.length > CLIENT_ID_MAX) e.clientId = `At most ${CLIENT_ID_MAX} characters.`
  else if (!ACCOUNT_ID.test(id)) {
    e.clientId = 'Letters, digits and . _ : - only, no spaces.'
  }
  if (d.label.trim().length > LABEL_MAX) e.label = `At most ${LABEL_MAX} characters.`
  return e
}

/** The request body, exactly the shape the endpoint takes. */
export function payload(d: Draft) {
  return {
    broker: 'dhan' as const,
    account_id: d.clientId.trim(),
    label: d.label.trim() || DEFAULT_LABEL,
    base_currency: BASE_CURRENCY,
  }
}

/** The active Dhan account, if one is registered. */
export function activeDhan(items: readonly Account[]): Account | null {
  return items.find((a) => a.broker === 'dhan' && a.is_active) ?? null
}

/** Field errors from FastAPI's 422 body (`detail: [{loc, msg}]`). */
export function fieldErrors(body: unknown): FieldErrors {
  const out: FieldErrors = {}
  const detail = (body as { detail?: unknown } | undefined)?.detail
  if (!Array.isArray(detail)) return out
  for (const item of detail) {
    const loc = (item as { loc?: unknown[] }).loc ?? []
    const msg = String((item as { msg?: unknown }).msg ?? 'Not accepted.')
    const field = loc[loc.length - 1]
    if (field === 'account_id') out.clientId = msg
    else if (field === 'label') out.label = msg
  }
  return out
}

export type Outcome =
  | { kind: 'registered'; account: Account }
  | { kind: 'exists'; account: Account | null; text: string }
  | { kind: 'invalid'; errors: FieldErrors; text: string }
  | { kind: 'denied'; text: string }
  | { kind: 'failed'; text: string }

type Res<T> = { data?: T; error?: unknown; response: Response }
export interface AccountsApi {
  list(): Promise<Res<{ items: Account[] }>>
  create(body: ReturnType<typeof payload>): Promise<Res<Account>>
}

/** Read the list, then register only if no active Dhan account exists. */
export async function register(api: AccountsApi, d: Draft): Promise<Outcome> {
  const errors = validate(d)
  if (Object.keys(errors).length) {
    return { kind: 'invalid', errors, text: 'Fix the highlighted field.' }
  }
  const denied = (status: number) =>
    status === 401
      ? 'Your Spasta session has ended. Sign in again, then register the account.'
      : 'Only an admin can register a Dhan account.'

  let listed: Res<{ items: Account[] }>
  try {
    listed = await api.list()
  } catch {
    return { kind: 'failed', text: 'Aureon could not be reached. Nothing was registered.' }
  }
  if (listed.response.status === 401 || listed.response.status === 403) {
    return { kind: 'denied', text: denied(listed.response.status) }
  }
  if (!listed.data || !listed.response.ok) {
    return {
      kind: 'failed',
      text: `Could not check the registered accounts (Aureon answered ${listed.response.status}). Nothing was registered.`,
    }
  }
  const existing = activeDhan(listed.data.items)
  if (existing) {
    return {
      kind: 'exists',
      account: existing,
      text: 'A Dhan account is already registered and active. Nothing was sent.',
    }
  }

  let r: Res<Account>
  try {
    r = await api.create(payload(d))
  } catch {
    return {
      kind: 'failed',
      text: 'Aureon could not be reached. Refresh to see whether the account was registered.',
    }
  }
  const s = r.response.status
  if (r.data && r.response.ok) return { kind: 'registered', account: r.data }
  if (s === 409) {
    return {
      kind: 'exists',
      account: null,
      text: 'This Dhan Client ID is already registered (it may be inactive). Nothing was changed.',
    }
  }
  if (s === 401 || s === 403) return { kind: 'denied', text: denied(s) }
  if (s === 422) {
    const fe = fieldErrors(r.error)
    return { kind: 'invalid', errors: fe, text: 'Aureon did not accept these details.' }
  }
  return { kind: 'failed', text: `Aureon answered ${s}. Nothing was registered.` }
}
