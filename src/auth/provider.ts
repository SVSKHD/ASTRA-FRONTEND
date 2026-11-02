// Which backend signs the owner in (migration stage 2).
//
//   VITE_AUTH_PROVIDER=aureon     (default) Aureon_Agentic: POST /api/auth/login, cookie session,
//                                 and the finance data on /api/finance (stage 3)
//   VITE_AUTH_PROVIDER=supabase   Supabase Auth and Supabase data, as before
//
// The default flipped to Aureon with stage 3 (docs/decisions.md, D-F1). The
// cookies are SameSite=Strict, so an Aureon build has to be served from the same
// origin as the API (nginx on spasta.online). A build hosted anywhere else, such
// as a Netlify deploy, sets VITE_AUTH_PROVIDER=supabase in its environment (D-F2).

export type AuthProvider = 'supabase' | 'aureon'

export function authProvider(
  env: string | undefined = import.meta.env.VITE_AUTH_PROVIDER,
): AuthProvider {
  return String(env ?? '')
    .trim()
    .toLowerCase() === 'supabase'
    ? 'supabase'
    : 'aureon'
}
