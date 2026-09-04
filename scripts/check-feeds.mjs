// Which feeds are actually alive (section 39).
//
//   node scripts/check-feeds.mjs           # check every feed
//   node scripts/check-feeds.mjs --write    # and record the answer in feeds.js
//   node scripts/check-feeds.mjs --json     # machine-readable, for CI
//
// This exists because "verify each URL returns 200" is not a thing you do once.
// Publishers restrict RSS, move it behind Cloudflare, or drop it entirely, and
// the failure mode is silent: a category that quietly has one fewer source in
// it. So the check is a command anybody can run, it reports the item count as
// well as the status — a 200 that parses to zero items is a dead feed wearing a
// live one's clothes — and `--write` records the verdict back into `feeds.js`
// so the file always says what was last true rather than what was once hoped.
//
// It needs open outbound HTTPS. In a sandbox whose egress policy blocks general
// web hosts every row comes back `blocked`, which is a fact about the sandbox
// and not about the feed; run it somewhere with real egress before trusting a
// removal.

import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { FEEDS } = require('../functions/feeds.js')

const WRITE = process.argv.includes('--write')
const JSON_OUT = process.argv.includes('--json')
const TIMEOUT_MS = 20_000

/** An item in RSS is <item>, in Atom it is <entry>. Count both. */
function countItems(xml) {
  return (xml.match(/<item[\s>]|<entry[\s>]/g) ?? []).length
}

async function check(feed) {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(feed.url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'AstraNewsBot/1.0 (+https://github.com/SVSKHD/ASTRA-FRONTEND)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8',
      },
    })
    const body = res.ok ? await res.text() : ''
    return {
      ...feed,
      status: res.status,
      items: body ? countItems(body) : 0,
      ms: Date.now() - started,
      // A 200 that parses to nothing is not a working feed. Saying so here is
      // the difference between a check and a ping.
      verdict: res.ok ? (countItems(body) > 0 ? 'ok' : 'empty') : 'dead',
      error: res.ok ? '' : `HTTP ${res.status}`,
    }
  } catch (err) {
    const blocked = /ECONNREFUSED|EAI_AGAIN|403|CONNECT|abort/i.test(String(err))
    return {
      ...feed,
      status: 0,
      items: 0,
      ms: Date.now() - started,
      verdict: blocked ? 'blocked' : 'dead',
      error: String(err.message ?? err).slice(0, 120),
    }
  } finally {
    clearTimeout(timer)
  }
}

let results = await Promise.all(FEEDS.map(check))

// Nineteen independent publishers do not fail in the same way at the same
// moment. When every single one answers with the same non-200 — a proxy's 403,
// a captive portal's 407 — the thing that is broken is the egress from this
// machine, and reporting the feeds as dead would be reporting on ourselves.
const statuses = new Set(results.map((r) => r.status))
const uniformFailure = statuses.size === 1 && ![200].includes([...statuses][0])
if (uniformFailure && results.length > 2) {
  const status = [...statuses][0]
  results = results.map((r) => ({
    ...r,
    verdict: 'blocked',
    error: `every feed answered ${status || 'nothing'} — egress policy, not the feed`,
  }))
}

if (JSON_OUT) {
  console.log(JSON.stringify(results, null, 2))
} else {
  const pad = (s, n) => String(s).padEnd(n)
  console.log(
    `${pad('CATEGORY', 8)}${pad('SOURCE', 18)}${pad('STATUS', 8)}${pad('ITEMS', 7)}VERDICT`,
  )
  for (const r of results) {
    console.log(
      `${pad(r.category, 8)}${pad(r.source, 18)}${pad(r.status || '—', 8)}${pad(r.items, 7)}${r.verdict}${
        r.error ? `  (${r.error})` : ''
      }`,
    )
  }
  const ok = results.filter((r) => r.verdict === 'ok').length
  const items = results.reduce((n, r) => n + r.items, 0)
  console.log(`\n${ok}/${results.length} feeds returned 200 with items · ${items} items total`)
  const dead = results.filter((r) => r.verdict === 'dead' || r.verdict === 'empty')
  if (dead.length) {
    console.log(`\nDrop or replace: ${dead.map((r) => `${r.source} (${r.verdict})`).join(', ')}`)
  }
  const blocked = results.filter((r) => r.verdict === 'blocked')
  if (blocked.length) {
    console.log(
      `\n${blocked.length} unreachable from here — that is this machine's egress policy, not a verdict on the feed.`,
    )
  }
}

if (WRITE) {
  // Rewritten in place rather than regenerated, so every comment and every tag
  // in `feeds.js` survives: this only ever touches the `verified` line.
  const path = new URL('../functions/feeds.js', import.meta.url)
  let source = readFileSync(path, 'utf8')
  for (const r of results) {
    const verdict = r.verdict === 'ok' ? 'ok' : r.verdict === 'blocked' ? 'unchecked' : 'dead'
    source = source.replace(
      new RegExp(
        `(url: '${r.url.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}',[\\s\\S]{0,240}?verified: ')[a-z]+(')`,
      ),
      `$1${verdict}$2`,
    )
  }
  writeFileSync(path, source)
  console.log('\nfeeds.js updated.')
}

process.exit(results.some((r) => r.verdict === 'dead') ? 1 : 0)
