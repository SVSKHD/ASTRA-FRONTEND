// The typed GitHub calls through Aureon: the right paths and queries, and Aureon's errors
// as the errors the GitHub panes already handle.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() }))
vi.mock('@/api/client', () => ({ aureon: api }))

import { ghApi } from './aureon'
import { GhNotConfiguredError, GhRateLimitError } from '@/utils/ghProxy'

const res = (data: unknown, status = 200, headers: Record<string, string> = {}) => ({
  data: status < 400 ? data : undefined,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status, headers: new Headers(headers) },
})

const REPO = {
  id: 7,
  name: 'astra',
  full_name: 'svskhd/astra',
  owner: 'svskhd',
  private: true,
  html_url: 'https://github.com/svskhd/astra',
  description: 'the app',
  default_branch: 'dev01',
  pushed_at: '2026-11-03T10:00:00Z',
  archived: false,
  synced_at: '2026-11-04T01:00:00Z',
}

beforeEach(() => Object.values(api).forEach((f) => f.mockReset()))

describe('ghApi', () => {
  it('lists repositories (optionally syncing first) and reads a file at a ref', async () => {
    api.GET.mockResolvedValueOnce(res({ items: [REPO], total: 1, limit: 100, offset: 0 }))
    const page = await ghApi.repositories({ refresh: true })
    expect(page.items[0].full_name).toBe('svskhd/astra')
    expect(api.GET).toHaveBeenCalledWith('/api/v1/github/repositories', {
      params: { query: { limit: 100, offset: 0, refresh: true } },
      signal: undefined,
    })
    api.GET.mockResolvedValueOnce(res({ type: 'file', path: 'a.md', ref: 'dev01', text: 'hi' }))
    await ghApi.contents('svskhd', 'astra', 'docs/a.md', 'dev01')
    expect(api.GET).toHaveBeenLastCalledWith(
      '/api/v1/github/repositories/{owner}/{repo}/contents/{path}',
      {
        params: {
          path: { owner: 'svskhd', repo: 'astra', path: 'docs/a.md' },
          query: { ref: 'dev01' },
        },
        signal: undefined,
      },
    )
  })
})

describe('errors', () => {
  it('maps "not configured", rate limits and admin-only to errors the panes handle', async () => {
    api.GET.mockResolvedValueOnce(
      res({ detail: { code: 'github_not_configured', detail: 'x' } }, 503),
    )
    await expect(ghApi.connection()).rejects.toBeInstanceOf(GhNotConfiguredError)

    api.GET.mockResolvedValueOnce(
      res({ detail: { code: 'rate_limited', detail: 'slow down' } }, 429, { 'retry-after': '30' }),
    )
    const err = await ghApi.branches('o', 'r').catch((e) => e)
    expect(err).toBeInstanceOf(GhRateLimitError)
    expect(err.resetAt).toBeGreaterThan(Date.now() + 25_000)

    api.GET.mockResolvedValueOnce(res({ detail: 'admin required' }, 403))
    await expect(ghApi.branches('o', 'r')).rejects.toThrow(/needs an admin account/)
  })
})
