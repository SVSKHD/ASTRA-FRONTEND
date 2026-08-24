import { describe, expect, it } from 'vitest'
import {
  computeBudget,
  currentMonthKey,
  monthKeyOf,
  monthLabel,
  resolveIncome,
  shiftMonth,
} from '@/utils/budget'
import { toMinor } from '@/utils/money'
import { emptyFinanceSettings, type Finance, type FinanceSettings } from '@/types'

// resolveIncome and computeBudget both answer in integer paise since 27b. The
// fixtures below deliberately keep the LEGACY rupee fields, because that is the
// shape a pre-27b workspace has on disk and reading it correctly is the point;
// the expectations are written in toMinor() so the unit is stated, not assumed.

function fin(over: Partial<Finance>): Finance {
  return {
    id: 1,
    amount: 0,
    category: 'Other',
    note: '',
    date: '2026-07-10',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

function settings(over: Partial<FinanceSettings>): FinanceSettings {
  return { ...emptyFinanceSettings(), ...over }
}

describe('month key helpers', () => {
  it('monthKeyOf / currentMonthKey use local YYYY-MM', () => {
    expect(monthKeyOf(new Date(2026, 6, 31, 23, 0))).toBe('2026-07')
    expect(currentMonthKey(new Date(2026, 0, 1))).toBe('2026-01')
  })

  it('shiftMonth wraps across year boundaries', () => {
    expect(shiftMonth('2026-07', 1)).toBe('2026-08')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('monthLabel is human readable', () => {
    expect(monthLabel('2026-07')).toBe('July 2026')
  })
})

describe('resolveIncome', () => {
  it('uses an explicit month entry when present', () => {
    const s = settings({ monthlyIncome: 90000, incomeByMonth: { '2026-07': 85000 } })
    expect(resolveIncome(s, '2026-07')).toBe(toMinor(85000))
  })

  it('carries forward the most recent earlier month', () => {
    const s = settings({
      monthlyIncome: 90000,
      incomeByMonth: { '2026-05': 80000, '2026-07': 85000 },
    })
    expect(resolveIncome(s, '2026-06')).toBe(toMinor(80000)) // carries May forward
    expect(resolveIncome(s, '2026-08')).toBe(toMinor(85000)) // carries July forward
  })

  it('falls back to the latest income when nothing is at or before the month', () => {
    const s = settings({ monthlyIncome: 90000, incomeByMonth: { '2026-07': 85000 } })
    expect(resolveIncome(s, '2026-01')).toBe(toMinor(90000))
  })

  it('is 0 when no income is set at all', () => {
    expect(resolveIncome(emptyFinanceSettings(), '2026-07')).toBe(0)
  })
})

describe('computeBudget', () => {
  const s = settings({ monthlyIncome: 85000, incomeByMonth: { '2026-07': 85000 } })
  const finances = [
    fin({ id: 1, amount: 20000, category: 'Bills', date: '2026-07-01' }),
    fin({ id: 2, amount: 5000, category: 'Food', date: '2026-07-15' }),
    fin({ id: 3, amount: 3000, category: 'Food', date: '2026-07-20' }),
    fin({ id: 4, amount: 9999, category: 'Fun', date: '2026-06-30' }), // other month
  ]

  it('sums only the target month and computes remaining', () => {
    const b = computeBudget(finances, s, '2026-07')
    expect(b.spent).toBe(toMinor(28000))
    expect(b.income).toBe(toMinor(85000))
    expect(b.remaining).toBe(toMinor(57000))
    expect(Math.round(b.percentUsed)).toBe(33)
  })

  it('groups by category, share-of-income, sorted by total desc', () => {
    const b = computeBudget(finances, s, '2026-07')
    expect(b.byCategory.map((c) => [c.category, c.total])).toEqual([
      ['Bills', toMinor(20000)],
      ['Food', toMinor(8000)],
    ])
    expect(Math.round(b.byCategory[0].pct)).toBe(24) // 20000 / 85000
  })

  it('goes negative when overspent', () => {
    const b = computeBudget([fin({ amount: 90000, date: '2026-07-05' })], s, '2026-07')
    expect(b.remaining).toBe(toMinor(-5000))
  })

  it('reads 100% used when there is spend but no income', () => {
    const b = computeBudget(
      [fin({ amount: 500, date: '2026-07-05' })],
      emptyFinanceSettings(),
      '2026-07',
    )
    expect(b.percentUsed).toBe(100)
    expect(b.remaining).toBe(toMinor(-500))
  })
})
