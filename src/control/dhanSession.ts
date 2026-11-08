// Dhan API key login (backend docs/11-dhan.md, "Log in with the API key").
//
// The pure half: what the session banner says, and reading Dhan's return from
// the URL. No token ever reaches the browser: the server keeps the session and
// only reports whether it is valid and until when.
//
// Flow: "Log in to Dhan" → POST /api/v1/dhan/auth/start (the server sets a
// one-time, HttpOnly login cookie) → the browser goes to Dhan's consent page →
// Dhan sends it back to /api/v1/dhan/auth/callback, which keeps Dhan's tokenId on
// the server and redirects to /dev/settings?dhan_login=ready → this page POSTs
// /consume. If the Aureon session expired meanwhile, the page asks the admin to
// sign in again and then finishes the login: the server binds it to the admin
// (not the session), and `rememberDhanReturn` keeps a non-secret "resume" marker
// in sessionStorage so the login is finished even if the query string is lost.
import { aureon } from '@/api/client'
import type { Schemas } from '@/control/api'

export type DhanStatus = Schemas['StatusOut']
export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

export interface Summary {
  tone: Tone
  text: string
  /** Show the "Log in to Dhan" button prominently. */
  needsLogin: boolean
}

const TIME = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '' : TIME.format(t)
}

/** One line for the banner on /settings and /trading. */
export function summarize(s: DhanStatus, now = Date.now()): Summary {
  if (!s.client_id_set) {
    return { tone: 'neutral', text: 'Dhan is not set up (no DHAN_CLIENT_ID).', needsLogin: false }
  }
  const until = s.valid_until ? Date.parse(s.valid_until) : NaN
  const left = Number.isNaN(until) ? '' : ` (${minutesLeft(until - now)})`
  if (s.source === 'session') {
    return {
      tone: s.expires_soon ? 'warning' : 'success',
      text: `Dhan session expires at ${formatTime(s.valid_until)}${left}.`,
      needsLogin: s.expires_soon,
    }
  }
  if (s.source === 'manual') {
    const at = s.valid_until ? ` until ${formatTime(s.valid_until)}` : ''
    return {
      tone: s.expires_soon ? 'warning' : 'info',
      text: `Using the manual DHAN_ACCESS_TOKEN${at}. Log in to Dhan for a session.`,
      needsLogin: true,
    }
  }
  const expired = s.session_expired
    ? `Dhan session expired at ${formatTime(s.session_expires_at)}.`
    : 'No Dhan session.'
  return { tone: 'danger', text: `${expired} Trading data is stale.`, needsLogin: true }
}

function minutesLeft(ms: number): string {
  if (ms <= 0) return 'expired'
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m} min left`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min left`
}

// --- the connection's state, for the Settings connection card -------------------------------

export type ConnectionState =
  | 'unavailable' // the status could not be read (server down, 5xx, network)
  | 'not_configured' // no DHAN_CLIENT_ID on the server
  | 'disconnected' // configured, but no session and no manual token
  | 'expired' // the login session lapsed
  | 'invalid' // a session/token exists but Dhan refused it (account health)
  | 'expiring' // valid, inside the server's expires_soon window
  | 'connected' // valid; `verified` says whether Dhan itself confirmed it

export interface AccountCheck {
  supported: boolean
  ok: boolean
  detail?: string | null
  checked_at?: string | null
}

export interface Connection {
  state: ConnectionState
  tone: Tone
  label: string
  text: string
  /** Dhan answered an authenticated call with this session (GET /accounts/{id}/health). */
  verified: boolean
  /** Which actions the backend contract supports right now. */
  canConnect: boolean
  canReconnect: boolean
  /** DELETE /dhan/auth/session forgets a login session only; a manual token stays in Settings. */
  canDisconnect: boolean
}

export const CONNECTION_LABEL: Record<ConnectionState, string> = {
  unavailable: 'Unavailable',
  not_configured: 'Not set up',
  disconnected: 'Disconnected',
  expired: 'Expired',
  invalid: 'Invalid',
  expiring: 'Expires soon',
  connected: 'Connected',
}

/**
 * One state for the connection, from the server's own answers only:
 * GET /dhan/auth/status (session) and, when an account is registered,
 * GET /accounts/{id}/health (whether Dhan accepted it). Nothing is inferred
 * from the browser; a status that could not be read is "unavailable", never
 * "disconnected".
 */
export function connectionState(
  s: DhanStatus | null,
  check: AccountCheck | null = null,
): Connection {
  const base = { verified: false, canConnect: false, canReconnect: false, canDisconnect: false }
  if (!s) {
    return {
      ...base,
      state: 'unavailable',
      tone: 'warning',
      label: CONNECTION_LABEL.unavailable,
      text: 'The Dhan connection status could not be read from Aureon. Nothing was changed; try Refresh.',
    }
  }
  const login = s.api_key_configured
  if (!s.client_id_set) {
    return {
      ...base,
      state: 'not_configured',
      tone: 'neutral',
      label: CONNECTION_LABEL.not_configured,
      text: 'Set DHAN_CLIENT_ID, DHAN_API_KEY and DHAN_API_SECRET in the Dhan settings below.',
    }
  }
  if (s.source === 'none') {
    const expired = s.session_expired
    return {
      ...base,
      state: expired ? 'expired' : 'disconnected',
      tone: expired ? 'danger' : 'neutral',
      label: CONNECTION_LABEL[expired ? 'expired' : 'disconnected'],
      text: expired
        ? `The Dhan session expired ${formatTime(s.session_expires_at)}. Reconnect to refresh trading data.`
        : login
          ? 'No Dhan session. Connect to log in on Dhan’s own page.'
          : 'No Dhan session. Set DHAN_API_KEY and DHAN_API_SECRET below to connect.',
      canConnect: login && !expired,
      canReconnect: login && expired,
    }
  }
  const session = s.source === 'session'
  const what = session ? 'Login session' : 'Manual access token'
  if (check?.supported && !check.ok) {
    return {
      ...base,
      state: 'invalid',
      tone: 'danger',
      label: CONNECTION_LABEL.invalid,
      text: `${what} is set, but Dhan refused it${check.detail ? `: ${check.detail}` : ''}. Reconnect to replace it.`,
      canReconnect: login,
      canDisconnect: session,
    }
  }
  const verified = !!check?.supported && check.ok
  const until = s.valid_until ? ` until ${formatTime(s.valid_until)}` : ''
  const proof = verified ? ' Dhan accepted it.' : check ? '' : ' Not yet checked against Dhan.'
  return {
    ...base,
    state: s.expires_soon ? 'expiring' : 'connected',
    tone: s.expires_soon ? 'warning' : 'success',
    label: CONNECTION_LABEL[s.expires_soon ? 'expiring' : 'connected'],
    text: `${what} valid${until}.${proof}${session ? '' : ' Log in to Dhan for a session.'}`,
    verified,
    canReconnect: login,
    canDisconnect: session,
  }
}

/** "••••1234": enough to recognise an account id, never the whole of it. */
export function maskId(id: string | null | undefined): string {
  if (!id) return ''
  const tail = id.slice(-4)
  return id.length > 4 ? `••••${tail}` : '••••'
}

export interface Callback {
  /** The server kept Dhan's return for this login: POST /consume to finish it. */
  ready: boolean
  /** Older servers handed the tokenId to the page itself. */
  tokenId: string | null
  error: string | null
}

const ID_RE = /^[A-Za-z0-9._-]{8,256}$/
const CODE_RE = /^[a-z_]{1,40}$/

/** Dhan's return, as the backend callback hands it to /dev/settings. */
export function readCallback(query: Record<string, unknown>): Callback {
  const raw = query.dhan_token_id
  const tokenId = typeof raw === 'string' && ID_RE.test(raw) ? raw : null
  const ready = query.dhan_login === 'ready'
  const err = query.dhan_error
  const error =
    typeof err === 'string'
      ? CODE_RE.test(err)
        ? err
        : 'bad_callback'
      : raw !== undefined && !tokenId
        ? 'bad_callback'
        : null
  return { ready, tokenId, error }
}

export { clearDhanReturn, pendingDhanReturn, rememberDhanReturn, RESUME_MS } from './dhanReturn'

/** Plain-language refusals for the server's codes. */
export function loginRefusal(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'dhan_api_key_missing':
      return 'Set DHAN_CLIENT_ID, DHAN_API_KEY and DHAN_API_SECRET below first.'
    case 'no_pending_login':
      return 'No Dhan login was started from this browser (or it was already finished). Start again with “Connect”.'
    case 'login_expired':
      return 'The Dhan login took longer than 10 minutes and expired. Start again.'
    case 'login_already_used':
      return 'This Dhan login was already completed. Refresh to see the connection.'
    case 'login_not_returned':
      return 'Dhan has not sent this login back yet. Finish it on Dhan’s page, or start again.'
    case 'dhan_login_other_user':
      return 'This Dhan login was started by another Aureon account. Sign in as the admin who started it to finish it.'
    case 'duplicate_callback':
      return 'Dhan sent this login back twice with different results. Start again.'
    case 'token_mismatch':
      return 'That is not the login Dhan returned. Start again.'
    case 'dhan_token_rejected':
      return 'Dhan did not accept the new session. Nothing was saved; start again.'
    case 'unavailable':
      return 'The Dhan login service is unavailable right now. Try again in a minute.'
    case 'dhan_client_mismatch':
      return 'The Dhan login was for a different client id than DHAN_CLIENT_ID. Nothing was saved.'
    case 'dhan_refused':
      return 'Dhan refused the request. Check the API key and secret (they last 12 months).'
    case 'dhan_unavailable':
      return 'Dhan could not be reached. Try again in a minute.'
    case 'bad_callback':
    case 'bad_token_id':
      return 'Dhan sent back an unreadable login. Start again.'
    case 'rate_limited':
      return 'Too many Dhan logins started. Dhan allows 25 a day; try again later.'
    case 'settings_key_missing':
      return 'The server has no SETTINGS_MASTER_KEY, so a session cannot be stored.'
    default:
      return fallback
  }
}

function codeOf(error: unknown): string | undefined {
  const d = (error as { detail?: unknown } | undefined)?.detail
  if (d && typeof d === 'object' && 'code' in d && typeof d.code === 'string') return d.code
  return undefined
}

export async function loadStatus(): Promise<DhanStatus | null> {
  const r = await aureon.GET('/api/v1/dhan/auth/status')
  return r.data ?? null
}

/** Ask the server for Dhan's consent page; the caller sends the browser there. */
export async function startLogin(): Promise<{ url: string } | { error: string }> {
  const r = await aureon.POST('/api/v1/dhan/auth/start')
  if (r.data) return { url: r.data.login_url }
  return { error: loginRefusal(codeOf(r.error), 'The Dhan login could not start.') }
}

export interface FinishError {
  error: string
  code?: string
  /** The login is still pending on the server: trying again (later, or after signing in) may work. */
  retry: boolean
}

/** Codes after which the pending login is gone (or never existed): stop resuming. */
const FINAL = new Set([
  'no_pending_login',
  'login_expired',
  'login_already_used',
  'duplicate_callback',
  'token_mismatch',
  'dhan_client_mismatch',
  'dhan_token_rejected',
  'dhan_refused',
  'dhan_bad_response',
  'settings_key_missing',
])

/** Finish the login the server holds for this admin (the tokenId never passes through here,
 * except from an older server that put it in the URL). */
export async function finishLogin(tokenId?: string | null): Promise<DhanStatus | FinishError> {
  const r = await aureon.POST(
    '/api/v1/dhan/auth/consume',
    tokenId ? { body: { token_id: tokenId } } : {},
  )
  if (r.data) return r.data
  const code = codeOf(r.error)
  const detail = (r.error as { detail?: { retry?: unknown } } | undefined)?.detail
  const retry =
    r.response.status === 401 ||
    (typeof detail?.retry === 'boolean' ? detail.retry : !code || !FINAL.has(code))
  const error =
    r.response.status === 401
      ? 'Your Aureon session ended. Sign in again to finish the Dhan login.'
      : loginRefusal(code, 'The Dhan login could not be completed.')
  return { error, code, retry }
}

export async function logout(): Promise<DhanStatus | { error: string }> {
  const r = await aureon.DELETE('/api/v1/dhan/auth/session')
  if (r.data) return r.data
  return { error: 'Could not log out of Dhan.' }
}

/** Only Dhan's own consent page is followed (the server builds it from DHAN_AUTH_URL). */
export function isSafeLoginUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.pathname.endsWith('/login/consentApp-login')
  } catch {
    return false
  }
}
