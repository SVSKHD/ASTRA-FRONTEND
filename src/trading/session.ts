// The trading panel's own Aureon sign-in gate.
//
// The panel reads everything from Aureon_Agentic, which needs ITS cookie
// session. With VITE_AUTH_PROVIDER=aureon (stage 2) that is the app's session
// already; with Supabase sign-in still the default, the owner signs in to Aureon
// here once, separately. Either way the check is the same: GET /api/auth/me.

import { reactive } from 'vue'
import { aureon, errorMessage, onUnauthorized } from '@/api/client'
import * as aureonSession from '@/auth/aureonSession'
import type { AureonUser } from '@/types'

export const tradingSession = reactive({
  checked: false,
  busy: false,
  user: null as AureonUser | null,
  role: '' as string,
  error: '',
})

let watching = false

export async function checkSession(): Promise<void> {
  tradingSession.busy = true
  try {
    const { data, error, response } = await aureon.GET('/api/auth/me')
    if (data) {
      tradingSession.user = aureonSession.toAureonUser(data)
      tradingSession.role = data.role
      tradingSession.error = ''
    } else {
      tradingSession.user = null
      tradingSession.error =
        response.status === 401 ? '' : errorMessage(error, `Aureon answered ${response.status}.`)
    }
  } catch {
    tradingSession.user = null
    tradingSession.error = 'Aureon is unreachable. Check the connection.'
  } finally {
    tradingSession.busy = false
    tradingSession.checked = true
  }
  if (!watching) {
    watching = true
    onUnauthorized((path) => {
      if (path.endsWith('/api/auth/login')) return
      if (tradingSession.user) tradingSession.error = 'Your Aureon session ended. Sign in again.'
      tradingSession.user = null
    })
  }
}

export async function signIn(email: string, passcode: string): Promise<void> {
  if (!email.trim() || !passcode) {
    tradingSession.error = 'Enter your email and passcode.'
    return
  }
  tradingSession.busy = true
  tradingSession.error = ''
  const res = await aureonSession.login(email.trim(), passcode)
  tradingSession.busy = false
  if (res.ok) await checkSession()
  else tradingSession.error = res.message
}

export function isAdmin(): boolean {
  return tradingSession.role === 'admin'
}
