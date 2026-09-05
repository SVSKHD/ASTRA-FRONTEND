// The news and GitHub rows the harness photographs (sections 38–40).
//
// Deterministic, like the trade seed and for the same reason: a screenshot is
// only a baseline if the next run produces the same picture. Everything here is
// derived from `SEED_TODAY` and a fixed table, never from `Math.random` or the
// wall clock.
//
// It is also deliberately AWKWARD. A well-behaved sample proves nothing — so
// there is a headline long enough to wrap, a repo with no open pull requests, a
// draft, a merged PR, a closed one, a changes-requested review, a comment on a
// deep file path and a preview that was truncated. Those are the cases that
// break a layout, and they are the ones worth having a picture of.

import { SEED_TODAY } from '@/dev/seed'
import type { GhCommentKind, NewsCategory, PullState } from '@/types'

const DAY = 86_400_000
/** 09:00 IST on the pinned day, as the clock the rows are laid out around. */
const NOON = Date.parse(`${SEED_TODAY}T03:30:00Z`)

export interface SeedNews {
  id: string
  title: string
  link: string
  source: string
  category: NewsCategory
  tags: string[]
  publishedAt: number
}

interface NewsSpec {
  t: string
  s: string
  c: NewsCategory
  tags: string[]
  /** Hours before the pinned clock. */
  ago: number
}

const NEWS: NewsSpec[] = [
  {
    t: 'Fed holds rates, Powell signals one more cut is on the table this year',
    s: 'Federal Reserve',
    c: 'forex',
    tags: ['fed', 'fomc'],
    ago: 2,
  },
  {
    t: 'Gold steadies above $2,400 after the decision',
    s: 'Kitco',
    c: 'forex',
    tags: ['gold'],
    ago: 3,
  },
  { t: 'US CPI comes in at 2.9% year on year', s: 'BLS', c: 'forex', tags: ['cpi'], ago: 6 },
  {
    // The one that has to wrap. A headline cut at forty characters is a
    // headline nobody can judge, and this is the row that proves it does not.
    t: 'Dollar index slips for a third session as traders reprice the path of policy into the end of the year, with the euro and the yen both firmer',
    s: 'FXStreet',
    c: 'forex',
    tags: ['dxy'],
    ago: 9,
  },
  { t: 'ECB minutes show a divided council', s: 'ECB', c: 'forex', tags: ['ecb'], ago: 26 },
  { t: 'Nonfarm payrolls beat expectations at 187k', s: 'BLS', c: 'forex', tags: ['nfp'], ago: 30 },
  {
    t: 'Scaling laws for retrieval-augmented models',
    s: 'arXiv cs.LG',
    c: 'ai',
    tags: ['research'],
    ago: 1,
  },
  {
    t: 'A new family of small models for on-device use',
    s: 'Hugging Face',
    c: 'ai',
    tags: ['models'],
    ago: 5,
  },
  { t: 'On evaluating agents that use tools', s: 'Anthropic', c: 'ai', tags: ['agents'], ago: 12 },
  {
    t: 'Import AI 401: the year of the small model',
    s: 'Import AI',
    c: 'ai',
    tags: ['newsletter'],
    ago: 28,
  },
  { t: 'Vue 3.6 release candidate is out', s: 'Vue.js Blog', c: 'code', tags: ['vue'], ago: 4 },
  {
    t: 'Firebase JS SDK 11.4.0 release notes',
    s: 'Firebase',
    c: 'code',
    tags: ['firebase'],
    ago: 8,
  },
  {
    t: 'Show HN: a terminal UI for reading RSS',
    s: 'Hacker News',
    c: 'code',
    tags: ['hn'],
    ago: 11,
  },
  {
    t: 'Fine-grained tokens are now the default for new apps',
    s: 'GitHub Blog',
    c: 'code',
    tags: ['github'],
    ago: 27,
  },
  {
    t: 'The Changelog: shipping less on purpose',
    s: 'Changelog',
    c: 'code',
    tags: ['podcast'],
    ago: 34,
  },
]

export function seedNews(): SeedNews[] {
  return NEWS.map((n, i) => ({
    id: `seed-news-${String(i + 1).padStart(2, '0')}`,
    title: n.t,
    link: `https://example.invalid/${i + 1}`,
    source: n.s,
    category: n.c,
    tags: n.tags,
    publishedAt: NOON - n.ago * 3_600_000,
  })).sort((a, b) => b.publishedAt - a.publishedAt)
}

/**
 * What every feed answered on the last pull, including three that did not.
 *
 * The panel's whole job is to distinguish the ways a feed fails, so the seed
 * has to contain one of each or the picture is of the happy path: a 200 that
 * parsed to nothing, a 404, a 200 whose body was not a feed, and one in the
 * penalty box after a run of failures.
 */
export function seedFeedHealth() {
  const seen = new Map<string, { source: string; category: NewsCategory; items: number }>()
  for (const n of NEWS) {
    const row = seen.get(n.s) ?? { source: n.s, category: n.c, items: 0 }
    row.items += 1
    seen.set(n.s, row)
  }
  const ok = [...seen.values()].map((row, i) => ({
    url: `https://example.invalid/feed/${i + 1}.xml`,
    source: row.source,
    category: row.category,
    status: 200,
    parsed: true,
    items: row.items,
    usable: row.items,
    written: row.items,
    error: '',
    ms: 180 + i * 20,
    at: SEED_FEED_PULLED_AT,
    fails: 0,
  }))
  return [
    ...ok,
    // Each of the four ways a feed fails, so the panel is photographed showing
    // all of them rather than nineteen green rows.
    {
      url: 'https://example.invalid/feed/quiet.xml',
      source: 'DailyFX',
      category: 'forex' as NewsCategory,
      status: 200,
      parsed: true,
      items: 0,
      usable: 0,
      written: 0,
      error: '',
      ms: 210,
      at: SEED_FEED_PULLED_AT,
      fails: 1,
    },
    {
      url: 'https://example.invalid/feed/moved.html',
      source: 'ECB',
      category: 'forex' as NewsCategory,
      // A 200 whose body is an HTML page where the XML used to be. It needs a
      // new URL, not a removal, and the panel has to say which.
      status: 200,
      parsed: false,
      items: 0,
      usable: 0,
      written: 0,
      error: '',
      ms: 260,
      at: SEED_FEED_PULLED_AT,
      fails: 3,
    },
    {
      url: 'https://example.invalid/feed/gone.xml',
      source: 'Google AI',
      category: 'ai' as NewsCategory,
      status: 404,
      parsed: false,
      items: 0,
      usable: 0,
      written: 0,
      error: 'HTTP 404',
      ms: 90,
      at: SEED_FEED_PULLED_AT,
      // Past the threshold: not fetched this run, re-probed every sixth hour.
      fails: 9,
      skipped: true,
    },
  ]
}

export interface SeedRepo {
  id: string
  repoId: number
  fullName: string
  defaultBranch: string
  openPRCount: number
  pushedAt: number
  updatedAt: number
}

export interface SeedPull {
  id: string
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

export interface SeedGhComment {
  id: string
  repoId: number
  pullNumber: number
  commentId: number
  kind: GhCommentKind
  author: string
  bodyPreview: string
  path: string
  line: number
  createdAt: number
  url: string
}

const REPOS: { repoId: number; fullName: string }[] = [
  { repoId: 8801, fullName: 'svskhd/astra-frontend' },
  { repoId: 8802, fullName: 'svskhd/dacoit-signals' },
  // The empty one. A repo with nothing open is the state most repos are in
  // most of the time, and a list that has never been photographed in it is a
  // list nobody has checked the empty case of.
  { repoId: 8803, fullName: 'svskhd/astra-docs' },
]

interface PullSpec {
  repoId: number
  number: number
  title: string
  state: PullState
  author: string
  headRef: string
  reviewDecision: string
  additions: number
  deletions: number
  comments: number
  ago: number
}

const PULL_SPECS: PullSpec[] = [
  {
    repoId: 8801,
    number: 61,
    title: 'A news feed and a GitHub mirror that are live without the browser asking',
    state: 'open',
    author: 'svskhd',
    headRef: 'claude/vue-trade-logger',
    reviewDecision: 'changes_requested',
    additions: 2140,
    deletions: 96,
    comments: 5,
    ago: 2,
  },
  {
    repoId: 8801,
    number: 60,
    title: 'Frosted glass surfaces',
    state: 'draft',
    author: 'svskhd',
    headRef: 'glass',
    reviewDecision: '',
    additions: 310,
    deletions: 88,
    comments: 0,
    ago: 20,
  },
  {
    repoId: 8801,
    number: 59,
    title: 'Expenses, a demo month, and a harness that photographs it',
    state: 'merged',
    author: 'svskhd',
    headRef: 'demo',
    reviewDecision: 'approved',
    additions: 4210,
    deletions: 310,
    comments: 3,
    ago: 48,
  },
  {
    repoId: 8801,
    number: 58,
    title: 'Drop the unused stocks widget',
    state: 'closed',
    author: 'svskhd',
    headRef: 'stocks',
    reviewDecision: '',
    additions: 4,
    deletions: 220,
    comments: 1,
    ago: 96,
  },
  {
    repoId: 8802,
    number: 12,
    title: 'Idempotent ingestion on signalId',
    state: 'open',
    author: 'svskhd',
    headRef: 'idempotent',
    reviewDecision: 'approved',
    additions: 88,
    deletions: 12,
    comments: 2,
    ago: 7,
  },
]

export function seedRepos(): SeedRepo[] {
  const open = new Map<number, number>()
  for (const p of PULL_SPECS) {
    if (p.state !== 'open' && p.state !== 'draft') continue
    open.set(p.repoId, (open.get(p.repoId) ?? 0) + 1)
  }
  return REPOS.map((r) => ({
    id: `r${r.repoId}-demo-uid`,
    repoId: r.repoId,
    fullName: r.fullName,
    defaultBranch: 'dev01',
    openPRCount: open.get(r.repoId) ?? 0,
    pushedAt: NOON - 2 * 3_600_000,
    updatedAt: NOON - 2 * 3_600_000,
  }))
}

export function seedPulls(): SeedPull[] {
  return PULL_SPECS.map((p) => ({
    id: `r${p.repoId}-p${p.number}-demo-uid`,
    repoId: p.repoId,
    number: p.number,
    title: p.title,
    state: p.state,
    draft: p.state === 'draft',
    author: p.author,
    headRef: p.headRef,
    baseRef: 'dev01',
    additions: p.additions,
    deletions: p.deletions,
    reviewDecision: p.reviewDecision,
    commentCount: p.comments,
    createdAt: NOON - (p.ago + 24) * 3_600_000,
    updatedAt: NOON - p.ago * 3_600_000,
    url: `https://github.com/${REPOS.find((r) => r.repoId === p.repoId)?.fullName}/pull/${p.number}`,
  })).sort((a, b) => b.updatedAt - a.updatedAt)
}

interface CommentSpec {
  kind: GhCommentKind
  author: string
  body: string
  path?: string
  line?: number
  ago: number
}

/** The thread on PR 61, which is the one the Code shot expands. */
const THREAD: CommentSpec[] = [
  {
    kind: 'issue',
    author: 'svskhd',
    body: 'Opening this as a draft first — the sweep still needs a test.',
    ago: 26,
  },
  {
    kind: 'review',
    author: 'reviewer',
    body: 'Read the whole diff. The webhook half is right; the ETag handling is what I want to talk about.',
    ago: 12,
  },
  {
    kind: 'review_comment',
    author: 'reviewer',
    body: 'A 304 here costs no rate limit, which is the point — but the stored ETag needs a namespace or two repos will collide on it.',
    path: 'functions/src/github.ts',
    line: 214,
    ago: 11,
  },
  {
    kind: 'review_comment',
    author: 'reviewer',
    body: 'This preview is what gets stored, so it has to be the truncated one and not the body. It is, but the name reads as though it might not be, and the next person to touch this will have to go and check — which is exactly the kind of doubt a name should not create in the first place, so please rename it',
    path: 'functions/src/githubPure.ts',
    line: 75,
    ago: 10,
  },
  {
    kind: 'issue',
    author: 'svskhd',
    body: 'Both fixed. The ETag doc id is now a hash of the full name.',
    ago: 4,
  },
]

export function seedComments(): SeedGhComment[] {
  return THREAD.map((c, i) => ({
    id: `${c.kind}-${9000 + i}-demo-uid`,
    repoId: 8801,
    pullNumber: 61,
    commentId: 9000 + i,
    kind: c.kind,
    author: c.author,
    // Truncated the same way the function truncates it, so the picture is of
    // what would actually be stored.
    bodyPreview: c.body.length > 280 ? `${c.body.slice(0, 279).trimEnd()}…` : c.body,
    path: c.path ?? '',
    line: c.line ?? 0,
    createdAt: NOON - c.ago * 3_600_000,
    url: 'https://github.com/svskhd/astra-frontend/pull/61',
  }))
}

export const SEED_FEED_PULLED_AT = NOON - 6 * 60_000
export const SEED_FEED_DAY = new Date(NOON - DAY).toISOString().slice(0, 10)
