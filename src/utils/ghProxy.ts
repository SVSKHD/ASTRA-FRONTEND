// The client half of the GitHub integration's trust boundary (section 13a).
//
// NO GITHUB TOKEN EVER REACHES THIS FILE. Every call is a POST to the `ghProxy`
// Cloud Function, authenticated with the caller's Firebase ID token. The function
// resolves the GitHub App installation for that uid, pulls the installation token
// out of Secret Manager, calls GitHub, and returns only the response body plus the
// conditional-request/rate-limit metadata. The browser never holds an
// installation id secret, a PAT, or an OAuth token, and nothing token-shaped is
// ever written back into Firestore — `stripSecrets` below is the belt-and-braces
// check on that (acceptance 59).
//
// The transport is deliberately thin; everything worth testing (request shaping,
// response parsing, secret stripping, backoff) is pure and lives here too.

import { auth } from '@/firebase'

// The operations the Cloud Function exposes. Kept as a closed union so a typo is
// a compile error rather than a 400 at runtime.
export type GhOp =
  | 'installations' // repos visible to the installation, for the picker
  | 'repo' // one repo's metadata
  | 'issues' // list issues for a repo (conditional via etag)
  | 'issue' // one issue
  | 'createIssue'
  | 'patchIssue'
  | 'comment'
  | 'commits' // recent commits on the default branch
  | 'pulls' // open PRs with CI status
  | 'branches'
  | 'rateLimit'

export interface GhParams {
  owner?: string
  repo?: string
  number?: number
  title?: string
  body?: string
  state?: 'open' | 'closed'
  labels?: string[]
  assignees?: string[]
  perPage?: number
  since?: string
}

// What the function reports back about the shared rate limit, so Settings can
// show it and the poller can back off before GitHub starts refusing (13f).
export interface GhRateLimit {
  limit: number
  remaining: number
  // Epoch ms at which the window resets.
  resetAt: number
}

export interface GhResponse<T> {
  // 200/201 on a fresh body, 304 when the etag matched (costs no rate limit).
  status: number
  notModified: boolean
  data: T | null
  etag: string | null
  rateLimit: GhRateLimit | null
}

// Thrown when GitHub (or the proxy) refuses because the rate limit is spent. The
// caller pauses sync and shows it rather than failing silently.
export class GhRateLimitError extends Error {
  constructor(
    public readonly resetAt: number,
    message = 'GitHub rate limit exhausted',
  ) {
    super(message)
    this.name = 'GhRateLimitError'
  }
}

// Thrown when the integration is not configured (no proxy URL) or the caller is
// not signed in. Callers treat it as "GitHub is simply not set up here".
export class GhNotConfiguredError extends Error {
  constructor(message = 'GitHub proxy is not configured') {
    super(message)
    this.name = 'GhNotConfiguredError'
  }
}

export function ghProxyUrl(): string {
  return (import.meta.env.VITE_GH_PROXY_URL || '').trim()
}

export function ghAppSlug(): string {
  return (import.meta.env.VITE_GH_APP_SLUG || '').trim()
}

export function isGhConfigured(): boolean {
  return ghProxyUrl().length > 0
}

// The install URL for the GitHub App. Installing is what grants per-repo,
// fine-grained access; there is no OAuth-app-only path and no PAT prompt.
export function ghInstallUrl(): string {
  const slug = ghAppSlug()
  return slug ? `https://github.com/apps/${slug}/installations/new` : ''
}

// ---- pure request/response shaping ----------------------------------------

export interface GhRequestBody {
  op: GhOp
  params: GhParams
  // Sent so the function can issue a conditional request; a 304 costs no quota.
  etag?: string
}

export function buildGhRequest(
  op: GhOp,
  params: GhParams = {},
  etag?: string | null,
): GhRequestBody {
  const body: GhRequestBody = { op, params: {} }
  // Drop undefined/empty values so the function sees exactly what was asked for.
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v) && v.length === 0) continue
    ;(body.params as Record<string, unknown>)[k] = v
  }
  if (etag) body.etag = etag
  return body
}

// Key names that must never survive into app state or Firestore. Matching is on
// the key, case-insensitively, at every depth.
const SECRET_KEY = /(token|secret|password|client_secret|private_key|authorization|bearer)/i

// Recursively drop anything token-shaped from a proxy response before it can be
// stored. The proxy should never send one; this is the guarantee that a change on
// the server side cannot leak a credential into the client's persisted document.
export function stripSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripSecrets(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) continue
      out[k] = stripSecrets(v)
    }
    return out as unknown as T
  }
  return value
}

export function parseRateLimit(raw: unknown): GhRateLimit | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const limit = typeof r.limit === 'number' ? r.limit : null
  const remaining = typeof r.remaining === 'number' ? r.remaining : null
  if (limit === null || remaining === null) return null
  // GitHub sends `reset` in epoch SECONDS; accept either and normalise to ms.
  const reset =
    typeof r.resetAt === 'number' ? r.resetAt : typeof r.reset === 'number' ? r.reset : 0
  const resetAt = reset > 1e11 ? reset : reset * 1000
  return { limit, remaining, resetAt }
}

// Shape whatever the function returned into a GhResponse. Tolerant by design: a
// proxy that answers with a bare body (no envelope) still parses.
export function parseGhResponse<T>(status: number, raw: unknown): GhResponse<T> {
  const env = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const hasEnvelope = 'data' in env || 'etag' in env || 'rateLimit' in env
  const data = hasEnvelope ? (env.data as T) : (raw as T)
  return {
    status,
    notModified: status === 304,
    data: status === 304 ? null : stripSecrets(data ?? null),
    etag: typeof env.etag === 'string' ? env.etag : null,
    rateLimit: parseRateLimit(env.rateLimit),
  }
}

// ---- transport -------------------------------------------------------------

async function idToken(): Promise<string> {
  const user = auth?.currentUser
  if (!user) throw new GhNotConfiguredError('Sign in before calling GitHub')
  return user.getIdToken()
}

export async function ghCall<T>(
  op: GhOp,
  params: GhParams = {},
  opts: { etag?: string | null; signal?: AbortSignal } = {},
): Promise<GhResponse<T>> {
  const url = ghProxyUrl()
  if (!url) throw new GhNotConfiguredError()
  const token = await idToken()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(buildGhRequest(op, params, opts.etag)),
    signal: opts.signal,
  })
  // 304 carries no body — read it as "unchanged", not as an error.
  if (res.status === 304)
    return { status: 304, notModified: true, data: null, etag: opts.etag ?? null, rateLimit: null }

  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }
  if (res.status === 429 || res.status === 403) {
    const rl = parseRateLimit((payload as Record<string, unknown>)?.rateLimit)
    if (rl && rl.remaining <= 0) throw new GhRateLimitError(rl.resetAt)
  }
  if (!res.ok) {
    const msg =
      (payload &&
      typeof payload === 'object' &&
      typeof (payload as { error?: string }).error === 'string'
        ? (payload as { error: string }).error
        : '') || `GitHub proxy failed (${res.status})`
    throw new Error(msg)
  }
  return parseGhResponse<T>(res.status, payload)
}
