import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import {
  emaKeys,
  eventSummary,
  kindLabel,
  kindTone,
  phaseTone,
  sessionLabel,
  toChart,
  useMt5Live,
  type Mt5Candle,
  type Mt5Event,
} from './mt5'
import { applyEvent, live } from './stream'

const candle = (t: string, c: string, ema: Record<string, string | null> = {}): Mt5Candle => ({
  t,
  o: c,
  h: c,
  l: c,
  c,
  v: null,
  ema,
})

describe('mt5 display helpers', () => {
  it('badges known kinds and stays neutral for unknown ones', () => {
    expect(kindTone('error')).toBe('danger')
    expect(kindTone('secured')).toBe('success')
    expect(kindTone('cross')).toBe('info')
    expect(kindTone('trail_update')).toBe('neutral')
    expect(kindLabel('P')).toBe('P (pullback)')
    expect(kindLabel('pre_cross')).toBe('Pre cross')
    expect(kindLabel('')).toBe('Event')
  })

  it('maps the guardian phase words and sessions', () => {
    expect(phaseTone('secured')).toBe('success')
    expect(phaseTone('ride')).toBe('success')
    expect(phaseTone('protect')).toBe('info')
    expect(phaseTone('pre')).toBe('neutral')
    expect(phaseTone(null)).toBe('neutral')
    expect(sessionLabel('ny')).toBe('New York')
    expect(sessionLabel('London')).toBe('London')
    expect(sessionLabel('off')).toBe('Off-session')
    expect(sessionLabel(null)).toBe('—')
  })

  it('picks EMA keys dynamically, in numeric order', () => {
    const cs = [candle('a', '1', { '80': '1', '50': '1' }), candle('b', '2', { '9': null })]
    expect(emaKeys(cs)).toEqual(['9', '50', '80'])
    expect(emaKeys([], ['21', '9'])).toEqual(['9', '21'])
  })

  it('builds chart candles and drops EMA lines with no values', () => {
    const cs = [candle('a', '1.5', { '50': '1.4', '80': null }), candle('b', '2', { '50': '1.6' })]
    const chart = toChart(cs, ['80'])
    expect(chart.candles).toEqual([
      { ts: 'a', open: '1.5', high: '1.5', low: '1.5', close: '1.5' },
      { ts: 'b', open: '2', high: '2', low: '2', close: '2' },
    ])
    expect(chart.lines.map((l) => l.name)).toEqual(['EMA 50'])
    expect(chart.lines[0].points[1]).toEqual({ ts: 'b', value: '1.6' })
    expect(toChart([]).candles).toEqual([])
  })

  it('summarises an event payload without nested objects', () => {
    const ev: Mt5Event = {
      id: 'x',
      t: '2026-11-03T10:00:00Z',
      event: 'signal',
      kind: 'cross',
      symbol: 'XAUUSD',
      ticket: null,
      payload: { side: 'LONG', price: '2650.1', extra: { a: 1 }, reason: '' },
    }
    expect(eventSummary(ev)).toBe('side LONG · price 2650.1')
  })
})

describe('useMt5Live', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    live.mt5 = null
    live.agents = {}
  })
  afterEach(() => vi.useRealTimers())

  it('refreshes once (debounced) per push and on the bot agent state', async () => {
    const refresh = vi.fn()
    const scope = effectScope()
    scope.run(() => useMt5Live(refresh, 100, 60_000))
    applyEvent('mt5', JSON.stringify({ push_id: 'p1', seq: 1, open_failures: 0 }))
    await nextTick()
    applyEvent('mt5', JSON.stringify({ push_id: 'p2', seq: 2, open_failures: 0 }))
    await nextTick()
    vi.advanceTimersByTime(150)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(live.mt5?.push_id).toBe('p2')
    applyEvent('agent', JSON.stringify({ id: 'mt5-bot', name: 'bot', state: 'stale' }))
    await nextTick()
    vi.advanceTimersByTime(150)
    expect(refresh).toHaveBeenCalledTimes(2)
    scope.stop()
    applyEvent('mt5', JSON.stringify({ push_id: 'p3', seq: 3, open_failures: 1 }))
    await nextTick()
    vi.advanceTimersByTime(60_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
