// Pure finance maths for the reworked Finances tab. Everything the view shows —
// scope-filtered month totals, extra income, the stacked outflow, the tag
// breakdown, and debt interest/positions — is derived here from plain arrays so
// it is testable without a store and can never drift from a stored running total
// (there isn't one).

import type { Debt, DebtPayment, FinScope, ScopeFilter, Txn } from '@/types'
import { toMinor } from '@/utils/money'

export const UNTAGGED = 'Untagged'

// ---- minor units (section 27b, acceptance 143) ------------------------------
// Every figure below is an INTEGER count of paise. It was rupees-as-a-float
// until 27b, and the change is not cosmetic: these functions sum long lists and
// feed a running balance, which is a chain of additions shown to the user, so a
// float drifts visibly and with no bad row to blame.
//
// Rows written before the change carry `amount` (rupees, float) and no
// `amountMinor`. Rather than requiring a migration to have run before anything
// can be read, the accessors below convert on read, and `migrateTxnAmounts`
// makes it permanent the first time the workspace loads.

/** A transaction's amount in paise, converting a legacy float row on the fly. */
export function txnMinor(t: Pick<Txn, 'amountMinor' | 'amount'>): number {
  if (Number.isFinite(t.amountMinor)) return t.amountMinor as number
  return Number.isFinite(t.amount) ? toMinor(t.amount as number) : 0
}

export function paymentMinor(p: Pick<DebtPayment, 'amountMinor' | 'amount'>): number {
  if (Number.isFinite(p.amountMinor)) return p.amountMinor as number
  return Number.isFinite(p.amount) ? toMinor(p.amount as number) : 0
}

export function principalMinor(d: Pick<Debt, 'principalMinor' | 'principal'>): number {
  if (Number.isFinite(d.principalMinor)) return d.principalMinor as number
  return Number.isFinite(d.principal) ? toMinor(d.principal as number) : 0
}

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
    const amt = txnMinor(t)
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
    const amt = txnMinor(t)
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
    const amt = txnMinor(t)
    const tags = t.tags && t.tags.length ? t.tags : [UNTAGGED]
    // Rounded, so the per-tag columns stay whole paise. The rounding error is
    // at most one paisa per tag on a multi-tag row, which is invisible against
    // a figure a person would notice and is the price of not reintroducing a
    // float into a column that gets summed.
    const share = Math.round(amt / tags.length)
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
  return (debt.payments || []).reduce((sum, p) => sum + paymentMinor(p), 0)
}

// Interest accrued to `asOf`, simple or compound per the debt's interestType.
export function accruedInterest(debt: Debt, asOf: number): number {
  const rate = debt.interestRatePct || 0
  if (!rate || debt.interestType === 'none' || !debt.interestType) return 0
  const t = yearsBetween(debt.startDate, asOf)
  if (t <= 0) return 0
  if (debt.interestType === 'compound') {
    return Math.round(principalMinor(debt) * (Math.pow(1 + rate / 100, t) - 1))
  }
  return Math.round(principalMinor(debt) * (rate / 100) * t)
}

// What is still outstanding: principal + accrued interest − payments, floored at 0.
export function debtOutstanding(debt: Debt, asOf: number): number {
  return Math.max(0, principalMinor(debt) + accruedInterest(debt, asOf) - debtPaid(debt))
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
// transactions collection: personal scope, no tags, keeping id/date/note and
// lifting the rupee float into integer paise on the way through.
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
    amountMinor: toMinor(f.amount),
    date: f.date,
    note: f.note || '',
    category: f.category || 'Other',
    tags: [],
    debtId: null,
    createdAt: f.createdAt ?? Date.now(),
    updatedAt: f.updatedAt ?? Date.now(),
  }))
}

// One-time lift of pre-27b money floats into integer minor units.
//
// It runs on load and returns NEW objects only where something changed, so a
// workspace whose rows are already migrated does not dirty itself and trigger a
// save on every open. The legacy `amount` is dropped rather than kept in sync:
// two fields holding the same number is how they end up holding two numbers.
export function migrateTxnAmounts(txns: Txn[]): { txns: Txn[]; changed: boolean } {
  let changed = false
  const migrated = txns.map((t) => {
    if (Number.isFinite(t.amountMinor) && t.amount === undefined) return t
    changed = true
    const { amount: _legacy, ...rest } = t
    return { ...rest, amountMinor: txnMinor(t) }
  })
  return { txns: changed ? migrated : txns, changed }
}

export function migrateDebtAmounts(debts: Debt[]): { debts: Debt[]; changed: boolean } {
  let changed = false
  const migrated = debts.map((d) => {
    const paymentsNeedWork = (d.payments || []).some(
      (p) => !Number.isFinite(p.amountMinor) || p.amount !== undefined,
    )
    if (Number.isFinite(d.principalMinor) && d.principal === undefined && !paymentsNeedWork)
      return d
    changed = true
    const { principal: _legacyPrincipal, ...rest } = d
    return {
      ...rest,
      principalMinor: principalMinor(d),
      payments: (d.payments || []).map((p) => {
        const { amount: _legacyAmount, ...pRest } = p
        return { ...pRest, amountMinor: paymentMinor(p) }
      }),
    }
  })
  return { debts: changed ? migrated : debts, changed }
}
