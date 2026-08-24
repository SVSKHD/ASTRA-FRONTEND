// Section 26c, acceptance 135 — currency neutral at zero, coloured only by sign.
import { describe, expect, it } from 'vitest'
import {
  formatCurrency,
  formatMinor,
  minorPerMajor,
  parseMoney,
  signTone,
  toMajor,
  toMinor,
  toneColor,
  valueColor,
} from '@/utils/money'

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

describe('minor units (acceptance 143)', () => {
  it('stores rupees as an integer count of paise', () => {
    expect(toMinor(1500)).toBe(150000)
    expect(toMinor(12.34)).toBe(1234)
    expect(Number.isInteger(toMinor(0.1))).toBe(true)
  })

  it('rounds rather than truncating, so a typed value is not shaved', () => {
    // 1.13 * 100 is 112.99999999999999 in IEEE-754. Truncating that loses a
    // paisa on a number the user typed exactly, and it does so on about one
    // value in a hundred — often enough to be a bug report, rarely enough that
    // it survives a casual test.
    expect(1.13 * 100).not.toBe(113)
    expect(toMinor(1.13)).toBe(113)
    expect(0.07 * 100).not.toBe(7)
    expect(toMinor(0.07)).toBe(7)
  })

  it('cannot rescue a float that was already wrong when it arrived', () => {
    // 1.005 is not 1.005 — the nearest double is 1.00499999999999989, so
    // rounding it to paise gives 100 and not 101, and no amount of cleverness
    // here changes that. Documented rather than hidden, because it is the
    // argument for the integer store rather than an exception to it: the fix is
    // to never have the float, not to round it better.
    expect(toMinor(1.005)).toBe(100)
  })

  it('does not drift over a long chain of additions', () => {
    // This is the whole reason for the integer store. A ledger IS a long chain
    // of additions, and a running balance is that chain shown to the user.
    const floats = Array.from({ length: 10 }, () => 0.1).reduce((a, b) => a + b, 0)
    expect(floats).not.toBe(1)
    const minors = Array.from({ length: 10 }, () => toMinor(0.1)).reduce((a, b) => a + b, 0)
    expect(minors).toBe(100)
    expect(formatMinor(minors)).toBe('₹1')
  })

  it('knows a yen is already the minor unit', () => {
    // Multiplying a zero-decimal currency by 100 stores every price a hundred
    // times over — a bug that stays invisible until someone changes currency.
    expect(minorPerMajor('JPY')).toBe(1)
    expect(toMinor(1500, 'JPY')).toBe(1500)
    expect(minorPerMajor('KWD')).toBe(1000)
    expect(toMinor(1.5, 'KWD')).toBe(1500)
  })

  it('round-trips', () => {
    expect(toMajor(toMinor(85000.5))).toBe(85000.5)
    expect(formatMinor(toMinor(85000.5))).toBe('₹85,000.50')
    expect(formatMinor(toMinor(85000))).toBe('₹85,000')
  })

  it('survives a value that is not a number', () => {
    expect(toMinor(NaN)).toBe(0)
    expect(toMajor(Infinity)).toBe(0)
  })
})

describe('parsing what a person types', () => {
  it('takes a plain number', () => {
    expect(parseMoney('1500')).toBe(150000)
    expect(parseMoney('1500.50')).toBe(150050)
  })

  it('takes the symbol and the grouping back out', () => {
    expect(parseMoney('₹1,50,000')).toBe(15000000)
    expect(parseMoney(' ₹ 450 ')).toBe(45000)
  })

  it('takes the shorthand people actually type', () => {
    // "2L" for two lakh is how the amount is said out loud here, so it is what
    // gets typed into a field labelled "amount".
    expect(parseMoney('1.5k')).toBe(150000)
    expect(parseMoney('2L')).toBe(20000000)
    expect(parseMoney('1.2cr')).toBe(1200000000)
  })

  it('is 0 rather than NaN on nonsense, so no caller has to guard', () => {
    // The "you typed nonsense" feedback belongs in the field that refuses to
    // submit a zero, not in every arithmetic site downstream.
    expect(parseMoney('groceries')).toBe(0)
    expect(parseMoney('')).toBe(0)
    expect(parseMoney('1.2.3')).toBe(0)
  })
})
