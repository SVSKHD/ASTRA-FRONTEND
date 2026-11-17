import { describe, expect, it } from 'vitest'
import {
  changePct,
  confirmation,
  isStaleAt,
  lastCross,
  readSignal,
  strengthOf,
  toSeries,
  type Bar,
  type IndicatorRow,
} from './classify'
import { concentrated, holdingViews, rebalance, toneOf } from './portfolio'

// 15-minute bars from 09:15 IST, 17 Nov 2026.
const T0 = Date.parse('2026-11-17T03:45:00Z')
const ts = (i: number) => new Date(T0 + i * 900_000).toISOString()

/** Bars with closes, and indicator rows with the given ema8 / ema32 / vwap per bar. */
function build(rows: { close: number; e8: number; e32: number; vwap?: number; vol?: number }[]) {
  const candles: Bar[] = rows.map((r, i) => ({
    ts: ts(i),
    open: String(r.close),
    high: String(r.close),
    low: String(r.close),
    close: String(r.close),
    volume: String(r.vol ?? 100),
  }))
  const ind: IndicatorRow[] = rows.flatMap((r, i) => [
    { name: 'ema:8', ts: ts(i), values: { value: String(r.e8) } },
    { name: 'ema:32', ts: ts(i), values: { value: String(r.e32) } },
    ...(r.vwap !== undefined
      ? [{ name: 'vwap', ts: ts(i), values: { value: String(r.vwap) } }]
      : []),
    { name: 'rsi:14', ts: ts(i), values: { value: '60' } },
    { name: 'adx:14', ts: ts(i), values: { adx: '30', plus_di: '25', minus_di: '15' } },
  ])
  return toSeries(candles, ind)
}

describe('reading the EMA 8 / 32 + VWAP signal', () => {
  it('is bullish when EMA 8 is over EMA 32 and price is over VWAP, with the cross confirmed', () => {
    const s = build([
      { close: 100, e8: 99, e32: 100, vwap: 100 },
      { close: 101, e8: 100.5, e32: 100, vwap: 100 }, // cross up, close over VWAP
      { close: 102, e8: 101, e32: 100.2, vwap: 100.5 },
    ])
    const r = readSignal(s, '15m')
    expect(r.cls).toBe('bullish')
    expect(r.cross).toMatchObject({ direction: 'up', index: 1, barsAgo: 1 })
    expect(r.confirmed?.index).toBe(1)
    expect(r.vwapDistPct).toBeCloseTo(1.4925, 3)
    expect(r.adx).toBe(30)
  })

  it('is pending after a cross while price has not crossed VWAP yet, then confirms', () => {
    const rows = [
      { close: 100, e8: 99, e32: 100, vwap: 101 },
      { close: 100.5, e8: 100.2, e32: 100, vwap: 101 }, // crossed up, under VWAP
    ]
    expect(readSignal(build(rows), '15m').cls).toBe('pending')
    const later = build([...rows, { close: 101.5, e8: 100.6, e32: 100.1, vwap: 101 }])
    expect(confirmation(later, lastCross(later))?.index).toBe(2)
    expect(readSignal(later, '15m').cls).toBe('bullish')
  })

  it('is bearish on the mirror, and mixed when EMAs and VWAP disagree with no recent cross', () => {
    const down = build([
      { close: 100, e8: 101, e32: 100, vwap: 100 },
      { close: 98, e8: 99, e32: 100, vwap: 99.5 },
    ])
    expect(readSignal(down, '15m').cls).toBe('bearish')
    const mixed = build(
      Array.from({ length: 15 }, () => ({ close: 99, e8: 101, e32: 100, vwap: 100 })),
    )
    expect(readSignal(mixed, '15m').cls).toBe('mixed')
  })

  it('reads daily bars on the EMAs alone, and never asks for VWAP there', () => {
    const d = build([
      { close: 100, e8: 99, e32: 100 },
      { close: 102, e8: 101, e32: 100 },
    ])
    const r = readSignal(d, '1d')
    expect(r.cls).toBe('bullish')
    expect(r.usesVwap).toBe(false)
    expect(r.explanation).toContain('no session VWAP')
  })

  it('says unavailable rather than guessing when the server has no numbers', () => {
    expect(readSignal(toSeries([], []), '15m').cls).toBe('unavailable')
    const noVwap = build([{ close: 100, e8: 101, e32: 100 }])
    expect(readSignal(noVwap, '15m').cls).toBe('unavailable')
  })

  it('scores strength from 0 to 100 in the trend direction', () => {
    const strong = strengthOf({
      trend: 'up',
      close: 100,
      ema8: 101,
      ema32: 99,
      vwap: 98,
      adx: 40,
      rsi: 70,
      usesVwap: true,
    })
    const weak = strengthOf({
      trend: 'up',
      close: 100,
      ema8: 100.05,
      ema32: 100,
      vwap: 101,
      adx: 10,
      rsi: 50,
      usesVwap: true,
    })
    expect(strong).toBe(100)
    expect(weak).toBeLessThan(20)
    expect(
      strengthOf({
        trend: null,
        close: 1,
        ema8: 1,
        ema32: 1,
        vwap: 1,
        adx: 1,
        rsi: 1,
        usesVwap: true,
      }),
    ).toBeNull()
  })

  it('measures relative volume, today’s change and staleness', () => {
    const rows = Array.from({ length: 22 }, (_, i) => ({
      close: 100,
      e8: 101,
      e32: 100,
      vwap: 99,
      vol: i === 21 ? 300 : 100,
    }))
    expect(readSignal(build(rows), '15m').relVolume).toBe(3)
    // previous IST day's last close 100, today 102
    const s = toSeries(
      [
        { ts: '2026-11-16T09:59:00Z', open: '1', high: '1', low: '1', close: '100' },
        { ts: '2026-11-17T03:45:00Z', open: '1', high: '1', low: '1', close: '102' },
      ],
      [],
    )
    expect(changePct(s)).toBeCloseTo(2)
    expect(isStaleAt(T0, '15m', T0 + 3_600_000)).toBe(false)
    expect(isStaleAt(T0, '15m', T0 + 2 * 3_600_000)).toBe(true)
  })
})

describe('portfolio map', () => {
  const views = holdingViews([
    { symbol: 'A', quantity: 10, avgCost: 100, price: 120 },
    { symbol: 'B', quantity: 4, avgCost: 100, price: 100 },
    { symbol: 'C', quantity: 2, avgCost: 50, price: null },
  ])
  it('weights holdings by value and works out P&L', () => {
    expect(views.map((v) => v.symbol)).toEqual(['A', 'B', 'C'])
    expect(views[0]).toMatchObject({ value: 1200, pnl: 200 })
    expect(views[0].weight).toBeCloseTo(1200 / 1700)
    expect(views[2].pnl).toBeNull()
    expect(concentrated(views).map((v) => v.symbol)).toEqual(['A'])
  })
  it('colours tiles by signal, grey when stale or unknown', () => {
    expect(toneOf('bullish')).toBe('bull')
    expect(toneOf('pending')).toBe('amber')
    expect(toneOf('bullish', true)).toBe('neutral')
    expect(toneOf(null)).toBe('neutral')
  })
  it('previews a rebalance in whole shares, with the cash it needs', () => {
    const p = rebalance(views, { A: 0.5, D: 0.2 }, { D: 50 })
    const a = p.lines.find((l) => l.symbol === 'A')!
    expect(a.shares).toBe(-2) // 0.5 × 1700 = 850 → sell 350 worth at 120
    const d = p.lines.find((l) => l.symbol === 'D')!
    expect(d).toMatchObject({ current: 0, proposed: 0.2, shares: 6, cash: 300 })
    expect(p.cashNeeded).toBeCloseTo(-240 + 300)
  })
})
