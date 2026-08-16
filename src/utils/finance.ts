// Pure finance maths for the reworked Finances tab. Everything the view shows —
// scope-filtered month totals, extra income, the stacked outflow, the tag
// breakdown, and debt interest/positions — is derived here from plain arrays so
// it is testable without a store and can never drift from a stored running total
// (there isn't one).

import type { Debt, FinScope, ScopeFilter, Txn } from '@/types'

export const UNTAGGED = 'Untagged'

// A scope filter of 'all' matches both; otherwise it must match exactly. Nothing
// leaks across scopes.
export function inScope(scope: FinScope, filter: ScopeFilter): boolean {
  return filter === 'all' || scope === filter
}

export function monthOf(date: string): string {
  return (date || '').slice(0, 7)
}

export interface TxnQuery {
  scope: ScopeFilter
  monthKey?: string
  kind?: Txn['kind']
}

export function filterTxns(txns: Txn[], q: TxnQuery): Txn[] {
  return txns.filter(
    (t) =>
      inScope(t.scope, q.scope) &&
      (!q.monthKey || monthOf(t.date) === q.monthKey) &&
      (!q.kind || t.kind === q.kind),
  )
}

export interface MonthTotals {
  incomeReceived: number
  incomeExpected: number // unconfirmed recurring income
  out: number // all expense outflow, incl. debt repayments
  debtRepay: number // subset of out linked to a debt
  net: number // received − out
}

export function monthTotals(txns: Txn[], scope: ScopeFilter, monthKey: string): MonthTotals {
  const month = filterTxns(txns, { scope, monthKey })
  let incomeReceived = 0
  let incomeExpected = 0
  let out = 0
  let debtRepay = 0
  for (const t of month) {
    const amt = Number.isFinite(t.amount) ? t.amount : 0
    if (t.kind === 'income') {
      if (t.confirmed === false) incomeExpected += amt
      else incomeReceived += amt
    } else {
      out += amt
      if (t.debtId != null) debtRepay += amt
    }
  }
  return { incomeReceived, incomeExpected, out, debtRepay, net: incomeReceived - out }
}

// Extra income = received beyond the baseline/expected monthly figure.
export function extraIncome(received: number, baseline: number): number {
  return Math.max(0, received - baseline)
}

export type BalanceLevel = 'good' | 'warn' | 'bad' | 'over'
export interface BalanceState {
  remaining: number
  level: BalanceLevel
  over: boolean
  overBy: number
}

// Remaining against a chosen income basis (baseline or received). Thresholds:
// green >40% left, amber 15–40%, red <15%, distinct over-budget state.
export function balanceState(incomeBasis: number, out: number): BalanceState {
  const remaining = incomeBasis - out
  if (remaining < 0) return { remaining, level: 'over', over: true, overBy: -remaining }
  const pctLeft = incomeBasis > 0 ? (remaining / incomeBasis) * 100 : remaining > 0 ? 100 : 0
  const level: BalanceLevel = pctLeft > 40 ? 'good' : pctLeft >= 15 ? 'warn' : 'bad'
  return { remaining, level, over: false, overBy: 0 }
}

export interface CategorySegment {
  category: string
  total: number
  pct: number // share of total outflow
}

// The stacked outflow bar: expenses grouped by category, largest first.
export function categoryOutflow(
  txns: Txn[],
  scope: ScopeFilter,
  monthKey: string,
): CategorySegment[] {
  const expenses = filterTxns(txns, { scope, monthKey, kind: 'expense' })
  const totals = new Map<string, number>()
  let sum = 0
  for (const t of expenses) {
    const amt = Number.isFinite(t.amount) ? t.amount : 0
    totals.set(t.category || 'Other', (totals.get(t.category || 'Other') || 0) + amt)
    sum += amt
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total, pct: sum > 0 ? (total / sum) * 100 : 0 }))
    .sort((a, b) => b.total - a.total)
}

export interface TagRow {
  name: string
  spent: number
  earned: number
  net: number
  count: number
}

// Per-tag spend/earn for the month. A transaction's amount is split evenly across
// its tags (untagged → the Untagged bucket), so the spent/earned columns sum back
// to the month totals with no double counting, while a multi-tag transaction
// still shows up under each of its tags. `count` is the full transaction count
// carrying the tag (not split).
export function tagBreakdown(txns: Txn[], scope: ScopeFilter, monthKey: string): TagRow[] {
  const month = filterTxns(txns, { scope, monthKey })
  const rows = new Map<string, TagRow>()
  const row = (name: string) => {
    let r = rows.get(name)
    if (!r) {
      r = { name, spent: 0, earned: 0, net: 0, count: 0 }
      rows.set(name, r)
    }
    return r
  }
  for (const t of month) {
    const amt = Number.isFinite(t.amount) ? t.amount : 0
    const tags = t.tags && t.tags.length ? t.tags : [UNTAGGED]
    const share = amt / tags.length
    for (const name of tags) {
      const r = row(name)
      if (t.kind === 'expense') r.spent += share
      else r.earned += share
      r.count += 1
    }
  }
  for (const r of rows.values()) r.net = r.earned - r.spent
  return [...rows.values()].sort((a, b) => b.spent - a.spent)
}

// ---- debts ----------------------------------------------------------------
function yearsBetween(startDate: string, asOf: number): number {
  const start = Date.parse(startDate + 'T00:00:00')
  if (Number.isNaN(start) || asOf <= start) return 0
  return (asOf - start) / (365.25 * 86_400_000)
}

export function debtPaid(debt: Debt): number {
  return (debt.payments || []).reduce((s, p) => s + (Number.isFinite(p.amount) ? p.amount : 0), 0)
}

// Interest accrued to `asOf`, simple or compound per the debt's interestType.
export function accruedInterest(debt: Debt, asOf: number): number {
  const rate = debt.interestRatePct || 0
  if (!rate || debt.interestType === 'none' || !debt.interestType) return 0
  const t = yearsBetween(debt.startDate, asOf)
  if (t <= 0) return 0
  if (debt.interestType === 'compound') {
    return debt.principal * (Math.pow(1 + rate / 100, t) - 1)
  }
  return debt.principal * (rate / 100) * t
}

// What is still outstanding: principal + accrued interest − payments, floored at 0.
export function debtOutstanding(debt: Debt, asOf: number): number {
  return Math.max(0, debt.principal + accruedInterest(debt, asOf) - debtPaid(debt))
}

export function isOverdue(debt: Debt, now: number): boolean {
  if (debt.status === 'settled' || debt.status === 'written_off') return false
  if (!debt.dueDate) return false
  const due = Date.parse(debt.dueDate + 'T23:59:59')
  return !Number.isNaN(due) && now > due && debtOutstanding(debt, now) > 0
}

// The effective status shown on a card: a stored settled/written_off wins;
// otherwise open, flipping to overdue past the due date with a balance left.
export function effectiveDebtStatus(debt: Debt, now: number): Debt['status'] {
  if (debt.status === 'settled' || debt.status === 'written_off') return debt.status
  if (debtOutstanding(debt, now) <= 0) return 'settled'
  return isOverdue(debt, now) ? 'overdue' : 'open'
}

export interface DebtSummary {
  iOwe: number
  owedToMe: number
  net: number // owedToMe − iOwe (positive is good)
  overdueCount: number
}

export function debtSummary(debts: Debt[], scope: ScopeFilter, now: number): DebtSummary {
  let iOwe = 0
  let owedToMe = 0
  let overdueCount = 0
  for (const d of debts) {
    if (!inScope(d.scope, scope)) continue
    if (d.status === 'written_off') continue
    const out = debtOutstanding(d, now)
    if (out <= 0) continue
    if (d.direction === 'owed_by_me') iOwe += out
    else owedToMe += out
    if (isOverdue(d, now)) overdueCount += 1
  }
  return { iOwe, owedToMe, net: owedToMe - iOwe, overdueCount }
}

// ---- migration ------------------------------------------------------------
// One-time lift of the legacy `finances` (expense-only) array into the unified
// transactions collection: personal scope, no tags, keeping id/amount/date/note.
export function migrateExpenses(
  finances: {
    id: number
    amount: number
    category: string
    note: string
    date: string
    createdAt?: number
    updatedAt?: number
  }[],
): Txn[] {
  return finances.map((f) => ({
    id: f.id,
    kind: 'expense' as const,
    scope: 'personal' as const,
    amount: f.amount,
    date: f.date,
    note: f.note || '',
    category: f.category || 'Other',
    tags: [],
    debtId: null,
    createdAt: f.createdAt ?? Date.now(),
    updatedAt: f.updatedAt ?? Date.now(),
  }))
}
