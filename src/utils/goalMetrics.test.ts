import { describe, it, expect } from 'vitest'
import {
  meetsTarget,
  captureOutcome,
  currentStreak,
  bestStreak,
  completionRate,
  rollingStats,
  type Metric,
  type Occurrence,
} from './goalMetrics'

const metric = (partial: Partial<Metric> = {}): Metric => ({
  enabled: true,
  label: 'Profit',
  unit: 'USD',
  target: 500,
  direction: 'at_least',
  allowPartial: true,
  ...partial,
})

const occ = (
  date: string,
  status: Occurrence['status'],
  actual: number | null = null,
): Occurrence => ({
  date,
  status,
  target: 500,
  actual,
  note: null,
})

describe('meetsTarget / captureOutcome', () => {
  it('handles each direction', () => {
    expect(meetsTarget('at_least', 500, 500)).toBe(true)
    expect(meetsTarget('at_least', 500, 499)).toBe(false)
    expect(meetsTarget('at_most', 500, 500)).toBe(true)
    expect(meetsTarget('at_most', 500, 501)).toBe(false)
    expect(meetsTarget('exact', 500, 500)).toBe(true)
    expect(meetsTarget('exact', 500, 499)).toBe(false)
  })
  it('acceptance 44: entering 400 against 500 → 80%, not a hit, actual preserved by caller', () => {
    const o = captureOutcome(metric(), 400)
    expect(o.hit).toBe(false)
    expect(o.pct).toBe(80)
    expect(o.offerMissed).toBe(false) // allowPartial true
  })
  it('offers "mark as missed" only when partials are disallowed', () => {
    expect(captureOutcome(metric({ allowPartial: false }), 400).offerMissed).toBe(true)
    expect(captureOutcome(metric({ allowPartial: false }), 500).offerMissed).toBe(false)
  })
})

describe('streaks (skipped neutral, missed breaks) — acceptance 46', () => {
  it('current streak counts consecutive done, skips are transparent', () => {
    const list = [
      occ('2026-08-10', 'done', 600),
      occ('2026-08-11', 'skipped'),
      occ('2026-08-12', 'done', 700),
      occ('2026-08-13', 'done', 500),
    ]
    expect(currentStreak(list)).toBe(3) // skip doesn't reset, doesn't add
  })
  it('a missed day breaks the current streak', () => {
    const list = [
      occ('2026-08-12', 'done', 600),
      occ('2026-08-13', 'missed'),
      occ('2026-08-14', 'done', 600),
    ]
    expect(currentStreak(list)).toBe(1)
  })
  it('best streak is the longest done run', () => {
    const list = [
      occ('2026-08-10', 'done', 600),
      occ('2026-08-11', 'done', 600),
      occ('2026-08-12', 'missed'),
      occ('2026-08-13', 'done', 600),
      occ('2026-08-14', 'skipped'),
      occ('2026-08-15', 'done', 600),
      occ('2026-08-16', 'done', 600),
    ]
    expect(bestStreak(list)).toBe(3) // the last run of 13,15,16 (skip transparent)
  })
})

describe('completionRate excludes skipped, includes missed', () => {
  it('is done / (done + missed)', () => {
    const list = [
      occ('2026-08-10', 'done', 600),
      occ('2026-08-11', 'missed'),
      occ('2026-08-12', 'skipped'),
      occ('2026-08-13', 'done', 600),
      occ('2026-08-14', 'pending'),
    ]
    expect(completionRate(list)).toBeCloseTo(2 / 3, 5)
  })
})

describe('rollingStats', () => {
  it('totals/averages actuals over done days and sums target over decided days', () => {
    const list = [
      occ('2026-08-13', 'done', 400),
      occ('2026-08-14', 'missed'),
      occ('2026-08-15', 'done', 600),
      occ('2026-08-16', 'skipped'),
      occ('2026-08-01', 'done', 999), // outside the 7-day window
    ]
    const s = rollingStats(list, 7, '2026-08-16', { direction: 'at_least' })
    expect(s.totalActual).toBe(1000) // 400 + 600
    expect(s.avgActual).toBe(500) // over 2 done days
    expect(s.daysHit).toBe(1) // only 600 >= 500
    expect(s.daysDone).toBe(2)
    expect(s.cumulativeTarget).toBe(1500) // 3 decided days (2 done + 1 missed) * 500
  })
})
