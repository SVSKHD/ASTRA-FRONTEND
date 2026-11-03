// The expense PLAN (section 35b): capital per category, where the money went,
// and what to do about it.
//
// `expenseMath` answers "how much was spent". This module answers the three
// questions that come after it, and keeps them pure so every figure on the plan
// half of the tab can be tested without a database or a component:
//
//   • AGAINST WHAT. Each category can carry capital; the month's budget is the
//     setting when there is one and the sum of the capital when there is not.
//   • ON WHAT. By what paid (a card is money still owed) and by whether it had
//     to be spent (avoidable is the "wasted" half of saving-versus-wasting).
//   • SO WHAT. Projections and the allocation advice built on them.
//
// THE PROJECTION RULE, because a naive one is wrong on day five of every month:
// recurring rows are counted once, as they are — rent paid on the 1st is not
// going to be paid thirty times — and only the one-off spending is carried
// forward at its daily rate over the days that are left.

import { round2 } from '@/utils/tradeMath'
import { amount2 } from '@/utils/format'
import { daysInMonth } from '@/utils/expenseMath'
import type { Expense, ExpenseMethod, ExpenseNeed } from '@/types'

export const METHOD_LABEL: Record<ExpenseMethod, string> = {
  card: 'Credit card',
  debit: 'Debit / UPI',
  cash: 'Cash',
}

export const NEED_LABEL: Record<ExpenseNeed, string> = {
  essential: 'Essential',
  lifestyle: 'Lifestyle',
  avoidable: 'Avoidable',
}

/** The 50/30/20 split, of income: needs, wants, and what is kept. */
export const RULE_TARGET = { needs: 50, wants: 30, savings: 20 } as const

const sum = (values: number[]) => round2(values.reduce((a, b) => a + b, 0))

/** The month's budget: the setting if there is one, else the capital assigned. */
export function planBudget(budget: number, capital: Record<string, number>): number {
  return budget > 0 ? round2(budget) : sum(Object.values(capital))
}

/** Days of the month still to come after `elapsed`, never negative. */
export function daysLeft(month: string, elapsed: number): number {
  return Math.max(0, daysInMonth(month) - elapsed)
}

/**
 * Where a month will land if the one-off rate holds.
 *
 * Recurring spend counted once; one-off spend divided by the days elapsed and
 * spread over the whole month.
 */
export function projectSpend(expenses: Expense[], elapsed: number, monthDays: number): number {
  const recurring = sum(expenses.filter((e) => e.kind === 'recurring').map((e) => e.amount))
  const oneOff = sum(expenses.filter((e) => e.kind !== 'recurring').map((e) => e.amount))
  return round2(recurring + (oneOff / Math.max(1, elapsed)) * monthDays)
}

export type CapitalStatus = 'unplanned' | 'over' | 'pacing-over' | 'on-track' | 'idle'

export interface CapitalRow {
  category: string
  capital: number
  spent: number
  /** Capital less spent. Negative once it is overspent. */
  remaining: number
  /** Spent as a share of capital, unclamped. Zero when there is no capital. */
  pct: number
  projected: number
  count: number
  status: CapitalStatus
}

/**
 * One row per category that has capital or has spending — the union, because a
 * planned category nobody has touched and a spent one nobody planned are the
 * two rows most worth seeing.
 */
export function capitalRows(
  expenses: Expense[],
  capital: Record<string, number>,
  elapsed: number,
  monthDays: number,
): CapitalRow[] {
  const names = new Set([...Object.keys(capital), ...expenses.map((e) => e.category)])
  const rows: CapitalRow[] = []
  for (const category of names) {
    const own = expenses.filter((e) => e.category === category)
    const spent = sum(own.map((e) => e.amount))
    const cap = round2(capital[category] ?? 0)
    const projected = projectSpend(own, elapsed, monthDays)
    let status: CapitalStatus
    if (cap <= 0) status = 'unplanned'
    else if (spent > cap) status = 'over'
    else if (projected > cap) status = 'pacing-over'
    else if (spent === 0) status = 'idle'
    else status = 'on-track'
    rows.push({
      category,
      capital: cap,
      spent,
      remaining: round2(cap - spent),
      pct: cap > 0 ? round2((spent / cap) * 100) : 0,
      projected,
      count: own.length,
      status,
    })
  }
  // Biggest commitment first, whichever of capital or spend made it big.
  return rows.sort(
    (a, b) =>
      Math.max(b.capital, b.spent) - Math.max(a.capital, a.spent) ||
      a.category.localeCompare(b.category),
  )
}

export interface SplitPart<K extends string> {
  key: K
  label: string
  amount: number
  count: number
  /** Share of the total spend, 0–100. */
  share: number
}

function split<K extends string>(
  expenses: Expense[],
  keys: K[],
  labels: Record<K, string>,
  pick: (e: Expense) => K,
): SplitPart<K>[] {
  const total = sum(expenses.map((e) => e.amount))
  return keys.map((key) => {
    const own = expenses.filter((e) => pick(e) === key)
    const amount = sum(own.map((e) => e.amount))
    return {
      key,
      label: labels[key],
      amount,
      count: own.length,
      share: total > 0 ? round2((amount / total) * 100) : 0,
    }
  })
}

export function byMethod(expenses: Expense[]): SplitPart<ExpenseMethod>[] {
  return split(expenses, ['card', 'debit', 'cash'], METHOD_LABEL, (e) => e.method)
}

export function byNeed(expenses: Expense[]): SplitPart<ExpenseNeed>[] {
  return split(expenses, ['essential', 'lifestyle', 'avoidable'], NEED_LABEL, (e) => e.need)
}

export interface DayPoint {
  date: string
  day: number
  spent: number
  avoidable: number
  cumulative: number
  /** Where the cumulative line would be if the budget were spent evenly. */
  pace: number
  /** The day's allowance less the day's spend: above zero saved, below wasted. */
  saved: number
}

/**
 * Every day of the month that has happened, for the two charts.
 *
 * Days to come are left out rather than drawn at zero: a flat line into the
 * future reads as "spent nothing", which nobody has done yet.
 */
export function dailySeries(
  expenses: Expense[],
  budget: number,
  month: string,
  elapsed: number,
): DayPoint[] {
  const monthDays = daysInMonth(month)
  const allowance = budget > 0 ? budget / monthDays : 0
  const out: DayPoint[] = []
  let cumulative = 0
  for (let day = 1; day <= Math.min(elapsed, monthDays); day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`
    const own = expenses.filter((e) => e.date === date)
    const spent = sum(own.map((e) => e.amount))
    cumulative = round2(cumulative + spent)
    out.push({
      date,
      day,
      spent,
      avoidable: sum(own.filter((e) => e.need === 'avoidable').map((e) => e.amount)),
      cumulative,
      pace: round2(allowance * day),
      saved: round2(allowance - spent),
    })
  }
  return out
}

export interface ExpenseKpis {
  spent: number
  budget: number
  income: number
  /** Income less spent; null when no income has been set. */
  kept: number | null
  /** Kept as a share of income; null without income. */
  savingsRate: number | null
  projected: number
  /** What may be spent per remaining day to land on budget; null with none. */
  safePerDay: number | null
  /** Pace-to-date less spent: positive is ahead of plan, negative behind. */
  vsPace: number
  card: number
  cardShare: number
  avoidable: number
  avoidableShare: number
  recurring: number
  /** Budget less the capital assigned to categories. */
  unallocated: number
  allocated: number
  overCategories: number
  largestCategory: { category: string; amount: number } | null
  biggest: Expense | null
  avgTicket: number
  count: number
  daysLeft: number
}

export function expenseKpis(input: {
  expenses: Expense[]
  budget: number
  income: number
  capital: Record<string, number>
  month: string
  elapsed: number
}): ExpenseKpis {
  const { expenses, income, capital, month, elapsed } = input
  const monthDays = daysInMonth(month)
  const budget = planBudget(input.budget, capital)
  const spent = sum(expenses.map((e) => e.amount))
  const left = daysLeft(month, elapsed)
  const rows = capitalRows(expenses, capital, elapsed, monthDays)
  const allocated = sum(Object.values(capital))
  const methods = byMethod(expenses)
  const needs = byNeed(expenses)
  const card = methods.find((m) => m.key === 'card')!
  const avoidable = needs.find((n) => n.key === 'avoidable')!
  const top = rows.filter((r) => r.spent > 0).sort((a, b) => b.spent - a.spent)[0]
  const biggest = expenses.reduce<Expense | null>(
    (best, e) => (!best || e.amount > best.amount ? e : best),
    null,
  )
  return {
    spent,
    budget,
    income: round2(income),
    kept: income > 0 ? round2(income - spent) : null,
    savingsRate: income > 0 ? round2(((income - spent) / income) * 100) : null,
    projected: projectSpend(expenses, elapsed, monthDays),
    safePerDay: budget > 0 && left > 0 ? round2(Math.max(0, budget - spent) / left) : null,
    vsPace: round2((budget / monthDays) * Math.min(elapsed, monthDays) - spent),
    card: card.amount,
    cardShare: card.share,
    avoidable: avoidable.amount,
    avoidableShare: avoidable.share,
    recurring: sum(expenses.filter((e) => e.kind === 'recurring').map((e) => e.amount)),
    unallocated: round2(budget - allocated),
    allocated,
    overCategories: rows.filter((r) => r.status === 'over' || r.status === 'pacing-over').length,
    largestCategory: top ? { category: top.category, amount: top.spent } : null,
    biggest,
    avgTicket: expenses.length ? round2(spent / expenses.length) : 0,
    count: expenses.length,
    daysLeft: left,
  }
}

export interface RulePart {
  key: keyof typeof RULE_TARGET
  label: string
  /** The rule's share of income, as an amount. */
  target: number
  actual: number
  /** Actual as a share of income. */
  share: number
}

/**
 * The month against 50/30/20 of income. Needs are essential spend, wants are
 * lifestyle and avoidable, and savings is whatever income was not spent.
 * Empty without an income, because a share of nothing is not a figure.
 */
export function ruleSplit(expenses: Expense[], income: number): RulePart[] {
  if (income <= 0) return []
  const needs = byNeed(expenses)
  const amountOf = (key: ExpenseNeed) => needs.find((n) => n.key === key)!.amount
  const spent = sum(expenses.map((e) => e.amount))
  const actual = {
    needs: amountOf('essential'),
    wants: round2(amountOf('lifestyle') + amountOf('avoidable')),
    savings: round2(Math.max(0, income - spent)),
  }
  const labels = { needs: 'Needs', wants: 'Wants', savings: 'Savings' }
  return (Object.keys(RULE_TARGET) as (keyof typeof RULE_TARGET)[]).map((key) => ({
    key,
    label: labels[key],
    target: round2((income * RULE_TARGET[key]) / 100),
    actual: actual[key],
    share: round2((actual[key] / income) * 100),
  }))
}

export type AdviceTone = 'good' | 'warn' | 'bad' | 'info'

export interface Advice {
  id: string
  tone: AdviceTone
  title: string
  detail: string
}

/**
 * What to do with the money, in sentences.
 *
 * Ordered by how much money each line is about, roughly: an overrun first,
 * then moves that cover it, then waste, then the card, then the plan's own
 * gaps. Each line names amounts, because "spend less on food" is not advice
 * and "move 1,200 from Books to Groceries" is.
 */
export function allocationAdvice(rows: CapitalRow[], kpis: ExpenseKpis): Advice[] {
  const out: Advice[] = []
  const left = kpis.daysLeft
  const live = left > 0

  // Overruns, each covered from the categories with room to spare.
  const spare = rows
    .filter((r) => r.capital > 0 && r.projected < r.capital)
    .map((r) => ({
      category: r.category,
      room: round2(r.capital - Math.max(r.spent, r.projected)),
    }))
    .filter((d) => d.room > 0)
    .sort((a, b) => b.room - a.room)
  for (const row of rows.filter((r) => r.status === 'over' || r.status === 'pacing-over')) {
    let short = round2((live ? row.projected : row.spent) - row.capital)
    const moves: string[] = []
    for (const donor of spare) {
      if (short <= 0) break
      const take = round2(Math.min(donor.room, short))
      if (take <= 0) continue
      donor.room = round2(donor.room - take)
      short = round2(short - take)
      moves.push(`${amount2(take)} from ${donor.category}`)
    }
    const where =
      row.status === 'over'
        ? `${row.category} has taken ${amount2(row.spent)} of ${amount2(row.capital)}`
        : `${row.category} is on pace for ${amount2(row.projected)} against ${amount2(row.capital)}`
    const cover = moves.length ? ` Move ${moves.join(' and ')} to cover it.` : ''
    const rest =
      short > 0
        ? live && row.remaining > 0
          ? ` Otherwise hold it to ${amount2(row.remaining / left)} a day for the ${left} days left.`
          : ` ${amount2(short)} is not covered by anything spare — raise its capital or cut back.`
        : ''
    out.push({
      id: `over-${row.category}`,
      tone: row.status === 'over' ? 'bad' : 'warn',
      title:
        row.status === 'over'
          ? `${row.category} is over its capital`
          : `${row.category} will run over`,
      detail: `${where}.${cover}${rest}`,
    })
  }

  for (const row of rows.filter((r) => r.status === 'unplanned' && r.spent > 0)) {
    out.push({
      id: `unplanned-${row.category}`,
      tone: 'warn',
      title: `${row.category} has no capital`,
      detail: `${amount2(row.spent)} went here without a plan. Give it a line of about ${amount2(row.projected)} a month, or stop spending on it.`,
    })
  }

  if (kpis.avoidable > 0) {
    out.push({
      id: 'avoidable',
      tone: kpis.avoidableShare >= 15 ? 'bad' : 'warn',
      title: `${amount2(kpis.avoidable)} went on avoidable spends`,
      detail: `That is ${kpis.avoidableShare.toFixed(0)}% of everything spent. Halving it puts ${amount2(kpis.avoidable / 2)} back each month — send it to savings.`,
    })
  }

  if (kpis.card > 0) {
    out.push({
      id: 'card',
      tone: kpis.cardShare >= 60 ? 'warn' : 'info',
      title: `Keep ${amount2(kpis.card)} aside for the card bill`,
      detail: `${kpis.cardShare.toFixed(0)}% of this month went on credit cards. That is owed, not spent from the bank yet — park it so the statement is paid in full and no interest is charged.`,
    })
  }

  if (kpis.budget > 0 && kpis.allocated > 0 && kpis.unallocated > 0) {
    out.push({
      id: 'unallocated',
      tone: 'info',
      title: `${amount2(kpis.unallocated)} of the budget is not assigned`,
      detail:
        'Give it to a category that keeps running over, or to savings so it is not spent by default.',
    })
  } else if (kpis.allocated > kpis.budget && kpis.budget > 0) {
    out.push({
      id: 'overallocated',
      tone: 'warn',
      title: `Categories hold ${amount2(-kpis.unallocated)} more than the budget`,
      detail:
        'The capital adds up to more than the month allows. Trim the categories with the most room, or raise the budget.',
    })
  }

  if (!live) {
    const unspent = sum(rows.filter((r) => r.capital > r.spent).map((r) => r.capital - r.spent))
    if (unspent > 0) {
      out.push({
        id: 'swept',
        tone: 'good',
        title: `${amount2(unspent)} of capital went unspent`,
        detail: 'Move it to savings or investments, so it is not quietly spent next month.',
      })
    }
  } else if (kpis.budget > 0 && kpis.vsPace > 0 && kpis.overCategories === 0) {
    out.push({
      id: 'ahead',
      tone: 'good',
      title: `${amount2(kpis.vsPace)} ahead of plan`,
      detail:
        `The month is running under budget. ${kpis.safePerDay !== null ? `Up to ${amount2(kpis.safePerDay)} a day stays on plan.` : ''}`.trim(),
    })
  }

  if (kpis.savingsRate !== null && kpis.savingsRate < RULE_TARGET.savings) {
    out.push({
      id: 'savings-rate',
      tone: kpis.savingsRate < 0 ? 'bad' : 'warn',
      title: `Saving ${kpis.savingsRate.toFixed(0)}% of income`,
      detail: `The usual floor is ${RULE_TARGET.savings}% — ${amount2((kpis.income * RULE_TARGET.savings) / 100)} this month. Lifestyle and avoidable spend are where it comes from.`,
    })
  }

  if (!out.length && kpis.budget <= 0) {
    out.push({
      id: 'no-plan',
      tone: 'info',
      title: 'Assign capital to see advice',
      detail:
        'Set an income, a budget, or capital per category. Every suggestion here is measured against those.',
    })
  }
  return out
}
