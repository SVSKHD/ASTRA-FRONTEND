import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAureonClient, errorMessage, onUnauthorized } from './client'
import { needsCsrf, readCsrfToken } from './csrf'

function recorder(status = 200, body: unknown = {}) {
  const calls: Request[] = []
  const fetchImpl = vi.fn(async (input: Request) => {
    calls.push(input)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

afterEach(() => {
  document.cookie = 'aureon_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})

describe('csrf', () => {
  it('reads either cookie name and decodes it', () => {
    expect(readCsrfToken('a=1; __Host-aureon_csrf=t%2Bk')).toBe('t+k')
    expect(readCsrfToken('aureon_csrf=abc')).toBe('abc')
    expect(readCsrfToken('other=1')).toBeNull()
  })
  it('only unsafe methods need it', () => {
    expect(needsCsrf('GET')).toBe(false)
    expect(needsCsrf('post')).toBe(true)
    expect(needsCsrf('DELETE')).toBe(true)
  })
})

describe('aureon client', () => {
  it('sends cookies, and the CSRF header on unsafe methods only', async () => {
    document.cookie = 'aureon_csrf=tok123'
    const { calls, fetchImpl } = recorder()
    const api = createAureonClient('https://spasta.test', fetchImpl)
    await api.GET('/api/auth/me')
    await api.POST('/api/auth/logout')
    expect(calls[0].url).toBe('https://spasta.test/api/auth/me')
    expect(calls[0].credentials).toBe('include')
    expect(calls[0].headers.get('x-csrf-token')).toBeNull()
    expect(calls[1].headers.get('x-csrf-token')).toBe('tok123')
  })

  it('serialises query params from the schema', async () => {
    const { calls, fetchImpl } = recorder(200, { items: [], total: 0, limit: 5, offset: 0 })
    const api = createAureonClient('https://spasta.test', fetchImpl)
    const { data } = await api.GET('/api/trading/signals', { params: { query: { limit: 5 } } })
    expect(new URL(calls[0].url).searchParams.get('limit')).toBe('5')
    expect(data?.total).toBe(0)
  })

  it('tells listeners about a 401', async () => {
    const { fetchImpl } = recorder(401, { detail: 'not authenticated' })
    const api = createAureonClient('https://spasta.test', fetchImpl)
    const seen: string[] = []
    const off = onUnauthorized((p) => seen.push(p))
    const { error } = await api.GET('/api/auth/me')
    off()
    expect(seen).toEqual(['/api/auth/me'])
    expect(errorMessage(error)).toBe('not authenticated')
  })
})

describe('errorMessage', () => {
  it('handles the FastAPI detail shapes', () => {
    expect(errorMessage({ detail: { code: 'queue_full' } })).toBe('queue full')
    expect(errorMessage({ detail: { code: 'x', detail: 'nicer' } })).toBe('nicer')
    expect(errorMessage({ detail: [{ msg: 'field required' }] })).toBe('field required')
    expect(errorMessage(null, 'fallback')).toBe('fallback')
  })
})
