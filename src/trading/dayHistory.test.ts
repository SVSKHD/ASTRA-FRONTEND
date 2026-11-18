import { describe, expect, it } from 'vitest'
import { historyOf } from './dayHistory'

const NOW = new Date(2026, 10, 13, 12, 0).getTime()
const bar = (d: number, close: string, closed = true) => ({
  ts: new Date(2026, 10, d, 9, 15).toISOString(),
  close,
  is_closed: closed,
  is_gap: false,
})

describe('daily history', () => {
  it('takes the previous close from the last closed bar before today', () => {
    const h = historyOf([bar(11, '98'), bar(12, '100'), bar(13, '104', false)], NOW)
    expect(h.previousClose).toBe('100')
    expect(h.closes).toEqual([98, 100, 104])
  })
  it('uses yesterday when today has no bar yet, and skips gaps', () => {
    const h = historyOf([bar(11, '98'), { ...bar(12, '0'), is_gap: true }], NOW)
    expect(h.previousClose).toBe('98')
    expect(h.closes).toEqual([98])
  })
  it('has no previous close without a closed bar', () => {
    expect(historyOf([bar(13, '104', false)], NOW).previousClose).toBeNull()
  })
})
