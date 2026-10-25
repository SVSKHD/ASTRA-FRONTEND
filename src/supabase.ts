// The one Supabase client (Supabase migration, phase 3: sign-in).
//
// Supabase is now the identity provider as well as the database. One client,
// shared by the sign-in store and the data adapter, so there is exactly one
// session: the token the data layer sends is the token the user signed in
// with, refreshed by supabase-js itself for REST and Realtime alike. (Under
// Firebase third-party auth that was two clients' worth of token plumbing, and
// the Realtime half of it went stale after an hour.)
//
// Loaded eagerly but small: supabase-js is already the app's data client.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
const key = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
).trim()

// Off under the test runner for the same reason Firebase is: a unit test that
// instantiates a store must not open a real session against a real project.
const isTestRunner = import.meta.env.MODE === 'test'

export const supabaseEnabled = Boolean(url && key) && !isTestRunner

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The OAuth redirect lands back on the app with the session in the URL.
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null

/**
 * The account in the session supabase-js keeps on this device, read without a
 * network call. Offline with an expired access token, supabase-js reports "no
 * session" yet keeps the stored one (a failed refresh is retryable), so this
 * is still the signed-in owner — the app opens offline as them, and the next
 * successful refresh confirms it. Null after a real sign-out, which removes
 * the stored session.
 */
export function storedSessionUser(): import('@supabase/supabase-js').User | null {
  if (!supabaseEnabled) return null
  try {
    // supabase-js's default storage key: sb-<project ref>-auth-token.
    const refId = new URL(url).hostname.split('.')[0]
    const raw = localStorage.getItem(`sb-${refId}-auth-token`)
    const parsed = raw ? (JSON.parse(raw) as { user?: { id?: string } }) : null
    return parsed?.user?.id ? (parsed.user as import('@supabase/supabase-js').User) : null
  } catch {
    return null
  }
}
