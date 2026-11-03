// Migration stage 2: the auth store signing in through Aureon_Agentic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { authProvider } from '@/auth/provider'

const ME = {
  id: '6a0b1c2d-0000-4000-8000-000000000001',
  email: 'owner@spasta.online',
  role: 'admin',
  last_login_at: null,
}

type Handler = (req: Request) => Response | Promise<Response>
let handler: Handler
const calls: Request[] = []

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function store() {
  vi.resetModules()
  vi.stubEnv('VITE_AUTH_PROVIDER', 'aureon')
  vi.stubGlobal('fetch', async (input: Request) => {
    calls.push(input)
    return handler(input)
  })
  setActivePinia(createPinia())
  const { useAuthStore } = await import('./auth')
  const s = useAuthStore()
  await flushPromises()
  return s
}

beforeEach(() => {
  calls.length = 0
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  document.cookie = 'aureon_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})

describe('authProvider', () => {
  it('defaults to aureon and only accepts supabase explicitly', () => {
    expect(authProvider(undefined)).toBe('aureon')
    expect(authProvider('')).toBe('aureon')
    expect(authProvider(' Aureon ')).toBe('aureon')
    expect(authProvider(' Supabase ')).toBe('supabase')
    expect(authProvider('firebase')).toBe('aureon')
  })
})

describe('auth store with VITE_AUTH_PROVIDER=aureon', () => {
  it('restores an existing cookie session from /api/auth/me', async () => {
    handler = () => json(200, ME)
    const auth = await store()
    expect(new URL(calls[0].url).pathname).toBe('/api/auth/me')
    expect(calls[0].credentials).toBe('include')
    expect(auth.authReady).toBe(true)
    expect(auth.isSignedIn).toBe(true)
    expect(auth.authOpen).toBe(false)
    expect(auth.user?.email).toBe('owner@spasta.online')
    expect(auth.user?.provider).toBe('aureon')
    expect(auth.configurationReady).toBe(true)
  })

  it('treats 401 as signed out (no error) and a network failure as an error', async () => {
    handler = () => json(401, { detail: 'not authenticated' })
    let auth = await store()
    expect(auth.isSignedIn).toBe(false)
    expect(auth.authOpen).toBe(true)
    expect(auth.authError).toBe('')

    handler = () => {
      throw new TypeError('Failed to fetch')
    }
    calls.length = 0
    auth = await store()
    // A dropped connection on a read is retried (api/resilient.ts) before it is an error.
    await vi.waitFor(() => expect(auth.authError).toContain('unreachable'), { timeout: 5000 })
    expect(auth.isSignedIn).toBe(false)
    expect(calls).toHaveLength(3)
  })

  it('signs in with email + passcode, and reports a mismatch without saying which', async () => {
    handler = () => json(401, { detail: 'not authenticated' })
    const auth = await store()
    handler = () => json(401, { detail: 'invalid credentials' })
    await auth.loginWithPasscode('owner@spasta.online', 'wrong')
    expect(auth.authError).toBe('That email and passcode do not match.')
    expect(auth.isSignedIn).toBe(false)

    handler = () => json(200, { user: ME, csrf_token: 'tok', expires_at: '2026-11-03T00:00:00Z' })
    await auth.loginWithPasscode(' owner@spasta.online ', 'right')
    const sent = await calls.at(-1)!.clone().json()
    expect(sent).toEqual({ email: 'owner@spasta.online', password: 'right' })
    expect(auth.isSignedIn).toBe(true)
    expect(auth.authOpen).toBe(false)
    expect(auth.authError).toBe('')
  })

  it('returns to sign-in when any later call answers 401', async () => {
    handler = () => json(200, ME)
    const auth = await store()
    const { aureon } = await import('@/api/client')
    handler = () => json(401, { detail: 'session expired' })
    await aureon.GET('/api/trading/signals')
    expect(auth.isSignedIn).toBe(false)
    expect(auth.authOpen).toBe(true)
    expect(auth.authError).toBe('Your session ended. Sign in again.')
  })

  it('signs out through /api/auth/logout with the CSRF header', async () => {
    handler = () => json(200, ME)
    const auth = await store()
    document.cookie = 'aureon_csrf=csrf-1'
    handler = () => new Response(null, { status: 204 })
    await auth.signOut()
    const req = calls.at(-1)!
    expect(new URL(req.url).pathname).toBe('/api/auth/logout')
    expect(req.method).toBe('POST')
    expect(req.headers.get('x-csrf-token')).toBe('csrf-1')
    expect(auth.isSignedIn).toBe(false)
    expect(auth.authOpen).toBe(true)
  })

  it('says GitHub sign-in is not available instead of redirecting', async () => {
    handler = () => json(401, {})
    const auth = await store()
    await auth.loginGithub()
    expect(auth.authError).toContain('Not available with Aureon sign-in')
    expect(auth.githubSignInAvailable).toBe(false)
  })
})
