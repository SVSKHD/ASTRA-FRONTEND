// The chart's viewport and axes, as pure functions (CandleChart.vue draws them).
//
// The view is a window of fractional bar indices [start, end). Only the candles inside
// it are drawn, so a few thousand candles cost what the visible hundred cost. Zoom and
// pan are functions of (view, input, total) → view, so the gestures (wheel, drag,
// pinch, keys) all go through the same clamping and are tested without a DOM.

import type { components } from '@/api/client'

export type Timeframe = components['schemas']['Timeframe']

/** The backend's Timeframe enum, in order. */
export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']

/** Seconds per timeframe (backend app/services/research.py TF_SECONDS). */
export const TF_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
}

export function isTimeframe(v: unknown): v is Timeframe {
  return typeof v === 'string' && (TIMEFRAMES as string[]).includes(v)
}

/**
 * Whether a candle's period has not ended yet at `nowMs` (docs/market-terminal.md §3).
 *
 * The backend calls a candle closed once ts + timeframe <= now
 * (app/services/research.py `load_candles`); this is the same test. `nowMs` should be
 * the server's clock when known (the response's Date header).
 */
export function isUnconfirmed(ts: string, tf: Timeframe, nowMs: number): boolean {
  const t = Date.parse(ts)
  if (Number.isNaN(t)) return false
  return t + TF_SECONDS[tf] * 1000 > nowMs
}

/** The backend's default RESEARCH_STALE_BARS: newest closed candle older than 3 bars. */
export const STALE_BARS = 3

/** Stale when the newest candle's period ended more than STALE_BARS periods before now. */
export function isStale(ts: string, tf: Timeframe, nowMs: number): boolean {
  const t = Date.parse(ts)
  if (Number.isNaN(t)) return false
  const closedAt = t + TF_SECONDS[tf] * 1000
  return nowMs - closedAt > STALE_BARS * TF_SECONDS[tf] * 1000
}

export interface View {
  start: number
  end: number
}

/** Fewest bars a zoom can show. */
export const MIN_BARS = 10
/** Empty bars to the right of the newest candle, so it never sits on the axis. */
export const RIGHT_PAD = 2
/** Bars shown when a chart first opens. */
export const DEFAULT_BARS = 120

export function initialView(total: number, bars = DEFAULT_BARS): View {
  const end = total + RIGHT_PAD
  return clampView({ start: end - bars, end }, total)
}

export function clampView(v: View, total: number): View {
  const maxEnd = total + RIGHT_PAD
  const minSpan = Math.min(MIN_BARS, maxEnd)
  const maxSpan = Math.max(maxEnd, minSpan)
  let span = v.end - v.start
  if (!Number.isFinite(span)) span = Math.min(DEFAULT_BARS, maxSpan)
  span = Math.min(Math.max(span, minSpan), maxSpan)
  let start = Number.isFinite(v.start) ? v.start : maxEnd - span
  start = Math.min(Math.max(start, 0), Math.max(0, maxEnd - span))
  return { start, end: start + span }
}

/** Zoom by `factor` (< 1 zooms in) about `anchor` (0 = left edge, 1 = right edge). */
export function zoomView(v: View, factor: number, anchor: number, total: number): View {
  const span = v.end - v.start
  const a = Math.min(Math.max(anchor, 0), 1)
  const at = v.start + a * span
  const next = span * factor
  return clampView({ start: at - a * next, end: at - a * next + next }, total)
}

/** Move the window by `bars` (positive = later in time). */
export function panView(v: View, bars: number, total: number): View {
  return clampView({ start: v.start + bars, end: v.end + bars }, total)
}

/** The candle indices to draw: [from, to). */
export function visibleRange(v: View, total: number): [number, number] {
  const from = Math.max(0, Math.floor(v.start))
  const to = Math.min(total, Math.ceil(v.end))
  return [from, Math.max(from, to)]
}

/** Whether the window shows the newest candle (so new candles keep it following). */
export function atLatest(v: View, total: number): boolean {
  return v.end >= total
}

/** A keyboard key → the next view, or null when the key is not the chart's. */
export function keyView(v: View, key: string, total: number): View | null {
  const span = v.end - v.start
  const step = Math.max(1, Math.round(span * 0.1))
  switch (key) {
    case 'ArrowLeft':
      return panView(v, -step, total)
    case 'ArrowRight':
      return panView(v, step, total)
    case '+':
    case '=':
      return zoomView(v, 0.8, 1, total)
    case '-':
    case '_':
      return zoomView(v, 1.25, 1, total)
    case 'Home':
      return clampView({ start: 0, end: span }, total)
    case 'End':
      return clampView({ start: total + RIGHT_PAD - span, end: total + RIGHT_PAD }, total)
    default:
      return null
  }
}

/** Round gridline values for a price axis: about `count` steps of 1, 2 or 5 × 10^k. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return []
  if (hi < lo) [lo, hi] = [hi, lo]
  const span = hi - lo || Math.abs(hi) || 1
  const raw = span / Math.max(1, count)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
  const first = Math.ceil(lo / step) * step
  const out: number[] = []
  for (let v = first; v <= hi + step * 1e-9 && out.length < 50; v += step) {
    out.push(Number(v.toFixed(12)))
  }
  return out
}

/** Decimals a tick step needs ("0.05" → 2), so axis labels read as round numbers. */
export function stepDecimals(ticks: number[]): number {
  if (ticks.length < 2) return 2
  const step = Math.abs(ticks[1] - ticks[0])
  if (step >= 1) return 0
  return Math.min(8, Math.ceil(-Math.log10(step) - 1e-9))
}

/** Every k-th candle gets a time label, so labels sit about `minPx` apart. */
export function labelEvery(barPx: number, minPx = 84): number {
  if (barPx <= 0) return 1
  const raw = Math.ceil(minPx / barPx)
  for (const k of [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30, 40, 50, 60, 80, 100]) {
    if (k >= raw) return k
  }
  return Math.ceil(raw / 100) * 100
}

/** NSE and BSE run on Indian time; the chart's times are shown in it. */
export const CHART_TZ = 'Asia/Kolkata'

const timeFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: CHART_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const dayFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: CHART_TZ,
  day: '2-digit',
  month: 'short',
})
const monthFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: CHART_TZ,
  month: 'short',
  year: 'numeric',
})
const fullFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: CHART_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** An axis label: the day when it changes (or the month on a daily chart), else the time. */
export function axisLabel(ms: number, prevMs: number | null, tf: Timeframe): string {
  if (tf === '1d') {
    if (prevMs !== null && monthFmt.format(prevMs) !== monthFmt.format(ms)) {
      return monthFmt.format(ms)
    }
    return dayFmt.format(ms)
  }
  if (prevMs === null || dayFmt.format(prevMs) !== dayFmt.format(ms)) return dayFmt.format(ms)
  return timeFmt.format(ms)
}

/** "10 Nov 2026, 09:15 IST" for the crosshair. */
export function fullTime(ms: number, tf: Timeframe): string {
  if (tf === '1d') return `${dayFmt.format(ms)} ${monthFmt.format(ms).split(' ').pop()}`
  return `${fullFmt.format(ms)} IST`
}
