// The stock page's chart, as plain data: its ranges (Live while NSE is open,
// then the historic ones) and timeframes, how many candles each needs (plus the
// older ones indicators warm up on), the moment today's session opened, folding
// a streamed tick into the newest candle, and the indicators the person set up.
// No Vue here, so the tests can read it.

import { TF_SECONDS, type Timeframe } from '@/trading/chartView'
import {
  EMA_PRESETS,
  KINDS,
  PALETTE,
  cleanParams,
  kindInfo,
  studyLabel,
  type ColorKey,
  type Study,
  type StudyKind,
} from '@/trading/studies'

export interface Candle {
  ts: string
  open: string
  high: string
  low: string
  close: string
  volume?: string | null
}

export type RangeKey = 'live' | '1d' | '1w' | '1m' | '6m' | '1y'

export interface RangeSpec {
  label: string
  /** The timeframe the range opens on ("Auto"). */
  tf: Timeframe
  /** Trading days the range covers. */
  days: number
  /** Live: keep the newest candle moving with each tick. */
  live?: boolean
}

export const RANGES: Record<RangeKey, RangeSpec> = {
  live: { label: 'Live', tf: '1m', days: 1, live: true },
  '1d': { label: '1D', tf: '5m', days: 1 },
  '1w': { label: '1W', tf: '15m', days: 5 },
  '1m': { label: '1M', tf: '1h', days: 21 },
  '6m': { label: '6M', tf: '1d', days: 126 },
  '1y': { label: '1Y', tf: '1d', days: 250 },
}
export const HISTORIC: RangeKey[] = ['1d', '1w', '1m', '6m', '1y']

// --- timeframe ----------------------------------------------------------------------

/** Timeframes the broker serves history for (history.ts HISTORY_DAYS). */
export const CHART_TFS: Timeframe[] = ['1m', '5m', '15m', '1h', '1d']
export type TfChoice = 'auto' | Timeframe
export const TF_LABEL: Record<string, string> = {
  '1m': '1 min',
  '5m': '5 min',
  '15m': '15 min',
  '1h': '1 hour',
  '1d': '1 day',
}

/** An NSE session (09:15 to 15:30) in bars of each timeframe. */
const BARS_PER_DAY: Partial<Record<Timeframe, number>> = {
  '1m': 375,
  '5m': 75,
  '15m': 25,
  '1h': 7,
  '1d': 1,
}
/** Most candles a range shows (1Y of 1-minute bars would be 90,000). */
export const MAX_BARS = 2000
/** Fewest candles a range shows (1D of daily bars would be one). */
export const MIN_BARS = 30

/** Timeframes a range can be drawn on: Live is intraday only. */
export function tfsFor(range: RangeKey): Timeframe[] {
  return RANGES[range].live ? ['1m', '5m', '15m'] : CHART_TFS
}

/** The timeframe drawn: the chosen one when the range allows it, else the range's own. */
export function resolveTf(range: RangeKey, choice: TfChoice | undefined): Timeframe {
  if (choice && choice !== 'auto' && tfsFor(range).includes(choice)) return choice
  return RANGES[range].tf
}

/** Candles the range shows on this timeframe. */
export function barsFor(range: RangeKey, tf: Timeframe): number {
  const per = BARS_PER_DAY[tf] ?? 1
  return Math.min(MAX_BARS, Math.max(MIN_BARS, Math.ceil(RANGES[range].days * per)))
}

/**
 * Older candles read beyond what is shown, so every indicator is already running
 * at the first candle on screen (an EMA 50 on 75 candles would start two thirds
 * of the way in). Rounded up to 100s, so a small period change does not re-read.
 */
export function warmupFor(defs: readonly Pick<IndicatorDef, 'kind' | 'params'>[]): number {
  let need = 0
  for (const d of defs) {
    const [a = 0, b = 0, c = 0] = d.params
    const bars =
      d.kind === 'ema' || d.kind === 'rsi' || d.kind === 'atr'
        ? a * 3
        : d.kind === 'adx'
          ? a * 4
          : d.kind === 'macd'
            ? b * 3 + c
            : d.kind === 'vwap'
              ? 0
              : a
    need = Math.max(need, bars)
  }
  return Math.min(1000, Math.max(100, Math.ceil(need / 100) * 100))
}

/** What to ask the server for: the shown candles plus the warm-up (its cap is 5000). */
export function fetchLimit(bars: number, warmup: number): number {
  return Math.min(5000, bars + warmup)
}

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

/** One indicator on the chart, with the periods the person chose. */
export interface IndicatorDef {
  id: string
  kind: StudyKind
  params: number[]
  color: ColorKey
}

export const INDICATOR_KINDS: StudyKind[] = KINDS.map((k) => k.kind)
export const MAX_INDICATORS = 10
export const INDICATORS_KEY = 'aureon.stocks.indicators.v2'
/** The first version kept fixed toggles ("ema20", "rsi"...). */
export const INDICATORS_V1_KEY = 'aureon.stocks.indicators.v1'

export const DEFAULT_INDICATORS: IndicatorDef[] = [
  { id: 'ema-8', kind: 'ema', params: [8], color: 'accent' },
  { id: 'ema-20', kind: 'ema', params: [20], color: 'warning' },
]

const COLORS = PALETTE.map((p) => p.key) as ColorKey[]

/** VWAP resets each day: it means nothing on daily candles. */
export function intradayOnly(kind: StudyKind): boolean {
  return kind === 'vwap'
}

export function studyOf(d: IndicatorDef): Study {
  return { id: d.id, kind: d.kind, params: d.params, color: d.color, visible: true }
}

export function indicatorLabel(d: Pick<IndicatorDef, 'kind' | 'params'>): string {
  return studyLabel(d)
}

/** A new indicator of `kind`: its usual periods (an EMA not already drawn) and a free colour. */
export function newIndicator(kind: StudyKind, existing: readonly IndicatorDef[]): IndicatorDef {
  let params = [...kindInfo(kind).defaults]
  if (kind === 'ema') {
    const used = new Set(existing.filter((d) => d.kind === 'ema').map((d) => d.params[0]))
    params = [EMA_PRESETS.find((p) => !used.has(p)) ?? 20]
  }
  const taken = new Set(existing.map((d) => d.color))
  const color = COLORS.find((c) => !taken.has(c)) ?? COLORS[existing.length % COLORS.length]
  const ids = new Set(existing.map((d) => d.id))
  let n = existing.length + 1
  while (ids.has(`${kind}-${n}`)) n++
  return { id: `${kind}-${n}`, kind, params, color }
}

// --- the picker ---------------------------------------------------------------------

/** What the indicator picker offers, by group; any other period is set on the chip. */
export const INDICATOR_PRESETS: { kind: StudyKind; params: number[]; group: string }[] = [
  ...[8, 9, 20, 21, 50, 100, 200].map((n) => ({
    kind: 'ema' as const,
    params: [n],
    group: 'Moving averages',
  })),
  ...[20, 50, 200].map((n) => ({ kind: 'sma' as const, params: [n], group: 'Moving averages' })),
  { kind: 'vwap', params: [], group: 'Price levels' },
  { kind: 'bb', params: [20, 2], group: 'Price levels' },
  { kind: 'rsi', params: [14], group: 'Oscillators' },
  { kind: 'macd', params: [12, 26, 9], group: 'Oscillators' },
  { kind: 'atr', params: [14], group: 'Oscillators' },
  { kind: 'adx', params: [14], group: 'Oscillators' },
]

/** One indicator's identity in the picker: its kind and periods ("ema:20"). */
export function indicatorSig(d: Pick<IndicatorDef, 'kind' | 'params'>): string {
  return `${d.kind}:${d.params.join(',')}`
}

/** The picker's options: the presets, then any indicator of yours with other periods. */
export function indicatorOptions(
  defs: readonly IndicatorDef[],
): { value: string; label: string; group: string }[] {
  const out = INDICATOR_PRESETS.map((p) => ({
    value: indicatorSig(p),
    label: studyLabel(p),
    group: p.group,
  }))
  const known = new Set(out.map((o) => o.value))
  for (const d of defs) {
    const sig = indicatorSig(d)
    if (known.has(sig)) continue
    known.add(sig)
    out.push({ value: sig, label: studyLabel(d), group: 'Your periods' })
  }
  return out
}

/**
 * The picker's new selection → the indicator list: kept ones stay as they are
 * (colour, id), picked ones are added with a free colour, up to MAX_INDICATORS.
 */
export function applyPicks(
  defs: readonly IndicatorDef[],
  picks: readonly string[],
): IndicatorDef[] {
  const want = new Set(picks)
  const out = defs.filter((d) => want.has(indicatorSig(d)))
  const have = new Set(out.map(indicatorSig))
  for (const sig of picks) {
    if (have.has(sig) || out.length >= MAX_INDICATORS) continue
    const [kind, raw = ''] = sig.split(':') as [StudyKind, string?]
    if (!INDICATOR_KINDS.includes(kind)) continue
    const params = cleanParams(kind, raw ? raw.split(',').map(Number) : [])
    out.push({ ...newIndicator(kind, out), params })
    have.add(sig)
  }
  return out
}

/**
 * Saved indicators, each checked: unknown kinds dropped, periods clamped. With
 * nothing saved, the first version's toggles carry over, else EMA 8 and EMA 20.
 */
export function parseIndicators(raw: string | null, v1: string | null = null): IndicatorDef[] {
  if (raw === null) return v1 === null ? clone(DEFAULT_INDICATORS) : migrateV1(v1)
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return clone(DEFAULT_INDICATORS)
    const out: IndicatorDef[] = []
    const ids = new Set<string>()
    for (const x of v) {
      if (!x || typeof x !== 'object') continue
      const d = x as Partial<IndicatorDef>
      if (!d.kind || !INDICATOR_KINDS.includes(d.kind)) continue
      let id = typeof d.id === 'string' && d.id ? d.id : `${d.kind}-${out.length + 1}`
      while (ids.has(id)) id = `${id}x`
      ids.add(id)
      const color = COLORS.includes(d.color as ColorKey)
        ? (d.color as ColorKey)
        : COLORS[out.length % COLORS.length]
      out.push({
        id,
        kind: d.kind,
        params: cleanParams(d.kind, Array.isArray(d.params) ? d.params : []),
        color,
      })
      if (out.length >= MAX_INDICATORS) break
    }
    return out
  } catch {
    return clone(DEFAULT_INDICATORS)
  }
}

const V1: Record<string, Omit<IndicatorDef, 'id'>> = {
  ema20: { kind: 'ema', params: [20], color: 'accent' },
  ema50: { kind: 'ema', params: [50], color: 'warning' },
  vwap: { kind: 'vwap', params: [], color: 'info' },
  bb: { kind: 'bb', params: [20, 2], color: 'dim' },
  rsi: { kind: 'rsi', params: [14], color: 'accent' },
  macd: { kind: 'macd', params: [12, 26, 9], color: 'accent' },
}
function migrateV1(raw: string): IndicatorDef[] {
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return clone(DEFAULT_INDICATORS)
    return v
      .filter((k): k is string => typeof k === 'string' && k in V1)
      .map((k) => ({ id: k, ...V1[k], params: [...V1[k].params] }))
  } catch {
    return clone(DEFAULT_INDICATORS)
  }
}
function clone(list: IndicatorDef[]): IndicatorDef[] {
  return list.map((d) => ({ ...d, params: [...d.params] }))
}
