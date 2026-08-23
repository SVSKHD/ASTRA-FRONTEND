// Section 26c, acceptance 135 — currency neutral at zero, coloured only by sign.
import { describe, expect, it } from 'vitest'
import { formatCurrency, signTone, toneColor, valueColor } from '@/utils/money'

describe('the colouring rule', () => {
  it('makes zero neutral', () => {
    // The bug, in one assertion: ₹0 rendered in large red, because red stood
    // for "this is the expenses metric" rather than for "this is bad". A reader
    // who has spent nothing gets an alarm about it.
    expect(signTone(0)).toBe('neutral')
    expect(valueColor(0)).toContain('--text-primary')
  })

  it('colours by sign and by nothing else', () => {
    expect(signTone(1)).toBe('positive')
    expect(signTone(-1)).toBe('negative')
    expect(valueColor(35500)).toBe('var(--theme-success)')
    expect(valueColor(-35500)).toBe('var(--theme-danger)')
  })

  it('treats -0 as zero, since it is', () => {
    expect(signTone(-0)).toBe('neutral')
  })

  it('does not colour a value it cannot read', () => {
    // NaN or Infinity reaching a currency figure is a bug upstream. Painting it
    // green would report that bug as a large profit, so both are neutral — the
    // number is still shown, it just makes no claim about itself.
    expect(signTone(NaN)).toBe('neutral')
    expect(signTone(Infinity)).toBe('neutral')
    expect(signTone(-Infinity)).toBe('neutral')
  })

  it('gives neutral the ordinary text colour, not a grey', () => {
    // A neutral figure is still the number you came to read; muting it would
    // make "no spend" harder to see than "some spend".
    expect(toneColor('neutral')).not.toContain('muted')
    expect(toneColor('neutral')).toContain('--text-primary')
  })
})

describe('formatting', () => {
  it('groups rupees the Indian way', () => {
    // ₹1,50,000 not ₹150,000 — the grouping is a property of the currency's
    // conventions here, not of the browser's language setting.
    expect(formatCurrency(150000)).toBe('₹1,50,000')
    expect(formatCurrency(10000000)).toBe('₹1,00,00,000')
  })

  it('keeps whole amounts whole and paise exact', () => {
    // A grocery bill of ₹85,000 should not read "₹85,000.00".
    expect(formatCurrency(85000)).toBe('₹85,000')
    expect(formatCurrency(85000.5)).toBe('₹85,000.50')
  })

  it('signs a delta, and only when asked', () => {
    expect(formatCurrency(35500, { signed: true })).toBe('+₹35,500')
    expect(formatCurrency(-35500, { signed: true })).toBe('−₹35,500')
    expect(formatCurrency(0, { signed: true })).toBe('+₹0')
    // A total is not a delta: it carries no sign of its own.
    expect(formatCurrency(-35500)).not.toContain('+')
  })

  it('uses the minus sign, not a hyphen', () => {
    // Same width as the plus, so a column of signed figures does not shift by a
    // pixel between rows.
    expect(formatCurrency(-1, { signed: true }).startsWith('−')).toBe(true)
    expect(formatCurrency(-1, { signed: true }).startsWith('-')).toBe(false)
  })

  it('survives a value that is not a number', () => {
    expect(formatCurrency(NaN)).toBe('₹0')
    expect(formatCurrency(Infinity)).toBe('₹0')
  })

  it('honours another currency when one is named', () => {
    expect(formatCurrency(1500, { currency: 'USD', locale: 'en-US' })).toBe('$1,500')
  })
})

describe('the view uses it (acceptance 135, 136)', () => {
  it('concatenates no rupee symbol by hand', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(__dirname, '../components/views/FinancesView.vue'), 'utf8')
    // Manual concatenation is what produces "₹1500" beside "₹1,50,000" on one
    // screen: the symbol is easy to remember and the grouping is not.
    expect(src).not.toMatch(/['"`]₹['"`]\s*\+/)
    expect(src).not.toMatch(/\+\s*['"`]₹/)
  })

  it('colours no figure by which metric it belongs to', async () => {
    // The whole class of bug: RED meaning "outflow" and GOOD meaning "inflow".
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(__dirname, '../components/views/FinancesView.vue'), 'utf8')
    expect(src).not.toMatch(/color:\s*RED/)
    expect(src).not.toMatch(/color:\s*GOOD/)
  })
})
