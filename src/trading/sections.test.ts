import { describe, expect, it } from 'vitest'
import { GROUPS, SECTIONS, chartPath, grouped, pathFor, sectionFor } from '@/trading/sections'

describe('trading sections', () => {
  it('lists every section the terminal spec asks to be discoverable', () => {
    const labels = SECTIONS.map((s) => s.label)
    for (const want of [
      'Overview',
      'Market Explorer',
      'Charts & Indicators',
      'Stock Screener',
      'Futures & Options',
      'Watchlists',
      'Strategies & Backtests',
      'Signals',
      'Dhan Account',
      'Risk',
      'Agents',
    ]) {
      expect(labels).toContain(want)
    }
  })

  it('keeps the operational sections, grouped', () => {
    const keys = SECTIONS.map((s) => s.key)
    for (const kept of ['mt5', 'origins', 'orders', 'paper']) expect(keys).toContain(kept)
    expect(grouped().flatMap((g) => g.sections)).toHaveLength(SECTIONS.length)
    expect(grouped().map((g) => g.key)).toEqual(GROUPS.map((g) => g.key))
  })

  it('has unique keys and maps URLs both ways', () => {
    expect(new Set(SECTIONS.map((s) => s.key)).size).toBe(SECTIONS.length)
    for (const s of SECTIONS) expect(sectionFor(pathFor(s.key).split('/')[2] ?? '')).toBe(s.key)
    expect(sectionFor('nope')).toBe('overview')
    expect(sectionFor(undefined)).toBe('overview')
    expect(pathFor('market')).toBe('/trading/market')
  })

  it('opens an instrument on the chart by URL', () => {
    expect(chartPath(42)).toBe('/trading/charts?instrument=42')
    expect(chartPath(42, '15m')).toBe('/trading/charts?instrument=42&tf=15m')
  })
})
