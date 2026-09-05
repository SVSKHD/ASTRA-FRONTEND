// The per-feed report, as a rule (section 44, item 8).
//
// The instruction was "report, per feed: the HTTP status, whether the parse
// succeeded, item count, and whether the write to `forex` succeeded", and
// "log a per-feed summary on every run so a silent failure is impossible".
// These tests hold the pipeline to both halves.
//
// The two decisions live in `newsPure.ts` rather than in `news.ts`, and this
// import is the reason. `news.ts` pulls in `firebase-admin`, `firebase-functions`
// and `rss-parser`, none of which the app installs — so a test that imported it
// would pass on a machine where somebody had run `npm --prefix functions ci` and
// fail `npm run verify` on a fresh clone. `newsPure.ts` imports `node:crypto`
// and nothing else, which is what makes a decision worth testing reachable from
// the test run that actually gets run.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  FAIL_THRESHOLD,
  REPROBE_EVERY,
  healthLine,
  liveFeeds,
  shouldFetch,
  type FeedHealth,
} from '../../functions/src/newsPure'

const base: FeedHealth = {
  source: 'Federal Reserve',
  url: 'https://example.test/feed.xml',
  category: 'forex',
  status: 200,
  parsed: true,
  items: 20,
  usable: 18,
  written: 18,
  error: '',
  ms: 240,
  at: 0,
  fails: 0,
}

describe('the health record names all four stages', () => {
  it('carries the status, the parse, the counts and the write', () => {
    // Every one of these is a different failure with a different fix, and the
    // report is useless if it collapses them into "not ok".
    for (const key of ['status', 'parsed', 'items', 'usable', 'written'] as const) {
      expect(Object.keys(base)).toContain(key)
    }
  })

  it('reports a dead URL as its status, and stops there', () => {
    const line = healthLine({ ...base, status: 404, parsed: false, items: 0, usable: 0, written: 0, error: 'HTTP 404' })
    expect(line).toContain('FAIL HTTP 404')
    expect(line).toContain('404')
  })

  it('separates "did not parse" from "returned nothing"', () => {
    // A 200 whose body is an HTML "we moved our feed" page and a 200 whose feed
    // is genuinely empty need different fixes: replace the URL, or drop the
    // source. One verdict for both is one fix nobody can pick.
    const unparsed = healthLine({ ...base, parsed: false, items: 0, usable: 0, written: 0 })
    const empty = healthLine({ ...base, parsed: true, items: 0, usable: 0, written: 0 })
    expect(unparsed).toContain('did not parse')
    expect(empty).toContain('EMPTY')
    expect(empty).not.toContain('did not parse')
  })

  it('reports a feed that parsed but wrote nothing as empty, not as ok', () => {
    expect(healthLine({ ...base, written: 0 })).toContain('EMPTY')
  })

  it('says ok only when documents actually landed', () => {
    expect(healthLine(base)).toContain('ok')
    expect(healthLine(base)).toContain('written=18')
  })

  it('puts every count in the line, so one line is the whole answer', () => {
    const line = healthLine(base)
    expect(line).toContain('items=20')
    expect(line).toContain('usable=18')
    expect(line).toContain('written=18')
    expect(line).toContain('Federal Reserve')
  })
})

describe('a feed that does not return 200 is dropped', () => {
  const feeds = [
    { url: 'a', source: 'A', category: 'forex' as const, tags: [], verified: 'ok' as const },
    { url: 'b', source: 'B', category: 'ai' as const, tags: [], verified: 'dead' as const },
    { url: 'c', source: 'C', category: 'code' as const, tags: [], verified: 'unchecked' as const },
    { url: 'd', source: 'D', category: 'code' as const, tags: [] },
  ]

  it('skips the ones marked dead and keeps everything else', () => {
    expect(liveFeeds(feeds).map((f) => f.source)).toEqual(['A', 'C', 'D'])
  })

  it('keeps an unchecked feed rather than assuming the worst', () => {
    // "Unchecked" is what a feed reads as when the check ran somewhere with no
    // egress. Treating that as dead would empty the whole list on the strength
    // of a sandbox's proxy.
    expect(liveFeeds(feeds).some((f) => f.verified === 'unchecked')).toBe(true)
  })

  it('stops asking a feed that keeps failing', () => {
    // The rule applied automatically rather than waiting for somebody to edit
    // feeds.js: after an hour and a half of failures the URL is not worth a
    // request every fifteen minutes.
    for (let fails = 0; fails < FAIL_THRESHOLD; fails++) {
      expect(shouldFetch(fails), `fails=${fails}`).toBe(true)
    }
    expect(shouldFetch(FAIL_THRESHOLD)).toBe(false)
  })

  it('always comes back to a dropped feed, so the penalty box is not a grave', () => {
    // The failure mode of any automatic drop rule: a skipped feed produces no
    // result, so its counter never resets, so it is dropped forever — and a
    // publisher that came back weeks ago is still being ignored. There must be
    // a re-probe, and it must be reachable from any streak length.
    const probes = []
    for (let fails = FAIL_THRESHOLD; fails <= FAIL_THRESHOLD + 3 * REPROBE_EVERY; fails++) {
      if (shouldFetch(fails)) probes.push(fails)
    }
    expect(probes.length).toBeGreaterThanOrEqual(3)
    // Evenly spaced, so "how long until it is tried again" has one answer.
    expect(probes[1] - probes[0]).toBe(REPROBE_EVERY)
  })

  it('clears the streak the moment a feed answers', () => {
    // A success has to reset the counter, or a feed that failed six times in
    // January is still being skipped in March.
    const source = readFileSync(resolve(__dirname, '../../functions/src/news.ts'), 'utf8')
    expect(source).toContain('health.fails = 0')
  })
})

describe('the write count is the committed count', () => {
  it('is set after the commit, never from the documents built', () => {
    // The bug this replaces: `written` was assigned `docs.length` at build
    // time, so a run whose every commit threw still reported nineteen healthy
    // feeds. The assignment must come after an awaited commit.
    const source = readFileSync(resolve(__dirname, '../../functions/src/news.ts'), 'utf8')
    const commitAt = source.indexOf('await batch.commit()')
    const assignAt = source.indexOf('result.health.written = result.docs.length')
    expect(commitAt).toBeGreaterThan(-1)
    expect(assignAt).toBeGreaterThan(commitAt)
  })

  it('logs one line per feed on every run', () => {
    const source = readFileSync(resolve(__dirname, '../../functions/src/news.ts'), 'utf8')
    expect(source).toMatch(/for \(const health of feeds\) logger\.info/)
  })
})

describe('the client and the function agree on where the news lives', () => {
  it('names the same collection on both sides', () => {
    const fn = readFileSync(resolve(__dirname, '../../functions/src/news.ts'), 'utf8')
    const client = readFileSync(resolve(__dirname, '../composables/useNews.ts'), 'utf8')
    const nameOf = (src: string) => /NEWS_COLLECTION = '([^']+)'/.exec(src)?.[1]
    expect(nameOf(fn)).toBe('forex')
    expect(nameOf(client)).toBe(nameOf(fn))
  })

  it('has the composite index the client query needs', () => {
    // `where('category','in',…)` ordered by `publishedAt desc` is not served by
    // single-field indexes. Without this the listener errors rather than
    // returning nothing — which is worth knowing, because it means an EMPTY tab
    // is never the index.
    const indexes = JSON.parse(
      readFileSync(resolve(__dirname, '../../firestore.indexes.json'), 'utf8'),
    ) as { indexes: { collectionGroup: string; fields: { fieldPath: string; order?: string }[] }[] }
    const match = indexes.indexes.find(
      (i) =>
        i.collectionGroup === 'forex' &&
        i.fields[0]?.fieldPath === 'category' &&
        i.fields[1]?.fieldPath === 'publishedAt' &&
        i.fields[1]?.order === 'DESCENDING',
    )
    expect(match).toBeTruthy()
  })
})

describe('something in the repository actually deploys the functions', () => {
  it('has a workflow that runs firebase deploy --only functions', () => {
    // The root cause. `netlify.toml` publishes the Vite build and nothing else,
    // so before this workflow existed no scheduled function had ever been
    // deployed by anything in this repository — and a scheduled function that
    // was never deployed has no schedule, has never run, and leaves `forex`
    // empty in a way that reads from the app exactly like nineteen dead feeds.
    const workflow = readFileSync(
      resolve(__dirname, '../../.github/workflows/deploy-functions.yml'),
      'utf8',
    )
    expect(workflow).toContain('firebase-tools')
    expect(workflow).toMatch(/--only functions/)
  })
})
