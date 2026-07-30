// Monthly-budget maths for the expenses view. Pure and month-keyed so both the
// FinancesView and any dashboard widget derive the same numbers from the same
// inputs, and so the logic is testable without a store.
//
// A month is a local 'YYYY-MM' key; expenses are bucketed by the first 7 chars
// of their date. No running balance is ever stored — every figure is recomputed
// from the month's expenses, which is what keeps totals from drifting.

import type { Finance, FinanceSettings } from '@/types'

// Local year-month key (not UTC): the month a date falls in depends on the
// viewer's calendar, not Greenwich's.
export function monthKeyOf(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}

export function currentMonthKey(now: Date = new Date()): string {
  return monthKeyOf(now)
}

// Step a month key by whole months, wrapping years correctly.
export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  return monthKeyOf(new Date(y, m - 1 + delta, 1))
}

// "July 2026" for the month switcher.
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

// Income for a month: an explicit entry wins; otherwise carry forward the most
// recent month at or before it (income persists until changed); otherwise fall
// back to the latest income value overall; otherwise 0.
export function resolveIncome(settings: FinanceSettings, monthKey: string): number {
  const byMonth = settings.incomeByMonth || {}
  const explicit = byMonth[monthKey]
  if (typeof explicit === 'number') return explicit
  const earlier = Object.keys(byMonth)
    .filter((m) => m <= monthKey)
    .sort()
  if (earlier.length) return byMonth[earlier[earlier.length - 1]]
  return typeof settings.monthlyIncome === 'number' ? settings.monthlyIncome : 0
}

export interface CategoryTotal {
  category: string
  total: number
  // Share of income (not of spend), per the design.
  pct: number
}

export interface BudgetSummary {
  monthKey: string
  income: number
  spent: number
  remaining: number
  // Spend as a share of income; 0 income with spend reads as fully used.
  percentUsed: number
  byCategory: CategoryTotal[]
}

export function computeBudget(
  finances: Finance[],
  settings: FinanceSettings,
  monthKey: string,
): BudgetSummary {
  const income = resolveIncome(settings, monthKey)
  let spent = 0
  const totals = new Map<string, number>()
  for (const f of finances) {
    if ((f.date || '').slice(0, 7) !== monthKey) continue
    const amt = Number.isFinite(f.amount) ? f.amount : 0
    spent += amt
    totals.set(f.category, (totals.get(f.category) || 0) + amt)
  }
  const remaining = income - spent
  const percentUsed = income > 0 ? (spent / income) * 100 : spent > 0 ? 100 : 0
  const byCategory: CategoryTotal[] = [...totals.entries()]
    .map(([category, total]) => ({
      category,
      total,
      pct: income > 0 ? (total / income) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)
  return { monthKey, income, spent, remaining, percentUsed, byCategory }
}
