// Shared plumbing for the control center (/dev, Phase 21).
//
// Every call goes through the typed Aureon client (`aureon`, cookies + CSRF).
// No credential for GitHub, Claude or Discord ever reaches the browser: the
// server holds them and the pages only see what its endpoints return.

import { reactive } from 'vue'
import { apiUrl } from '@/api/config'
import { needsCsrf, readCsrfToken } from '@/api/csrf'
import type { components } from '@/api/client'
import { ApiFailure, must } from '@/trading/useLoad'

export { ApiFailure, must }
export type Schemas = components['schemas']
export type Gated = Schemas['GatedOut']

/** The repository every GitHub module is pointed at, "owner/name". Kept per browser. */
const REPO_KEY = 'cc.repo'
function readRepo(): string {
  try {
    return globalThis.localStorage?.getItem(REPO_KEY) ?? ''
  } catch {
    return ''
  }
}
export const cc = reactive({ repo: readRepo() })

export function setRepo(full: string): void {
  cc.repo = full
  try {
    globalThis.localStorage?.setItem(REPO_KEY, full)
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}

/** `{ owner, repo }` path params for the selected repository, or null. */
export function repoParams(full = cc.repo): { owner: string; repo: string } | null {
  const [owner, repo, ...rest] = full.split('/')
  return owner && repo && !rest.length ? { owner, repo } : null
}

/** The status and code of a failed call, from an ApiFailure or anything else. */
export function failureOf(e: unknown): { status: number; message: string } {
  if (e instanceof ApiFailure) return { status: e.status, message: e.message }
  return { status: 0, message: (e as Error)?.message || 'Request failed.' }
}

/** The error code FastAPI put in `detail.code`, if any. */
export function codeOf(error: unknown): string {
  const d = (error as { detail?: unknown } | undefined)?.detail
  if (d && typeof d === 'object' && 'code' in d && typeof d.code === 'string') return d.code
  return ''
}

/**
 * GET an endpoint that is not in the generated schema yet (backend Phase 20
 * routes that may not be on main). Same cookies, same origin as the client.
 */
export async function rawGet<T>(
  path: string,
  query: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(apiUrl(path), globalThis.location?.origin ?? 'http://localhost')
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const res = await fetch(new Request(url, { credentials: 'include' }))
  const body = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const d = (body as { detail?: unknown } | null)?.detail
    const msg = typeof d === 'string' ? d : `Aureon answered ${res.status}`
    throw new ApiFailure(msg, res.status)
  }
  return body as T
}

/** POST JSON to an endpoint that is not in the generated schema yet. */
export async function rawPost<T>(path: string, body: unknown): Promise<T> {
  const url = new URL(apiUrl(path), globalThis.location?.origin ?? 'http://localhost')
  const headers = new Headers({ 'content-type': 'application/json' })
  if (needsCsrf('POST')) {
    const token = readCsrfToken()
    if (token) headers.set('X-CSRF-Token', token)
  }
  const res = await fetch(
    new Request(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    }),
  )
  const out = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const d = (out as { detail?: unknown } | null)?.detail
    const msg =
      typeof d === 'string'
        ? d
        : d && typeof d === 'object' && 'code' in d && typeof d.code === 'string'
          ? d.code
          : `Aureon answered ${res.status}`
    throw new ApiFailure(msg, res.status)
  }
  return out as T
}

/** A short sha for display. */
export function short(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : '—'
}
