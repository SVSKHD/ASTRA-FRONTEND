import { describe, expect, it } from 'vitest'
import { isCorrectable, plausibleCorrection } from '@/utils/autoCorrect'
import { wordChanges } from '@/utils/autoCorrectFields'

describe('isCorrectable', () => {
  it('sends ordinary sentences', () => {
    expect(isCorrectable('call teh bank tomorow')).toBe(true)
  })
  it('skips short, numeric, URL, JSON and code values', () => {
    expect(isCorrectable('ok')).toBe(false)
    expect(isCorrectable('12,400.50')).toBe(false)
    expect(isCorrectable('https://example.com/a')).toBe(false)
    expect(isCorrectable('{"title":"x"}')).toBe(false)
    expect(isCorrectable('const a = () => b')).toBe(false)
    expect(isCorrectable('a'.repeat(2001))).toBe(false)
  })
})

describe('plausibleCorrection', () => {
  it('accepts a typo fix', () => {
    expect(plausibleCorrection('call teh bank tomorow', 'call the bank tomorrow')).toBe(true)
  })
  it('rejects a rewrite, an empty answer or changed line breaks', () => {
    expect(plausibleCorrection('fix bug', 'Here is the corrected text: fix the bug now')).toBe(false)
    expect(plausibleCorrection('fix bug', '')).toBe(false)
    expect(plausibleCorrection('line one\nline two', 'line one line two')).toBe(false)
  })
})

describe('wordChanges', () => {
  it('lists each changed word once', () => {
    expect(wordChanges('call teh bank tomorow', 'call the bank tomorrow')).toEqual([
      { from: 'teh', to: 'the' },
      { from: 'tomorow', to: 'tomorrow' },
    ])
  })
  it('shows an added word', () => {
    expect(wordChanges('i need go home', 'I need to go home')).toEqual([
      { from: 'i', to: 'I' },
      { from: '', to: 'to' },
    ])
  })
})
