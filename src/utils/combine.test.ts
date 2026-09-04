// The one claim Combined mode makes that the two separate tables cannot: this
// signal was acted on and that one was not. It is a claim about a pair, so it
// is tested as one.
import { describe, expect, it } from 'vitest'
import { LINK_WINDOW_MS, dayTimeline, linkSignals, takeRate } from '@/utils/combine'
import type { DacoitSignal, Trade } from '@/types'

const DAY = Date.UTC(2026, 8, 2, 6, 0) // 11:30 IST

function signal(over: Partial<DacoitSignal> = {}): DacoitSignal {
  return {
    id: 's1',
    userId: 'u1',
    signalId: 's1',
    signalAt: DAY,
    receivedAt: DAY,
    istDate: '2026-09-02',
    symbol: 'XAUUSD',
    session: 'London',
    verdict: 'GO',
    raw: {},
    source: 'dacoit',
    ...over,
  }
}

function trade(over: Partial<Trade> = {}): Trade {
  return {
    id: 't1',
    userId: 'u1',
    istDate: '2026-09-02',
    ts: DAY,
    entryAt: DAY + 10 * 60_000,
    exitAt: 0,
    istTime: '11:40',
    brokerOffsetMinutes: 180,
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
    ...over,
  }
}

describe('linking a GO to the trade that followed', () => {
  it('links a trade taken inside the window on the same symbol', () => {
    const links = linkSignals([trade()], [signal()])
    expect(links.tradeToSignal.t1).toBe('s1')
    expect(links.signalToTrade.s1).toBe('t1')
    expect(links.untaken).toHaveLength(0)
  })

  it('leaves a GO untaken when the trade is too late', () => {
    const late = trade({ entryAt: DAY + LINK_WINDOW_MS + 60_000 })
    const links = linkSignals([late], [signal()])
    expect(links.untaken.map((s) => s.id)).toEqual(['s1'])
    expect(links.tradeToSignal).toEqual({})
  })

  it('never links a trade that happened before the signal', () => {
    // The order is the whole meaning of "taken on": a trade entered ten minutes
    // before a GO was not prompted by it.
    const early = trade({ entryAt: DAY - 10 * 60_000 })
    expect(linkSignals([early], [signal()]).untaken).toHaveLength(1)
  })

  it('does not link across symbols', () => {
    const other = trade({ symbol: 'US30' })
    expect(linkSignals([other], [signal()]).untaken).toHaveLength(1)
  })

  it('ignores a NO_GO entirely', () => {
    const links = linkSignals([trade()], [signal({ verdict: 'NO_GO' })])
    expect(links.signalToTrade).toEqual({})
    // And it is not "untaken" either — nobody was asked to take it.
    expect(links.untaken).toHaveLength(0)
  })

  it('gives one signal to one trade, and the first trade wins', () => {
    const second = trade({ id: 't2', entryAt: DAY + 20 * 60_000 })
    const links = linkSignals([second, trade()], [signal()])
    expect(links.signalToTrade.s1).toBe('t1')
    expect(links.tradeToSignal.t2).toBeUndefined()
  })

  it('honours an explicit signalId over a closer signal', () => {
    // Somebody said which signal this was; proximity does not get to disagree.
    const signals = [
      signal({ id: 's1', signalId: 's1' }),
      signal({ id: 's2', signalId: 's2', signalAt: DAY + 5 * 60_000 }),
    ]
    const links = linkSignals([trade({ signalId: 's2' })], signals)
    expect(links.tradeToSignal.t1).toBe('s2')
    expect(links.untaken.map((s) => s.id)).toEqual(['s1'])
  })

  it('is independent of the order the arrays arrive in', () => {
    const signals = [signal({ id: 's2', signalAt: DAY + 30 * 60_000 }), signal({ id: 's1' })]
    const trades = [trade({ id: 't2', entryAt: DAY + 40 * 60_000 }), trade({ id: 't1' })]
    expect(linkSignals(trades, signals).signalToTrade).toEqual({ s1: 't1', s2: 't2' })
  })
})

describe('the day, interleaved', () => {
  it('reads in the order it happened, with the signal ahead of its trade', () => {
    const signals = [signal()]
    const trades = [trade()]
    const rows = dayTimeline(trades, signals, linkSignals(trades, signals))
    expect(rows.map((r) => r.kind)).toEqual(['signal', 'trade'])
    // Ten minutes between them, computed from the instants on both rows.
    expect(rows[0].gapMinutes).toBe(10)
    expect(rows[1].gapMinutes).toBe(10)
  })

  it('puts a signal first when the two share a minute', () => {
    const signals = [signal()]
    const trades = [trade({ entryAt: DAY })]
    const rows = dayTimeline(trades, signals, linkSignals(trades, signals))
    expect(rows[0].kind).toBe('signal')
  })

  it('leaves an untaken GO with no link to draw', () => {
    const signals = [signal()]
    const rows = dayTimeline([], signals, linkSignals([], signals))
    expect(rows[0].linkedId).toBeUndefined()
    expect(rows[0].gapMinutes).toBeUndefined()
  })
})

describe('the take rate', () => {
  it('is the share of GOs that were acted on', () => {
    const signals = [signal(), signal({ id: 's2', signalAt: DAY + 3 * 3600_000 })]
    const trades = [trade()]
    expect(takeRate(linkSignals(trades, signals), signals)).toBe(50)
  })

  it('is zero rather than a division when nothing fired', () => {
    expect(takeRate(linkSignals([], []), [])).toBe(0)
  })
})
