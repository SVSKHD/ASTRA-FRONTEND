// A Dhan login that came back and still has to be finished (src/control/dhanSession.ts).
// Dependency-free on purpose: the router imports it on every navigation.
//
// Only a marker that a login is waiting: no tokenId, no state (those stay on the server and in
// an HttpOnly cookie). It lives as long as the server keeps the login (10 min).

const RESUME_KEY = 'aureon.dhan.loginReturn'
export const RESUME_MS = 10 * 60_000

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

/** Called for every navigation (router guard): note that Dhan sent the browser back. */
export function rememberDhanReturn(query: Record<string, unknown>, now = Date.now()): void {
  if (query.dhan_login !== 'ready') return
  try {
    storage()?.setItem(RESUME_KEY, String(now))
  } catch {
    // Private mode / quota: the query string still carries it.
  }
}

/** A Dhan login came back recently and has not been finished yet. */
export function pendingDhanReturn(now = Date.now()): boolean {
  const at = Number(storage()?.getItem(RESUME_KEY) ?? NaN)
  if (!Number.isFinite(at)) return false
  if (now - at > RESUME_MS || at > now + 60_000) {
    clearDhanReturn()
    return false
  }
  return true
}

export function clearDhanReturn(): void {
  try {
    storage()?.removeItem(RESUME_KEY)
  } catch {
    // nothing to clear
  }
}
