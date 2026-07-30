import { describe, expect, it } from 'vitest'
import { formatINR, parseINR } from '@/utils/currency'

describe('formatINR', () => {
  it('formats whole rupees with no decimals and Indian grouping', () => {
    expect(formatINR(85000)).toBe('₹85,000')
    expect(formatINR(150000)).toBe('₹1,50,000')
    expect(formatINR(10000000)).toBe('₹1,00,00,000')
  })

  it('shows two fraction digits only when there are paise', () => {
    expect(formatINR(100)).toBe('₹100')
    expect(formatINR(100.5)).toBe('₹100.50')
    expect(formatINR(99.99)).toBe('₹99.99')
  })

  it('formats negatives (over budget)', () => {
    expect(formatINR(-4200)).toBe('-₹4,200')
  })

  it('treats non-finite input as zero', () => {
    expect(formatINR(NaN)).toBe('₹0')
    expect(formatINR(Infinity)).toBe('₹0')
  })
})

describe('parseINR', () => {
  it('strips the symbol, commas and whitespace', () => {
    expect(parseINR('₹85,000')).toBe(85000)
    expect(parseINR('1,50,000')).toBe(150000)
    expect(parseINR('  ₹ 1,234.50 ')).toBe(1234.5)
  })

  it('returns 0 for empty or invalid input', () => {
    expect(parseINR('')).toBe(0)
    expect(parseINR('abc')).toBe(0)
    expect(parseINR('-')).toBe(0)
  })

  it('keeps a leading minus', () => {
    expect(parseINR('-4200')).toBe(-4200)
  })
})
