// The typed Aureon_Agentic client (migration stage 1).
//
// Types come from the backend's own OpenAPI schema — `npm run api:gen`
// regenerates src/api/schema.d.ts from src/api/openapi.json, which the backend
// writes with `python scripts/export_openapi.py --out …`. A request that does
// not match the schema is a type error, so a backend change shows up here as a
// failed `vue-tsc`, not as a blank panel in production.
//
//   const { data, error } = await aureon.GET('/api/trading/signals', {
//     params: { query: { limit: 20 } },
//   })
//
// Cookie auth: `credentials: 'include'` sends the session cookie; unsafe
// methods carry X-CSRF-Token (see csrf.ts). A 401 calls the handlers registered
// with onUnauthorized — the auth store uses that to return to sign-in.

import createClient, { type Middleware } from 'openapi-fetch'
import { AUREON_API_URL } from './config'
import { needsCsrf, readCsrfToken } from './csrf'
import { resilientFetch, type ResilientOptions } from './resilient'
import type { paths } from './schema'

export type { components, paths } from './schema'

type Listener = (path: string) => void
const unauthorized = new Set<Listener>()

/** Called with the request path whenever the API answers 401. Returns an unsubscribe. */
export function onUnauthorized(fn: Listener): () => void {
  unauthorized.add(fn)
  return () => unauthorized.delete(fn)
}

type SchemaListener = (fingerprint: string) => void
const schemaListeners = new Set<SchemaListener>()

/**
 * Called with the server's `X-API-Schema` fingerprint on every response that carries one.
 * It changes when a deploy adds or changes a route, which is how the Modules nav knows to
 * re-read the manifest (src/modules/manifest.ts). Returns an unsubscribe.
 */
export function onApiSchema(fn: SchemaListener): () => void {
  schemaListeners.add(fn)
  return () => schemaListeners.delete(fn)
}

export const authMiddleware: Middleware = {
  onRequest({ request }) {
    if (needsCsrf(request.method)) {
      const token = readCsrfToken()
      if (token) request.headers.set('X-CSRF-Token', token)
    }
    return request
  },
  onResponse({ request, response }) {
    if (response.status === 401) {
      const path = new URL(request.url, globalThis.location?.href ?? 'http://localhost').pathname
      for (const fn of unauthorized) fn(path)
    }
    const schema = response.headers.get('x-api-schema')
    if (schema) for (const fn of schemaListeners) fn(schema)
    return response
  },
}

export function createAureonClient(
  baseUrl: string = AUREON_API_URL,
  fetchImpl?: typeof fetch,
  policy?: ResilientOptions,
) {
  const client = createClient<paths>({
    baseUrl: baseUrl || globalThis.location?.origin || '',
    credentials: 'include',
    // Safe reads time out and retry (resilient.ts); mutations go through as-is.
    // The global fetch is looked up per call, so a stubbed one is honoured.
    fetch: resilientFetch((input, init) => (fetchImpl ?? globalThis.fetch)(input, init), policy),
  })
  client.use(authMiddleware)
  return client
}

export const aureon = createAureonClient()

/** A readable message from an error body (FastAPI `detail` string, object or list). */
export function errorMessage(error: unknown, fallback = 'Request failed'): string {
  if (!error || typeof error !== 'object') return fallback
  const detail = (error as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const d = detail as { detail?: unknown; code?: unknown }
    if (typeof d.detail === 'string') return d.detail
    if (typeof d.code === 'string') return d.code.replaceAll('_', ' ')
  }
  if (Array.isArray(detail) && detail[0] && typeof detail[0] === 'object') {
    const msg = (detail[0] as { msg?: unknown }).msg
    if (typeof msg === 'string') return msg
  }
  return fallback
}
