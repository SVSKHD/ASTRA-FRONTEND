// Aureon_Agentic sign-in, used by the auth store when VITE_AUTH_PROVIDER=aureon.
//
// The session is an HttpOnly cookie the page never sees; the CSRF token is the
// readable cookie the API client echoes back (src/api/csrf.ts). So "am I signed
// in?" is answered by asking: GET /api/auth/me.

import { aureon, errorMessage } from '@/api/client'
import type { components } from '@/api/client'
import type { AureonUser } from '@/types'

type UserOut = components['schemas']['UserOut']

// The neutral default avatar tone (a status colour here would fail the theme test).
const AUREON_COLOR = 'oklch(0.7 0.02 260)'

export function toAureonUser(u: UserOut): AureonUser {
  const name = u.email.split('@')[0] || 'Owner'
  return {
    uid: u.id,
    name,
    email: u.email,
    provider: 'aureon',
    initial: name.charAt(0).toUpperCase() || 'O',
    color: AUREON_COLOR,
  }
}

export type SessionResult =
  { ok: true; user: AureonUser } | { ok: false; signedOut: boolean; message: string }

/** The current session, if any. A network failure is NOT a sign-out. */
export async function currentUser(): Promise<SessionResult> {
  try {
    const { data, error, response } = await aureon.GET('/api/auth/me')
    if (data) return { ok: true, user: toAureonUser(data) }
    return {
      ok: false,
      signedOut: response.status === 401,
      message: errorMessage(error, `Sign-in check failed (HTTP ${response.status}).`),
    }
  } catch {
    return { ok: false, signedOut: false, message: 'Aureon is unreachable. Check the connection.' }
  }
}

export async function login(email: string, passcode: string): Promise<SessionResult> {
  try {
    const { data, error, response } = await aureon.POST('/api/auth/login', {
      body: { email, password: passcode },
    })
    if (data) return { ok: true, user: toAureonUser(data.user) }
    // The API answers a wrong email and a wrong passcode the same way, on purpose.
    const message =
      response.status === 401
        ? 'That email and passcode do not match.'
        : response.status === 429
          ? 'Too many attempts. Wait a few minutes and try again.'
          : errorMessage(error, `Sign-in failed (HTTP ${response.status}).`)
    return { ok: false, signedOut: true, message }
  } catch {
    return { ok: false, signedOut: false, message: 'Aureon is unreachable. Check the connection.' }
  }
}

export async function logout(): Promise<void> {
  try {
    await aureon.POST('/api/auth/logout')
  } catch (error) {
    console.error('[Aureon] Sign-out request failed:', error)
  }
}
