// GitHub through Aureon: the transport `ghCall` uses when the app runs on Aureon
// (VITE_AUTH_PROVIDER=aureon, the production default).
//
// The GitHub tab, the repo cards and the task ↔ issue sync were written against
// the Netlify proxy, which answered with GitHub's own JSON. That proxy is not
// deployed with Aureon, so on spasta.online every one of those calls failed as
// "not configured". This file answers the same `GhOp`s from Aureon's
// /api/v1/github routes instead — same origin, the session cookie and CSRF via
// the shared `aureon` client — and reshapes Aureon's answers into the subset of
// GitHub's JSON the callers read. No token is ever in the browser: Aureon holds
// it and applies its own repository allowlist and admin check.
//
// What Aureon does not offer is refused here rather than faked:
//   - `putFile`: Aureon has no direct file commit; repository writes go through
//     its approval workflow. `ghSupports('putFile')` is false so the editor hides.
//   - `languages`: there is no per-language breakdown; the repository's main
//     language (from the repository detail) stands in, so the chips still show.
//   - conditional requests: Aureon has no ETag passthrough, so nothing is ever
//     304. It caches GitHub reads server-side (GITHUB_CACHE_TTL_SECONDS).
//   - PR CI status: not in Aureon's pull list, so `ci` is absent ("none").

import { aureon, errorMessage } from '@/api/client'
import type { components } from '@/api/schema'
import {
  GhNotConfiguredError,
  GhRateLimitError,
  type GhOp,
  type GhParams,
  type GhRateLimit,
  type GhResponse,
} from './ghProxy'

type S = components['schemas']

const UNSUPPORTED: ReadonlySet<GhOp> = new Set<GhOp>(['putFile'])

/** Whether Aureon can answer this op (the editor asks before offering a commit). */
export function ghSupports(op: GhOp): boolean {
  return !UNSUPPORTED.has(op)
}

interface Answer {
  data?: unknown
  error?: unknown
  response: Response
}

function codeOf(error: unknown): string {
  const detail = (error as { detail?: unknown } | null)?.detail
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const code = (detail as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return ''
}

/** Turn a failed Aureon answer into the errors the GitHub callers already handle. */
function raise(ans: Answer, what: string): never {
  const status = ans.response.status
  const code = codeOf(ans.error)
  if (code === 'github_rate_limited' || code === 'github_rate_limit_floor') {
    const retry = Number(ans.response.headers.get('retry-after'))
    const wait = Number.isFinite(retry) && retry > 0 ? retry * 1000 : 60_000
    throw new GhRateLimitError(
      Date.now() + wait,
      errorMessage(ans.error, 'GitHub rate limit reached'),
    )
  }
  if (code === 'github_not_configured') {
    throw new GhNotConfiguredError(errorMessage(ans.error, 'GitHub is not configured on Aureon'))
  }
  if (status === 401) throw new GhNotConfiguredError('Sign in to use GitHub')
  if (status === 403 && !code) {
    throw new Error('GitHub on Aureon is for admins only')
  }
  throw new Error(errorMessage(ans.error, `${what} failed (${status})`))
}

function ok<T>(ans: Answer, what: string): T {
  if (ans.error !== undefined || !ans.response.ok) raise(ans, what)
  return ans.data as T
}

function wrap<T>(
  status: number,
  data: unknown,
  rateLimit: GhRateLimit | null = null,
): GhResponse<T> {
  return { status, notModified: false, data: data as T, etag: null, rateLimit }
}

function need(params: GhParams, ...keys: (keyof GhParams)[]): void {
  for (const k of keys) {
    if (params[k] === undefined || params[k] === null || params[k] === '') {
      throw new Error(`GitHub call is missing ${k}`)
    }
  }
}

function repoPath(p: GhParams) {
  need(p, 'owner', 'repo')
  return { owner: p.owner as string, repo: p.repo as string }
}

function issuePath(p: GhParams) {
  need(p, 'number')
  return { ...repoPath(p), n: p.number as number }
}

const perPage = (n: number | undefined, max = 100) =>
  n === undefined ? undefined : Math.max(1, Math.min(max, Math.trunc(n)))

// ---- reshaping: Aureon → the GitHub fields the callers read -----------------

const userRef = (login: string | null | undefined) => (login ? { login } : null)
const labelRefs = (names: string[] | null | undefined) => (names ?? []).map((name) => ({ name }))

export function repoToGh(r: S['RepositoryOut'] | S['RepositoryDetail']): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    owner: { login: r.owner },
    description: r.description ?? null,
    private: r.private,
    default_branch: r.default_branch ?? 'main',
    archived: r.archived ?? false,
    pushed_at: r.pushed_at ?? null,
    html_url: r.html_url,
    language: 'language' in r ? (r.language ?? null) : null,
    open_issues_count: 'open_issues_count' in r ? (r.open_issues_count ?? 0) : 0,
  }
}

export function issueToGh(i: S['IssueOut']): Record<string, unknown> {
  return {
    number: i.number,
    title: i.title,
    body: i.body ?? '',
    state: i.state,
    state_reason: i.state_reason ?? null,
    labels: labelRefs(i.labels),
    assignees: (i.assignees ?? []).map((login) => ({ login })),
    user: userRef(i.user),
    comments: i.comments ?? 0,
    html_url: i.html_url ?? '',
    created_at: i.created_at ?? null,
    updated_at: i.updated_at ?? null,
    closed_at: i.closed_at ?? null,
    ...(i.is_pull_request ? { pull_request: {} } : {}),
  }
}

export function commitToGh(c: S['app__schemas__github__CommitOut']): Record<string, unknown> {
  return {
    sha: c.sha,
    html_url: c.html_url ?? '',
    author: userRef(c.author_login),
    commit: {
      message: c.message,
      author: { name: c.author_name ?? '', date: c.authored_at ?? c.committed_at ?? null },
    },
  }
}

export function pullToGh(p: S['PullOut'] | S['PullDetail']): Record<string, unknown> {
  return {
    number: p.number,
    title: p.title,
    body: p.body ?? null,
    state: p.state,
    draft: p.draft ?? false,
    merged: p.merged ?? false,
    merged_at: p.merged_at ?? null,
    updated_at: p.updated_at ?? null,
    created_at: p.created_at ?? null,
    html_url: p.html_url ?? '',
    user: userRef(p.user),
    head: { ref: p.head?.ref ?? '', sha: p.head?.sha ?? '' },
    base: { ref: p.base?.ref ?? '', sha: p.base?.sha ?? '' },
    labels: labelRefs(p.labels),
    ...('commits' in p
      ? {
          commits: p.commits ?? 0,
          additions: p.additions ?? 0,
          deletions: p.deletions ?? 0,
          changed_files: p.changed_files ?? 0,
          mergeable_state: p.mergeable_state ?? undefined,
        }
      : {}),
  }
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

/** Contents in GitHub's shape. Text comes decoded from Aureon; it is re-encoded as
 *  base64 because that is what the code pane decodes. Binary and too-large files
 *  carry no content, which the pane already shows as read-only. */
export function contentToGh(c: S['ContentOut']): Record<string, unknown> {
  const text = c.type === 'file' && c.content_kind === 'text' ? (c.text ?? '') : null
  return {
    type: c.type,
    path: c.path,
    name: c.name ?? c.path.split('/').pop(),
    sha: c.sha ?? '',
    size: c.size ?? 0,
    html_url: c.html_url ?? '',
    ...(text !== null ? { content: encodeBase64Utf8(text), encoding: 'base64' } : {}),
  }
}

export function rateLimitFrom(conn: S['ConnectionOut'] | undefined): GhRateLimit | null {
  const rl = conn?.rate_limit
  if (!rl || typeof rl.limit !== 'number' || typeof rl.remaining !== 'number') return null
  const reset = rl.reset_at ? Date.parse(rl.reset_at) : NaN
  return { limit: rl.limit, remaining: rl.remaining, resetAt: Number.isFinite(reset) ? reset : 0 }
}

// ---- the ops ----------------------------------------------------------------

const BASE = '/api/v1/github/repositories/{owner}/{repo}' as const

export async function aureonGhCall<T>(
  op: GhOp,
  params: GhParams = {},
  opts: { signal?: AbortSignal } = {},
): Promise<GhResponse<T>> {
  const signal = opts.signal
  switch (op) {
    case 'installations': {
      // Every repository Aureon lets this admin see, plus the connection's rate limit.
      const [repos, conn] = await Promise.all([
        aureon.GET('/api/v1/github/repositories', { params: { query: { limit: 200 } }, signal }),
        aureon.GET('/api/v1/github/connection', { signal }),
      ])
      const page = ok<S['Page_RepositoryOut_']>(repos, 'Listing repositories')
      const connection = conn.response.ok ? (conn.data as S['ConnectionOut']) : undefined
      return wrap<T>(200, page.items.map(repoToGh), rateLimitFrom(connection))
    }
    case 'viewer':
    case 'rateLimit': {
      const conn = ok<S['ConnectionOut']>(
        await aureon.GET('/api/v1/github/connection', { signal }),
        'Reading the GitHub connection',
      )
      const rl = rateLimitFrom(conn)
      if (op === 'viewer') return wrap<T>(200, { login: conn.login ?? '' }, rl)
      return wrap<T>(
        200,
        rl ? { limit: rl.limit, remaining: rl.remaining, reset: rl.resetAt } : null,
        rl,
      )
    }
    case 'repo': {
      const d = ok<S['RepositoryDetail']>(
        await aureon.GET(BASE, { params: { path: repoPath(params) }, signal }),
        'Reading the repository',
      )
      return wrap<T>(200, repoToGh(d))
    }
    case 'languages': {
      const d = ok<S['RepositoryDetail']>(
        await aureon.GET(BASE, { params: { path: repoPath(params) }, signal }),
        'Reading the repository',
      )
      return wrap<T>(200, d.language ? { [d.language]: 1 } : {})
    }
    case 'branches': {
      const list = ok<S['BranchOut'][]>(
        await aureon.GET(`${BASE}/branches`, { params: { path: repoPath(params) }, signal }),
        'Listing branches',
      )
      return wrap<T>(
        200,
        list.map((b) => ({ name: b.name, protected: b.protected, commit: { sha: b.sha } })),
      )
    }
    case 'commits': {
      const list = ok<S['app__schemas__github__CommitOut'][]>(
        await aureon.GET(`${BASE}/commits`, {
          params: {
            path: repoPath(params),
            query: {
              sha: params.ref || params.branch || undefined,
              per_page: perPage(params.perPage),
            },
          },
          signal,
        }),
        'Listing commits',
      )
      return wrap<T>(200, list.map(commitToGh))
    }
    case 'tree': {
      const t = ok<S['TreeOut']>(
        await aureon.GET(`${BASE}/tree`, {
          params: {
            path: repoPath(params),
            query: { ref: params.ref || undefined, recursive: true },
          },
          signal,
        }),
        'Reading the repository tree',
      )
      return wrap<T>(200, { sha: t.sha, truncated: t.truncated, tree: t.entries })
    }
    case 'file': {
      need(params, 'path')
      const c = ok<S['ContentOut']>(
        await aureon.GET(`${BASE}/contents/{path}`, {
          params: {
            path: { ...repoPath(params), path: params.path as string },
            query: { ref: params.ref || undefined },
          },
          signal,
        }),
        'Opening the file',
      )
      return wrap<T>(200, contentToGh(c))
    }
    case 'issues': {
      const page = ok<S['ListPage_IssueOut_']>(
        await aureon.GET(`${BASE}/issues`, {
          params: {
            path: repoPath(params),
            query: {
              state: params.state ?? 'open',
              labels: params.labels?.length ? params.labels.join(',') : undefined,
              since: params.since || undefined,
              per_page: perPage(params.perPage),
            },
          },
          signal,
        }),
        'Listing issues',
      )
      return wrap<T>(200, page.items.map(issueToGh))
    }
    case 'issue': {
      const d = ok<S['IssueOut']>(
        await aureon.GET(`${BASE}/issues/{n}`, { params: { path: issuePath(params) }, signal }),
        'Reading the issue',
      )
      return wrap<T>(200, issueToGh(d))
    }
    case 'createIssue': {
      need(params, 'title')
      const made = ok<S['IssueOut']>(
        await aureon.POST(`${BASE}/issues`, {
          params: { path: repoPath(params) },
          body: {
            title: params.title as string,
            body: params.body ?? null,
            ...(params.labels?.length ? { labels: params.labels } : {}),
            ...(params.assignees?.length ? { assignees: params.assignees } : {}),
          },
          signal,
        }),
        'Creating the issue',
      )
      return wrap<T>(201, issueToGh(made))
    }
    case 'patchIssue': {
      // Only the fields IssueUpdate accepts (it rejects unknown keys).
      const body: S['IssueUpdate'] = {}
      if (params.title !== undefined) body.title = params.title
      if (params.body !== undefined) body.body = params.body
      if (params.state === 'open' || params.state === 'closed') body.state = params.state
      if (params.labels !== undefined) body.labels = params.labels
      if (params.assignees !== undefined) body.assignees = params.assignees
      const d = ok<S['IssueOut']>(
        await aureon.PATCH(`${BASE}/issues/{n}`, {
          params: { path: issuePath(params) },
          body,
          signal,
        }),
        'Updating the issue',
      )
      return wrap<T>(200, issueToGh(d))
    }
    case 'comment': {
      need(params, 'body')
      const c = ok<S['CommentOut']>(
        await aureon.POST(`${BASE}/issues/{n}/comments`, {
          params: { path: issuePath(params) },
          body: { body: params.body as string },
          signal,
        }),
        'Commenting',
      )
      return wrap<T>(201, {
        id: c.id,
        body: c.body ?? '',
        html_url: c.html_url ?? '',
        user: userRef(c.user),
      })
    }
    case 'pulls': {
      const page = ok<S['ListPage_PullOut_']>(
        await aureon.GET(`${BASE}/pulls`, {
          params: {
            path: repoPath(params),
            query: { state: params.state ?? 'open', per_page: perPage(params.perPage) },
          },
          signal,
        }),
        'Listing pull requests',
      )
      return wrap<T>(200, page.items.map(pullToGh))
    }
    case 'pull': {
      const d = ok<S['PullDetail']>(
        await aureon.GET(`${BASE}/pulls/{n}`, { params: { path: issuePath(params) }, signal }),
        'Reading the pull request',
      )
      return wrap<T>(200, pullToGh(d))
    }
    case 'pullFiles': {
      const files = ok<S['PullFileOut'][]>(
        await aureon.GET(`${BASE}/pulls/{n}/files`, {
          params: { path: issuePath(params) },
          signal,
        }),
        'Listing changed files',
      )
      return wrap<T>(200, files)
    }
    case 'putFile':
      throw new Error(
        'Committing from the editor is not available on Aureon — repository writes need its approval workflow.',
      )
  }
}
