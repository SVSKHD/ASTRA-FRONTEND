// The GitHub integration's decisions, with no I/O (section 40).
//
// Two things live here because both are security-relevant and neither needs a
// network: whether a delivery is genuine, and what a delivery becomes in the
// database. A signature check that cannot be unit-tested is a signature check
// nobody has actually tested.

import { createHmac, timingSafeEqual } from 'node:crypto'

/** A comment is a pointer to GitHub, not a copy of it. */
export const BODY_PREVIEW_CHARS = 280

export type PullState = 'open' | 'draft' | 'merged' | 'closed'
export type CommentKind = 'issue' | 'review' | 'review_comment'

/**
 * Is this delivery really from GitHub?
 *
 * `timingSafeEqual` on the raw bytes, and both sides are hashed to a fixed
 * width first — the function throws on a length mismatch, and a throw is itself
 * an observable difference between "wrong length" and "wrong value".
 *
 * The comparison is over the RAW body. Parsing first and re-serialising would
 * compare a signature against bytes GitHub never sent: key order, whitespace and
 * unicode escaping all differ after a JSON round trip.
 */
export function verifySignature(rawBody: Buffer | string, header: string, secret: string): boolean {
  if (!header || !secret) return false
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  // Fixed width both sides: `timingSafeEqual` refuses unequal lengths, and that
  // refusal would leak the length of the expected digest.
  const a = Buffer.from(header.padEnd(80, '\0').slice(0, 80))
  const b = Buffer.from(expected.padEnd(80, '\0').slice(0, 80))
  return timingSafeEqual(a, b)
}

/**
 * The state a pull request is in, as one word.
 *
 * Draft is a state, not a flag on "open": a draft PR is not waiting for anybody
 * and drawing it the same as an open one is what makes a review queue useless.
 * Merged is likewise not "closed" — closed means abandoned.
 */
export function pullState(pr: {
  state?: string
  draft?: boolean
  merged?: boolean
  merged_at?: string | null
}): PullState {
  if (pr.merged || pr.merged_at) return 'merged'
  if (pr.state === 'closed') return 'closed'
  return pr.draft ? 'draft' : 'open'
}

/** Ids come from GitHub's own, so a replayed delivery overwrites rather than duplicates. */
export function repoDocId(repoId: number | string): string {
  return `r${repoId}`
}

export function pullDocId(repoId: number | string, number: number): string {
  return `r${repoId}-p${number}`
}

export function commentDocId(kind: CommentKind, commentId: number | string): string {
  return `${kind}-${commentId}`
}

/**
 * The stored slice of a comment.
 *
 * Truncated on a word boundary where one is near, so the preview does not end
 * mid-word for the sake of two characters. Same rule as the news: enough to
 * recognise the comment, never enough to be a copy of it.
 */
export function bodyPreview(body: unknown, max = BODY_PREVIEW_CHARS): string {
  const text = String(body ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max - 40 ? cut.slice(0, space) : cut).trimEnd()}…`
}

export function millisOf(value: unknown): number {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return typeof value === 'number' ? value : 0
}

export interface PullDoc {
  userId: string
  repoId: number
  number: number
  title: string
  state: PullState
  draft: boolean
  author: string
  headRef: string
  baseRef: string
  additions: number
  deletions: number
  reviewDecision: string
  commentCount: number
  createdAt: number
  updatedAt: number
  url: string
}

/**
 * One pull request as the document to store.
 *
 * Every field is read defensively: a webhook payload and a REST list response
 * are the same shape in the fields that matter and differ in the ones that do
 * not, and the list response omits `additions`/`deletions` entirely.
 */
export function toPullDoc(pr: Record<string, unknown>, userId: string, repoId: number): PullDoc {
  const user = (pr.user ?? {}) as Record<string, unknown>
  const head = (pr.head ?? {}) as Record<string, unknown>
  const base = (pr.base ?? {}) as Record<string, unknown>
  return {
    userId,
    repoId,
    number: Number(pr.number ?? 0),
    title: String(pr.title ?? '').slice(0, 300),
    state: pullState(pr as never),
    draft: pr.draft === true,
    author: String(user.login ?? ''),
    headRef: String(head.ref ?? ''),
    baseRef: String(base.ref ?? ''),
    additions: Number(pr.additions ?? 0),
    deletions: Number(pr.deletions ?? 0),
    // Only the GraphQL API reports this directly; over REST it is derived from
    // the reviews, so an empty string means "not known here" rather than "none".
    reviewDecision: String(pr.review_decision ?? ''),
    commentCount: Number(pr.comments ?? 0) + Number(pr.review_comments ?? 0),
    createdAt: millisOf(pr.created_at),
    updatedAt: millisOf(pr.updated_at),
    url: String(pr.html_url ?? ''),
  }
}

/** Which of the five events this delivery is, or '' for one we do not handle. */
export const HANDLED_EVENTS = [
  'pull_request',
  'pull_request_review',
  'pull_request_review_comment',
  'issue_comment',
  'push',
] as const

export type HandledEvent = (typeof HANDLED_EVENTS)[number]

export function isHandled(event: string): event is HandledEvent {
  return (HANDLED_EVENTS as readonly string[]).includes(event)
}

/**
 * What the sweep must repair (section 40).
 *
 * The half a webhook cannot do. A missed `closed` delivery leaves a row open
 * forever and nothing else would ever correct it: the webhook only speaks when
 * something happens, and the thing that happened is the thing we missed. So the
 * sweep compares what we hold against what GitHub currently lists, and anything
 * we still call open that is no longer listed was merged or closed while we were
 * not listening.
 *
 * Pure and separate so the claim "the sweep repairs drift" is a test rather than
 * a paragraph.
 */
export function driftRepairs(
  held: { id: string; number: number; state: PullState }[],
  liveNumbers: number[],
): string[] {
  const live = new Set(liveNumbers)
  return held
    .filter((row) => (row.state === 'open' || row.state === 'draft') && !live.has(row.number))
    .map((row) => row.id)
}

// ---------------------------------------------------------------------------
// The guided setup (section 44, item 9).
//
// The scopes and the events live here rather than in prose in two places,
// because the two places drift: the webhook handler already declares which five
// events it handles, and a setup page that lists a sixth is a setup page that
// tells somebody to configure a delivery nothing reads. `HANDLED_EVENTS` above
// is the handler's list, and `WEBHOOK_EVENTS` below is derived from it — the UI
// cannot get it wrong because it is not writing it down.

/**
 * The three permissions a fine-grained token needs, and nothing else.
 *
 * Every one of them is READ. This integration mirrors; it does not push, does
 * not comment and does not merge, so a leak of a correctly-scoped token is a
 * read of data the holder could already see — which is the whole reason the
 * setup asks for a fine-grained token rather than a classic one with `repo`.
 */
export const REQUIRED_SCOPES = [
  {
    key: 'metadata',
    label: 'Metadata',
    access: 'Read-only',
    why: 'Lists the repositories the token can see. Without it the other two are unusable and every sweep fails.',
  },
  {
    key: 'pull_requests',
    label: 'Pull requests',
    access: 'Read-only',
    why: 'The pull requests, their reviews and their comments — everything the Code tab shows.',
  },
  {
    key: 'contents',
    label: 'Contents',
    access: 'Read-only',
    why: 'The default branch and the last push time on each repository row.',
  },
] as const

/** The five deliveries the webhook handler acts on. Derived, never retyped. */
export const WEBHOOK_EVENTS = HANDLED_EVENTS

export interface ConnectionFacts {
  login: string
  connectedAtMs: number
  lastSyncAtMs: number
  limit: number
  remaining: number
  resetAtMs: number
}

export interface Connection {
  login: string
  connectedAt: number
  lastSyncAt: number
  rateLimit: { limit: number; remaining: number; resetAt: number }
  /** True when the quota is low enough that a sweep is about to start failing. */
  low: boolean
}

/**
 * What the panel is told about the connection.
 *
 * A function rather than an object literal at each call site, so there is one
 * definition of the shape AND one definition of "low" — and, more to the point,
 * one place that can be read to confirm the token itself is not in it. Every
 * field here is a fact ABOUT the credential; none of them is the credential.
 */
export function describeConnection(facts: ConnectionFacts): Connection {
  return {
    login: facts.login,
    connectedAt: facts.connectedAtMs,
    lastSyncAt: facts.lastSyncAtMs,
    rateLimit: {
      limit: facts.limit,
      remaining: facts.remaining,
      resetAt: facts.resetAtMs,
    },
    // A tenth of the window. The sweep costs one conditional request per repo
    // per quarter hour, so this is comfortably before anything breaks — which
    // is when a warning is worth reading.
    low: facts.limit > 0 && facts.remaining < facts.limit / 10,
  }
}
