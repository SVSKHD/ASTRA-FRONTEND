import { describe, expect, it } from 'vitest'
import { ago, dec, pct, signed, sumDec, toneOf } from './format'

describe('decimal display (never through a float)', () => {
  it('groups, trims and truncates', () => {
    expect(dec('1234567.50000')).toBe('1,234,567.5')
    expect(dec('0.000000019', 8)).toBe('0.00000001')
    expect(dec('-1500')).toBe('-1,500')
    expect(dec('-0.00')).toBe('0')
    expect(dec('2650.555', 2)).toBe('2,650.55')
    expect(dec(null)).toBe('—')
    expect(dec('n/a')).toBe('n/a')
  })
  it('keeps precision a float would lose', () => {
    expect(dec('12345678901234567.12345678')).toBe('12,345,678,901,234,567.12345678')
  })
  it('signs and tones by the value itself', () => {
    expect(signed('12.5')).toBe('+12.5')
    expect(signed('-4')).toBe('-4')
    expect(signed('0')).toBe('0')
    expect(toneOf('0.00')).toBe('neutral')
    expect(toneOf('-0.01')).toBe('negative')
    expect(toneOf('3')).toBe('positive')
  })
  it('formats ratios as percents exactly', () => {
    expect(pct('0.6')).toBe('60%')
    expect(pct('0.5833')).toBe('58.33%')
    expect(pct('1')).toBe('100%')
    expect(pct(null)).toBe('—')
  })
  it('sums decimal strings exactly', () => {
    expect(sumDec(['0.1', '0.2'])).toBe('0.3')
    expect(sumDec(['-10.5', '4.25', null, ''])).toBe('-6.25')
    expect(sumDec(['9007199254740993', '1'])).toBe('9007199254740994')
    expect(sumDec([null, undefined])).toBeNull()
  })
  it('says how long ago', () => {
    const now = Date.parse('2026-11-02T12:00:00Z')
    expect(ago('2026-11-02T11:59:30Z', now)).toBe('30 s ago')
    expect(ago('2026-11-02T11:00:00Z', now)).toBe('60 min ago')
    expect(ago(null, now)).toBe('never')
  })
})
