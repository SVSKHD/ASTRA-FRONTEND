// The chart viewer's data: one stock's stored candles (GET /api/trading/candles)
// and the server's computed EMA 8 / EMA 32 / session VWAP for them
// (GET /api/trading/indicators/compute), aligned by candle time. The signal
// itself (state, cross, confirmation) comes from the Stock Signals API; this is
// only what the chart draws. Cached a minute per instrument and timeframe.

import { aureon } from '@/api/client'
import { must } from '@/trading/useLoad'
import type { Timeframe } from '@/trading/chartView'

export interface Bar {
  ts: string
  open: string
  high: string
  low: string
  close: string
  volume?: string | null
}
/** One row of GET /api/trading/indicators/compute. */
export interface IndicatorRow {
  name: string
  ts: string
  values: Record<string, unknown>
}

export interface Series {
  /** The candles, oldest first. */
  bars: Bar[]
  time: number[]
  ema8: (number | null)[]
  ema32: (number | null)[]
  /** Empty on daily bars: the compute endpoint has no intraday VWAP there. */
  vwap: (number | null)[]
}

/** The indicators the chart draws on this timeframe. */
export function specsFor(tf: Timeframe): string {
  return tf === '1d' ? 'ema:8,ema:32' : 'ema:8,ema:32,vwap'
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function toSeries(candles: readonly Bar[], rows: readonly IndicatorRow[]): Series {
  const bars = [...candles].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
  const time = bars.map((b) => Date.parse(b.ts))
  const at = new Map(time.map((t, i) => [t, i]))
  const blank = () => time.map(() => null as number | null)
  const s: Series = { bars, time, ema8: blank(), ema32: blank(), vwap: blank() }
  for (const r of rows) {
    const i = at.get(Date.parse(r.ts))
    if (i === undefined) continue
    const values = r.values ?? {}
    const v = 'value' in values ? num(values.value) : null
    const n = r.name.toLowerCase()
    if (n === 'ema:8') s.ema8[i] = v
    else if (n === 'ema:32') s.ema32[i] = v
    else if (n.startsWith('vwap')) s.vwap[i] = v
  }
  return s
}

const BARS = 200
const TTL = 60_000
const cache = new Map<string, { at: number; series: Series }>()

export async function loadSeries(
  instrumentId: number,
  tf: Timeframe,
  force = false,
): Promise<Series> {
  const key = `${instrumentId}:${tf}`
  const hit = cache.get(key)
  if (!force && hit && Date.now() - hit.at < TTL) return hit.series
  const [candles, rows] = await Promise.all([
    aureon
      .GET('/api/trading/candles', {
        params: { query: { instrument_id: instrumentId, timeframe: tf, limit: BARS } },
      })
      .then(must),
    aureon
      .GET('/api/trading/indicators/compute', {
        params: {
          query: { instrument_id: instrumentId, timeframe: tf, specs: specsFor(tf), limit: BARS },
        },
      })
      .then(must),
  ])
  const bars = (candles as (Bar & { is_gap?: boolean })[]).filter((c) => !c.is_gap)
  const series = toSeries(bars, rows as IndicatorRow[])
  cache.set(key, { at: Date.now(), series })
  return series
}

/** Tests only. */
export function clearSeriesCache(): void {
  cache.clear()
}
