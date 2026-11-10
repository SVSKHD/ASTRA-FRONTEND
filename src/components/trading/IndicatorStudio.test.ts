// The Indicator Studio, driven the way a person drives it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import IndicatorStudio from './IndicatorStudio.vue'
import { createStudio, type Studio } from '@/trading/studies'

const wrappers: VueWrapper[] = []
beforeEach(() => localStorage.clear())
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
  localStorage.clear()
})

function make(studio: Studio = createStudio(), sources = {}) {
  const w = mount(IndicatorStudio, { props: { studio, sources }, attachTo: document.body })
  wrappers.push(w)
  return { w, studio }
}
const button = (w: VueWrapper, text: string) => {
  const b = w.findAll('button').find((x) => x.text().trim() === text)
  if (!b) throw new Error(`no button "${text}"`)
  return b
}
const items = (w: VueWrapper) => w.findAll('li.is__item').map((li) => li.attributes('data-study'))

describe('IndicatorStudio', () => {
  it('adds EMA 8 and EMA 32 with marked crossovers from the one-click preset', async () => {
    const { w, studio } = make()
    await button(w, 'EMA 8/32 Crossover').trigger('click')
    expect(items(w)).toEqual(['EMA 8', 'EMA 32'])
    expect(studio.state.cross).not.toBeNull()
    expect(w.text()).toContain('Crossovers marked: EMA 8 / EMA 32')
    expect(w.find('[role="status"]').text()).toContain('Added EMA 8 and EMA 32')
  })

  it('changes a period, by typing and by a preset button', async () => {
    const { w, studio } = make()
    await button(w, 'EMA 20').trigger('click')
    const id = studio.state.studies[0].id
    const field = w.find(`#${id}-p0`)
    ;(field.element as HTMLInputElement).value = '50'
    await field.trigger('input')
    expect(items(w)).toEqual(['EMA 50'])
    const presets = w.find(`[aria-label="EMA 50 period presets"]`)
    await presets
      .findAll('button')
      .find((b) => b.text() === '200')!
      .trigger('click')
    expect(items(w)).toEqual(['EMA 200'])
  })

  it('toggles visibility and changes colour from the token palette', async () => {
    const { w, studio } = make()
    await button(w, 'RSI').trigger('click')
    await w.find('[role="switch"]').trigger('click')
    expect(studio.state.studies[0].visible).toBe(false)
    const amber = w.find('[role="radiogroup"] [aria-label="Amber"]')
    await amber.trigger('click')
    expect(studio.state.studies[0].color).toBe('warning')
    expect(amber.attributes('aria-checked')).toBe('true')
    expect(amber.attributes('style')).toContain('var(--theme-warning)')
  })

  it('shows where each study’s values come from', async () => {
    const studio = createStudio()
    const s = studio.add('ema', [9])!
    const t = studio.add('ema', [8])!
    const { w } = make(studio, { [s.id]: 'server', [t.id]: 'browser' })
    const srcs = w.findAll('.is__src').map((x) => x.text())
    expect(srcs).toEqual(['Server values', 'Calculated in the browser'])
  })

  it('saves a named preset, loads it back, and deletes it', async () => {
    const { w, studio } = make()
    await button(w, 'EMA 8/32 Crossover').trigger('click')
    const name = w.find('input[aria-label="Preset name"]')
    await name.setValue('Scalp')
    await button(w, 'Save preset').trigger('click')
    expect(studio.state.presets.map((p) => p.name)).toEqual(['Scalp'])
    expect(JSON.parse(localStorage.getItem('aureon.trading.chart.presets.v1')!)[0].name).toBe(
      'Scalp',
    )

    // change the chart, then load the preset back
    await w.find('[aria-label="Remove EMA 32"]').trigger('click')
    expect(items(w)).toEqual(['EMA 8'])
    await button(w, 'Load').trigger('click')
    expect(items(w)).toEqual(['EMA 8', 'EMA 32'])
    expect(studio.state.cross).not.toBeNull()

    await w.find('[aria-label="Delete preset Scalp"]').trigger('click')
    expect(studio.state.presets).toEqual([])
  })

  it('removes a study', async () => {
    const { w } = make()
    await button(w, 'MACD').trigger('click')
    await button(w, 'ATR').trigger('click')
    expect(items(w)).toEqual(['MACD 12, 26, 9', 'ATR 14'])
    await w.find('[aria-label="Remove MACD 12, 26, 9"]').trigger('click')
    expect(items(w)).toEqual(['ATR 14'])
    expect(w.find('[role="status"]').text()).toBe('Removed MACD 12, 26, 9.')
  })
})
