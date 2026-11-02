// The CSRF half of Aureon's cookie auth.
//
// Login sets two cookies: the session (HttpOnly, invisible here) and a CSRF
// token the page CAN read. Every unsafe request echoes the token back in the
// X-CSRF-Token header; a cross-site page cannot read our cookie, so it cannot
// forge the header. Over https the cookie is `__Host-aureon_csrf`; on plain-http
// LAN testing (COOKIE_SECURE=false) it is `aureon_csrf`.

const NAMES = ['__Host-aureon_csrf', 'aureon_csrf'] as const
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

export function readCsrfToken(cookie: string = globalThis.document?.cookie ?? ''): string | null {
  for (const part of cookie.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const name = part.slice(0, eq).trim()
    if ((NAMES as readonly string[]).includes(name)) {
      return decodeURIComponent(part.slice(eq + 1).trim())
    }
  }
  return null
}

export function needsCsrf(method: string): boolean {
  return !SAFE.has(method.toUpperCase())
}
