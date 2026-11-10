// Technical indicators calculated in the browser, from the candles the chart shows.
//
// These exist because the backend stores only a configured set (docs/market-terminal.md
// §4: ema:9, ema:21, macd:12:26:9, atr:14, vwap:UTC). Every other study is calculated
// here and LABELLED as calculated in the browser. When a stored server row matches, the
// chart uses the server's value instead (src/trading/studies.ts).
//
// The formulas follow the backend's (Aureon_agents_Assembler,
// app/agents/research/indicators.py) so the two agree on the same candles:
//
//   EMA(n)   seeded with the simple mean of the first n values (`_seeded_ema`): the first
//            value is at index start + n - 1, where `start` is the first non-NaN input;
//            a NaN inside the seed window leaves the whole series NaN; a NaN after the
//            seed repeats the previous value. Then ema = prev + (x - prev) * 2 / (n + 1).
//   MACD     EMA(fast) - EMA(slow); signal = the same seeded EMA of the MACD line;
//            hist = MACD - signal.
//   ATR(n)   Wilder's smoothing of the true range, seeded with the mean of the first n
//            TRs. The first TR has no previous close, so it is high - low (pandas' max
//            with skipna, as the backend does). First value at index n - 1.
//   VWAP     typical price (H+L+C)/3 weighted by volume, reset each calendar day in the
//            anchor time zone. A day with no volume yet is NaN.
//
// Studies the backend does not have, with the conventions chosen here:
//
//   SMA(n)   mean of the last n values; NaN until n values, NaN if the window has one.
//   RSI(n)   Wilder: average gain/loss seeded with the mean of the first n changes
//            (changes start at index 1, so the first RSI is at index n), then
//            avg = (prev * (n - 1) + x) / n. avgLoss = 0 → 100 (50 when both are 0).
//   ADX(n)   Wilder +DM/-DM and TR from index 1 (each needs the previous bar), smoothed
//            the same mean-seeded Wilder way as ATR: +DI/-DI from index n, DX from n,
//            ADX = mean of the first n DX at index 2n - 1, then Wilder.
//   BB(n,k)  SMA(n) ± k × population standard deviation (ddof 0, as most charting
//            packages draw it).
//
// Prices become floats here ONLY for this analysis math, exactly as the backend does;
// the chart shows the server's decimal strings for every candle value.

export type Series = number[]

function nanArray(n: number): Series {
  return new Array<number>(n).fill(NaN)
}

function assertPeriod(n: number): void {
  if (!Number.isInteger(n) || n < 1) throw new Error('period must be a positive integer')
}

/** The backend's `_seeded_ema`, line for line. */
export function ema(values: readonly number[], n: number): Series {
  assertPeriod(n)
  const out = nanArray(values.length)
  const start = values.findIndex((v) => !Number.isNaN(v))
  if (start < 0) return out
  let valid = 0
  for (const v of values) if (!Number.isNaN(v)) valid++
  if (valid < n) return out
  const seedEnd = start + n - 1
  if (seedEnd >= values.length) return out
  let sum = 0
  for (let i = start; i <= seedEnd; i++) {
    if (Number.isNaN(values[i])) return out
    sum += values[i]
  }
  const alpha = 2 / (n + 1)
  let prev = sum / n
  out[seedEnd] = prev
  for (let i = seedEnd + 1; i < values.length; i++) {
    const v = values[i]
    if (Number.isNaN(v)) {
      out[i] = prev
      continue
    }
    prev = prev + (v - prev) * alpha
    out[i] = prev
  }
  return out
}

export function sma(values: readonly number[], n: number): Series {
  assertPeriod(n)
  const out = nanArray(values.length)
  for (let i = n - 1; i < values.length; i++) {
    let sum = 0
    let bad = false
    for (let j = i - n + 1; j <= i; j++) {
      if (Number.isNaN(values[j])) {
        bad = true
        break
      }
      sum += values[j]
    }
    if (!bad) out[i] = sum / n
  }
  return out
}

export interface Macd {
  macd: Series
  signal: Series
  hist: Series
}

export function macd(close: readonly number[], fast = 12, slow = 26, signal = 9): Macd {
  if (fast >= slow) throw new Error('MACD fast period must be shorter than slow')
  const f = ema(close, fast)
  const s = ema(close, slow)
  const line = f.map((v, i) => v - s[i])
  const sig = ema(line, signal)
  return { macd: line, signal: sig, hist: line.map((v, i) => v - sig[i]) }
}

export interface Hlc {
  high: readonly number[]
  low: readonly number[]
  close: readonly number[]
}

/** True range; the first bar (no previous close) is high - low, as pandas' skipna max gives. */
export function trueRange({ high, low, close }: Hlc): Series {
  return high.map((h, i) => {
    const l = low[i]
    if (i === 0) return h - l
    const pc = close[i - 1]
    return Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))
  })
}

/** Wilder smoothing seeded with the mean of the first n values of `x` from index `from`. */
function wilder(x: readonly number[], n: number, from: number): Series {
  const out = nanArray(x.length)
  const seedEnd = from + n - 1
  if (seedEnd >= x.length) return out
  let sum = 0
  for (let i = from; i <= seedEnd; i++) sum += x[i]
  let prev = sum / n
  out[seedEnd] = prev
  for (let i = seedEnd + 1; i < x.length; i++) {
    prev = (prev * (n - 1) + x[i]) / n
    out[i] = prev
  }
  return out
}

export function atr(hlc: Hlc, n = 14): Series {
  assertPeriod(n)
  return wilder(trueRange(hlc), n, 0)
}

export function rsi(close: readonly number[], n = 14): Series {
  assertPeriod(n)
  const gains = close.map((c, i) => (i === 0 ? 0 : Math.max(c - close[i - 1], 0)))
  const losses = close.map((c, i) => (i === 0 ? 0 : Math.max(close[i - 1] - c, 0)))
  const g = wilder(gains, n, 1)
  const l = wilder(losses, n, 1)
  return g.map((gv, i) => {
    const lv = l[i]
    if (Number.isNaN(gv) || Number.isNaN(lv)) return NaN
    if (lv === 0) return gv === 0 ? 50 : 100
    return 100 - 100 / (1 + gv / lv)
  })
}

export interface Adx {
  plusDI: Series
  minusDI: Series
  adx: Series
}

export function adx({ high, low, close }: Hlc, n = 14): Adx {
  assertPeriod(n)
  const len = close.length
  const pdm = nanArray(len)
  const mdm = nanArray(len)
  const tr = trueRange({ high, low, close })
  for (let i = 1; i < len; i++) {
    const up = high[i] - high[i - 1]
    const down = low[i - 1] - low[i]
    pdm[i] = up > down && up > 0 ? up : 0
    mdm[i] = down > up && down > 0 ? down : 0
  }
  const sTr = wilder(tr, n, 1)
  const sP = wilder(pdm, n, 1)
  const sM = wilder(mdm, n, 1)
  const plusDI = nanArray(len)
  const minusDI = nanArray(len)
  const dx = nanArray(len)
  for (let i = n; i < len; i++) {
    if (Number.isNaN(sTr[i]) || sTr[i] === 0) continue
    plusDI[i] = (100 * sP[i]) / sTr[i]
    minusDI[i] = (100 * sM[i]) / sTr[i]
    const sum = plusDI[i] + minusDI[i]
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(plusDI[i] - minusDI[i])) / sum
  }
  // ADX: Wilder of DX, seeded by the mean of the first n DX values (index n .. 2n-1).
  const out = nanArray(len)
  const seedEnd = 2 * n - 1
  if (seedEnd < len) {
    let sum = 0
    let ok = true
    for (let i = n; i <= seedEnd; i++) {
      if (Number.isNaN(dx[i])) ok = false
      sum += dx[i]
    }
    if (ok) {
      let prev = sum / n
      out[seedEnd] = prev
      for (let i = seedEnd + 1; i < len; i++) {
        if (!Number.isNaN(dx[i])) prev = (prev * (n - 1) + dx[i]) / n
        out[i] = prev
      }
    }
  }
  return { plusDI, minusDI, adx: out }
}

export interface Bands {
  middle: Series
  upper: Series
  lower: Series
}

export function bollinger(close: readonly number[], n = 20, k = 2): Bands {
  const middle = sma(close, n)
  const upper = nanArray(close.length)
  const lower = nanArray(close.length)
  for (let i = n - 1; i < close.length; i++) {
    const m = middle[i]
    if (Number.isNaN(m)) continue
    let v = 0
    for (let j = i - n + 1; j <= i; j++) v += (close[j] - m) ** 2
    const sd = Math.sqrt(v / n)
    upper[i] = m + k * sd
    lower[i] = m - k * sd
  }
  return { middle, upper, lower }
}

/** IST: NSE and BSE trade on Indian time, so the browser's VWAP resets at IST midnight. */
export const DEFAULT_VWAP_TZ = 'Asia/Kolkata'

const dayFormats = new Map<string, Intl.DateTimeFormat>()
/** "2026-11-10" for an instant, in `tz`. */
export function dayKey(ms: number, tz: string): string {
  let f = dayFormats.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    dayFormats.set(tz, f)
  }
  return f.format(ms)
}

export interface Hlcv extends Hlc {
  volume: readonly number[]
  /** Candle open times, epoch ms. */
  time: readonly number[]
}

/**
 * Session VWAP, reset at each calendar day in `tz`.
 *
 * The backend stores `vwap:UTC` (UTC days). NSE's session (09:15–15:30 IST, i.e.
 * 03:45–10:00 UTC) falls on the same calendar day in both zones, so for NSE candles an
 * IST anchor and a UTC anchor give the same numbers; they differ only for bars between
 * IST midnight and 05:30 IST, which NSE does not trade.
 */
export function vwap(c: Hlcv, tz = DEFAULT_VWAP_TZ): Series {
  const out = nanArray(c.close.length)
  let day = ''
  let pv = 0
  let vol = 0
  for (let i = 0; i < c.close.length; i++) {
    const d = dayKey(c.time[i], tz)
    if (d !== day) {
      day = d
      pv = 0
      vol = 0
    }
    const tp = (c.high[i] + c.low[i] + c.close[i]) / 3
    pv += tp * c.volume[i]
    vol += c.volume[i]
    out[i] = vol === 0 ? NaN : pv / vol
  }
  return out
}

export type CrossSide = 'bullish' | 'bearish'
export interface Cross {
  index: number
  side: CrossSide
}

/**
 * Where `fast` crosses `slow`, as the backend's ema_cross defines it
 * (app/agents/research/strategies.py): bullish when diff > 0 and the previous diff <= 0,
 * bearish when diff < 0 and the previous diff >= 0. A NaN on either bar is no cross.
 */
export function crossovers(fast: readonly number[], slow: readonly number[]): Cross[] {
  const out: Cross[] = []
  for (let i = 1; i < fast.length; i++) {
    const d = fast[i] - slow[i]
    const p = fast[i - 1] - slow[i - 1]
    if (Number.isNaN(d) || Number.isNaN(p)) continue
    if (d > 0 && p <= 0) out.push({ index: i, side: 'bullish' })
    else if (d < 0 && p >= 0) out.push({ index: i, side: 'bearish' })
  }
  return out
}
