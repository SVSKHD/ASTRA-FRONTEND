// The stock page's chart, as plain data: its ranges (Live while NSE is open,
// then the historic ones), the moment today's session opened, folding a
// streamed tick into the newest candle, and the indicator toggles it offers.
// No Vue here, so the tests can read it.

import { TF_SECONDS, type Timeframe } from '@/trading/chartView'
import type { Study, StudyKind, ColorKey } from '@/trading/studies'

export interface Candle {
  ts: string
  open: string
  high: string
  low: string
  close: string
  volume?: string | null
}

export type RangeKey = 'live' | '1d' | '1w' | '6m' | '1y'

export interface RangeSpec {
  label: string
  tf: Timeframe
  limit: number
  /** Minute or hour bars: VWAP means something here. */
  intraday: boolean
  /** Live: read from today's open and keep the newest candle moving. */
  live?: boolean
}

export const RANGES: Record<RangeKey, RangeSpec> = {
  // A full NSE session is 375 one-minute bars.
  live: { label: 'Live', tf: '1m', limit: 400, intraday: true, live: true },
  '1d': { label: '1D', tf: '5m', limit: 75, intraday: true },
  '1w': { label: '1W', tf: '1h', limit: 35, intraday: true },
  '6m': { label: '6M', tf: '1d', limit: 130, intraday: false },
  '1y': { label: '1Y', tf: '1d', limit: 250, intraday: false },
}
export const HISTORIC: RangeKey[] = ['1d', '1w', '6m', '1y']

const IST_MS = 5.5 * 3_600_000

/** 09:15 IST on the IST calendar day of `now`, as epoch ms. */
export function sessionStart(now: number): number {
  const ist = new Date(now + IST_MS)
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 9, 15) - IST_MS
}

/** 15:30 IST, the close, on the IST day of `now`. */
export function sessionEnd(now: number): number {
  return sessionStart(now) + (6 * 60 + 15) * 60_000
}

/** Bars that open a new candle from a tick: session-aligned (NSE bars start at 09:15). */
const NEW_BAR_MS: Partial<Record<Timeframe, number>> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
}

/**
 * Fold one streamed price into the candles, on any timeframe: a tick inside the
 * newest candle's period moves its close (and high / low); on minute and hour
 * bars a tick past it opens the next candle, aligned to the 09:15 open. Daily and
 * 4h candles are only moved, never invented. Older ticks, ticks outside today's
 * session and bad prices are ignored. Returns the SAME array when nothing changes,
 * so nothing re-renders.
 */
export function mergeTick(
  candles: readonly Candle[],
  ltp: string | null | undefined,
  at: string | null | undefined,
  tf: Timeframe,
  now: number,
): readonly Candle[] {
  const p = Number(ltp)
  const t = Date.parse(at ?? '')
  if (!ltp || !Number.isFinite(p) || p <= 0 || !Number.isFinite(t)) return candles
  const open = sessionStart(now)
  if (t < open || t > sessionEnd(now) + 60_000) return candles
  const last = candles[candles.length - 1]
  const lastT = last ? Date.parse(last.ts) : -Infinity
  if (t < lastT) return candles
  if (last && t < lastT + TF_SECONDS[tf] * 1000) {
    const high = p > Number(last.high) ? ltp : last.high
    const low = p < Number(last.low) ? ltp : last.low
    if (last.close === ltp && high === last.high && low === last.low) return candles
    return [...candles.slice(0, -1), { ...last, close: ltp, high, low }]
  }
  const step = NEW_BAR_MS[tf]
  if (!step) return candles
  const bucket = open + Math.floor((t - open) / step) * step
  if (bucket <= lastT) return candles
  return [
    ...candles,
    {
      ts: new Date(bucket).toISOString(),
      open: ltp,
      high: ltp,
      low: ltp,
      close: ltp,
      volume: null,
    },
  ]
}

/**
 * A filter that hands back the previous array while the candles are the same,
 * value for value: a computed that rebuilds them (a clock tick, an unchanged
 * quote) then changes nothing downstream, so the chart and its indicators do not
 * redraw.
 */
export function stableCandles<T extends Candle>(): (next: readonly T[]) => readonly T[] {
  let last: readonly T[] = []
  return (next) => {
    if (sameCandles(last, next)) return last
    last = next
    return next
  }
}

/** Two reads with the same candles, value for value (a refresh that brought nothing new). */
export function sameCandles(a: readonly Candle[], b: readonly Candle[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (
      x.ts !== y.ts ||
      x.close !== y.close ||
      x.high !== y.high ||
      x.low !== y.low ||
      x.open !== y.open ||
      (x.volume ?? null) !== (y.volume ?? null)
    )
      return false
  }
  return true
}

// --- what was read, per instrument and range --------------------------------------

/**
 * Candles already read this page load, so switching ranges (or coming back to a
 * stock) draws at once while a fresh read runs behind it.
 */
const CACHE_MAX = 40
const cache = new Map<string, { candles: readonly Candle[]; at: number }>()

export function cachedCandles(key: string) {
  return cache.get(key) ?? null
}
export function cacheCandles(key: string, candles: readonly Candle[], at = Date.now()): void {
  cache.delete(key)
  cache.set(key, { candles, at })
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
}

// --- indicators ---------------------------------------------------------------------

export interface IndicatorSpec {
  key: string
  label: string
  kind: StudyKind
  params: number[]
  color: ColorKey
  /** VWAP resets daily: only drawn on minute / hour bars. */
  intradayOnly?: boolean
}

export const INDICATORS: IndicatorSpec[] = [
  { key: 'ema20', label: 'EMA 20', kind: 'ema', params: [20], color: 'accent' },
  { key: 'ema50', label: 'EMA 50', kind: 'ema', params: [50], color: 'warning' },
  { key: 'vwap', label: 'VWAP', kind: 'vwap', params: [], color: 'info', intradayOnly: true },
  { key: 'bb', label: 'Bollinger', kind: 'bb', params: [20, 2], color: 'dim' },
  { key: 'rsi', label: 'RSI', kind: 'rsi', params: [14], color: 'accent' },
  { key: 'macd', label: 'MACD', kind: 'macd', params: [12, 26, 9], color: 'accent' },
]

export function studyOf(spec: IndicatorSpec): Study {
  return { id: spec.key, kind: spec.kind, params: spec.params, color: spec.color, visible: true }
}

export const INDICATORS_KEY = 'aureon.stocks.indicators.v1'
export const DEFAULT_INDICATORS = ['ema20']

/** Saved toggles, keeping only keys that still exist. */
export function parseIndicators(raw: string | null): string[] {
  if (raw === null) return [...DEFAULT_INDICATORS]
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return [...DEFAULT_INDICATORS]
    const known = new Set(INDICATORS.map((i) => i.key))
    return v.filter((k): k is string => typeof k === 'string' && known.has(k))
  } catch {
    return [...DEFAULT_INDICATORS]
  }
}
