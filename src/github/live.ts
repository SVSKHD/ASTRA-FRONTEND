// The Code tab's repositories and open pull requests, read from Aureon.
//
// Replaces the Firestore mirror (gh-repos / gh-pulls / gh-comments) in an Aureon build:
// the allowlisted repositories come from Aureon's synced table, and each one's open pull
// requests from GitHub through Aureon, re-read every two minutes while the page is
// visible and at once when it comes back. Nothing here is a copy that can drift: what
// the list shows is what the server answered last.

import type { GhComment, GhPull, GhRepo, PullState } from '@/types'
import {
  ghApi,
  type GhCommentOut,
  type GhPullOut,
  type GhRepositoryOut,
  type GhReviewCommentOut,
  type GhReviewOut,
} from './aureon'

export const LIVE_POLL_MS = 120_000
/** Repositories whose pull requests are read on each pass; the rest list without counts. */
export const LIVE_MAX_REPOS = 30
const CONCURRENCY = 4

const ms = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : 0
}

export function repoOf(r: GhRepositoryOut, userId: string, openPRCount: number): GhRepo {
  return {
    id: String(r.id),
    userId,
    repoId: r.id,
    fullName: r.full_name,
    defaultBranch: r.default_branch ?? 'main',
    openPRCount,
    pushedAt: ms(r.pushed_at),
    updatedAt: ms(r.synced_at),
  }
}

function stateOf(p: GhPullOut): PullState {
  if (p.merged || p.merged_at) return 'merged'
  if (p.state === 'closed') return 'closed'
  return p.draft ? 'draft' : 'open'
}

export function pullOf(p: GhPullOut, repoId: number, userId: string): GhPull {
  return {
    id: `${repoId}#${p.number}`,
    userId,
    repoId,
    number: p.number,
    title: p.title,
    state: stateOf(p),
    draft: p.draft === true,
    author: p.user ?? '',
    headRef: p.head.ref ?? '',
    baseRef: p.base.ref ?? '',
    // The list endpoint carries no line counts or review decision; the row shows what
    // it has rather than zeros dressed up as data.
    additions: 0,
    deletions: 0,
    reviewDecision: '',
    commentCount: 0,
    createdAt: ms(p.created_at),
    updatedAt: ms(p.updated_at),
    url: p.html_url ?? '',
  }
}

/** Run `fn` over `items`, a few at a time. A failure for one item yields `null` for it. */
async function pool<I, O>(items: I[], fn: (item: I) => Promise<O>): Promise<(O | null)[]> {
  const out: (O | null)[] = new Array(items.length).fill(null)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      try {
        out[i] = await fn(items[i])
      } catch {
        out[i] = null
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker))
  return out
}

export interface LiveSnapshot {
  repos: GhRepo[]
  pulls: GhPull[]
  /** Repositories whose pull requests could not be read this pass. */
  failed: string[]
}

/** One pass: the allowlisted repositories, then each one's open pull requests. */
export async function readLive(userId: string, signal?: AbortSignal): Promise<LiveSnapshot> {
  const page = await ghApi.repositories({ limit: 200 }, { signal })
  const repos = page.items.filter((r) => !r.archived)
  const head = repos.slice(0, LIVE_MAX_REPOS)
  const lists = await pool(head, (r) =>
    ghApi.pulls(r.owner, r.name, { state: 'open', per_page: 50 }, { signal }),
  )
  const pulls: GhPull[] = []
  const failed: string[] = []
  const counts = new Map<number, number>()
  head.forEach((r, i) => {
    const list = lists[i]
    if (!list) {
      failed.push(r.full_name)
      return
    }
    counts.set(r.id, list.items.length)
    for (const p of list.items) pulls.push(pullOf(p, r.id, userId))
  })
  pulls.sort((a, b) => b.updatedAt - a.updatedAt)
  return {
    repos: repos
      .map((r) => repoOf(r, userId, counts.get(r.id) ?? 0))
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    pulls,
    failed,
  }
}

/** Pull ids whose `updatedAt` moved since the previous pass — what the rows ring. */
export function changedPulls(before: GhPull[], after: GhPull[]): string[] {
  const was = new Map(before.map((p) => [p.id, p.updatedAt]))
  return after.filter((p) => was.has(p.id) && was.get(p.id) !== p.updatedAt).map((p) => p.id)
}

// ---- one pull request's conversation -----------------------------------------------------

const PREVIEW = 280
const preview = (body: string | null | undefined) => {
  const text = (body ?? '').trim()
  return text.length > PREVIEW ? `${text.slice(0, PREVIEW - 1)}…` : text
}

export function threadOf(
  repoId: number,
  pullNumber: number,
  userId: string,
  parts: {
    issue: GhCommentOut[]
    review: GhReviewOut[]
    line: GhReviewCommentOut[]
  },
): GhComment[] {
  const base = { userId, repoId, pullNumber }
  const out: GhComment[] = [
    ...parts.issue.map((c) => ({
      ...base,
      id: `i${c.id}`,
      commentId: c.id,
      kind: 'issue' as const,
      author: c.user ?? '',
      bodyPreview: preview(c.body),
      path: '',
      line: 0,
      createdAt: ms(c.created_at),
      url: c.html_url ?? '',
    })),
    // A review with no summary is only its line comments; those come below.
    ...parts.review
      .filter(
        (r) => (r.body ?? '').trim() || r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED',
      )
      .map((r) => ({
        ...base,
        id: `r${r.id}`,
        commentId: r.id,
        kind: 'review' as const,
        author: r.user ?? '',
        bodyPreview:
          preview(r.body) ||
          (r.state === 'APPROVED'
            ? 'Approved'
            : r.state === 'CHANGES_REQUESTED'
              ? 'Changes requested'
              : ''),
        path: '',
        line: 0,
        createdAt: ms(r.submitted_at),
        url: r.html_url ?? '',
      })),
    ...parts.line.map((c) => ({
      ...base,
      id: `l${c.id}`,
      commentId: c.id,
      kind: 'review_comment' as const,
      author: c.user ?? '',
      bodyPreview: preview(c.body),
      path: c.path ?? '',
      line: c.line ?? 0,
      createdAt: ms(c.created_at),
      url: c.html_url ?? '',
    })),
  ]
  return out.sort((a, b) => a.createdAt - b.createdAt)
}

export async function readThread(
  fullName: string,
  repoId: number,
  pullNumber: number,
  userId: string,
  signal?: AbortSignal,
): Promise<GhComment[]> {
  const [owner, repo] = fullName.split('/')
  const [issue, review, line] = await Promise.all([
    ghApi.pullIssueComments(owner, repo, pullNumber, { signal }),
    ghApi.pullReviews(owner, repo, pullNumber, { signal }),
    ghApi.pullReviewComments(owner, repo, pullNumber, { signal }),
  ])
  return threadOf(repoId, pullNumber, userId, { issue, review, line })
}

/** repoId → "owner/name", kept from the last pass so a thread can find its repository. */
export const repoNames = new Map<number, string>()
