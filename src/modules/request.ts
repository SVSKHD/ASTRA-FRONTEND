// Calls to the paths a manifest names. They are not in the generated client's
// types (that is the point: they can be newer than this build), so they go
// through the same client untyped — same cookies, CSRF header on writes,
// retries on reads, 401 handling and schema fingerprint as every other call.

import { aureon, errorMessage } from '@/api/client'
import type { Gated } from '@/control/api'
import type { ManifestView } from './manifest'

type Method = ManifestView['method']
type RawResult = { data?: unknown; error?: unknown; response: Response }
type RawClient = Record<
  Method,
  (
    path: string,
    init: { params?: { query?: Record<string, unknown> }; body?: unknown },
  ) => Promise<RawResult>
>

/** `/api/x/{id}` + `{id: 'a b'}` → `/api/x/a%20b`. A missing parameter is an error, not "undefined". */
export function fillPath(path: string, params: Record<string, unknown>): string {
  return path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const v = params[name]
    if (v === undefined || v === null || v === '')
      throw new Error(`missing path parameter: ${name}`)
    return encodeURIComponent(String(v))
  })
}

export interface CallResult {
  ok: boolean
  status: number
  data: unknown
  error: string
  /** The approval request a gated operation answered with (nothing has run). */
  gated: Gated | null
}

export function isGated(data: unknown): data is Gated {
  return !!data && typeof data === 'object' && 'approval_id' in data && 'kind' in data
}

export async function callView(
  view: Pick<ManifestView, 'method' | 'path'>,
  opts: { params?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown } = {},
): Promise<CallResult> {
  const path = fillPath(view.path, opts.params ?? {})
  const query = Object.fromEntries(
    Object.entries(opts.query ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  )
  const client = aureon as unknown as RawClient
  const init = {
    ...(Object.keys(query).length ? { params: { query } } : {}),
    ...(opts.body !== undefined ? { body: opts.body } : {}),
  }
  const r = await client[view.method](path, init)
  const status = r.response.status
  const data = r.data ?? null
  if (!r.response.ok) {
    return {
      ok: false,
      status,
      data,
      error: errorMessage(r.error, `Aureon answered ${status}`),
      gated: null,
    }
  }
  return { ok: true, status, data, error: '', gated: status === 202 && isGated(data) ? data : null }
}

/** `a.b.c` into an object; '' is the object itself. */
export function pick(obj: unknown, path: string | null | undefined): unknown {
  if (!path) return obj
  let cur: unknown = obj
  for (const part of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}
