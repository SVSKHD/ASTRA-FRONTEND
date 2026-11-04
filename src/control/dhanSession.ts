// Dhan API key login (backend docs/11-dhan.md, "Log in with the API key").
//
// The pure half: what the session banner says, and reading Dhan's return from
// the URL. No token ever reaches the browser: the server keeps the session and
// only reports whether it is valid and until when.
//
// Flow: "Log in to Dhan" → POST /api/v1/dhan/auth/start → the browser goes to
// Dhan's consent page → Dhan sends it back to /api/v1/dhan/auth/callback, which
// redirects to /dev/settings?dhan_token_id=… → this page POSTs /consume.
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

export interface Callback {
  tokenId: string | null
  error: string | null
}

const ID_RE = /^[A-Za-z0-9._-]{8,256}$/

/** Dhan's return, as the backend callback hands it to /dev/settings. */
export function readCallback(query: Record<string, unknown>): Callback {
  const raw = query.dhan_token_id
  const tokenId = typeof raw === 'string' && ID_RE.test(raw) ? raw : null
  const err = query.dhan_error
  const error =
    typeof err === 'string' ? err : raw !== undefined && !tokenId ? 'bad_callback' : null
  return { tokenId, error }
}

/** Plain-language refusals for the server's codes. */
export function loginRefusal(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'dhan_api_key_missing':
      return 'Set DHAN_CLIENT_ID, DHAN_API_KEY and DHAN_API_SECRET below first.'
    case 'no_pending_login':
      return 'That Dhan login was not started from this browser session, or it timed out. Start again.'
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

export async function finishLogin(tokenId: string): Promise<DhanStatus | { error: string }> {
  const r = await aureon.POST('/api/v1/dhan/auth/consume', { body: { token_id: tokenId } })
  if (r.data) return r.data
  return { error: loginRefusal(codeOf(r.error), 'The Dhan login could not be completed.') }
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
