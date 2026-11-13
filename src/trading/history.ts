// Candle history on demand: a chart with no stored candles asks the server to
// fetch them from Dhan.
//
//   POST /api/trading/candles/backfill {instrument_ids, timeframe, days}
//
// The server queues it for the research worker's `candle-backfill` lane, under
// the shared Dhan rate limit, and fetches only missing bars. Nothing here talks
// to Dhan, and nothing places orders: history is read-only market data. The
// chart's usual refresh picks the candles up once they are stored.

import { aureon, type components } from '@/api/client'
import type { Timeframe } from '@/trading/chartView'

/** Dhan serves history for these timeframes only (backend market_data.check_request). */
export const HISTORY_DAYS: Partial<Record<Timeframe, number>> = {
  '1m': 30,
  '5m': 90,
  '15m': 90,
  '1h': 90,
  '1d': 3650,
}

export type HistoryState =
  | { state: 'queued' }
  | { state: 'unsupported'; reason: string }
  | { state: 'rejected'; reason: string }
  | { state: 'failed'; reason: string }

/** One request per instrument and timeframe per page load: a refusal is not retried. */
const asked = new Map<string, HistoryState>()

export function historyFor(instrumentId: number, tf: Timeframe): HistoryState | null {
  return asked.get(`${instrumentId}:${tf}`) ?? null
}

export function forgetHistoryRequests(): void {
  asked.clear()
}

export async function requestHistory(instrumentId: number, tf: Timeframe): Promise<HistoryState> {
  const key = `${instrumentId}:${tf}`
  const seen = asked.get(key)
  if (seen) return seen
  const days = HISTORY_DAYS[tf]
  let out: HistoryState
  if (!days) {
    out = { state: 'unsupported', reason: `Dhan has no ${tf} history. Pick 1m, 5m, 15m, 1h or 1d.` }
  } else {
    try {
      const { data, error, response } = await aureon.POST('/api/trading/candles/backfill', {
        body: { instrument_ids: [instrumentId], timeframe: tf, days },
      })
      if (data) {
        const rejected = data.rejected.find((r) => r.instrument_id === instrumentId)
        out = rejected ? { state: 'rejected', reason: rejected.reason } : { state: 'queued' }
      } else {
        const detail = (error as { detail?: unknown } | undefined)?.detail
        const text =
          typeof detail === 'string'
            ? detail
            : typeof (detail as { message?: unknown } | undefined)?.message === 'string'
              ? (detail as { message: string }).message
              : `the server answered ${response.status}`
        out = { state: 'failed', reason: text }
      }
    } catch {
      out = { state: 'failed', reason: 'the server could not be reached' }
    }
  }
  asked.set(key, out)
  return out
}

export type BackfillOut = components['schemas']['BackfillOut']

/**
 * What became of the newest history request for this instrument and timeframe,
 * as the server reports it (GET /api/trading/candles/backfill): queued, running,
 * done (with how many bars) or failed (with the broker's error). Null when there
 * is none, or the list could not be read.
 */
export async function historyStatus(
  instrumentId: number,
  tf: Timeframe,
): Promise<BackfillOut | null> {
  try {
    const { data } = await aureon.GET('/api/trading/candles/backfill', {
      params: { query: { instrument_id: instrumentId, limit: 20 } },
    })
    return data?.items.find((r) => r.timeframe === tf) ?? null
  } catch {
    return null
  }
}

/** A request queued this long with nothing picking it up: no worker is working the queue. */
export const STUCK_MS = 45_000

/**
 * The chart's sentence for a request's state. `waiting` keeps the chart looking
 * again; otherwise it stops and says why.
 */
export function explainHistory(
  r: Pick<BackfillOut, 'status' | 'error' | 'candles' | 'created_at' | 'started_at'>,
  now: number = Date.now(),
): { waiting: boolean; text: string } {
  if (r.status === 'running') return { waiting: true, text: 'Fetching this range from the broker…' }
  if (r.status === 'queued') {
    const age = now - Date.parse(r.created_at)
    if (!r.started_at && age > STUCK_MS)
      return {
        waiting: false,
        text: 'The history request is queued, but nothing on the server has picked it up. Price history is fetched by the backend’s research worker, which looks stopped (it runs only when the server’s COMPOSE_PROFILES includes “research”).',
      }
    return { waiting: true, text: 'Queued with the broker; waiting for its turn…' }
  }
  if (r.status === 'failed')
    return {
      waiting: false,
      text: `The broker could not send this history: ${r.error || 'no reason given'}.`,
    }
  if (r.status === 'done' && !r.candles)
    return { waiting: false, text: 'The broker has no price history for this range.' }
  if (r.status === 'cancelled')
    return { waiting: false, text: 'The history request was cancelled.' }
  return { waiting: false, text: '' }
}
