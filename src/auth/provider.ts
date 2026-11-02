// Which backend signs the owner in (migration stage 2).
//
//   VITE_AUTH_PROVIDER=supabase   (default) Supabase Auth, as before
//   VITE_AUTH_PROVIDER=aureon     Aureon_Agentic: POST /api/auth/login, cookie session
//
// The flag exists because the DATA still lives in Supabase until stage 3, and
// Supabase's row-level security needs a Supabase session. Flip it together with
// the finance data (docs/frontend-migration-checklist.md, stage 2 caveat).

export type AuthProvider = 'supabase' | 'aureon'

export function authProvider(
  env: string | undefined = import.meta.env.VITE_AUTH_PROVIDER,
): AuthProvider {
  return String(env ?? '')
    .trim()
    .toLowerCase() === 'aureon'
    ? 'aureon'
    : 'supabase'
}
