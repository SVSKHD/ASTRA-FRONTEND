// Section 26c, acceptance 136 — every label/value pair the same size, weight
// and spacing.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import StatRow from '@/components/ui/StatRow.vue'

const SOURCE = readFileSync(resolve(__dirname, 'StatRow.vue'), 'utf8')
const rule = (selector: string) => {
  const at = SOURCE.indexOf(`${selector} {`)
  return at < 0 ? '' : SOURCE.slice(at, SOURCE.indexOf('}', at)).replace(/\s+/g, ' ')
}

const STATS = [
  { label: 'In', value: '₹1,20,000' },
  { label: 'Out', value: '₹84,500' },
  { label: 'Net', value: '+₹35,500', tone: 'positive' as const },
]

describe('the pairing', () => {
  it('stacks each label over its own value', () => {
    // What it replaces is a run-on sentence — "In ₹0 Out ₹0 Net +₹0" — where
    // the eye cannot tell which number belongs to which word. Stacking makes
    // the pairing spatial, so it needs no reading at all.
    const w = mount(StatRow, { props: { stats: STATS } })
    const cells = w.findAll('.statrow__cell')
    expect(cells).toHaveLength(3)
    expect(cells[0].find('.statrow__label').text()).toBe('In')
    expect(cells[0].find('.statrow__value').text()).toBe('₹1,20,000')
  })

  it('is a description list, so the pairing survives without the layout', () => {
    const w = mount(StatRow, { props: { stats: STATS } })
    expect(w.element.tagName).toBe('DL')
    expect(w.findAll('dt')).toHaveLength(3)
  })

  it('gives every value the same size and weight', () => {
    const value = rule('.statrow__value')
    expect(value).toContain('font-size: var(--text-base)')
    expect(value).toContain('font-weight: var(--weight-semibold)')
  })

  it('gives labels a level above muted', () => {
    // A label is not decoration — it is the half of the pair that says what the
    // number means. Muting it to the level used for timestamps is what made
    // these strips read as one grey line.
    const label = rule('.statrow__label')
    expect(label).toContain('font-size: var(--text-xs)')
    expect(label).toContain('var(--text-secondary')
  })

  it('spaces the cells evenly, so the row does not reflow as values change', () => {
    // Equal grid columns rather than flex gaps: ₹0 becoming ₹1,50,000 must not
    // move the dividers.
    const row = rule('.statrow')
    expect(row).toContain('grid-auto-columns: 1fr')
  })
})

describe('the colour', () => {
  it('is neutral unless a tone says otherwise', () => {
    const w = mount(StatRow, { props: { stats: STATS } })
    const values = w.findAll('.statrow__value')
    expect(values[0].attributes('style')).toContain('--text-primary')
    expect(values[1].attributes('style')).toContain('--text-primary')
    expect(values[2].attributes('style')).toContain('--theme-success')
  })

  it('takes a danger tone where the sign is negative', () => {
    const w = mount(StatRow, {
      props: { stats: [{ label: 'Net', value: '−₹500', tone: 'negative' as const }] },
    })
    expect(w.find('.statrow__value').attributes('style')).toContain('--theme-danger')
  })
})

describe('the figures', () => {
  it('are tabular, so a column of them aligns', () => {
    const w = mount(StatRow, { props: { stats: STATS } })
    expect(w.find('.statrow__value').classes()).toContain('ui-tabular')
  })

  it('takes an optional qualifier under the value', () => {
    const w = mount(StatRow, {
      props: { stats: [{ label: 'Received', value: '₹80,000', note: 'of ₹1,20,000' }] },
    })
    expect(w.find('.statrow__note').text()).toBe('of ₹1,20,000')
  })
})

describe('the dividers', () => {
  it('are borders on the cells, so none is left orphaned at an end', () => {
    expect(rule('.statrow__cell')).toContain('border-left: 1px solid')
    expect(rule('.statrow__cell:first-child')).toContain('border-left: none')
  })
})

describe('on a phone', () => {
  it('becomes rows rather than three slivers', () => {
    expect(SOURCE).toContain('@media (max-width: 480px)')
    expect(SOURCE).toContain('grid-auto-flow: row')
  })
})
