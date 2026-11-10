// Quotes for the market terminal's tables (Explorer, Watchlists).
//
//   GET /api/trading/quotes ?broker&symbols   → QuoteOut[]   (a broker snapshot, read once)
//   GET /api/trading/stream  `quote` events    → StreamQuote  (live, for subscribed ids)
//
// `symbols` are Dhan references, "SEGMENT:SECURITY_ID" — the instrument's
// `broker_instrument_id` (backend app/agents/trading/dhan/adapter.py `quotes`
// splits each one with `split_ref`), at most 50 per request. The answer's
// `symbol` is that same reference.
//
// A live stream quote wins over a snapshot. A snapshot is never called "live":
// it is labelled by the age of its last trade and says it is not updating.
//
// BACKEND GAP (docs/market-terminal.md §3): QuoteOut has no previous close, so
// change and % change are "—". `changeOf` computes them only when a previous
// close is actually present; nothing is estimated.

import { aureon, type components } from '@/api/client'
import { quoteFreshness, type FreshnessView } from '@/trading/dhanHealth'
import { sumDec } from '@/trading/format'
import type { Broker } from '@/trading/instruments'
import type { StreamQuote } from '@/trading/stream'
import { must } from '@/trading/useLoad'

export type QuoteOut = components['schemas']['QuoteOut']

/** The backend refuses more than this many symbols in one request. */
export const QUOTE_BATCH = 50

/** Snapshot quotes for these references, keyed by reference. Batches of 50. */
export async function fetchQuotes(
  refs: string[],
  broker: Broker = 'dhan',
): Promise<Map<string, QuoteOut>> {
  const wanted = [...new Set(refs.filter(Boolean))]
  const out = new Map<string, QuoteOut>()
  // One batch at a time: each one is a call to the broker, which rate-limits quotes.
  for (let i = 0; i < wanted.length; i += QUOTE_BATCH) {
    const rows = must(
      await aureon.GET('/api/trading/quotes', {
        params: { query: { broker, symbols: wanted.slice(i, i + QUOTE_BATCH).join(',') } },
      }),
    )
    for (const q of rows) out.set(q.symbol, q)
  }
  return out
}

/** One quote, as a table row shows it, whichever source it came from. */
export interface QuoteView {
  last: string | null
  bid: string | null
  ask: string | null
  volume: string | null
  /** When the price was set (stream: received_at; snapshot: the broker's last trade time). */
  at: string | null
  source: 'stream' | 'snapshot'
  freshness: FreshnessView
  /** Present only if the backend ever sends one (§3). */
  previousClose: string | null
}

const SNAPSHOT_TEXT = 'A snapshot read once, not streaming. Refresh to read it again.'

/** A snapshot's freshness: by the age of its last trade, never "Live". */
export function snapshotFreshness(q: Pick<QuoteOut, 'ts'>, now: number): FreshnessView {
  const f = quoteFreshness({ received_at: q.ts, stale: false }, 'open', now)
  if (f.level === 'live') {
    return { level: 'live', label: 'Fresh', tone: 'success', text: `${f.text} ${SNAPSHOT_TEXT}` }
  }
  return { ...f, text: `${f.text} ${SNAPSHOT_TEXT}` }
}

function previousCloseOf(q: object): string | null {
  const v = (q as { previous_close?: unknown }).previous_close
  return typeof v === 'string' && v !== '' ? v : null
}

/** The quote to show: the live stream's when there is one, else the snapshot's. */
export function quoteView(
  stream: StreamQuote | undefined,
  snapshot: QuoteOut | undefined,
  streamStatus: string,
  now: number,
): QuoteView | null {
  if (stream) {
    return {
      last: stream.ltp,
      bid: null,
      ask: null,
      volume: stream.volume,
      at: stream.received_at,
      source: 'stream',
      freshness: quoteFreshness(stream, streamStatus, now),
      previousClose: previousCloseOf(stream),
    }
  }
  if (snapshot) {
    return {
      last: snapshot.last,
      bid: snapshot.bid,
      ask: snapshot.ask,
      volume: snapshot.volume,
      at: snapshot.ts,
      source: 'snapshot',
      freshness: snapshotFreshness(snapshot, now),
      previousClose: previousCloseOf(snapshot),
    }
  }
  return null
}

export const NO_CHANGE_REASON =
  'No previous close: the quote API does not send one yet, so change is not shown rather than estimated (docs/market-terminal.md §3).'

/** Change and % change from a real previous close; null without one. */
export function changeOf(
  last: string | null,
  previousClose: string | null,
): { change: string; pct: string } | null {
  if (!last || !previousClose) return null
  const prev = Number(previousClose)
  if (!Number.isFinite(prev) || prev === 0) return null
  const neg = previousClose.startsWith('-') ? previousClose.slice(1) : `-${previousClose}`
  const change = sumDec([last, neg])
  if (change === null) return null
  // The percent is display only (two decimals); the change itself stays exact.
  const pct = ((Number(change) / prev) * 100).toFixed(2)
  return { change, pct }
}
