// GitHub through Aureon: the one place the SPA reads GitHub from the self-hosted backend.
//
// Aureon holds the token (GITHUB_TOKEN on the server) and answers /api/v1/github/* for
// admins, same origin, with the session cookie and the CSRF header the shared client
// adds. Nothing token-shaped ever reaches this file: the connection endpoint reports a
// fingerprint and a kind, never the token.
//
// Two layers:
//   - typed calls (`ghApi.*`), used by the connection card, the Code tab's live list and
//     the AI workspace;
//   - `aureonGhCall`, which serves the older `ghCall` ops (utils/ghProxy) from those same
//     calls and reshapes the answers into the GitHub REST shapes the Issues, Pull
//     requests, Code and Repos panes already parse. That keeps those panes as they are
//     instead of writing a second set of them.

import { aureon, type components } from '@/api/client'
import {
  GhNotConfiguredError,
  GhRateLimitError,
  type GhOp,
  type GhParams,
  type GhRateLimit,
  type GhResponse,
} from '@/utils/ghProxy'
import { encodeBase64Utf8 } from '@/utils/ghCode'

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

// ---- the older ghCall ops, served from Aureon ------------------------------------------

/** Aureon's rate-limit snapshot as the panes' GhRateLimit (epoch ms). */
export function rateLimitOf(c: GhConnectionOut | null | undefined): GhRateLimit | null {
  const rl = c?.rate_limit
  if (!rl || rl.limit == null || rl.remaining == null) return null
  const reset = rl.reset_at ? Date.parse(rl.reset_at) : 0
  return { limit: rl.limit, remaining: rl.remaining, resetAt: Number.isFinite(reset) ? reset : 0 }
}

/** A repository as GitHub's REST API spells it (owner.login, default_branch, …). */
export function rawRepo(r: GhRepositoryOut | GhRepositoryDetail): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    owner: { login: r.owner },
    private: r.private,
    html_url: r.html_url,
    description: r.description ?? '',
    default_branch: r.default_branch ?? 'main',
    pushed_at: r.pushed_at ?? null,
    archived: r.archived ?? false,
    language: 'language' in r ? (r.language ?? '') : '',
    open_issues_count: 'open_issues_count' in r ? (r.open_issues_count ?? 0) : 0,
  }
}

export function rawIssue(i: GhIssueOut): Record<string, unknown> {
  return {
    number: i.number,
    title: i.title,
    body: i.body ?? '',
    state: i.state,
    labels: (i.labels ?? []).map((name) => ({ name })),
    assignees: (i.assignees ?? []).map((login) => ({ login })),
    user: { login: i.user ?? '' },
    html_url: i.html_url ?? '',
    created_at: i.created_at ?? null,
    updated_at: i.updated_at ?? null,
    closed_at: i.closed_at ?? null,
    comments: i.comments ?? 0,
    ...(i.is_pull_request ? { pull_request: {} } : {}),
  }
}

export function rawPull(p: GhPullOut | GhPullDetail): Record<string, unknown> {
  return {
    ...p,
    user: { login: p.user ?? '' },
    head: { ref: p.head.ref ?? '', sha: p.head.sha ?? '' },
    base: { ref: p.base.ref ?? '', sha: p.base.sha ?? '' },
    labels: (p.labels ?? []).map((name) => ({ name })),
    html_url: p.html_url ?? '',
    updated_at: p.updated_at ?? '',
  }
}

export function rawCommit(c: GhCommitOut): Record<string, unknown> {
  return {
    sha: c.sha,
    html_url: c.html_url ?? '',
    author: c.author_login ? { login: c.author_login } : null,
    commit: {
      message: c.message,
      author: { name: c.author_name ?? '', date: c.authored_at ?? c.committed_at ?? null },
    },
  }
}

/** A file's contents in the contents-API shape: base64 text, or no content when binary. */
export function rawFile(c: GhContentOut): Record<string, unknown> {
  const text = c.content_kind === 'text' && typeof c.text === 'string' ? c.text : null
  return {
    type: c.type,
    path: c.path,
    name: c.name ?? '',
    sha: c.sha ?? '',
    size: c.size ?? 0,
    html_url: c.html_url ?? '',
    ...(text !== null ? { content: encodeBase64Utf8(text), encoding: 'base64' } : {}),
  }
}

function need(p: GhParams): { owner: string; repo: string } {
  if (!p.owner || !p.repo) throw new GhApiError('Pick a repository first.', 400)
  return { owner: p.owner, repo: p.repo }
}
function num(p: GhParams): number {
  if (typeof p.number !== 'number') throw new GhApiError('Which number?', 400)
  return p.number
}

const ok = <T>(data: T, rateLimit: GhRateLimit | null = null): GhResponse<T> => ({
  status: 200,
  notModified: false,
  data,
  etag: null,
  rateLimit,
})

/**
 * One `ghCall` op, answered by Aureon. Aureon does not do conditional requests, so there
 * is never a 304 and never an etag; its own cache and sync table keep GitHub's quota.
 */
export async function aureonGhCall<T>(
  op: GhOp,
  params: GhParams = {},
  opts: { signal?: AbortSignal } = {},
): Promise<GhResponse<T>> {
  const o = { signal: opts.signal }
  const as = <R>(data: R) => ok(data as unknown as T)
  switch (op) {
    case 'installations': {
      // Every repository the server's allowlist lets the SPA open. A bare array, the
      // shape the token proxy used, so the store and RepoBrowser read it unchanged.
      const page = await ghApi.repositories({ limit: 200 }, o)
      return as(page.items.map(rawRepo))
    }
    case 'repo': {
      const { owner, repo } = need(params)
      return as(rawRepo(await ghApi.repository(owner, repo, o)))
    }
    case 'languages': {
      // Aureon reports the main language only; that is one honest chip.
      const { owner, repo } = need(params)
      const d = await ghApi.repository(owner, repo, o)
      return as(d.language ? { [d.language]: 1 } : {})
    }
    case 'issues': {
      const { owner, repo } = need(params)
      const page = await ghApi.issues(
        owner,
        repo,
        { state: params.state ?? 'open', per_page: Math.min(params.perPage ?? 50, 100) },
        o,
      )
      return as(page.items.map(rawIssue))
    }
    case 'issue': {
      const { owner, repo } = need(params)
      return as(rawIssue(await ghApi.issue(owner, repo, num(params), o)))
    }
    case 'createIssue': {
      const { owner, repo } = need(params)
      const created = await ghApi.createIssue(owner, repo, {
        title: params.title ?? '',
        body: params.body ?? null,
        labels: params.labels ?? null,
        assignees: params.assignees ?? null,
      })
      return as(rawIssue(created))
    }
    case 'patchIssue': {
      const { owner, repo } = need(params)
      const body: S['IssueUpdate'] = {}
      if (params.title !== undefined) body.title = params.title
      if (params.body !== undefined) body.body = params.body
      if (params.state !== undefined && params.state !== 'all') body.state = params.state
      if (params.labels !== undefined) body.labels = params.labels
      if (params.assignees !== undefined) body.assignees = params.assignees
      return as(rawIssue(await ghApi.updateIssue(owner, repo, num(params), body)))
    }
    case 'comment': {
      const { owner, repo } = need(params)
      return as(await ghApi.comment(owner, repo, num(params), params.body ?? ''))
    }
    case 'commits': {
      const { owner, repo } = need(params)
      const list = await ghApi.commits(
        owner,
        repo,
        {
          per_page: Math.min(params.perPage ?? 30, 100),
          ...(params.ref ? { sha: params.ref } : {}),
        },
        o,
      )
      return as(list.map(rawCommit))
    }
    case 'pulls': {
      const { owner, repo } = need(params)
      const page = await ghApi.pulls(
        owner,
        repo,
        { state: params.state ?? 'open', per_page: Math.min(params.perPage ?? 30, 100) },
        o,
      )
      return as(page.items.map(rawPull))
    }
    case 'pull': {
      const { owner, repo } = need(params)
      return as(rawPull(await ghApi.pull(owner, repo, num(params), o)))
    }
    case 'pullFiles': {
      const { owner, repo } = need(params)
      return as(await ghApi.pullFiles(owner, repo, num(params), o))
    }
    case 'branches': {
      const { owner, repo } = need(params)
      const list = await ghApi.branches(owner, repo, o)
      return as(list.map((b) => ({ name: b.name, protected: b.protected, commit: { sha: b.sha } })))
    }
    case 'tree': {
      const { owner, repo } = need(params)
      const t = await ghApi.tree(owner, repo, { ref: params.ref, recursive: true }, o)
      return as({ tree: t.entries, truncated: t.truncated, sha: t.sha })
    }
    case 'file': {
      const { owner, repo } = need(params)
      return as(rawFile(await ghApi.contents(owner, repo, params.path ?? '', params.ref, o)))
    }
    case 'viewer': {
      const c = await ghApi.connection(o)
      return ok({ login: c.login ?? '' } as unknown as T, rateLimitOf(c))
    }
    case 'rateLimit': {
      const c = await ghApi.connection(o)
      const rl = rateLimitOf(c)
      return ok(rl as unknown as T, rl)
    }
    case 'putFile':
      // Aureon has no direct-commit endpoint on purpose: a change is a code task, made on
      // its own branch, tested, and applied only after an admin approves it.
      throw new GhApiError(
        'Direct commits are off on Aureon. Request the change instead: it runs as a code task and lands only after you approve its diff.',
        405,
        'direct_commit_disabled',
      )
  }
}
