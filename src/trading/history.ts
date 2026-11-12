// Candle history on demand: a chart with no stored candles asks the server to
// fetch them from Dhan.
//
//   POST /api/trading/candles/backfill {instrument_ids, timeframe, days}
//
// The server queues it for the research worker's `candle-backfill` lane, under
// the shared Dhan rate limit, and fetches only missing bars. Nothing here talks
// to Dhan, and nothing places orders: history is read-only market data. The
// chart's usual refresh picks the candles up once they are stored.

import { aureon } from '@/api/client'
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
