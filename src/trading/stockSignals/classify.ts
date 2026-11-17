// Stock Signals: the EMA 8 / EMA 32 + session VWAP reading of one stock, as
// plain functions of the server's own numbers (candles from GET
// /api/trading/candles, indicators from GET /api/trading/indicators/compute).
// Nothing here invents a price: a missing input gives "unavailable", never a
// guess.
//
// The rule, in words:
//   Bullish   EMA 8 above EMA 32, and the close above VWAP (confirmed).
//   Bearish   EMA 8 below EMA 32, and the close below VWAP (confirmed).
//   Pending   EMA 8 crossed EMA 32 within the last CROSS_WINDOW bars, and the
//             close has not yet moved to the cross's side of VWAP.
//   Mixed     the EMAs and VWAP disagree, with no recent cross.
// On the daily timeframe there is no session VWAP: the reading is the EMAs
// alone, and says so.

import { TF_SECONDS, type Timeframe } from '@/trading/chartView'

export type SignalClass = 'bullish' | 'bearish' | 'pending' | 'mixed' | 'unavailable'
export type Direction = 'up' | 'down'

export const SIGNAL_LABEL: Record<SignalClass, string> = {
  bullish: 'Bullish',
  bearish: 'Bearish',
  pending: 'Pending',
  mixed: 'Mixed',
  unavailable: 'No data',
}

/** Bars back a cross still counts as recent (and can be awaiting VWAP). */
export const CROSS_WINDOW = 10
/** Bars the relative volume is measured against. */
export const RVOL_BARS = 20

export const SIGNAL_TFS: Timeframe[] = ['5m', '15m', '1h', '1d']
export const DEFAULT_TF: Timeframe = '15m'
/** The compute endpoint's specs this page reads. */
export function specsFor(tf: Timeframe): string {
  return tf === '1d' ? 'ema:8,ema:32,rsi:14,adx:14' : 'ema:8,ema:32,vwap,rsi:14,adx:14'
}

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
  /** The candles themselves, oldest first (for the chart). */
  bars: Bar[]
  time: number[]
  close: number[]
  volume: (number | null)[]
  ema8: (number | null)[]
  ema32: (number | null)[]
  vwap: (number | null)[]
  rsi: (number | null)[]
  adx: (number | null)[]
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** The value of an indicator row: `value`, else the first numeric field (adx → `adx`). */
function valueOf(name: string, values: Record<string, unknown>): number | null {
  if ('value' in values) return num(values.value)
  if (name.startsWith('adx') && 'adx' in values) return num(values.adx)
  for (const v of Object.values(values)) {
    const n = num(v)
    if (n !== null) return n
  }
  return null
}

/** Candles and indicator rows → aligned arrays by candle time. */
export function toSeries(candles: readonly Bar[], rows: readonly IndicatorRow[]): Series {
  const bars = [...candles].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
  const time = bars.map((b) => Date.parse(b.ts))
  const at = new Map(time.map((t, i) => [t, i]))
  const blank = () => time.map(() => null as number | null)
  const s: Series = {
    bars,
    time,
    close: bars.map((b) => Number(b.close)),
    volume: bars.map((b) => num(b.volume)),
    ema8: blank(),
    ema32: blank(),
    vwap: blank(),
    rsi: blank(),
    adx: blank(),
  }
  for (const r of rows) {
    const i = at.get(Date.parse(r.ts))
    if (i === undefined) continue
    const v = valueOf(r.name, r.values ?? {})
    const n = r.name.toLowerCase()
    if (n === 'ema:8') s.ema8[i] = v
    else if (n === 'ema:32') s.ema32[i] = v
    else if (n.startsWith('vwap')) s.vwap[i] = v
    else if (n.startsWith('rsi')) s.rsi[i] = v
    else if (n.startsWith('adx')) s.adx[i] = v
  }
  return s
}

function lastIndex<T>(xs: readonly (T | null)[]): number {
  for (let i = xs.length - 1; i >= 0; i--) if (xs[i] !== null) return i
  return -1
}

export interface Crossover {
  direction: Direction
  /** Bar index of the first bar with EMA 8 on its new side. */
  index: number
  at: number
  barsAgo: number
}

/** The newest EMA 8 / 32 cross in the series, if any. */
export function lastCross(s: Series): Crossover | null {
  let prev: number | null = null
  let found: Crossover | null = null
  for (let i = 0; i < s.time.length; i++) {
    const a = s.ema8[i]
    const b = s.ema32[i]
    if (a === null || b === null) continue
    const d = Math.sign(a - b)
    if (d !== 0 && prev !== null && prev !== 0 && d !== prev)
      found = { direction: d > 0 ? 'up' : 'down', index: i, at: s.time[i], barsAgo: 0 }
    if (d !== 0) prev = d
  }
  if (found) found.barsAgo = s.time.length - 1 - found.index
  return found
}

/** The first bar at or after the cross whose close is on the cross's side of VWAP. */
export function confirmation(
  s: Series,
  cross: Crossover | null,
): { index: number; at: number } | null {
  if (!cross) return null
  for (let i = cross.index; i < s.time.length; i++) {
    const v = s.vwap[i]
    if (v === null) continue
    const c = s.close[i]
    if (cross.direction === 'up' ? c > v : c < v) return { index: i, at: s.time[i] }
  }
  return null
}

export interface Reading {
  cls: SignalClass
  /** EMA 8 over or under EMA 32 at the newest bar. */
  trend: Direction | null
  close: number | null
  ema8: number | null
  ema32: number | null
  vwap: number | null
  /** (close − VWAP) / VWAP, as a percentage. */
  vwapDistPct: number | null
  rsi: number | null
  adx: number | null
  /** Newest bar's volume over the mean of the RVOL_BARS before it. */
  relVolume: number | null
  cross: Crossover | null
  confirmed: { index: number; at: number } | null
  /** VWAP is part of the reading (intraday). */
  usesVwap: boolean
  /** 0–100: how firmly the trend holds, in its own direction. */
  strength: number | null
  /** Newest candle time. */
  asOf: number | null
  explanation: string
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** How firmly the trend holds: EMA gap, VWAP agreement, ADX and RSI, each scaled to its share. */
export function strengthOf(
  r: Pick<Reading, 'trend' | 'close' | 'ema8' | 'ema32' | 'vwap' | 'adx' | 'rsi' | 'usesVwap'>,
): number | null {
  if (!r.trend || r.close === null || r.ema8 === null || r.ema32 === null || r.close <= 0)
    return null
  const d = r.trend === 'up' ? 1 : -1
  const parts: [number, number][] = [[clamp01(Math.abs(r.ema8 - r.ema32) / r.close / 0.01), 35]]
  if (r.usesVwap && r.vwap !== null)
    parts.push([
      Math.sign(r.close - r.vwap) === d ? clamp01(Math.abs(r.close - r.vwap) / r.close / 0.01) : 0,
      25,
    ])
  if (r.adx !== null) parts.push([clamp01(r.adx / 40), 25])
  if (r.rsi !== null) parts.push([clamp01((d * (r.rsi - 50)) / 20), 15])
  const weight = parts.reduce((a, [, w]) => a + w, 0)
  return Math.round((parts.reduce((a, [v, w]) => a + v * w, 0) / weight) * 100)
}

export function strengthWord(score: number | null): string {
  if (score === null) return '—'
  return score >= 70 ? 'Strong' : score >= 40 ? 'Moderate' : 'Weak'
}

/** The reading at the newest bar. */
export function readSignal(s: Series, tf: Timeframe): Reading {
  const usesVwap = tf !== '1d'
  const i = lastIndex(s.ema8)
  const empty: Reading = {
    cls: 'unavailable',
    trend: null,
    close: null,
    ema8: null,
    ema32: null,
    vwap: null,
    vwapDistPct: null,
    rsi: null,
    adx: null,
    relVolume: null,
    cross: null,
    confirmed: null,
    usesVwap,
    strength: null,
    asOf: s.time.length ? s.time[s.time.length - 1] : null,
    explanation: 'The server has no EMA 8 / 32 for this stock on this timeframe yet.',
  }
  if (i < 0 || s.ema32[i] === null) return empty
  const close = s.close[i]
  const ema8 = s.ema8[i]!
  const ema32 = s.ema32[i]!
  const vwap = usesVwap ? s.vwap[i] : null
  if (usesVwap && vwap === null)
    return {
      ...empty,
      close,
      ema8,
      ema32,
      explanation: 'EMAs are in, but the server has no session VWAP for the newest bar.',
    }
  const trend: Direction | null = ema8 > ema32 ? 'up' : ema8 < ema32 ? 'down' : null
  const cross = lastCross(s)
  const recent = cross && cross.barsAgo <= CROSS_WINDOW ? cross : null
  const confirmed = confirmation(s, recent)
  const side = vwap === null ? null : close > vwap ? 'up' : close < vwap ? 'down' : null

  let cls: SignalClass
  if (!usesVwap) cls = trend === 'up' ? 'bullish' : trend === 'down' ? 'bearish' : 'mixed'
  else if (trend && side === trend)
    cls = recent && !confirmed ? 'pending' : trend === 'up' ? 'bullish' : 'bearish'
  else if (recent && recent.direction === trend) cls = 'pending'
  else cls = 'mixed'

  const vol = s.volume[i]
  const prior = s.volume
    .slice(Math.max(0, i - RVOL_BARS), i)
    .filter((v): v is number => v !== null && v > 0)
  const relVolume =
    vol !== null && prior.length >= 5
      ? vol / (prior.reduce((a, b) => a + b, 0) / prior.length)
      : null

  const reading: Reading = {
    cls,
    trend,
    close,
    ema8,
    ema32,
    vwap,
    vwapDistPct: vwap ? ((close - vwap) / vwap) * 100 : null,
    rsi: s.rsi[i] ?? null,
    adx: s.adx[i] ?? null,
    relVolume,
    cross,
    confirmed,
    usesVwap,
    strength: null,
    asOf: s.time[i],
    explanation: '',
  }
  reading.strength = strengthOf(reading)
  reading.explanation = explain(reading)
  return reading
}

function explain(r: Reading): string {
  const ema =
    r.trend === 'up'
      ? 'EMA 8 is above EMA 32'
      : r.trend === 'down'
        ? 'EMA 8 is below EMA 32'
        : 'EMA 8 and EMA 32 are level'
  const cross = r.cross
    ? ` It crossed ${r.cross.direction === 'up' ? 'up' : 'down'} ${r.cross.barsAgo === 0 ? 'on the newest bar' : `${r.cross.barsAgo} bar${r.cross.barsAgo === 1 ? '' : 's'} ago`}.`
    : ''
  if (!r.usesVwap)
    return `${ema}.${cross} Daily bars have no session VWAP, so this reading is the EMAs alone.`
  const side = r.close !== null && r.vwap !== null ? (r.close >= r.vwap ? 'above' : 'below') : 'at'
  const vw = ` Price is ${side} VWAP${r.vwapDistPct !== null ? ` by ${Math.abs(r.vwapDistPct).toFixed(2)}%` : ''}.`
  const tail =
    r.cls === 'pending'
      ? ' Waiting for price to close on the cross side of VWAP to confirm.'
      : r.cls === 'mixed'
        ? ' The EMAs and VWAP disagree, so there is no confirmed signal.'
        : r.confirmed
          ? ' VWAP confirmed the cross.'
          : ''
  return `${ema}.${cross}${vw}${tail}`
}

/** Stale: the newest bar ended more than three bars before `now` (while the market trades). */
export function isStaleAt(asOf: number | null, tf: Timeframe, now: number): boolean {
  if (asOf === null) return true
  return now - (asOf + TF_SECONDS[tf] * 1000) > 3 * TF_SECONDS[tf] * 1000
}

const IST_MS = 5.5 * 3_600_000
const istDay = (t: number) => Math.floor((t + IST_MS) / 86_400_000)

/** Today's move against the previous session's last close in the series, as a percentage. */
export function changePct(s: Series): number | null {
  const n = s.time.length
  if (n < 2) return null
  const today = istDay(s.time[n - 1])
  for (let i = n - 2; i >= 0; i--) {
    if (istDay(s.time[i]) < today) {
      const prev = s.close[i]
      return prev ? ((s.close[n - 1] - prev) / prev) * 100 : null
    }
  }
  return null
}
