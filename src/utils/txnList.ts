// The transactions list: filtering, day grouping, and the running balance.
//
// All of it is pure and lives outside the component, because the running
// balance is the one number here that is easy to get subtly, invisibly wrong —
// it depends on the order rows are summed in, which is NOT the order they are
// displayed in, and a balance computed in display order looks entirely
// plausible while being wrong on every row but the first.

import type { Txn, TxnMethod, TxnKind } from '@/types'
import { inScope, monthOf, txnMinor } from '@/utils/finance'
import type { ScopeFilter } from '@/types'

export interface TxnFilters {
  scope: ScopeFilter
  /** Inclusive YYYY-MM-DD bounds. Either end may be omitted. */
  from: string
  to: string
  categories: string[]
  methods: TxnMethod[]
  tags: string[]
  kind: TxnKind | 'all'
  /** Inclusive minor-unit bounds. 0 means "no bound", not "amount of zero". */
  minMinor: number
  maxMinor: number
  search: string
}

export function emptyFilters(): TxnFilters {
  return {
    scope: 'all',
    from: '',
    to: '',
    categories: [],
    methods: [],
    tags: [],
    kind: 'all',
    minMinor: 0,
    maxMinor: 0,
    search: '',
  }
}

/** Whether anything is narrowing the list — drives the "Clear filters" affordance. */
export function isFiltered(f: TxnFilters): boolean {
  const empty = emptyFilters()
  return (
    f.scope !== empty.scope ||
    f.from !== '' ||
    f.to !== '' ||
    f.categories.length > 0 ||
    f.methods.length > 0 ||
    f.tags.length > 0 ||
    f.kind !== 'all' ||
    f.minMinor > 0 ||
    f.maxMinor > 0 ||
    f.search.trim() !== ''
  )
}

/**
 * Text search across the fields a person would actually remember: what they
 * wrote, who it was with, and which bucket it went in. Deliberately NOT the
 * amount — "500" would match ₹500, ₹1,500 and ₹500,000, and a search that
 * returns three unrelated rows for an exact recollection is worse than one that
 * returns none.
 */
function matchesSearch(t: Txn, needle: string): boolean {
  if (!needle) return true
  const q = needle.toLowerCase()
  return (
    (t.note ?? '').toLowerCase().includes(q) ||
    (t.party ?? '').toLowerCase().includes(q) ||
    (t.category ?? '').toLowerCase().includes(q) ||
    t.tags.some((tag) => tag.toLowerCase().includes(q))
  )
}

export function applyFilters(txns: Txn[], f: TxnFilters): Txn[] {
  const search = f.search.trim().toLowerCase()
  return txns.filter((t) => {
    if (!inScope(t.scope, f.scope)) return false
    if (f.kind !== 'all' && t.kind !== f.kind) return false
    if (f.from && t.date < f.from) return false
    if (f.to && t.date > f.to) return false
    if (f.categories.length && !f.categories.includes(t.category)) return false
    if (f.methods.length && (!t.method || !f.methods.includes(t.method))) return false
    // ANY of the chosen tags, not ALL: someone filtering by "goa" and "work"
    // wants both trips, not the transactions that were somehow both.
    if (f.tags.length && !t.tags.some((tag) => f.tags.includes(tag))) return false
    const amount = txnMinor(t)
    if (f.minMinor > 0 && amount < f.minMinor) return false
    if (f.maxMinor > 0 && amount > f.maxMinor) return false
    return matchesSearch(t, search)
  })
}

/** Signed minor units: an expense is negative, so a sum IS the net. */
export function signedMinor(t: Txn): number {
  return t.kind === 'income' ? txnMinor(t) : -txnMinor(t)
}

export interface TxnRowView {
  txn: Txn
  /** Balance after this transaction, counting from the oldest in the list. */
  balanceMinor: number
}

export interface DayGroup {
  date: string
  /** Net for the day: income minus outflow. */
  subtotalMinor: number
  rows: TxnRowView[]
}

export interface MonthGroup {
  monthKey: string
  days: DayGroup[]
  subtotalMinor: number
}

/**
 * Group into months and days, newest first, with a running balance.
 *
 * The balance is accumulated OLDEST FIRST and then the whole structure is
 * reversed for display. Doing it in display order would produce a column that
 * counts down from the total instead of up to it — plausible-looking and wrong
 * on every row but one, which is exactly the kind of bug that survives review.
 *
 * `openingMinor` is the balance carried in from before this window, so
 * filtering to one month does not restart the balance at zero and imply the
 * account was empty on the 1st.
 */
export function groupTransactions(txns: Txn[], openingMinor = 0): MonthGroup[] {
  // Oldest first, and stable within a day: id ascending, so two transactions
  // entered on the same date keep the order they were entered in.
  const chronological = [...txns].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id,
  )

  let balance = openingMinor
  const byDay = new Map<string, DayGroup>()
  for (const txn of chronological) {
    balance += signedMinor(txn)
    let day = byDay.get(txn.date)
    if (!day) {
      day = { date: txn.date, subtotalMinor: 0, rows: [] }
      byDay.set(txn.date, day)
    }
    day.subtotalMinor += signedMinor(txn)
    day.rows.push({ txn, balanceMinor: balance })
  }

  const byMonth = new Map<string, MonthGroup>()
  for (const day of byDay.values()) {
    const key = monthOf(day.date)
    let month = byMonth.get(key)
    if (!month) {
      month = { monthKey: key, days: [], subtotalMinor: 0 }
      byMonth.set(key, month)
    }
    month.days.push(day)
    month.subtotalMinor += day.subtotalMinor
  }

  // Reverse for display: newest month, newest day, newest row.
  for (const month of byMonth.values()) {
    month.days.reverse()
    for (const day of month.days) day.rows.reverse()
  }
  return [...byMonth.values()].reverse()
}

/** The closing balance of a grouped list — the first row of the newest day. */
export function closingBalance(groups: MonthGroup[], openingMinor = 0): number {
  return groups[0]?.days[0]?.rows[0]?.balanceMinor ?? openingMinor
}

export interface ListTotals {
  inMinor: number
  outMinor: number
  netMinor: number
  count: number
}

export function listTotals(txns: Txn[]): ListTotals {
  let inMinor = 0
  let outMinor = 0
  for (const t of txns) {
    if (t.kind === 'income') inMinor += txnMinor(t)
    else outMinor += txnMinor(t)
  }
  return { inMinor, outMinor, netMinor: inMinor - outMinor, count: txns.length }
}
