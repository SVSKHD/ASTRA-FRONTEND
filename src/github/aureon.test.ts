// GitHub through Aureon: the older ghCall ops are answered by /api/v1/github/* with the
// shapes the panes already parse, Aureon's errors become the errors they already handle,
// and nothing writes a file directly.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() }))
vi.mock('@/api/client', () => ({ aureon: api }))

import { aureonGhCall, ghApi, rateLimitOf } from './aureon'
import { ghCall, GhNotConfiguredError, GhRateLimitError, isGhConfigured } from '@/utils/ghProxy'
import { decodeBase64Utf8 } from '@/utils/ghCode'

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
afterEach(() => vi.unstubAllEnvs())

describe('aureonGhCall', () => {
  it('lists the allowlisted repositories as GitHub repository objects', async () => {
    api.GET.mockResolvedValue(res({ items: [REPO], total: 1, limit: 200, offset: 0 }))
    const r = await aureonGhCall<Record<string, unknown>[]>('installations')
    expect(api.GET).toHaveBeenCalledWith('/api/v1/github/repositories', {
      params: { query: { limit: 200, offset: 0 } },
      signal: undefined,
    })
    expect(r.data?.[0]).toMatchObject({
      id: 7,
      full_name: 'svskhd/astra',
      owner: { login: 'svskhd' },
      default_branch: 'dev01',
      private: true,
    })
    expect(r.etag).toBeNull()
  })

  it('reshapes issues: labels, assignees and the author as GitHub spells them', async () => {
    api.GET.mockResolvedValue(
      res({
        items: [
          {
            number: 12,
            title: 'Broken',
            state: 'open',
            labels: ['bug'],
            assignees: ['koushik'],
            user: 'koushik',
            comments: 2,
          },
        ],
        page: 1,
        per_page: 50,
        has_next: false,
      }),
    )
    const r = await aureonGhCall<Record<string, unknown>[]>('issues', {
      owner: 'svskhd',
      repo: 'astra',
      perPage: 50,
    })
    expect(api.GET).toHaveBeenCalledWith(
      '/api/v1/github/repositories/{owner}/{repo}/issues',
      expect.objectContaining({
        params: {
          path: { owner: 'svskhd', repo: 'astra' },
          query: { state: 'open', per_page: 50 },
        },
      }),
    )
    expect(r.data?.[0]).toMatchObject({
      number: 12,
      labels: [{ name: 'bug' }],
      assignees: [{ login: 'koushik' }],
      user: { login: 'koushik' },
    })
  })

  it('creates and patches issues through the CSRF-protected client', async () => {
    api.POST.mockResolvedValue(res({ number: 3, title: 'New', state: 'open' }, 201))
    await aureonGhCall('createIssue', { owner: 'o', repo: 'r', title: 'New', body: 'b' })
    expect(api.POST).toHaveBeenCalledWith('/api/v1/github/repositories/{owner}/{repo}/issues', {
      params: { path: { owner: 'o', repo: 'r' } },
      body: { title: 'New', body: 'b', labels: null, assignees: null },
    })
    api.PATCH.mockResolvedValue(res({ number: 3, title: 'New', state: 'closed' }))
    await aureonGhCall('patchIssue', { owner: 'o', repo: 'r', number: 3, state: 'closed' })
    expect(api.PATCH).toHaveBeenCalledWith(
      '/api/v1/github/repositories/{owner}/{repo}/issues/{n}',
      { params: { path: { owner: 'o', repo: 'r', n: 3 } }, body: { state: 'closed' } },
    )
  })

  it('serves a file as base64 text, and a binary as no content', async () => {
    api.GET.mockResolvedValueOnce(
      res({
        type: 'file',
        path: 'a.md',
        ref: 'dev01',
        sha: 's',
        size: 6,
        content_kind: 'text',
        text: 'héllo',
      }),
    )
    const r = await aureonGhCall<{ content: string; encoding: string; type: string }>('file', {
      owner: 'o',
      repo: 'r',
      path: 'a.md',
      ref: 'dev01',
    })
    expect(r.data?.encoding).toBe('base64')
    expect(decodeBase64Utf8(r.data!.content)).toBe('héllo')

    api.GET.mockResolvedValueOnce(
      res({ type: 'file', path: 'x.png', ref: null, sha: 's', size: 9, content_kind: 'binary' }),
    )
    const b = await aureonGhCall<Record<string, unknown>>('file', {
      owner: 'o',
      repo: 'r',
      path: 'x.png',
    })
    expect(b.data && 'content' in b.data).toBe(false)
  })

  it('reads the whole tree, recursively, at a ref', async () => {
    api.GET.mockResolvedValue(
      res({
        entries: [{ path: 'src', type: 'tree' }],
        truncated: false,
        ref: 'dev01',
        path: '',
        recursive: true,
        sha: 't',
      }),
    )
    const r = await aureonGhCall<{ tree: unknown[]; truncated: boolean }>('tree', {
      owner: 'o',
      repo: 'r',
      ref: 'dev01',
    })
    expect(api.GET.mock.calls[0][1].params.query).toEqual({ ref: 'dev01', recursive: true })
    expect(r.data).toMatchObject({ tree: [{ path: 'src', type: 'tree' }], truncated: false })
  })

  it('never commits a file directly: a change goes through an approved code task', async () => {
    await expect(
      aureonGhCall('putFile', { owner: 'o', repo: 'r', path: 'a', content: 'x' }),
    ).rejects.toThrow(/Direct commits are off on Aureon/)
    expect(api.POST).not.toHaveBeenCalled()
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

  it('reads the rate limit as epoch ms', () => {
    expect(
      rateLimitOf({
        configured: true,
        api_url: '',
        allowed_owners: [],
        allowed_repos: [],
        scopes: [],
        rate_limit: { limit: 5000, remaining: 4000, reset_at: '2026-11-04T12:00:00Z' },
      }),
    ).toEqual({ limit: 5000, remaining: 4000, resetAt: Date.parse('2026-11-04T12:00:00Z') })
  })
})

describe('ghCall routing', () => {
  it('goes to Aureon in an Aureon build, with no proxy URL needed', async () => {
    vi.stubEnv('VITE_AUTH_PROVIDER', 'aureon')
    vi.stubEnv('VITE_GH_PROXY_URL', '')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    api.GET.mockResolvedValue(res([{ name: 'dev01', protected: true, sha: 'a' }]))
    expect(isGhConfigured()).toBe(true)
    const r = await ghCall<{ name: string }[]>('branches', { owner: 'o', repo: 'r' })
    expect(r.data?.[0].name).toBe('dev01')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('keeps the proxy in a Supabase build', () => {
    vi.stubEnv('VITE_AUTH_PROVIDER', 'supabase')
    vi.stubEnv('VITE_GH_PROXY_URL', '')
    expect(isGhConfigured()).toBe(false)
  })
})
