// The chart draws only the visible window, keeps the server's strings, marks the live
// candle, and answers the keyboard.
import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import CandleChart, { type ChartCandle } from './CandleChart.vue'

const T0 = Date.parse('2026-11-10T03:45:00Z')
function series(n: number): ChartCandle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = 100 + Math.sin(i / 5) * 5
    return {
      ts: new Date(T0 + i * 900_000).toISOString(),
      open: (c - 0.5).toFixed(2),
      high: (c + 1).toFixed(2),
      low: (c - 1).toFixed(2),
      close: c.toFixed(2),
      volume: String(1000 + i),
    }
  })
}

const wrappers: VueWrapper[] = []
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
})
function make(props: Record<string, unknown>) {
  const w = mount(CandleChart, { props: props as never, attachTo: document.body })
  wrappers.push(w)
  return w
}

describe('CandleChart', () => {
  it('draws only the visible window of a long series', () => {
    const w = make({ candles: series(3000) })
    // default view: the newest 120 bars (two of them the empty right margin)
    expect(w.findAll('rect.cc__up, rect.cc__down').length).toBeLessThanOrEqual(121)
    expect(w.findAll('rect.cc__up, rect.cc__down').length).toBeGreaterThan(100)
    expect(w.text()).toContain('of 3000 candles')
  })

  it('pans and zooms from the keyboard', async () => {
    const w = make({ candles: series(500) })
    const vm = w.vm as unknown as { view: { start: number; end: number } }
    const before = { ...vm.view }
    const plot = w.find('.cc__plot')
    await plot.trigger('keydown', { key: 'ArrowLeft' })
    expect(vm.view.start).toBeLessThan(before.start)
    await plot.trigger('keydown', { key: 'Home' })
    expect(vm.view.start).toBe(0)
    await plot.trigger('keydown', { key: '+' })
    expect(vm.view.end - vm.view.start).toBeLessThan(before.end - before.start)
    await plot.trigger('keydown', { key: 'End' })
    expect(vm.view.end).toBe(502)
  })

  it('marks an unconfirmed last candle, and only the last', () => {
    const w = make({ candles: series(50), unconfirmedLast: true })
    expect(w.findAll('g.cc__live')).toHaveLength(1)
    expect(w.text()).toContain('unconfirmed')
    expect(w.find('.cc__note').text()).toContain('its period has not ended')
    const closed = make({ candles: series(50) })
    expect(closed.findAll('g.cc__live')).toHaveLength(0)
  })

  it('shows the server’s strings in the tooltip and the last-price tag', async () => {
    const candles = series(20)
    candles[19] = { ...candles[19], close: '101.25000000' }
    const w = make({ candles })
    expect(w.find('.cc__last').text()).toContain('101.25')
    // jsdom has no layout or PointerEvent: the plot sits at 0,0, 800px wide less the
    // 64px axis, so 22 bars (20 + the right margin) are 33.5px each; x 650 is bar 19.
    const ev = new MouseEvent('pointermove', { clientX: 650, clientY: 50, bubbles: true })
    Object.assign(ev, { pointerId: 1, pointerType: 'mouse' })
    w.find('.cc__plot').element.dispatchEvent(ev)
    await w.vm.$nextTick()
    const tip = w.find('.cc__tip')
    expect(tip.exists()).toBe(true)
    expect(tip.text()).toContain('C 101.25')
    expect(tip.text()).toContain('IST')
  })

  it('draws signal and crossover markers, hollow while unconfirmed', () => {
    const w = make({
      candles: series(30),
      unconfirmedLast: true,
      markers: [
        { index: 25, kind: 'buy', confirmed: true, label: 'BUY signal' },
        { index: 29, kind: 'bear', confirmed: false, label: 'Bearish cross' },
      ],
    })
    const marks = w.findAll('g.cc__marker')
    expect(marks.map((m) => m.text())).toEqual(['B', '↓'])
    expect(marks[1].classes()).toContain('is-unconfirmed')
    expect(marks[0].classes()).not.toContain('is-unconfirmed')
  })

  it('draws overlays and sub-panes with their source in the legend', () => {
    const candles = series(40)
    const values = candles.map((_, i) => (i < 5 ? null : 100))
    const display = values.map((v) => (v === null ? null : '100.00'))
    const w = make({
      candles,
      overlays: [
        {
          id: 'e',
          label: 'EMA 9',
          source: 'server',
          lines: [
            {
              key: 'value',
              label: 'EMA 9',
              color: 'var(--theme-accent)',
              values,
              display,
              style: 'line',
            },
          ],
        },
      ],
      panes: [
        {
          id: 'r',
          label: 'RSI 14',
          source: 'browser',
          range: [0, 100],
          guides: [30, 70],
          lines: [
            {
              key: 'value',
              label: 'RSI 14',
              color: 'var(--theme-accent)',
              values,
              display,
              style: 'line',
            },
          ],
        },
      ],
    })
    expect(w.text()).toContain('EMA 9')
    expect(w.text()).toContain('server')
    expect(w.text()).toContain('browser')
    expect(w.findAll('g.cc__pane')).toHaveLength(1)
    expect(w.findAll('path.cc__line').length).toBe(2)
  })

  it('keeps the MT5 panel’s server lines working', () => {
    const candles = series(10)
    const w = make({
      candles,
      lines: [{ name: 'EMA 50', points: candles.map((c) => ({ ts: c.ts, value: c.close })) }],
    })
    expect(w.text()).toContain('EMA 50')
    expect(w.find('path.cc__line').attributes('d')).toMatch(/^M/)
  })

  it('marks the plot as a swipe-free, focusable region', () => {
    const w = make({ candles: series(10) })
    const plot = w.find('.cc__plot')
    expect(plot.attributes('data-no-tab-swipe')).toBeDefined()
    expect(plot.attributes('tabindex')).toBe('0')
  })
})
