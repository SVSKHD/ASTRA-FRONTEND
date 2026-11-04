// GitHub through Aureon: ghCall's ops answered from /api/v1/github and reshaped
// into the GitHub JSON the existing mappers read.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commitFromApi, issueFromApi, pullFromApi, repoFromApi } from './githubModel'

type Handler = (req: Request) => Response | Promise<Response>
let handler: Handler
const calls: Request[] = []

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

async function load(provider = 'aureon') {
  vi.resetModules()
  vi.stubEnv('VITE_AUTH_PROVIDER', provider)
  vi.stubEnv('VITE_GH_PROXY_URL', '')
  vi.stubGlobal('fetch', async (input: Request) => {
    calls.push(input)
    return handler(input)
  })
  return import('./ghProxy')
}

const path = (r: Request) => new URL(r.url).pathname
const query = (r: Request) => Object.fromEntries(new URL(r.url).searchParams)

beforeEach(() => {
  calls.length = 0
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  document.cookie = 'aureon_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})

const REPO = {
  id: 7,
  full_name: 'SVSKHD/ASTRA-FRONTEND',
  owner: 'SVSKHD',
  name: 'ASTRA-FRONTEND',
  description: 'Spasta',
  private: true,
  default_branch: 'dev01',
  archived: false,
  pushed_at: '2026-11-04T09:00:00Z',
  html_url: 'https://github.com/SVSKHD/ASTRA-FRONTEND',
  synced_at: '2026-11-04T09:10:00Z',
}

describe('configuration', () => {
  it('is configured on Aureon without a proxy URL, and read-only for commits', async () => {
    const gh = await load('aureon')
    expect(gh.ghViaAureon()).toBe(true)
    expect(gh.isGhConfigured()).toBe(true)
    expect(gh.ghCanCommitFiles()).toBe(false)
  })

  it('a Supabase build still needs the proxy', async () => {
    const gh = await load('supabase')
    expect(gh.ghViaAureon()).toBe(false)
    expect(gh.isGhConfigured()).toBe(false)
    await expect(gh.ghCall('installations')).rejects.toBeInstanceOf(gh.GhNotConfiguredError)
    expect(calls).toHaveLength(0)
  })
})

describe('ghCall on Aureon', () => {
  it('installations: lists repositories same-origin, with the connection rate limit', async () => {
    handler = (r) =>
      path(r) === '/api/v1/github/repositories'
        ? json(200, { items: [REPO], total: 1, limit: 200, offset: 0 })
        : json(200, {
            ok: true,
            login: 'SVSKHD',
            rate_limit: { limit: 5000, remaining: 4990, reset_at: '2026-11-04T10:00:00Z' },
          })
    const gh = await load()
    const res = await gh.ghCall<Record<string, unknown>[]>('installations')
    const repos = calls.find((c) => path(c) === '/api/v1/github/repositories')!
    expect(repos.url.startsWith(location.origin)).toBe(true)
    expect(repos.credentials).toBe('include')
    expect(query(repos)).toEqual({ limit: '200' })
    expect(calls.some((c) => path(c) === '/api/v1/github/connection')).toBe(true)
    expect(res.rateLimit).toEqual({
      limit: 5000,
      remaining: 4990,
      resetAt: Date.parse('2026-11-04T10:00:00Z'),
    })
    const linked = repoFromApi(res.data![0]!, 1)
    expect(linked).toMatchObject({
      id: 'SVSKHD__ASTRA-FRONTEND',
      owner: 'SVSKHD',
      name: 'ASTRA-FRONTEND',
      defaultBranch: 'dev01',
      private: true,
    })
  })

  it('file: decoded text comes back base64 for the code pane, path kept intact', async () => {
    handler = () =>
      json(200, {
        path: 'src/a b.ts',
        ref: 'dev01',
        type: 'file',
        size: 12,
        sha: 'abc',
        html_url: 'https://github.com/x',
        content_kind: 'text',
        encoding: 'utf-8',
        text: 'héllo ✓\n',
      })
    const gh = await load()
    const res = await gh.ghCall<{ content: string; encoding: string; type: string; sha: string }>(
      'file',
      { owner: 'SVSKHD', repo: 'ASTRA-FRONTEND', path: 'src/a b.ts', ref: 'dev01' },
    )
    expect(decodeURIComponent(path(calls[0]!))).toBe(
      '/api/v1/github/repositories/SVSKHD/ASTRA-FRONTEND/contents/src/a b.ts',
    )
    expect(query(calls[0]!)).toEqual({ ref: 'dev01' })
    expect(res.data!.type).toBe('file')
    expect(res.data!.encoding).toBe('base64')
    const bytes = Uint8Array.from(atob(res.data!.content), (c) => c.charCodeAt(0))
    expect(new TextDecoder().decode(bytes)).toBe('héllo ✓\n')
  })

  it('file: binary content carries no content (the pane shows it read-only)', async () => {
    handler = () =>
      json(200, { path: 'a.png', ref: null, type: 'file', size: 9, content_kind: 'binary' })
    const gh = await load()
    const res = await gh.ghCall<Record<string, unknown>>('file', {
      owner: 'o',
      repo: 'r',
      path: 'a.png',
    })
    expect(res.data!.content).toBeUndefined()
  })

  it('tree: asks for the recursive tree and returns GitHub’s {tree, truncated}', async () => {
    handler = () =>
      json(200, {
        ref: 'main',
        path: '',
        sha: 's',
        recursive: true,
        truncated: false,
        entries: [{ path: 'README.md', type: 'blob' }],
      })
    const gh = await load()
    const res = await gh.ghCall<{ tree: { path: string }[]; truncated: boolean }>('tree', {
      owner: 'o',
      repo: 'r',
      ref: 'main',
    })
    expect(query(calls[0]!)).toEqual({ ref: 'main', recursive: 'true' })
    expect(res.data).toEqual({
      sha: 's',
      truncated: false,
      tree: [{ path: 'README.md', type: 'blob' }],
    })
  })

  it('commits and pulls map through the existing mappers', async () => {
    handler = (r) =>
      path(r).endsWith('/commits')
        ? json(200, [
            {
              sha: 'c1',
              message: 'feat: x\n\nbody',
              author_login: 'me',
              author_name: 'Me',
              authored_at: '2026-11-04T08:00:00Z',
              html_url: 'h',
            },
          ])
        : json(200, {
            items: [
              {
                number: 4,
                title: 'PR',
                state: 'open',
                draft: true,
                user: 'me',
                head: { ref: 'feat' },
                base: { ref: 'main' },
                labels: ['ui'],
                html_url: 'p',
              },
            ],
            page: 1,
            per_page: 30,
            has_next: false,
          })
    const gh = await load()
    const commits = await gh.ghCall<Record<string, unknown>[]>('commits', {
      owner: 'o',
      repo: 'r',
      perPage: 5,
    })
    expect(query(calls[0]!)).toEqual({ per_page: '5' })
    expect(commitFromApi(commits.data![0]!)).toEqual({
      sha: 'c1',
      message: 'feat: x',
      author: 'me',
      committedAt: Date.parse('2026-11-04T08:00:00Z'),
      htmlUrl: 'h',
    })
    const pulls = await gh.ghCall<Record<string, unknown>[]>('pulls', { owner: 'o', repo: 'r' })
    expect(query(calls[1]!)).toEqual({ state: 'open' })
    expect(pullFromApi(pulls.data![0]!)).toEqual({
      number: 4,
      title: 'PR',
      author: 'me',
      htmlUrl: 'p',
      draft: true,
      ci: 'none',
    })
    expect(pulls.data![0]).toMatchObject({ head: { ref: 'feat' }, labels: [{ name: 'ui' }] })
  })

  it('patchIssue: PATCH with CSRF and only the fields Aureon accepts', async () => {
    document.cookie = 'aureon_csrf=tok123; path=/'
    handler = () =>
      json(200, {
        number: 9,
        title: 'T',
        body: 'b',
        state: 'closed',
        labels: ['bug'],
        assignees: ['me'],
        user: 'me',
        html_url: 'i',
      })
    const gh = await load()
    const res = await gh.ghCall<Record<string, unknown>>('patchIssue', {
      owner: 'o',
      repo: 'r',
      number: 9,
      title: 'T',
      body: 'b',
      state: 'closed',
      perPage: 3,
    })
    const req = calls[0]!
    expect(req.method).toBe('PATCH')
    expect(path(req)).toBe('/api/v1/github/repositories/o/r/issues/9')
    expect(req.headers.get('x-csrf-token')).toBe('tok123')
    expect(await req.json()).toEqual({ title: 'T', body: 'b', state: 'closed' })
    expect(issueFromApi(res.data!, 'o__r')).toMatchObject({
      number: 9,
      state: 'closed',
      labels: ['bug'],
      assignees: ['me'],
      author: 'me',
    })
  })

  it('issues: labels go as a comma list, PRs stay marked so callers can drop them', async () => {
    handler = () =>
      json(200, {
        items: [
          { number: 1, title: 'i', state: 'open', labels: [] },
          { number: 2, title: 'p', state: 'open', labels: [], is_pull_request: true },
        ],
        page: 1,
        per_page: 50,
        has_next: false,
      })
    const gh = await load()
    const res = await gh.ghCall<Record<string, unknown>[]>('issues', {
      owner: 'o',
      repo: 'r',
      labels: ['bug', 'ui'],
      perPage: 50,
    })
    expect(query(calls[0]!)).toEqual({ state: 'open', labels: 'bug,ui', per_page: '50' })
    expect(res.notModified).toBe(false)
    expect(res.data![1]).toHaveProperty('pull_request')
    expect(res.data![0]).not.toHaveProperty('pull_request')
  })
})

describe('errors', () => {
  it('a GitHub rate limit becomes GhRateLimitError with Retry-After', async () => {
    handler = () =>
      json(
        429,
        { detail: { code: 'github_rate_limited', detail: 'slow down' } },
        { 'retry-after': '30' },
      )
    const gh = await load()
    const before = Date.now()
    const err = await gh.ghCall('branches', { owner: 'o', repo: 'r' }).catch((e) => e)
    expect(err).toBeInstanceOf(gh.GhRateLimitError)
    expect(err.resetAt).toBeGreaterThanOrEqual(before + 30_000)
  })

  it('no token on the server becomes GhNotConfiguredError', async () => {
    handler = () =>
      json(503, { detail: { code: 'github_not_configured', detail: 'set GITHUB_TOKEN' } })
    const gh = await load()
    await expect(gh.ghCall('installations')).rejects.toBeInstanceOf(gh.GhNotConfiguredError)
  })

  it('a non-admin session gets a readable refusal, an allowlist miss the backend’s detail', async () => {
    const gh = await load()
    handler = () => json(403, { detail: 'admin only' })
    await expect(gh.ghCall('branches', { owner: 'o', repo: 'r' })).rejects.toThrow(/admins only/)
    handler = () => json(404, { detail: { code: 'not_found', detail: 'repository not found' } })
    await expect(gh.ghCall('branches', { owner: 'o', repo: 'x' })).rejects.toThrow(
      'repository not found',
    )
  })

  it('putFile is refused without a request', async () => {
    const gh = await load()
    await expect(
      gh.ghCall('putFile', { owner: 'o', repo: 'r', path: 'a', content: 'eA==' }),
    ).rejects.toThrow(/approval/)
    expect(calls).toHaveLength(0)
  })
})
