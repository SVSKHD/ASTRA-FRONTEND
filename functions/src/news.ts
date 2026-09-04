// The news pipeline (section 39).
//
// WHY IT IS A FUNCTION AT ALL. The browser cannot fetch a third-party feed: the
// publishers do not send `Access-Control-Allow-Origin`, so every one of these
// URLs is a CORS failure from a page and no amount of client code fixes it.
// Fetching happens here, the result is written to Firestore, and the app renders
// from a snapshot — which also means the feed is read once for everybody rather
// than once per open tab.
//
// WHERE IT WRITES. The top-level `forex` collection, which the existing rules
// already make readable by every signed-in user and writable only by an admin.
// The Admin SDK bypasses rules entirely, so the function can write it without a
// rules edit and without an owner field — this is one shared copy of the news,
// deliberately, including for the demo account. It is not anybody's data.
//
// ONE DEAD FEED MUST NOT STOP THE OTHER TWENTY. Every feed is fetched inside its
// own try/catch and a failure is recorded, not thrown: a publisher that 404s, a
// TLS handshake that hangs, XML that does not parse — each of those is one
// source missing from one run, and the run still writes the other eighteen.

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import Parser from 'rss-parser'
import { NEWS_TTL_DAYS, toNewsDoc, type NewsCategory, type RawItem } from './newsPure'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FEEDS, FOREX_KEYWORDS } = require('../feeds') as {
  FEEDS: { url: string; source: string; category: NewsCategory; tags: string[] }[]
  FOREX_KEYWORDS: Record<string, string[]>
}

/** The collection the rules already publish to every signed-in reader. */
const NEWS_COLLECTION = 'forex'
/** Per-feed health, in the same collection, under an id nothing else can take. */
const HEALTH_DOC = '_health'
/** Long enough for a slow publisher, short enough that twenty of them fit. */
const FETCH_TIMEOUT_MS = 15_000
/** Per feed, per run. A backlog is not worth a thousand writes. */
const MAX_ITEMS_PER_FEED = 25

interface FeedHealth {
  source: string
  url: string
  category: string
  status: number
  items: number
  written: number
  error: string
  at: number
}

/**
 * One feed, fetched and parsed, with every failure caught.
 *
 * The status is recorded whatever happens — that record IS the verification the
 * feed list cannot carry, because a URL that returned 200 the day it was added
 * can return 404 a month later and nothing would otherwise say so.
 */
async function pullFeed(
  feed: { url: string; source: string; category: NewsCategory; tags: string[] },
  parser: Parser,
  now: number,
): Promise<{ docs: ReturnType<typeof toNewsDoc>[]; health: FeedHealth }> {
  const health: FeedHealth = {
    source: feed.source,
    url: feed.url,
    category: feed.category,
    status: 0,
    items: 0,
    written: 0,
    error: '',
    at: now,
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let text: string
    try {
      const res = await fetch(feed.url, {
        signal: controller.signal,
        headers: {
          // Some publishers 403 a bare fetch. A named agent is honest about who
          // is asking and is what their robots guidance expects.
          'User-Agent': 'AstraNewsBot/1.0 (+https://github.com/SVSKHD/ASTRA-FRONTEND)',
          Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8',
        },
      })
      health.status = res.status
      if (!res.ok) {
        health.error = `HTTP ${res.status}`
        return { docs: [], health }
      }
      text = await res.text()
    } finally {
      clearTimeout(timer)
    }

    const parsed = await parser.parseString(text)
    const items = (parsed.items ?? []) as RawItem[]
    health.items = items.length
    const docs = items
      .slice(0, MAX_ITEMS_PER_FEED)
      .map((item) => toNewsDoc(item, feed, FOREX_KEYWORDS, now))
      .filter((d): d is NonNullable<ReturnType<typeof toNewsDoc>> => d !== null)
    health.written = docs.length
    return { docs, health }
  } catch (err) {
    // Every failure mode lands here and none of them propagates: a skip, never
    // a function failure.
    health.error = err instanceof Error ? err.message.slice(0, 200) : 'unknown'
    return { docs: [], health }
  }
}

export const pullNews = onSchedule(
  { schedule: 'every 15 minutes', region: 'asia-south1', timeoutSeconds: 300, memory: '512MiB' },
  async () => {
    const db = getFirestore()
    const parser = new Parser({ timeout: FETCH_TIMEOUT_MS })
    const now = Date.now()

    // Fetched in parallel because the run is dominated by waiting, and one slow
    // publisher should not add its latency to the other eighteen.
    const results = await Promise.all(FEEDS.map((feed) => pullFeed(feed, parser, now)))

    let written = 0
    let batch = db.batch()
    let pending = 0
    for (const { docs } of results) {
      for (const doc of docs) {
        if (!doc) continue
        // setDoc at the hashed id: the same item on the next run overwrites
        // rather than duplicating, which is what makes a 15-minute schedule
        // safe to run forever.
        batch.set(db.collection(NEWS_COLLECTION).doc(doc.id), {
          ...doc,
          publishedAt: Timestamp.fromMillis(doc.publishedAt),
          fetchedAt: Timestamp.fromMillis(doc.fetchedAt),
        })
        written += 1
        pending += 1
        if (pending >= 400) {
          await batch.commit()
          batch = db.batch()
          pending = 0
        }
      }
    }
    if (pending) await batch.commit()

    // The health record is the answer to "which feeds are actually alive",
    // available in the app rather than only in a log nobody opens.
    await db
      .collection(NEWS_COLLECTION)
      .doc(HEALTH_DOC)
      .set({
        kind: 'health',
        at: Timestamp.fromMillis(now),
        feeds: results.map((r) => r.health),
        ok: results.filter((r) => r.health.status === 200).length,
        total: results.length,
      })

    const dead = results.filter((r) => r.health.error).map((r) => r.health.source)
    logger.info('pullNews finished', { written, dead, feeds: results.length })
  },
)

/**
 * A month is as far back as a headline is worth keeping.
 *
 * Daily rather than on every pull: a delete sweep is a full-collection read and
 * doing it ninety-six times a day to remove the same nothing is waste.
 */
export const cleanupNews = onSchedule(
  { schedule: 'every day 03:30', region: 'asia-south1', timeZone: 'Asia/Kolkata' },
  async () => {
    const db = getFirestore()
    const cutoff = Timestamp.fromMillis(Date.now() - NEWS_TTL_DAYS * 86_400_000)
    const stale = await db
      .collection(NEWS_COLLECTION)
      .where('publishedAt', '<', cutoff)
      .limit(2000)
      .get()

    let removed = 0
    let batch = db.batch()
    for (const doc of stale.docs) {
      // The health document has no `publishedAt`, so it cannot match the query —
      // but it is named explicitly here too, because a document that carries the
      // pipeline's own diagnosis must not be deletable by the pipeline.
      if (doc.id === HEALTH_DOC) continue
      batch.delete(doc.ref)
      removed += 1
      if (removed % 400 === 0) {
        await batch.commit()
        batch = db.batch()
      }
    }
    if (removed % 400 !== 0) await batch.commit()
    logger.info('cleanupNews finished', { removed })
  },
)
