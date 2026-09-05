// The news pipeline (section 39, reworked in 44).
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
//
// ---------------------------------------------------------------------------
// WHY "NEWS RETURNS NOTHING", AND WHAT CHANGED
//
// Four things could produce an empty News tab, and three of them are ruled out
// by reading the code rather than by guessing:
//
//   the client queries a collection the function does not write to
//       Ruled out. Both name `forex` — `NEWS_COLLECTION` here and in
//       `composables/useNews.ts` — and the health document is excluded from the
//       client's query by having no `category`, so it cannot be the thing being
//       counted.
//   a missing composite index
//       Ruled out. The query is `where('category','in',…)` ordered by
//       `publishedAt desc`, and `firestore.indexes.json` carries exactly
//       `forex (category ASC, publishedAt DESC)`. A missing index would also
//       surface as a listener ERROR in the tab, not as silence.
//   dead feed URLs
//       Possible, and now impossible to be silent about — see the health record
//       below. It cannot be settled from a sandbox whose egress policy answers
//       403 for every host, which is a fact about the sandbox and not about the
//       publishers. `scripts/check-feeds.mjs` is the thing to run somewhere with
//       real egress, and `pullNewsNow` is the thing to call against the real
//       project.
//   THE FUNCTION IS NEVER SCHEDULED
//       This is the one the repository actually evidences. `netlify.toml` builds
//       and deploys the Vite front end and nothing else; there is no workflow,
//       no CI step and no hook anywhere in this repository that runs
//       `firebase deploy --only functions`. A scheduled function that was never
//       deployed has no Cloud Scheduler job, has never run, and leaves `forex`
//       empty — which reads from the app exactly like a feed problem.
//       `.github/workflows/deploy-functions.yml` is the fix.
//
// WHAT THE HEALTH RECORD NOW SAYS, per feed, per run: the HTTP status, whether
// the parse succeeded, how many items came back, how many of those were usable,
// and how many documents were ACTUALLY COMMITTED to `forex`. The last one is
// the field that matters and it is the one that did not exist: `written` used
// to be the number of documents BUILT, so a run whose every commit failed
// reported a healthy nineteen-for-nineteen. And every run logs one line per
// feed, so the answer is in the log as well as in the document.

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import Parser from 'rss-parser'
import {
  NEWS_TTL_DAYS,
  healthLine,
  liveFeeds,
  shouldFetch,
  toNewsDoc,
  type FeedDef,
  type FeedHealth,
  type RawItem,
} from './newsPure'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FEEDS, FOREX_KEYWORDS } = require('../feeds') as {
  FEEDS: FeedDef[]
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

/**
 * One feed, fetched and parsed, with every failure caught.
 *
 * The status is recorded whatever happens — that record IS the verification the
 * feed list cannot carry, because a URL that returned 200 the day it was added
 * can return 404 a month later and nothing would otherwise say so.
 */
async function pullFeed(
  feed: FeedDef,
  parser: Parser,
  now: number,
  priorFails: number,
): Promise<{ docs: NonNullable<ReturnType<typeof toNewsDoc>>[]; health: FeedHealth }> {
  const started = Date.now()
  const health: FeedHealth = {
    source: feed.source,
    url: feed.url,
    category: feed.category,
    status: 0,
    parsed: false,
    items: 0,
    usable: 0,
    written: 0,
    error: '',
    ms: 0,
    at: now,
    fails: priorFails,
  }
  // In the penalty box, and not this run's turn to re-probe. The counter still
  // advances so the re-probe eventually comes round — see `shouldFetch`.
  if (!shouldFetch(priorFails)) {
    health.skipped = true
    health.fails = priorFails + 1
    health.error = `skipped after ${priorFails} consecutive failures`
    return { docs: [], health }
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let text: string
    try {
      const res = await fetch(feed.url, {
        signal: controller.signal,
        redirect: 'follow',
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
        health.ms = Date.now() - started
        health.fails = priorFails + 1
        return { docs: [], health }
      }
      text = await res.text()
    } finally {
      clearTimeout(timer)
    }

    // Parsed separately from fetched, and recorded separately, because a 200
    // whose body is an HTML "we moved our feed" page is a different failure from
    // a 404 and needs a different fix.
    const parsed = await parser.parseString(text)
    health.parsed = true
    const items = (parsed.items ?? []) as RawItem[]
    health.items = items.length
    const docs = items
      .slice(0, MAX_ITEMS_PER_FEED)
      .map((item) => toNewsDoc(item, feed, FOREX_KEYWORDS, now))
      .filter((d): d is NonNullable<ReturnType<typeof toNewsDoc>> => d !== null)
    health.usable = docs.length
    health.ms = Date.now() - started
    // Reached and parsed: the streak is over, whatever it was. A feed that was
    // down for an afternoon is back in the rotation on its own.
    health.fails = 0
    return { docs, health }
  } catch (err) {
    // Every failure mode lands here and none of them propagates: a skip, never
    // a function failure.
    health.error = err instanceof Error ? err.message.slice(0, 200) : 'unknown'
    health.ms = Date.now() - started
    health.fails = priorFails + 1
    return { docs: [], health }
  }
}

export interface PullReport {
  at: number
  feeds: FeedHealth[]
  /** Feeds that returned 200, parsed, and committed at least one document. */
  ok: number
  total: number
  skipped: number
  written: number
}

/**
 * The whole run: fetch every live feed, commit each one's documents, record what
 * happened.
 *
 * COMMITTED PER FEED, on purpose. One batch across all nineteen is fewer round
 * trips, but it cannot say which feed's documents landed — and "did the write to
 * `forex` succeed" is exactly the question this has to answer per feed. Nineteen
 * batches of at most twenty-five documents is a rounding error against a
 * fifteen-minute schedule.
 */
async function runPull(): Promise<PullReport> {
  const db = getFirestore()
  const parser = new Parser({ timeout: FETCH_TIMEOUT_MS })
  const now = Date.now()
  const live = liveFeeds(FEEDS)
  const dropped = FEEDS.length - live.length

  // Last run's failure streaks, so a URL that has been 404ing all week stops
  // being asked every fifteen minutes. Carried in the health document rather
  // than in a collection of its own: it is one small array that is already
  // being written once a run.
  const priorDoc = await db.collection(NEWS_COLLECTION).doc(HEALTH_DOC).get()
  const prior = new Map<string, number>()
  for (const row of (priorDoc.data()?.feeds ?? []) as FeedHealth[]) {
    prior.set(row.url, typeof row.fails === 'number' ? row.fails : 0)
  }

  // Fetched in parallel because the run is dominated by waiting, and one slow
  // publisher should not add its latency to the other eighteen.
  const results = await Promise.all(
    live.map((feed) => pullFeed(feed, parser, now, prior.get(feed.url) ?? 0)),
  )

  for (const result of results) {
    if (!result.docs.length) continue
    try {
      const batch = db.batch()
      for (const doc of result.docs) {
        // setDoc at the hashed id: the same item on the next run overwrites
        // rather than duplicating, which is what makes a 15-minute schedule
        // safe to run forever.
        batch.set(db.collection(NEWS_COLLECTION).doc(doc.id), {
          ...doc,
          publishedAt: Timestamp.fromMillis(doc.publishedAt),
          fetchedAt: Timestamp.fromMillis(doc.fetchedAt),
        })
      }
      await batch.commit()
      // Set only AFTER the commit resolved. This is the difference between
      // reporting what was written and reporting what was intended.
      result.health.written = result.docs.length
    } catch (err) {
      result.health.error =
        'write failed: ' + (err instanceof Error ? err.message.slice(0, 160) : 'unknown')
    }
  }

  const feeds = results.map((r) => r.health)
  const report: PullReport = {
    at: now,
    feeds,
    ok: feeds.filter((f) => f.status === 200 && f.parsed && f.written > 0).length,
    total: feeds.length,
    // Marked dead in `feeds.js`, plus the ones this run left in the penalty box.
    skipped: dropped + feeds.filter((f) => f.skipped).length,
    written: feeds.reduce((n, f) => n + f.written, 0),
  }

  // The health record is the answer to "which feeds are actually alive",
  // available in the app rather than only in a log nobody opens.
  await db
    .collection(NEWS_COLLECTION)
    .doc(HEALTH_DOC)
    .set({
      kind: 'health',
      at: Timestamp.fromMillis(now),
      feeds,
      ok: report.ok,
      total: report.total,
      skipped: report.skipped,
      written: report.written,
    })

  // AND one line per feed in the log, every run. A summary that says
  // "19 feeds, 0 written" tells you something is wrong and nothing about what;
  // nineteen lines say which publisher, with which status, at which stage.
  // This is what makes a silent failure impossible: there is no path through
  // this function that logs nothing about a feed.
  for (const health of feeds) logger.info('pullNews feed: ' + healthLine(health))
  logger.info('pullNews finished', {
    ok: report.ok,
    total: report.total,
    skipped: report.skipped,
    written: report.written,
    dead: feeds.filter((f) => f.error || !f.parsed).map((f) => f.source),
    empty: feeds.filter((f) => !f.error && f.parsed && f.written === 0).map((f) => f.source),
  })

  return report
}

export const pullNews = onSchedule(
  { schedule: 'every 15 minutes', region: 'asia-south1', timeoutSeconds: 300, memory: '512MiB' },
  async () => {
    await runPull()
  },
)

/**
 * The same run, on demand, returning the per-feed report to the caller.
 *
 * It exists because "is the pipeline working" should not require waiting up to
 * fifteen minutes and then reading Cloud Logging. Any signed-in user may call it
 * — the news is shared and there is nothing here to leak — but it is rate-limited
 * to one run a minute so a held-down button cannot become nineteen fetches a
 * second against nineteen publishers.
 */
let lastManualRun = 0
const MANUAL_COOLDOWN_MS = 60_000

export const pullNewsNow = onCall(
  { region: 'asia-south1', timeoutSeconds: 300, memory: '512MiB' },
  async (req): Promise<PullReport> => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.')
    const since = Date.now() - lastManualRun
    if (since < MANUAL_COOLDOWN_MS) {
      throw new HttpsError(
        'resource-exhausted',
        `A pull ran ${Math.round(since / 1000)}s ago. Wait ${Math.ceil((MANUAL_COOLDOWN_MS - since) / 1000)}s.`,
      )
    }
    lastManualRun = Date.now()
    return runPull()
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
