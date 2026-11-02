// Where Aureon_Agentic (the self-hosted backend) lives.
//
// Empty means same origin, which is the production shape: nginx serves the SPA
// and routes /api/* to the API on 127.0.0.1:8000. Same origin is not optional —
// the session and CSRF cookies are SameSite=Strict (and __Host- prefixed over
// https), so a cross-origin API would never receive them.

export const AUREON_API_URL = String(import.meta.env.VITE_AUREON_API_URL ?? '').replace(/\/+$/, '')

/** Absolute or same-origin URL for an API path ("/api/..."). */
export function apiUrl(path: string): string {
  return `${AUREON_API_URL}${path}`
}
