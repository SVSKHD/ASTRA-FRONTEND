import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONTRACT_SIZES,
  accountTotals,
  byDay,
  contractSizeFor,
  dayMetaFor,
  isKnownSymbol,
  monthBounds,
  recomputed,
  signed2,
  sortTrades,
  targetProgress,
  tradeMove,
  tradePl,
  tradeStats,
  tradesToCsv,
} from '@/utils/tradeMath'
import type { SecuredEntry, Trade } from '@/types'

function makeTrade(over: Partial<Trade> = {}): Trade {
  const base: Trade = {
    id: 't1',
    date: '2026-09-01',
    ts: 1,
    symbol: 'XAUUSD',
    session: 'London',
    side: 'buy',
    lot: 1,
    entry: 2400,
    exit: 2410,
    move: 10,
    pl: 1000,
    note: '',
    createdAt: 0,
  }
  return { ...base, ...over }
}

function makeSecured(over: Partial<SecuredEntry> = {}): SecuredEntry {
  return { id: 's1', date: '2026-09-02', amt: 500, note: '', createdAt: 0, ...over }
}

describe('move and P/L', () => {
  it('reads a buy up and a sell down', () => {
    expect(tradeMove('buy', 2400, 2410)).toBe(10)
    expect(tradeMove('sell', 2400, 2410)).toBe(-10)
    expect(tradeMove('sell', 2410, 2400)).toBe(10)
  })

  it('multiplies the move by the lot and the contract size', () => {
    expect(tradePl(10, 2, 100)).toBe(2000)
    expect(tradePl(-3.5, 1, 5000)).toBe(-17500)
  })

  it('rounds to two decimals rather than carrying float noise', () => {
    expect(tradeMove('buy', 0.1, 0.3)).toBe(0.2)
    expect(tradePl(0.1 + 0.2, 1, 1)).toBe(0.3)
  })
})

describe('a stored value is never trusted', () => {
  it('recomputes move and P/L from the row’s own inputs', () => {
    const wrong = makeTrade({ move: 999, pl: -12345 })
    const fixed = recomputed(wrong, DEFAULT_CONTRACT_SIZES)
    expect(fixed.move).toBe(10)
    expect(fixed.pl).toBe(1000)
  })

  it('falls back to a contract size of 1 for a symbol nobody has sized yet', () => {
    expect(contractSizeFor(DEFAULT_CONTRACT_SIZES, 'NAS100')).toBe(1)
    expect(contractSizeFor(DEFAULT_CONTRACT_SIZES, 'xauusd')).toBe(100)
    expect(isKnownSymbol(DEFAULT_CONTRACT_SIZES, 'NAS100')).toBe(false)
    expect(isKnownSymbol(DEFAULT_CONTRACT_SIZES, 'us30')).toBe(true)
  })
})

describe('day buckets', () => {
  const trades = [
    makeTrade({ id: 'a', date: '2026-09-01', move: 10, pl: 1000 }),
    makeTrade({ id: 'b', date: '2026-09-01', move: -4, pl: -400 }),
    makeTrade({ id: 'c', date: '2026-09-02', move: -6, pl: -600 }),
  ]

  it('sums move, P/L and count per day', () => {
    const days = byDay(trades)
    expect(days.get('2026-09-01')).toEqual({ date: '2026-09-01', move: 6, pl: 600, count: 2 })
    expect(days.get('2026-09-02')).toEqual({ date: '2026-09-02', move: -6, pl: -600, count: 1 })
  })

  it('tones a day by its P/L sign and scales intensity against the day target', () => {
    const meta = dayMetaFor(trades, 10)
    expect(meta['2026-09-01'].tone).toBe('pos')
    expect(meta['2026-09-01'].intensity).toBeCloseTo(0.6)
    expect(meta['2026-09-02'].tone).toBe('neg')
    expect(meta['2026-09-02'].intensity).toBeCloseTo(0.6)
    expect(meta['2026-09-01'].title).toContain('2 trades')
  })

  it('caps intensity at a full day rather than running off the scale', () => {
    const meta = dayMetaFor([makeTrade({ move: 40 })], 10)
    expect(meta['2026-09-01'].intensity).toBe(1)
  })

  it('leaves a day with no trades out of the map entirely', () => {
    expect(dayMetaFor(trades, 10)['2026-09-03']).toBeUndefined()
  })
})

describe('the account block', () => {
  it('books secured out of the balance without netting it against profit', () => {
    const totals = accountTotals(
      [makeTrade({ pl: 1000 }), makeTrade({ id: 't2', pl: -250 })],
      [makeSecured({ amt: 500 })],
      10_000,
    )
    expect(totals.totalProfit).toBe(750)
    expect(totals.securedTotal).toBe(500)
    expect(totals.balance).toBe(10_250)
  })

  it('reports zeros for an account that has done nothing', () => {
    expect(accountTotals([], [], 0)).toEqual({ totalProfit: 0, securedTotal: 0, balance: 0 })
  })
})

describe('stats', () => {
  const trades = [
    makeTrade({ id: 'a', date: '2026-09-01', session: 'Asia', move: 10, pl: 1000 }),
    makeTrade({ id: 'b', date: '2026-09-01', session: 'London', move: -4, pl: -400 }),
    makeTrade({ id: 'c', date: '2026-09-02', session: 'NY', move: -6, pl: -600 }),
    makeTrade({ id: 'd', date: '2026-09-02', session: 'NY', move: 0, pl: 0 }),
  ]
  const stats = tradeStats(trades)

  it('counts a scratch as neither a win nor a loss', () => {
    expect(stats.wins).toBe(1)
    expect(stats.hitRate).toBeCloseTo(33.33)
  })

  it('averages the move across every trade, scratches included', () => {
    expect(stats.avgMove).toBe(0)
  })

  it('names the best and worst day by P/L', () => {
    expect(stats.bestDay?.date).toBe('2026-09-01')
    expect(stats.worstDay?.date).toBe('2026-09-02')
    expect(stats.daysTraded).toBe(2)
  })

  it('splits the month’s move across the three sessions', () => {
    expect(stats.bySession).toEqual({ Asia: 10, London: -4, NY: -6 })
  })

  it('has no best or worst day when nothing has been traded', () => {
    const empty = tradeStats([])
    expect(empty.bestDay).toBeNull()
    expect(empty.worstDay).toBeNull()
    expect(empty.hitRate).toBe(0)
  })
})

describe('targets', () => {
  it('reports progress and what is still owed', () => {
    expect(targetProgress(20, 50)).toEqual({ move: 20, target: 50, pct: 40, remaining: 30 })
  })

  it('clamps a beaten target at full rather than overflowing the bar', () => {
    const beaten = targetProgress(75, 50)
    expect(beaten.pct).toBe(100)
    expect(beaten.remaining).toBe(0)
  })

  it('survives a target of zero without dividing by it', () => {
    expect(targetProgress(5, 0)).toEqual({ move: 5, target: 0, pct: 0, remaining: 0 })
  })
})

describe('formatting', () => {
  it('signs a figure and never renders a negative zero', () => {
    expect(signed2(12.3)).toBe('+12.30')
    expect(signed2(-12.345)).toBe('−12.35')
    expect(signed2(-0.001)).toBe('0.00')
  })
})

describe('ordering and export', () => {
  it('sorts by date, then by the moment within the day', () => {
    const rows = sortTrades([
      makeTrade({ id: 'b', date: '2026-09-02', ts: 5 }),
      makeTrade({ id: 'c', date: '2026-09-01', ts: 9 }),
      makeTrade({ id: 'a', date: '2026-09-01', ts: 2 }),
    ])
    expect(rows.map((r) => r.id)).toEqual(['a', 'c', 'b'])
  })

  it('exports the nine columns the spec names, oldest first', () => {
    const csv = tradesToCsv([
      makeTrade({ id: 'b', date: '2026-09-02', symbol: 'US30', side: 'sell', move: -6, pl: -6 }),
      makeTrade({ id: 'a', date: '2026-09-01' }),
    ])
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('date,symbol,session,side,lot,entry,exit,move,pl')
    expect(lines[1]).toBe('2026-09-01,XAUUSD,London,buy,1.00,2400.00,2410.00,10.00,1000.00')
    expect(lines[2]).toBe('2026-09-02,US30,London,sell,1.00,2400.00,2410.00,-6.00,-6.00')
  })

  it('quotes a note-free field that happens to contain a comma', () => {
    expect(tradesToCsv([makeTrade({ symbol: 'A,B' })])).toContain('"A,B"')
  })
})

describe('month bounds', () => {
  it('brackets the month as inclusive date strings', () => {
    expect(monthBounds('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-31' })
  })
})
