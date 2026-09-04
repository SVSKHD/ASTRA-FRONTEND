// The hour strip's two claims (section 31): it buckets on the trader's clock
// and labels on the broker's, and it refuses to draw a conclusion from an hour
// that has not been traded enough times to have one.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TradeHours from '@/components/trades/TradeHours.vue'
import { IST, instantFromWall } from '@/utils/tradeTime'
import type { Trade } from '@/types'

const REFERENCE = instantFromWall(IST, '2026-09-01', '00:00')!

function makeTrade(hour: number, over: Partial<Trade> = {}): Trade {
  return {
    id: `t${hour}-${Math.random()}`,
    date: '2026-09-02',
    ts: 1,
    entryAt: instantFromWall(IST, '2026-09-02', `${String(hour).padStart(2, '0')}:30`)!,
    exitAt: 0,
    istTime: `${String(hour).padStart(2, '0')}:30`,
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

const mountHours = (trades: Trade[]) =>
  mount(TradeHours, {
    props: {
      trades,
      broker: { zone: '', offsetMinutes: 180 },
      dayTarget: 10,
      reference: REFERENCE,
    },
  })

describe('TradeHours', () => {
  it('draws twenty-four cells and two axes over them', () => {
    const wrapper = mountHours([makeTrade(9)])
    expect(wrapper.findAll('.thours__cell')).toHaveLength(24)
    // The IST axis and the broker axis, aligned to the same cells. Half-hour
    // labels on the second one, because IST is not a whole number of hours
    // from anywhere — which is the reason for showing both.
    const axes = wrapper.findAll('.thours__axis')
    expect(axes).toHaveLength(2)
    expect(axes[0].text()).toContain('09:00')
    expect(axes[1].text()).toContain('06:30')
  })

  it('says nothing at all rather than drawing an empty day', () => {
    // Every row untimed: the strip would be twenty-four identical cells, which
    // reads as "you traded nothing" instead of "no row carries a time".
    const wrapper = mountHours([makeTrade(9, { entryAt: 0 })])
    expect(wrapper.find('.thours__strip').exists()).toBe(false)
    expect(wrapper.text()).toContain('No trade carries a time yet')
  })

  it('counts the timed rows and says how many it left out', () => {
    const wrapper = mountHours([
      makeTrade(9),
      makeTrade(9, { timeEstimated: true }),
      makeTrade(9, { entryAt: 0 }),
    ])
    expect(wrapper.text()).toContain('1 timed trade')
    expect(wrapper.text()).toContain('2 without a time')
  })

  it('mutes an hour with too few trades and never names it best', () => {
    const wrapper = mountHours([makeTrade(4, { move: 40 })])
    const cells = wrapper.findAll('.thours__cell')
    expect(cells[4].classes()).toContain('is-thin')
    expect(cells[4].classes()).not.toContain('is-best')
    // One 40-point winner at 04:00 is not a discovery about 04:00.
    expect(wrapper.find('.thours__legend').text()).toContain('—')
  })

  it('marks the best and the worst once an hour has earned it', () => {
    const wrapper = mountHours([
      ...[1, 2, 3].map(() => makeTrade(9, { move: 5 })),
      ...[1, 2, 3].map(() => makeTrade(14, { move: -3 })),
    ])
    const cells = wrapper.findAll('.thours__cell')
    expect(cells[9].classes()).toContain('is-best')
    expect(cells[14].classes()).toContain('is-worst')
    expect(cells[9].classes()).not.toContain('is-thin')
  })

  it('colours a cell from the same P/L scale the calendar uses', () => {
    const wrapper = mountHours([...[1, 2, 3].map(() => makeTrade(9, { move: 5 }))])
    const style = wrapper.findAll('.thours__cell')[9].attributes('style') ?? ''
    // A token from the shared ramp, not a colour of its own: a deep green here
    // has to mean the same as a deep green on the calendar.
    expect(style).toMatch(/--hour-wash:\s*var\(--pl-pos-\d\)/)
    expect(style).toContain('--hour-ink: var(--on-pl-pos-')
  })
})
