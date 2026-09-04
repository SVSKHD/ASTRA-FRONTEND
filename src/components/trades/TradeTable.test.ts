// What the table does beyond printing rows: groups them by date, rails them by
// sign, and keeps the delete out of the way until somebody goes for it.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TradeTable from '@/components/trades/TradeTable.vue'
import type { Trade } from '@/types'

function makeTrade(over: Partial<Trade> = {}): Trade {
  return {
    id: 't1',
    date: '2026-09-01',
    ts: 1,
    // Section 31's four: the instant, its optional close, the IST reading it
    // was typed as, and the broker offset that was in force for it.
    entryAt: 0,
    exitAt: 0,
    istTime: '',
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

const TRADES = [
  makeTrade({ id: 'a', date: '2026-09-01', pl: 1000, move: 10 }),
  makeTrade({ id: 'b', date: '2026-09-01', pl: -400, move: -4, side: 'sell', session: 'NY' }),
  makeTrade({ id: 'c', date: '2026-09-02', pl: 0, move: 0, session: 'Asia' }),
]

// The rows live inside a TransitionGroup rendering as the <tbody>, and Vue Test
// Utils stubs transitions by default — which would leave the table with no
// tbody at all. Unstubbed here because the grouping and the rail are properties
// of the real markup.
const mountTable = (trades = TRADES) =>
  mount(TradeTable, {
    props: { trades, emptyTitle: 'Nothing yet', emptyDescription: 'Log one.' },
    global: { stubs: { 'transition-group': false } },
  })

describe('TradeTable', () => {
  it('writes each date once, on the row that opens the day', () => {
    const wrapper = mountTable()
    const rows = wrapper.findAll('tbody tr')
    expect(rows[0].classes()).toContain('is-dayStart')
    expect(rows[1].classes()).not.toContain('is-dayStart')
    expect(rows[2].classes()).toContain('is-dayStart')
    // The date the row belongs to is still readable to a screen reader on every
    // row — grouping is a visual economy, not a loss of information.
    expect(rows[1].find('.ui-sr-only').text()).toBe('2026-09-01')
  })

  it('rails every row by its own sign', () => {
    const rows = mountTable().findAll('tbody tr')
    expect(rows[0].attributes('style')).toContain('--row-rail: var(--theme-success)')
    expect(rows[1].attributes('style')).toContain('--row-rail: var(--theme-danger)')
    // A scratch is neither: it takes the muted token, not a green or a red.
    expect(rows[2].attributes('style')).toContain('--row-rail: var(--text-muted')
  })

  it('gives Buy and Sell their own glyphs, and each session its own', () => {
    const wrapper = mountTable()
    // Found by the column's own heading rather than by a number: this table has
    // gained two columns since it was written, and each time it did, a test
    // counting cells failed for a reason that had nothing to do with glyphs.
    const headings = wrapper.findAll('thead th').map((th) => th.text())
    const cell = (row: number, column: string) =>
      wrapper.findAll('tbody tr')[row].findAll('td')[headings.indexOf(column)].find('svg').html()
    expect(cell(0, 'Side')).not.toBe(cell(1, 'Side'))
    expect(new Set([cell(0, 'Session'), cell(1, 'Session'), cell(2, 'Session')]).size).toBe(3)
  })

  it('reads one instant on two clocks, and dashes the rows that have no instant', () => {
    // Section 31. Broker time is computed from `entryAt` at render, never from
    // the IST string with hours added to it — so a row stored under a +02:00
    // broker still reads +02:00 after the clocks change.
    const at = Date.UTC(2026, 8, 1, 14, 12) // 19:42 IST, 17:12 on a +03:00 broker
    const wrapper = mount(TradeTable, {
      props: {
        trades: [
          makeTrade({ id: 'a', entryAt: at, istTime: '19:42', brokerOffsetMinutes: 180 }),
          makeTrade({ id: 'b', entryAt: at, timeEstimated: true }),
          makeTrade({ id: 'c' }),
        ],
        emptyTitle: 'Nothing yet',
        emptyDescription: 'Log one.',
        broker: { zone: '', offsetMinutes: 180 },
      },
      global: { stubs: { 'transition-group': false } },
    })
    const rows = wrapper.findAll('tbody tr')
    expect(rows[0].find('.ttable__time').text()).toContain('19:42')
    expect(rows[0].find('.ttable__time').text()).toContain('17:12')
    expect(rows[0].find('.ttable__time').attributes('title')).toContain('UTC 14:12')
    // A backfilled midnight and a row with no time at all read the same way,
    // because they are the same thing: a time nobody typed.
    expect(rows[1].find('.ttable__time').text()).toContain('—')
    expect(rows[2].find('.ttable__time').text()).toContain('—')
  })

  it('dots only the rows the server has not got, and says which is which', () => {
    // Section 30. Three states are worth drawing and the fourth — safely on the
    // server — is worth drawing nothing at all: a tick on every row is thirty
    // ticks to look past for the one that has not landed.
    const wrapper = mount(TradeTable, {
      props: {
        trades: TRADES,
        emptyTitle: 'Nothing yet',
        emptyDescription: 'Log one.',
        state: { a: 'pending', b: 'blocked' } as Record<string, 'pending' | 'blocked'>,
      },
      global: { stubs: { 'transition-group': false } },
    })
    const rows = wrapper.findAll('tbody tr')
    expect(rows[0].find('.ttable__dot').classes()).toContain('is-pending')
    expect(rows[1].find('.ttable__dot').classes()).toContain('is-blocked')
    expect(rows[2].find('.ttable__dot').exists()).toBe(false)
    // The colour is never the only carrier: each dot states its case.
    expect(rows[1].find('.ttable__dot').attributes('title')).toContain('refused')
    expect(rows[1].find('.ttable__dot').text()).toContain('refused')
  })

  it('keeps the delete in the row, ready for hover and for focus', () => {
    const wrapper = mountTable()
    const del = wrapper.findAll('tbody tr')[0].find('.ttable__del')
    // Present and reachable — hidden with opacity, never with display, or the
    // keyboard could not get to it at all.
    expect(del.exists()).toBe(true)
    expect(del.attributes('aria-label')).toContain('2026-09-01')
  })

  it('emits the id it was asked to delete', async () => {
    const wrapper = mountTable()
    await wrapper.findAll('tbody tr')[1].find('.ttable__del').trigger('click')
    expect(wrapper.emitted('delete')?.[0]).toEqual(['b'])
  })

  it('says what an empty log is rather than showing an empty grid', () => {
    const wrapper = mountTable([])
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.text()).toContain('Nothing yet')
    expect(wrapper.text()).toContain('Log one.')
  })
})
