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
    const rows = mountTable().findAll('tbody tr')
    const buy = rows[0].findAll('td')[4].find('svg').html()
    const sell = rows[1].findAll('td')[4].find('svg').html()
    expect(buy).not.toBe(sell)
    const london = rows[0].findAll('td')[3].find('svg').html()
    const ny = rows[1].findAll('td')[3].find('svg').html()
    const asia = rows[2].findAll('td')[3].find('svg').html()
    expect(new Set([london, ny, asia]).size).toBe(3)
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
