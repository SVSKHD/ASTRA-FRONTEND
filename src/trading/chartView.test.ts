import { describe, expect, it } from 'vitest'
import {
  carryView,
  MIN_BARS,
  RIGHT_PAD,
  TIMEFRAMES,
  atLatest,
  axisLabel,
  clampView,
  initialView,
  isStale,
  isTimeframe,
  isUnconfirmed,
  keyView,
  labelEvery,
  niceTicks,
  panView,
  stepDecimals,
  visibleRange,
  zoomView,
} from './chartView'

describe('the viewport', () => {
  it('opens on the newest candles, with a little room on the right', () => {
    expect(initialView(1000, 120)).toEqual({ start: 1000 + RIGHT_PAD - 120, end: 1000 + RIGHT_PAD })
    // fewer candles than the default window: the whole series
    expect(initialView(30)).toEqual({ start: 0, end: 30 + RIGHT_PAD })
  })
  it('draws only the visible window', () => {
    expect(visibleRange({ start: 880.4, end: 1002 }, 1000)).toEqual([880, 1000])
    expect(visibleRange({ start: 0, end: 50.2 }, 1000)).toEqual([0, 51])
  })
  it('pans by bars and stops at both ends', () => {
    const v = { start: 500, end: 600 }
    expect(panView(v, 10, 1000)).toEqual({ start: 510, end: 610 })
    expect(panView(v, -1000, 1000)).toEqual({ start: 0, end: 100 })
    expect(panView(v, 1000, 1000)).toEqual({ start: 902, end: 1002 })
  })
  it('zooms about the anchor and never below MIN_BARS or beyond the series', () => {
    const v = { start: 500, end: 600 }
    // zoom in 2× about the centre: 25 bars each side of 550
    expect(zoomView(v, 0.5, 0.5, 1000)).toEqual({ start: 525, end: 575 })
    // about the right edge: the right edge stays put
    expect(zoomView(v, 0.5, 1, 1000)).toEqual({ start: 550, end: 600 })
    const tiny = zoomView(v, 0.001, 0.5, 1000)
    expect(tiny.end - tiny.start).toBe(MIN_BARS)
    const all = zoomView(v, 1000, 0.5, 1000)
    expect(all).toEqual({ start: 0, end: 1000 + RIGHT_PAD })
  })
  it('keys: arrows pan 10%, +/- zoom, Home/End jump; other keys are not the chart’s', () => {
    const v = { start: 500, end: 600 }
    expect(keyView(v, 'ArrowLeft', 1000)).toEqual({ start: 490, end: 590 })
    expect(keyView(v, 'ArrowRight', 1000)).toEqual({ start: 510, end: 610 })
    expect(keyView(v, '+', 1000)).toEqual({ start: 520, end: 600 })
    expect(keyView(v, '-', 1000)).toEqual({ start: 475, end: 600 })
    expect(keyView(v, 'Home', 1000)).toEqual({ start: 0, end: 100 })
    expect(keyView(v, 'End', 1000)).toEqual({ start: 902, end: 1002 })
    expect(keyView(v, 'a', 1000)).toBeNull()
  })
  it('knows when it is following the newest candle', () => {
    expect(atLatest({ start: 900, end: 1002 }, 1000)).toBe(true)
    expect(atLatest({ start: 800, end: 900 }, 1000)).toBe(false)
  })
  it('clamps nonsense', () => {
    expect(clampView({ start: NaN, end: NaN }, 50)).toEqual({ start: 0, end: 52 })
    expect(clampView({ start: 0, end: 5 }, 3)).toEqual({ start: 0, end: 5 })
  })
})

describe('the newest candle', () => {
  const ts = '2026-11-10T04:00:00Z' // a 15m candle: 04:00–04:15 UTC
  it('is unconfirmed until ts + timeframe, by the clock given (the server’s)', () => {
    expect(isUnconfirmed(ts, '15m', Date.parse('2026-11-10T04:14:59Z'))).toBe(true)
    expect(isUnconfirmed(ts, '15m', Date.parse('2026-11-10T04:15:00Z'))).toBe(false)
    expect(isUnconfirmed(ts, '1d', Date.parse('2026-11-10T20:00:00Z'))).toBe(true)
  })
  it('is stale when it closed more than 3 bars ago (the backend default)', () => {
    expect(isStale(ts, '15m', Date.parse('2026-11-10T05:00:00Z'))).toBe(false)
    expect(isStale(ts, '15m', Date.parse('2026-11-10T05:00:01Z'))).toBe(true)
  })
  it('only the backend’s timeframes are accepted', () => {
    expect(TIMEFRAMES).toEqual(['1m', '5m', '15m', '30m', '1h', '4h', '1d'])
    expect(isTimeframe('15m')).toBe(true)
    expect(isTimeframe('2h')).toBe(false)
  })
})

describe('axes', () => {
  it('round price ticks', () => {
    expect(niceTicks(101.3, 108.9, 4)).toEqual([102, 104, 106, 108])
    expect(niceTicks(0.12, 0.19, 4)).toEqual([0.12, 0.14, 0.16, 0.18])
    expect(stepDecimals([0.12, 0.14])).toBe(2)
    expect(stepDecimals([100, 200])).toBe(0)
  })
  it('time labels sit far enough apart', () => {
    expect(labelEvery(10)).toBe(10)
    expect(labelEvery(100)).toBe(1)
  })
  it('labels the day when it changes, else the time (IST)', () => {
    const a = Date.parse('2026-11-09T09:45:00Z') // 15:15 IST, 9 Nov
    const b = Date.parse('2026-11-10T03:45:00Z') // 09:15 IST, 10 Nov
    const c = Date.parse('2026-11-10T04:00:00Z') // 09:30 IST
    expect(axisLabel(b, a, '15m')).toMatch(/10/)
    expect(axisLabel(c, b, '15m')).toBe('09:30')
  })
})

describe('carryView', () => {
  const t = (from: number, n: number) => Array.from({ length: n }, (_, i) => (from + i) * 60_000)

  it('keeps the same candles on screen when the window slid by one', () => {
    // Looking at candles 10..30 of 100; a refresh drops the oldest and adds one.
    const v = carryView({ start: 10, end: 30 }, t(0, 100), t(1, 100))
    expect(v).toEqual({ start: 9, end: 29 })
  })
  it('keeps following the newest candle when it was', () => {
    const v = carryView({ start: 50, end: 102 }, t(0, 100), t(1, 100))
    expect(v?.end).toBe(102)
    expect(v!.end - v!.start).toBe(52)
  })
  it('is unchanged for an identical re-read', () => {
    expect(carryView({ start: 10, end: 30 }, t(0, 100), t(0, 100))).toEqual({ start: 10, end: 30 })
  })
  it('starts over when the reads share no candle', () => {
    expect(carryView({ start: 10, end: 30 }, t(0, 100), t(500, 100))).toBeNull()
  })
})
