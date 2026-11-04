// GitHub through Aureon: the one place the SPA reads GitHub from the self-hosted backend.
//
// Aureon holds the token (GITHUB_TOKEN on the server) and answers /api/v1/github/* for
// admins, same origin, with the session cookie and the CSRF header the shared client
// adds. Nothing token-shaped ever reaches this file: the connection endpoint reports a
// fingerprint and a kind, never the token.
//
// These are the typed calls (`ghApi.*`) used by the connection card, the Code tab's live
// list and the AI workspace. The older `ghCall` ops (Issues, Pull requests, Code and Repos
// panes) are served from Aureon by utils/ghAureon.ts, which reshapes the answers into the
// GitHub REST shapes those panes parse.

import { aureon, type components } from '@/api/client'
import { GhNotConfiguredError, GhRateLimitError } from '@/utils/ghProxy'

type S = components['schemas']
export type GhConnectionOut = S['ConnectionOut']
export type GhRepositoryOut = S['RepositoryOut']
export type GhRepositoryDetail = S['RepositoryDetail']
export type GhBranchOut = S['BranchOut']
export type GhCommitOut = S['app__schemas__github__CommitOut']
export type GhTreeOut = S['TreeOut']
export type GhContentOut = S['ContentOut']
export type GhPullOut = S['PullOut']
export type GhPullDetail = S['PullDetail']
export type GhPullFile = S['PullFileOut']
export type GhIssueOut = S['IssueOut']
export type GhCommentOut = S['CommentOut']
export type GhReviewCommentOut = S['ReviewCommentOut']
export type GhReviewOut = S['app__schemas__github_ops__ReviewOut']

/** Why a GitHub call failed, in words a person can act on. */
export class GhApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = '',
  ) {
    super(message)
    this.name = 'GhApiError'
  }
}

interface Result<T> {
  data?: T
  error?: unknown
  response: Response
}

function detailOf(error: unknown): { code: string; detail: string } {
  const d = (error as { detail?: unknown } | undefined)?.detail
  if (typeof d === 'string') return { code: '', detail: d }
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const o = d as { code?: unknown; detail?: unknown }
    return {
      code: typeof o.code === 'string' ? o.code : '',
      detail: typeof o.detail === 'string' ? o.detail : '',
    }
  }
  return { code: '', detail: '' }
}

/**
 * Unwrap an answer, turning Aureon's error bodies into the errors the panes already
 * handle: not configured → GhNotConfiguredError, rate limited → GhRateLimitError.
 */
export function unwrap<T>(r: Result<T>): T {
  if (r.response.ok && r.data !== undefined) return r.data
  const status = r.response.status
  const { code, detail } = detailOf(r.error)
  if (status === 503 && code === 'github_not_configured') {
    throw new GhNotConfiguredError('GitHub is not configured on the Aureon server (GITHUB_TOKEN).')
  }
  if (status === 429 || code === 'rate_limited') {
    const after = Number(r.response.headers.get('retry-after') ?? '60')
    throw new GhRateLimitError(Date.now() + (Number.isFinite(after) ? after : 60) * 1000)
  }
  if (status === 401) throw new GhApiError('Sign in to Aureon again.', status, code)
  if (status === 403) {
    throw new GhApiError('GitHub on Aureon needs an admin account.', status, code)
  }
  if (status === 404) {
    throw new GhApiError(detail || 'Not found, or not on the server’s allowlist.', status, code)
  }
  throw new GhApiError(detail || `Aureon answered ${status}`, status, code)
}

interface Opts {
  signal?: AbortSignal
}
const REPO = '/api/v1/github/repositories/{owner}/{repo}' as const
const path = (owner: string, repo: string) => ({ owner, repo })

/** Typed calls, one per backend endpoint used by the SPA. */
export const ghApi = {
  async connection(o: Opts = {}): Promise<GhConnectionOut> {
    return unwrap(await aureon.GET('/api/v1/github/connection', { signal: o.signal }))
  },
  async checkConnection(): Promise<GhConnectionOut> {
    return unwrap(await aureon.POST('/api/v1/github/connection/check', {}))
  },
  async repositories(
    q: { limit?: number; offset?: number; refresh?: boolean; q?: string } = {},
    o: Opts = {},
  ): Promise<S['Page_RepositoryOut_']> {
    return unwrap(
      await aureon.GET('/api/v1/github/repositories', {
        params: { query: { limit: q.limit ?? 100, offset: q.offset ?? 0, ...q } },
        signal: o.signal,
      }),
    )
  },
  async repository(owner: string, repo: string, o: Opts = {}): Promise<GhRepositoryDetail> {
    return unwrap(await aureon.GET(REPO, { params: { path: path(owner, repo) }, signal: o.signal }))
  },
  async branches(owner: string, repo: string, o: Opts = {}): Promise<GhBranchOut[]> {
    return unwrap(
      await aureon.GET(`${REPO}/branches`, {
        params: { path: path(owner, repo) },
        signal: o.signal,
      }),
    )
  },
  async commits(
    owner: string,
    repo: string,
    q: { sha?: string; path?: string; per_page?: number; page?: number } = {},
    o: Opts = {},
  ): Promise<GhCommitOut[]> {
    return unwrap(
      await aureon.GET(`${REPO}/commits`, {
        params: { path: path(owner, repo), query: q },
        signal: o.signal,
      }),
    )
  },
  async tree(
    owner: string,
    repo: string,
    q: { ref?: string; path?: string; recursive?: boolean } = {},
    o: Opts = {},
  ): Promise<GhTreeOut> {
    return unwrap(
      await aureon.GET(`${REPO}/tree`, {
        params: { path: path(owner, repo), query: q },
        signal: o.signal,
      }),
    )
  },
  async contents(
    owner: string,
    repo: string,
    filePath: string,
    ref?: string,
    o: Opts = {},
  ): Promise<GhContentOut> {
    return unwrap(
      await aureon.GET(`${REPO}/contents/{path}`, {
        params: { path: { owner, repo, path: filePath }, query: ref ? { ref } : {} },
        signal: o.signal,
      }),
    )
  },
  async pulls(
    owner: string,
    repo: string,
    q: { state?: 'open' | 'closed' | 'all'; per_page?: number; page?: number } = {},
    o: Opts = {},
  ): Promise<S['ListPage_PullOut_']> {
    return unwrap(
      await aureon.GET(`${REPO}/pulls`, {
        params: { path: path(owner, repo), query: q },
        signal: o.signal,
      }),
    )
  },
  async pull(owner: string, repo: string, n: number, o: Opts = {}): Promise<GhPullDetail> {
    return unwrap(
      await aureon.GET(`${REPO}/pulls/{n}`, {
        params: { path: { owner, repo, n } },
        signal: o.signal,
      }),
    )
  },
  async pullFiles(owner: string, repo: string, n: number, o: Opts = {}): Promise<GhPullFile[]> {
    return unwrap(
      await aureon.GET(`${REPO}/pulls/{n}/files`, {
        params: { path: { owner, repo, n } },
        signal: o.signal,
      }),
    )
  },
  async pullCommits(owner: string, repo: string, n: number, o: Opts = {}) {
    return unwrap(
      await aureon.GET(`${REPO}/pulls/{n}/commits`, {
        params: { path: { owner, repo, n } },
        signal: o.signal,
      }),
    )
  },
  async pullIssueComments(
    owner: string,
    repo: string,
    n: number,
    o: Opts = {},
  ): Promise<GhCommentOut[]> {
    return unwrap(
      await aureon.GET(`${REPO}/pulls/{n}/issue-comments`, {
        params: { path: { owner, repo, n } },
        signal: o.signal,
      }),
    )
  },
  async pullReviewComments(
    owner: string,
    repo: string,
    n: number,
    o: Opts = {},
  ): Promise<GhReviewCommentOut[]> {
    return unwrap(
      await aureon.GET(`${REPO}/pulls/{n}/comments`, {
        params: { path: { owner, repo, n } },
        signal: o.signal,
      }),
    )
  },
  async pullReviews(owner: string, repo: string, n: number, o: Opts = {}): Promise<GhReviewOut[]> {
    return unwrap(
      await aureon.GET(`${REPO}/pulls/{n}/reviews`, {
        params: { path: { owner, repo, n } },
        signal: o.signal,
      }),
    )
  },
  async issues(
    owner: string,
    repo: string,
    q: { state?: 'open' | 'closed' | 'all'; per_page?: number; page?: number } = {},
    o: Opts = {},
  ): Promise<S['ListPage_IssueOut_']> {
    return unwrap(
      await aureon.GET(`${REPO}/issues`, {
        params: { path: path(owner, repo), query: q },
        signal: o.signal,
      }),
    )
  },
  async issue(owner: string, repo: string, n: number, o: Opts = {}): Promise<S['IssueDetail']> {
    return unwrap(
      await aureon.GET(`${REPO}/issues/{n}`, {
        params: { path: { owner, repo, n } },
        signal: o.signal,
      }),
    )
  },
  async createIssue(owner: string, repo: string, body: S['IssueCreate']): Promise<GhIssueOut> {
    return unwrap(
      await aureon.POST(`${REPO}/issues`, { params: { path: path(owner, repo) }, body }),
    )
  },
  async updateIssue(
    owner: string,
    repo: string,
    n: number,
    body: S['IssueUpdate'],
  ): Promise<GhIssueOut> {
    return unwrap(
      await aureon.PATCH(`${REPO}/issues/{n}`, { params: { path: { owner, repo, n } }, body }),
    )
  },
  async comment(owner: string, repo: string, n: number, body: string): Promise<GhCommentOut> {
    return unwrap(
      await aureon.POST(`${REPO}/issues/{n}/comments`, {
        params: { path: { owner, repo, n } },
        body: { body },
      }),
    )
  },
}
