// The calendar's three signals, and the one rule they exist for: no day is told
// apart by colour alone.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TradeCalendar from '@/components/trades/TradeCalendar.vue'
import type { Trade } from '@/types'

function makeTrade(over: Partial<Trade> = {}): Trade {
  return {
    id: 't1',
    date: '2026-09-03',
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
  makeTrade({ id: 'a', date: '2026-09-03', move: 4, pl: 400 }),
  makeTrade({ id: 'b', date: '2026-09-04', move: -12, pl: -1200 }),
]

function mountCalendar(props: Record<string, unknown> = {}) {
  return mount(TradeCalendar, {
    props: { trades: TRADES, dayTarget: 10, selected: '', ...props },
    attachTo: document.body,
  })
}

describe('TradeCalendar', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('washes a day with the step its move earned, not a linear tint', () => {
    const wrapper = mountCalendar()
    // 4 of a 10 target is the second of five steps; 12 is past the target, so
    // it is capped at the fifth.
    expect(wrapper.get('#gdp-day-2026-09-03').attributes('style')).toContain(
      '--gdp-day-wash: var(--pl-pos-2)',
    )
    expect(wrapper.get('#gdp-day-2026-09-04').attributes('style')).toContain(
      '--gdp-day-wash: var(--pl-neg-5)',
    )
    wrapper.unmount()
  })

  it('bars the day by its move against the target', () => {
    const wrapper = mountCalendar()
    const bar = wrapper.get('#gdp-day-2026-09-03 .tcal__barFill')
    expect(bar.attributes('style')).toContain('width: 40%')
    // A day past the target fills the bar rather than overflowing it.
    expect(wrapper.get('#gdp-day-2026-09-04 .tcal__barFill').attributes('style')).toContain(
      'width: 100%',
    )
    wrapper.unmount()
  })

  it('marks the direction in a channel that is not colour', () => {
    const wrapper = mountCalendar()
    expect(wrapper.get('#gdp-day-2026-09-03 .tcal__mark').text()).toBe('▲')
    expect(wrapper.get('#gdp-day-2026-09-04 .tcal__mark').text()).toBe('▼')
    wrapper.unmount()
  })

  it('leaves an untraded day with no wash, no bar and no mark', () => {
    const wrapper = mountCalendar()
    const quiet = wrapper.get('#gdp-day-2026-09-05')
    expect(quiet.attributes('style')).not.toContain('--gdp-day-wash')
    expect(quiet.find('.tcal__bar').exists()).toBe(false)
    expect(quiet.find('.tcal__mark').exists()).toBe(false)
    wrapper.unmount()
  })

  it('anchors the day’s figures to the cell, and says them to a screen reader too', () => {
    const wrapper = mountCalendar()
    const cell = wrapper.get('#gdp-day-2026-09-04')
    const tip = cell.get('.tcal__tip')
    expect(tip.text()).toContain('Net move')
    expect(tip.text()).toContain('−12.00')
    expect(tip.text()).toContain('Net P/L')
    expect(tip.text()).toContain('Trades')
    // The same three facts, unhidden, for a reader who cannot hover.
    expect(cell.get('.ui-sr-only').text()).toContain('net move −12.00')
    wrapper.unmount()
  })

  it('filters to a day, and clears the filter when the same day is picked again', async () => {
    const wrapper = mountCalendar()
    await wrapper.get('#gdp-day-2026-09-03').trigger('click')
    expect(wrapper.emitted('update:selected')?.[0]).toEqual(['2026-09-03'])

    const selected = mountCalendar({ selected: '2026-09-03' })
    await selected.get('#gdp-day-2026-09-03').trigger('click')
    expect(selected.emitted('update:selected')?.[0]).toEqual([''])
    wrapper.unmount()
    selected.unmount()
  })

  it('summarises the picked day, and says whether it made the target', () => {
    const wrapper = mountCalendar({ selected: '2026-09-04' })
    const text = wrapper.get('.tcal__summary').text()
    expect(text).toContain('1 trade')
    expect(text).toContain('−12.00')
    expect(text).toContain('−1200.00')
    wrapper.unmount()
  })

  it('explains an empty month instead of showing a blank grid', () => {
    const wrapper = mountCalendar({ trades: [] })
    expect(wrapper.get('.tcal__hint').text()).toContain('No trades this month yet')
    wrapper.unmount()
  })

  it('says it is loading rather than showing an empty month', () => {
    const wrapper = mountCalendar({ trades: [], loading: true })
    expect(wrapper.get('.tcal__hint').text()).toContain('Loading')
    wrapper.unmount()
  })
})
