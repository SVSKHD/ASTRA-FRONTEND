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
