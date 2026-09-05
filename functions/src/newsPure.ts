// The news pipeline's decisions, with no I/O (section 39).
//
// Split out for the same reason `dacoitPure` is: the two things that decide what
// ends up in the database — which document an item lands on, and what a headline
// gets tagged with — are pure, and pure things can be tested from the app's own
// test run rather than only from a deployed function.

import { createHash } from 'node:crypto'

export type NewsCategory = 'forex' | 'ai' | 'code'

export interface RawItem {
  title?: string
  link?: string
  guid?: string
  isoDate?: string
  pubDate?: string
  [key: string]: unknown
}

export interface NewsDoc {
  id: string
  title: string
  link: string
  source: string
  category: NewsCategory
  tags: string[]
  publishedAt: number
  fetchedAt: number
}

/**
 * The document id.
 *
 * A SHA-1 of the GUID when the feed gives one and of the link otherwise, so the
 * same item pulled at 09:00 and at 09:15 is one document rather than two.
 * `setDoc` at this id makes a re-pull an overwrite; `addDoc` would make it a
 * duplicate every fifteen minutes, forever.
 *
 * Truncated to 32 hex characters: a Firestore id has a length budget and the
 * first half of a SHA-1 is far past the point where a collision is a concern
 * for a few thousand headlines.
 */
export function newsId(item: RawItem): string {
  const key = String(item.guid || item.link || item.title || '').trim()
  return createHash('sha1').update(key).digest('hex').slice(0, 32)
}

/** Feeds date things in a dozen ways; anything unparseable falls back to now. */
export function publishedAt(item: RawItem, now = Date.now()): number {
  const raw = item.isoDate || item.pubDate
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw)
    if (!Number.isNaN(parsed)) return parsed
  }
  return now
}

/**
 * The keywords a headline matches.
 *
 * Word boundaries on both sides, so "CPI" matches and "recipient" does not, and
 * a multi-word phrase matches as a phrase. Case-insensitive because headline
 * capitalisation is not a signal.
 */
export function matchKeywords(title: string, keywords: Record<string, string[]>): string[] {
  const haystack = ` ${title.toLowerCase()} `
  const hits: string[] = []
  for (const [tag, words] of Object.entries(keywords)) {
    if (
      words.some((w) => new RegExp(`(^|[^a-z0-9])${escape(w)}([^a-z0-9]|$)`, 'i').test(haystack))
    ) {
      hits.push(tag)
    }
  }
  return hits
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * One feed item as the document to store.
 *
 * Headline, link, source and timestamp. Never the body: the publisher's page is
 * the publisher's, this is an index of it, and storing paragraphs would make
 * this a scraper with a copyright problem instead of a reading list.
 */
export function toNewsDoc(
  item: RawItem,
  feed: { source: string; category: NewsCategory; tags: string[] },
  keywords: Record<string, string[]>,
  now = Date.now(),
): NewsDoc | null {
  const title = String(item.title ?? '').trim()
  const link = String(item.link ?? '').trim()
  // An item with no title or no link is not a headline anybody can act on.
  if (!title || !link) return null
  const tags = [...feed.tags]
  if (feed.category === 'forex') {
    for (const tag of matchKeywords(title, keywords)) if (!tags.includes(tag)) tags.push(tag)
  }
  return {
    id: newsId(item),
    title: title.slice(0, 300),
    link,
    source: feed.source,
    category: feed.category,
    tags,
    publishedAt: publishedAt(item, now),
    fetchedAt: now,
  }
}

/** Anything older than this is dropped by the daily cleanup. */
export const NEWS_TTL_DAYS = 30

export function isExpired(publishedAtMs: number, now = Date.now(), days = NEWS_TTL_DAYS): boolean {
  return now - publishedAtMs > days * 86_400_000
}

// ---------------------------------------------------------------------------
// The health record (section 44, item 8).
//
// Here rather than in `news.ts` for the same reason `toNewsDoc` is: these are
// decisions — which feeds get fetched, and how a run is described — and a
// decision that can only be exercised by deploying a function is a decision
// nobody exercises. `news.ts` imports `firebase-admin` and `rss-parser`; this
// file imports `node:crypto`, which is what lets the app's own test run reach
// it without the functions package being installed.

export interface FeedDef {
  url: string
  source: string
  category: NewsCategory
  tags: string[]
  verified?: 'ok' | 'unchecked' | 'blocked' | 'dead'
  note?: string
}

/**
 * What one feed did on one run.
 *
 * The stages are recorded separately because they fail separately and each
 * needs a different fix: a 404 is a dead URL, a 200 that did not parse is a
 * publisher serving an HTML page where the XML used to be, items with no
 * `usable` count is a feed of untitled or unlinked entries, and `usable` with
 * no `written` is a Firestore write that failed.
 *
 * `written` is the count that ACTUALLY REACHED `forex`, set only after the
 * commit resolved. It used to be the number of documents built, which meant a
 * run whose every write failed still reported nineteen healthy feeds.
 */
export interface FeedHealth {
  source: string
  url: string
  category: string
  /** The HTTP status. 0 means the request never completed at all. */
  status: number
  /** Did the body parse as a feed? */
  parsed: boolean
  /** Items the feed returned. */
  items: number
  /** Of those, the ones with both a title and a link. */
  usable: number
  /** Documents committed to `forex`. Never the number built. */
  written: number
  error: string
  /** How long the fetch and the parse took, in ms. */
  ms: number
  at: number
  /**
   * Consecutive runs this feed has failed, carried across runs.
   *
   * Reset to zero the moment it answers 200 with a parseable body, so a
   * publisher that was down for an afternoon is back in the rotation without
   * anybody touching anything.
   */
  fails: number
  /** True when this run did not fetch it, because it is in the penalty box. */
  skipped?: boolean
}

/**
 * Failures before a feed stops being fetched every fifteen minutes.
 *
 * Six is an hour and a half. Short enough that a genuinely dead URL stops
 * costing a request every quarter hour within the morning; long enough that a
 * publisher's ten-minute deploy does not evict them.
 */
export const FAIL_THRESHOLD = 6
/**
 * How often a feed in the penalty box is tried again anyway.
 *
 * Every twenty-fourth run is every six hours on the fifteen-minute schedule.
 * WITHOUT THIS THE PENALTY BOX IS A GRAVE: a feed that is skipped never gets a
 * result, so its counter never resets, so it is skipped forever — and the
 * failure mode of an automatic drop rule is that it silently keeps dropping a
 * source that came back weeks ago.
 */
export const REPROBE_EVERY = 24

/**
 * Is this feed fetched on this run?
 *
 * This is "drop any feed that does not return 200" as BEHAVIOUR rather than as
 * an instruction somebody has to remember to carry out. `feeds.js`'s `verified:
 * 'dead'` is still honoured — that is the permanent, human decision — and this
 * is the automatic one that happens in between.
 */
export function shouldFetch(fails: number): boolean {
  if (fails < FAIL_THRESHOLD) return true
  return fails % REPROBE_EVERY === 0
}

/**
 * A feed marked dead is not fetched.
 *
 * "Drop any feed that does not return 200" is a standing instruction, not a
 * one-off edit, so it is enforced on every run as well as recorded in
 * `feeds.js`. The marking is done by `scripts/check-feeds.mjs --write`, which
 * refuses to mark anything dead when EVERY feed failed the same way — nineteen
 * independent publishers do not break in the same second, and a uniform failure
 * is the egress policy of the machine running the check, not a verdict on the
 * publishers. That is also why `unchecked` is kept rather than dropped: it
 * means "nobody has been able to ask", which is not the same as "no".
 */
export function liveFeeds(feeds: FeedDef[]): FeedDef[] {
  return feeds.filter((f) => f.verified !== 'dead')
}

/**
 * One line per feed, in the shape somebody reading a log wants to read.
 *
 * The verdict names the FIRST stage that failed. Order matters: a feed that
 * 404s has no parse to report on, and a feed that did not parse has no item
 * count worth believing. Saying the first thing that went wrong is the
 * difference between a diagnosis and a list of symptoms.
 */
export function healthLine(h: FeedHealth): string {
  const status = h.status || '—'
  const verdict = h.error
    ? `FAIL ${h.error}`
    : !h.parsed
      ? 'FAIL did not parse'
      : h.written === 0
        ? 'EMPTY'
        : 'ok'
  return (
    `${verdict.padEnd(28)} ${String(status).padStart(3)} ${h.category.padEnd(5)} ` +
    `${h.source.padEnd(18)} items=${h.items} usable=${h.usable} written=${h.written} ${h.ms}ms`
  )
}
