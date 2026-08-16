import { describe, expect, it } from 'vitest'
import {
  GhRateLimitError,
  buildGhRequest,
  parseGhResponse,
  parseRateLimit,
  stripSecrets,
} from './ghProxy'

describe('buildGhRequest', () => {
  it('drops undefined, null and empty-array params', () => {
    const body = buildGhRequest('issues', {
      owner: 'octo',
      repo: 'demo',
      title: undefined,
      labels: [],
      assignees: ['me'],
    })
    expect(body).toEqual({
      op: 'issues',
      params: { owner: 'octo', repo: 'demo', assignees: ['me'] },
    })
  })

  it('includes the etag only when one is known', () => {
    expect(buildGhRequest('issues', {}, 'W/"abc"').etag).toBe('W/"abc"')
    expect(buildGhRequest('issues', {}, null).etag).toBeUndefined()
    expect(buildGhRequest('issues', {}).etag).toBeUndefined()
  })
})

describe('stripSecrets', () => {
  it('removes token-shaped keys at every depth (acceptance 59)', () => {
    const raw = {
      login: 'octo',
      token: 'ghs_live',
      nested: { access_token: 'x', name: 'ok', deeper: { clientSecret: 'y', id: 3 } },
      list: [{ authorization: 'Bearer z', number: 1 }],
    }
    expect(stripSecrets(raw)).toEqual({
      login: 'octo',
      nested: { name: 'ok', deeper: { id: 3 } },
      list: [{ number: 1 }],
    })
  })

  it('leaves primitives and plain data untouched', () => {
    expect(stripSecrets(5)).toBe(5)
    expect(stripSecrets('hi')).toBe('hi')
    expect(stripSecrets(null)).toBe(null)
    expect(stripSecrets({ a: [1, 2] })).toEqual({ a: [1, 2] })
  })
})

describe('parseRateLimit', () => {
  it('normalises GitHub seconds to epoch ms', () => {
    expect(parseRateLimit({ limit: 5000, remaining: 4980, reset: 1_700_000_000 })).toEqual({
      limit: 5000,
      remaining: 4980,
      resetAt: 1_700_000_000_000,
    })
  })

  it('passes through a value already in ms', () => {
    expect(parseRateLimit({ limit: 60, remaining: 0, resetAt: 1_700_000_000_000 })?.resetAt).toBe(
      1_700_000_000_000,
    )
  })

  it('returns null when the shape is not a rate limit', () => {
    expect(parseRateLimit(null)).toBeNull()
    expect(parseRateLimit({ remaining: 3 })).toBeNull()
  })
})

describe('parseGhResponse', () => {
  it('unwraps the proxy envelope and keeps the etag', () => {
    const res = parseGhResponse<{ id: number }>(200, {
      data: { id: 7, token: 'nope' },
      etag: 'W/"e1"',
      rateLimit: { limit: 5000, remaining: 4999, reset: 1000 },
    })
    expect(res.data).toEqual({ id: 7 })
    expect(res.etag).toBe('W/"e1"')
    expect(res.rateLimit?.remaining).toBe(4999)
    expect(res.notModified).toBe(false)
  })

  it('accepts a bare body with no envelope', () => {
    const res = parseGhResponse<number[]>(200, [1, 2, 3])
    expect(res.data).toEqual([1, 2, 3])
    expect(res.etag).toBeNull()
  })

  it('reads 304 as not-modified with no data', () => {
    const res = parseGhResponse(304, {})
    expect(res.notModified).toBe(true)
    expect(res.data).toBeNull()
  })
})

describe('GhRateLimitError', () => {
  it('carries the reset time so the UI can say when sync resumes', () => {
    const err = new GhRateLimitError(1_700_000_000_000)
    expect(err.resetAt).toBe(1_700_000_000_000)
    expect(err.name).toBe('GhRateLimitError')
  })
})
