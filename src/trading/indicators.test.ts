// The browser's indicator maths, against hand-computed values and against the backend's
// own formulas (app/agents/research/indicators.py). The "backend" numbers below were
// produced by running that module, unchanged, on the same fixture.
import { describe, expect, it } from 'vitest'
import {
  adx,
  atr,
  bollinger,
  crossovers,
  dayKey,
  ema,
  macd,
  rsi,
  sma,
  trueRange,
  vwap,
} from './indicators'

const CLOSE = [
  10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 17, 18, 17, 19, 20, 19, 21, 22, 21, 23, 24, 23, 25, 26,
  25, 27, 28, 27, 29, 30, 29, 31, 32, 31, 33, 34, 33, 35, 36, 35,
]
const HIGH = CLOSE.map((c) => c + 1)
const LOW = CLOSE.map((c) => c - 1.5)
const VOLUME = CLOSE.map((_, i) => 100 + i * 10)
// 15-minute bars from 09:15 IST (03:45 UTC) on 9 Nov 2026.
const T0 = Date.parse('2026-11-09T03:45:00Z')
const TIME = CLOSE.map((_, i) => T0 + i * 15 * 60_000)

function close(a: number[], b: (number | null)[], digits = 8) {
  expect(a.length).toBeGreaterThanOrEqual(b.length)
  b.forEach((v, i) => {
    if (v === null) expect(a[i]).toBeNaN()
    else expect(a[i]).toBeCloseTo(v, digits)
  })
}

describe('EMA, seeded like the backend', () => {
  it('starts at index n-1 with the SMA of the first n values (hand-computed)', () => {
    // seed = (10+11+12)/3 = 11; then α = 0.5: 11 + (11-11)/2 = 11; 11 + (13-11)/2 = 12; …
    close(ema(CLOSE, 3), [null, null, 11, 11, 12, 13, 13, 14])
  })
  it('matches the backend on EMA 9', () => {
    const e = ema(CLOSE, 9)
    expect(e.slice(0, 8).every(Number.isNaN)).toBe(true)
    close(
      e.slice(8, 14),
      [12.7777777778, 13.2222222222, 13.9777777778, 14.7822222222, 15.2257777778, 15.9806222222],
    )
    expect(e[39]).toBeCloseTo(33.2294991771, 8)
  })
  it('starts from the first value that is not NaN and carries the last value over a NaN', () => {
    // backend: [nan, nan, 1, 2, 3, nan, 5] → [nan ×4, 2, 2, 3.5]
    close(ema([NaN, NaN, 1, 2, 3, NaN, 5], 3), [null, null, null, null, 2, 2, 3.5])
  })
  it('is all NaN when the seed window holds a NaN, or there are too few values', () => {
    expect(ema([1, NaN, 3, 4, 5], 3).every(Number.isNaN)).toBe(true)
    expect(ema([1, 2], 3).every(Number.isNaN)).toBe(true)
  })
  it('rejects a period below 1', () => {
    expect(() => ema(CLOSE, 0)).toThrow()
  })
})

describe('SMA and Bollinger Bands', () => {
  it('SMA is NaN until warm, then the window mean', () => {
    close(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4])
    close(sma([1, NaN, 3, 4, 5], 2), [null, null, null, 3.5, 4.5])
  })
  it('bands are SMA ± k × population SD', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9]: mean 5, population SD 2.
    const b = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2)
    expect(b.middle[7]).toBe(5)
    expect(b.upper[7]).toBe(9)
    expect(b.lower[7]).toBe(1)
    expect(b.upper[6]).toBeNaN()
  })
})

describe('MACD, as the backend builds it', () => {
  it('line from index slow-1, signal from slow-1+signal-1 (seeded EMA of the line)', () => {
    const m = macd(CLOSE, 3, 6, 4)
    expect(m.macd.slice(0, 5).every(Number.isNaN)).toBe(true)
    close(m.macd.slice(4, 9), [null, 1.1666666667, 0.8333333333, 1.0238095238, 1.1598639456])
    expect(m.signal.slice(0, 8).every(Number.isNaN)).toBe(true)
    close(m.signal.slice(7, 11), [null, 1.0459183673, 0.9589407191, 0.9834999306])
    close(m.hist.slice(7, 11), [null, 0.1139455782, -0.1304664723, 0.0368388172])
    expect(m.signal[39]).toBeCloseTo(0.9621796527, 8)
  })
  it('refuses fast >= slow, like the backend', () => {
    expect(() => macd(CLOSE, 26, 12, 9)).toThrow()
  })
})

describe('ATR, Wilder-smoothed and mean-seeded', () => {
  it('the first TR has no previous close, so it is high - low', () => {
    const tr = trueRange({ high: [11, 13], low: [9.5, 12], close: [10, 12.5] })
    expect(tr).toEqual([1.5, 3]) // max(1, |13-10|, |12-10|) = 3
  })
  it('matches the backend on ATR 5', () => {
    // TRs: 2.5, 2.5, 2.5, 2.5, 3.5 → seed 2.6 at index 4; then (2.6×4 + 2.5)/5 = 2.58.
    const a = atr({ high: HIGH, low: LOW, close: CLOSE }, 5)
    close(a.slice(3, 9), [null, 2.6, 2.58, 2.564, 2.6512, 2.62096])
    expect(a[39]).toBeCloseTo(2.6311049812, 8)
  })
})

describe('RSI (Wilder)', () => {
  it('first value at index n, from the mean gain/loss of the first n changes', () => {
    // changes: +1, +1, -1 → avg gain 2/3, avg loss 1/3 → RS 2 → RSI 66.67
    const r = rsi([10, 11, 12, 11, 13], 3)
    expect(r.slice(0, 3).every(Number.isNaN)).toBe(true)
    expect(r[3]).toBeCloseTo(66.6667, 3)
    // next change +2: gain (2/3·2 + 2)/3 = 10/9, loss (1/3·2 + 0)/3 = 2/9 → RS 5 → 83.33
    expect(r[4]).toBeCloseTo(83.3333, 3)
  })
  it('is 100 with no losses and 50 on a flat line', () => {
    expect(rsi([1, 2, 3, 4], 3)[3]).toBe(100)
    expect(rsi([5, 5, 5, 5], 3)[3]).toBe(50)
  })
})

describe('ADX (Wilder +DI / −DI)', () => {
  it('DI from index n, ADX from index 2n-1, NaN before', () => {
    const a = adx({ high: HIGH, low: LOW, close: CLOSE }, 3)
    expect(a.plusDI.slice(0, 3).every(Number.isNaN)).toBe(true)
    expect(Number.isNaN(a.plusDI[3])).toBe(false)
    expect(a.adx.slice(0, 5).every(Number.isNaN)).toBe(true)
    expect(Number.isNaN(a.adx[5])).toBe(false)
  })
  it('hand-computed on a steady climb: all movement is +DM, so +DI > 0, −DI = 0, ADX 100', () => {
    const high = [11, 12, 13, 14, 15, 16, 17]
    const low = [9, 10, 11, 12, 13, 14, 15]
    const cl = [10, 11, 12, 13, 14, 15, 16]
    // +DM = 1 each bar, TR = max(2, 2, 0) = 2 → +DI = 50, −DI = 0, DX = 100.
    const a = adx({ high, low, close: cl }, 3)
    expect(a.plusDI[3]).toBeCloseTo(50, 10)
    expect(a.minusDI[3]).toBe(0)
    expect(a.adx[5]).toBeCloseTo(100, 10)
  })
})

describe('VWAP, anchored per day', () => {
  it('matches the backend (vwap:UTC) on NSE hours, where IST and UTC days coincide', () => {
    const c = { high: HIGH, low: LOW, close: CLOSE, volume: VOLUME, time: TIME }
    const ist = vwap(c, 'Asia/Kolkata')
    const utc = vwap(c, 'UTC')
    // first bar: typical price (11 + 8.5 + 10) / 3 = 9.8333
    expect(ist[0]).toBeCloseTo(9.8333333333, 8)
    expect(ist[1]).toBeCloseTo(10.3571428571, 8)
    expect(ist[39]).toBeCloseTo(25.8299435028, 8)
    expect(ist).toEqual(utc)
  })
  it('resets at the anchor day, and differs from UTC only between IST midnight and 05:30', () => {
    // 18:15 UTC is 23:45 IST (day 1); 18:45 UTC is 00:15 IST (day 2) but the same UTC day.
    const time = [Date.parse('2026-11-09T18:15:00Z'), Date.parse('2026-11-09T18:45:00Z')]
    const c = { high: [11, 21], low: [9, 19], close: [10, 20], volume: [1, 1], time }
    expect(vwap(c, 'Asia/Kolkata')).toEqual([10, 20])
    expect(vwap(c, 'UTC')).toEqual([10, 15])
    expect(dayKey(time[1], 'Asia/Kolkata')).toBe('2026-11-10')
  })
  it('is NaN while the day has no volume', () => {
    const c = { high: [2], low: [1], close: [1.5], volume: [0], time: [T0] }
    expect(vwap(c)[0]).toBeNaN()
  })
})

describe('crossovers, as the backend ema_cross defines them', () => {
  it('bullish when diff > 0 after <= 0, bearish when < 0 after >= 0; NaN is no cross', () => {
    const fast = [NaN, 1, 2, 3, 3, 1, 2]
    const slow = [NaN, 2, 2, 2, 3, 2, 2]
    // diffs: nan, -1, 0, 1, 0, -1, 0
    expect(crossovers(fast, slow)).toEqual([
      { index: 3, side: 'bullish' },
      { index: 5, side: 'bearish' },
    ])
  })
})
