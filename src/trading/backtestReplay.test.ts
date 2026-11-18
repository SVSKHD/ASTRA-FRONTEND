import { describe, expect, it } from 'vitest'
import {
  barAt,
  heldBars,
  isLong,
  markersAt,
  placeTrades,
  stateAt,
  statsAt,
  unrealised,
  type BacktestTrade,
} from './backtestReplay'

// Ten 5-minute candles from 09:15 IST on 17 Nov 2026.
const T0 = Date.parse('2026-11-17T03:45:00Z')
const times = Array.from({ length: 10 }, (_, i) => T0 + i * 300_000)
const at = (bar: number, plusSec = 0) => new Date(times[bar] + plusSec * 1000).toISOString()

const trade = (over: Partial<BacktestTrade>): BacktestTrade => ({
  side: 'buy',
  quantity: '10',
  entry_price: '100',
  entry_time: at(1),
  exit_price: '110',
  exit_time: at(3),
  pnl: '100',
  fees: '1',
  session: 'regular',
  ...over,
})

const trades = [
  // given out of order on purpose
  trade({
    side: 'sell',
    entry_time: at(5),
    exit_time: at(7),
    entry_price: '110',
    exit_price: '115',
    pnl: '-50',
  }),
  trade({}),
  trade({ entry_time: at(8), exit_time: null, exit_price: null, pnl: null }),
]

describe('placing trades on the candles', () => {
  it('puts a moment in the bar it falls in', () => {
    expect(barAt(times, times[2])).toBe(2)
    expect(barAt(times, times[2] + 120_000)).toBe(2)
    expect(barAt(times, T0 - 1)).toBe(-1)
  })
  it('numbers trades in entry order and reads the side', () => {
    const p = placeTrades(trades, times)
    expect(p.map((t) => [t.n, t.entryBar, t.exitBar, t.long])).toEqual([
      [1, 1, 3, true],
      [2, 5, 7, false],
      [3, 8, -1, true],
    ])
    expect(p[0].ret).toBeCloseTo(0.1)
    expect(isLong('LONG')).toBe(true)
    expect(isLong('sell')).toBe(false)
  })
})

describe('the replay at a cursor', () => {
  const p = placeTrades(trades, times)

  it('knows which trades are pending, open and closed', () => {
    expect(stateAt(p[0], 0)).toBe('pending')
    expect(stateAt(p[0], 2)).toBe('open')
    expect(stateAt(p[0], 3)).toBe('closed')
    expect(stateAt(p[2], 9)).toBe('open')
  })

  it('adds up closed P&L, wins and drawdown so far', () => {
    expect(statsAt(p, 2)).toMatchObject({ closed: 0, net: 0, winRate: null })
    expect(statsAt(p, 2).open?.n).toBe(1)
    const s = statsAt(p, 9)
    expect(s).toMatchObject({ closed: 2, wins: 1, losses: 1, net: 50, maxDrawdown: 50 })
    expect(s.winRate).toBe(0.5)
    expect(s.equity.map((e) => e.value)).toEqual([0, 100, 50])
    expect(s.open?.n).toBe(3)
  })

  it('marks entries and exits only once they have happened', () => {
    expect(markersAt(p, 2).map((m) => [m.index, m.kind])).toEqual([[1, 'buy']])
    expect(markersAt(p, 7).map((m) => [m.index, m.kind])).toEqual([
      [1, 'buy'],
      [3, 'sell'],
      [5, 'sell'],
      [7, 'buy'],
    ])
  })

  it('values an open trade and counts how long it was held', () => {
    expect(unrealised(p[0], 104)).toBe(40)
    expect(unrealised(p[1], 104)).toBe(60)
    expect(heldBars(p[0], 9)).toBe(2)
    expect(heldBars(p[2], 9)).toBe(1)
  })
})
