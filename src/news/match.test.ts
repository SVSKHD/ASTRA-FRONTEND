import { describe, expect, it } from 'vitest'
import { baseSymbol, filterNews, istStamp, mentions, sourcesOf, termsFor } from './match'
import type { NewsItem } from '@/types'

const at = (iso: string) => Date.parse(iso)
function item(
  id: string,
  title: string,
  source = 'FXStreet',
  publishedAt = at('2026-11-04T06:00:00Z'),
): NewsItem {
  return {
    id,
    title,
    link: `https://x.test/${id}`,
    source,
    category: 'forex',
    tags: [],
    publishedAt,
    fetchedAt: 0,
  }
}

describe('termsFor / baseSymbol', () => {
  it('strips exchange decoration', () => {
    expect(baseSymbol('NSE:RELIANCE-EQ')).toBe('RELIANCE')
    expect(baseSymbol('reliance.ns')).toBe('RELIANCE')
    expect(baseSymbol('XAUUSD.m')).toBe('XAUUSD')
  })
  it('expands a currency pair into how headlines write it', () => {
    const t = termsFor('XAUUSD')
    expect(t).toEqual(expect.arrayContaining(['XAUUSD', 'gold', 'USD', 'dollar', 'Fed', 'CPI']))
    expect(termsFor('EURINR')).toEqual(expect.arrayContaining(['euro', 'rupee', 'RBI']))
  })
  it('leaves an equity as itself', () => {
    expect(termsFor('NSE:TCS-EQ')).toEqual(['TCS'])
  })
})

describe('mentions', () => {
  it('matches words on boundaries, codes case-sensitively', () => {
    expect(mentions('Gold climbs as the Fed pauses', termsFor('XAUUSD'))).toEqual(['gold', 'Fed'])
    // "fed up" is not the Fed; "used" is not USD.
    expect(mentions('Traders fed up with used cars', ['Fed', 'USD'])).toEqual([])
    expect(mentions('Goldman Sachs earnings', ['gold'])).toEqual([])
  })
})

describe('filterNews', () => {
  const items = [
    item('a', 'Gold hits a record as dollar slides', 'Reuters', at('2026-11-04T03:00:00Z')),
    item('b', 'Euro steadies before ECB', 'FXStreet', at('2026-11-03T03:00:00Z')),
    item('c', 'Oil falls on supply news', 'Reuters', at('2026-11-02T20:00:00Z')),
  ]
  it('finds a symbol by the words it is written as', () => {
    expect(filterNews(items, { q: 'XAUUSD' }).map((i) => i.id)).toEqual(['a'])
  })
  it('matches plain words in title or source', () => {
    expect(filterNews(items, { q: 'supply news' }).map((i) => i.id)).toEqual(['c'])
    expect(filterNews(items, { q: 'reuters' }).map((i) => i.id)).toEqual(['a', 'c'])
  })
  it('filters by source and by IST day (inclusive)', () => {
    expect(filterNews(items, { source: 'FXStreet' }).map((i) => i.id)).toEqual(['b'])
    // 2026-11-02T20:00Z is 3 Nov 01:30 in IST.
    expect(filterNews(items, { from: '2026-11-03', to: '2026-11-03' }).map((i) => i.id)).toEqual([
      'b',
      'c',
    ])
  })
})

describe('sourcesOf / istStamp', () => {
  it('counts sources, busiest first', () => {
    const s = sourcesOf([item('a', 'x', 'B'), item('b', 'y', 'A'), item('c', 'z', 'B')])
    expect(s.map((x) => [x.source, x.count])).toEqual([
      ['B', 2],
      ['A', 1],
    ])
  })
  it('writes IST, with the day only when it is not today', () => {
    const now = at('2026-11-04T10:00:00Z')
    expect(istStamp(at('2026-11-04T08:35:00Z'), now)).toBe('14:05 IST')
    expect(istStamp(at('2026-11-02T08:35:00Z'), now)).toBe('2 Nov · 14:05 IST')
    expect(istStamp(0, now)).toBe('time unknown')
  })
})
