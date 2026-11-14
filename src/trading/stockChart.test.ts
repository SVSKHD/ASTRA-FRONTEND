import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INDICATORS,
  cacheCandles,
  cachedCandles,
  mergeTick,
  parseIndicators,
  sessionStart,
  type Candle,
} from './stockChart'

// 13 Nov 2026, 10:00 IST = 04:30 UTC.
const NOW = Date.parse('2026-11-13T04:30:00Z')
const c = (ts: string, close: string, high = close, low = close): Candle => ({
  ts,
  open: close,
  high,
  low,
  close,
  volume: '10',
})

describe('sessionStart', () => {
  it('is 09:15 IST on the IST day', () => {
    expect(new Date(sessionStart(NOW)).toISOString()).toBe('2026-11-13T03:45:00.000Z')
  })
  it('uses the IST day just after midnight IST', () => {
    // 00:30 IST on the 14th is 19:00 UTC on the 13th.
    const t = Date.parse('2026-11-13T19:00:00Z')
    expect(new Date(sessionStart(t)).toISOString()).toBe('2026-11-14T03:45:00.000Z')
  })
})

describe('mergeTick', () => {
  const base = [c('2026-11-13T04:28:00Z', '100'), c('2026-11-13T04:29:00Z', '101')]

  it('moves the newest candle within its minute', () => {
    const out = mergeTick(base, '103.5', '2026-11-13T04:29:40Z', '1m', NOW)
    expect(out).toHaveLength(2)
    expect(out[1]).toMatchObject({ close: '103.5', high: '103.5', low: '101' })
    expect(out[0]).toBe(base[0])
  })
  it('opens a new candle for the next minute', () => {
    const out = mergeTick(base, '99', '2026-11-13T04:30:05Z', '1m', NOW)
    expect(out).toHaveLength(3)
    expect(out[2]).toMatchObject({ ts: '2026-11-13T04:30:00.000Z', open: '99', close: '99' })
  })
  it('returns the same array for no change, an old tick, a bad price or a pre-open tick', () => {
    expect(mergeTick(base, '101', '2026-11-13T04:29:10Z', '1m', NOW)).toBe(base)
    expect(mergeTick(base, '120', '2026-11-13T04:20:00Z', '1m', NOW)).toBe(base)
    expect(mergeTick(base, null, '2026-11-13T04:29:10Z', '1m', NOW)).toBe(base)
    expect(mergeTick(base, '0', '2026-11-13T04:29:10Z', '1m', NOW)).toBe(base)
    expect(mergeTick([], '100', '2026-11-13T03:00:00Z', '1m', NOW)).toEqual([])
  })
  it('leaves daily candles alone', () => {
    expect(mergeTick(base, '150', '2026-11-13T04:29:40Z', '1d', NOW)).toBe(base)
  })
  it('starts from nothing when the server has no candles yet', () => {
    expect(mergeTick([], '100', '2026-11-13T04:29:40Z', '1m', NOW)).toHaveLength(1)
  })
})

describe('parseIndicators', () => {
  it('defaults when nothing is saved or it is unreadable', () => {
    expect(parseIndicators(null)).toEqual(DEFAULT_INDICATORS)
    expect(parseIndicators('{oops')).toEqual(DEFAULT_INDICATORS)
  })
  it('keeps known keys only, and an empty choice stays empty', () => {
    expect(parseIndicators('["rsi","nope",3]')).toEqual(['rsi'])
    expect(parseIndicators('[]')).toEqual([])
  })
})

describe('candle cache', () => {
  it('returns what was stored', () => {
    const list = [c('2026-11-13T04:28:00Z', '1')]
    cacheCandles('7:1d', list, 5)
    expect(cachedCandles('7:1d')).toEqual({ candles: list, at: 5 })
    expect(cachedCandles('8:1d')).toBeNull()
  })
})
