// The expense arithmetic (section 35).
//
// Single-signed throughout, which is the one thing that makes this module
// different from `tradeMath`: an expense has a size and no direction, so
// nothing here returns a sign, nothing is coloured by one, and the ramp is one
// hue deepening rather than two hues meeting at zero. Spending more is not the
// opposite of spending less; it is more of the same thing.

import { round2 } from '@/utils/tradeMath'
import type { Expense } from '@/types'

export interface DaySpend {
  date: string
  amount: number
  count: number
}

export function byDay(expenses: Expense[]): Map<string, DaySpend> {
  const out = new Map<string, DaySpend>()
  for (const e of expenses) {
    const cell = out.get(e.date) ?? { date: e.date, amount: 0, count: 0 }
    cell.amount = round2(cell.amount + e.amount)
    cell.count += 1
    out.set(e.date, cell)
  }
  return out
}

export interface ExpenseTotals {
  /** Everything spent in the month on screen. */
  spent: number
  /** Budget minus spent. Can be negative — that is the useful case. */
  remaining: number
  /** Spent divided by the days elapsed, not by the days in the month. */
  perDay: number
  budget: number
  /** 0–100 for the bar, clamped; the figure beside it is not clamped. */
  pct: number
  count: number
}

/**
 * The header's three figures.
 *
 * `perDay` is over days ELAPSED rather than days in the month, because the
 * question it answers is "at this rate": dividing a week's spending by thirty
 * says the month is going well when it is only young.
 */
export function expenseTotals(
  expenses: Expense[],
  budget: number,
  elapsedDays: number,
): ExpenseTotals {
  const spent = round2(expenses.reduce((sum, e) => sum + e.amount, 0))
  const days = Math.max(1, elapsedDays)
  return {
    spent,
    budget: round2(budget),
    remaining: round2(budget - spent),
    perDay: round2(spent / days),
    pct: budget > 0 ? Math.max(0, Math.min(100, round2((spent / budget) * 100))) : 0,
    count: expenses.length,
  }
}

/** How many days of the month have happened, given the day on screen. */
export function elapsedDays(monthKey: string, today: string): number {
  if (!today.startsWith(monthKey)) {
    // A past month is fully elapsed; a future one has not started.
    return today > monthKey ? daysInMonth(monthKey) : 1
  }
  return Number(today.slice(8)) || 1
}

export function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return 30
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Five steps, like the P/L scale, so the two calendars read at one glance. */
export const SPEND_STEPS = 5

/**
 * A day's step on the single-hue ramp, keyed to the month's budget.
 *
 * The reference is the budget spread evenly over the month — a day that spends
 * a whole month's allowance is at the top of the ramp, a day at the daily rate
 * sits near the bottom. With no budget set there is nothing to key to, so every
 * spent day takes the same middle step rather than a scale that means nothing.
 */
export function spendStep(amount: number, budget: number, monthDays: number): number {
  const value = Math.abs(amount)
  if (value <= 0) return 0
  if (budget <= 0) return 3
  const daily = budget / Math.max(1, monthDays)
  const ratio = value / (daily * 2)
  return Math.max(1, Math.min(SPEND_STEPS, Math.ceil(ratio * SPEND_STEPS)))
}

/** The token a cell asks for. One hue; the step is the depth. */
export function spendWashVar(step: number): string {
  return step === 0 ? 'var(--pl-flat)' : `var(--spend-${step})`
}

export function spendInkVar(step: number): string {
  return step === 0 ? 'var(--text-primary)' : `var(--on-spend-${step}, var(--text-primary))`
}

/** What a day cell says on hover, in words rather than in colour alone. */
export function dayTitle(cell: DaySpend | undefined): string {
  if (!cell || !cell.count) return 'Nothing spent'
  return `${cell.count} ${cell.count === 1 ? 'expense' : 'expenses'} · ${cell.amount.toFixed(2)}`
}

/** Spend by category, biggest first — the only breakdown worth a row each. */
export function byCategory(
  expenses: Expense[],
): { category: string; amount: number; count: number }[] {
  const out = new Map<string, { category: string; amount: number; count: number }>()
  for (const e of expenses) {
    const cell = out.get(e.category) ?? { category: e.category, amount: 0, count: 0 }
    cell.amount = round2(cell.amount + e.amount)
    cell.count += 1
    out.set(e.category, cell)
  }
  return [...out.values()].sort((a, b) => b.amount - a.amount)
}
