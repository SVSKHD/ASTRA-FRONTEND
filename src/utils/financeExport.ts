// Getting the data back out (section 27b).
//
// Two formats, because they answer two different questions. The CSV is "give me
// my rows so I can do something else with them" — a spreadsheet, an accountant,
// a tax return. The markdown summary is "tell me how the month went" in
// something you can paste into a message.
//
// Both are pure string builders. Nothing here touches the DOM, downloads a
// file, or reads a store, so the exact bytes are testable — which matters,
// because a CSV that is subtly malformed is not noticed until it has been
// opened somewhere else and the columns have silently shifted.

import type { Debt, Txn, TxnCategory } from '@/types'
import { formatMinor, toMajor } from '@/utils/money'
import { debtOutstanding, principalMinor, txnMinor } from '@/utils/finance'
import { monthLabel } from '@/utils/budget'
import { listTotals } from '@/utils/txnList'

export const CSV_COLUMNS = [
  'Date',
  'Direction',
  'Amount',
  'Currency',
  'Category',
  'Method',
  'Counterparty',
  'Note',
  'Tags',
  'Scope',
] as const

/**
 * One CSV field, quoted when it has to be.
 *
 * The three characters that require quoting are the comma, the double quote and
 * the newline — and a leading or trailing space, which some parsers strip. The
 * quote itself is escaped by doubling, which is the RFC 4180 rule and not the
 * backslash every hand-rolled escaper reaches for first.
 */
export function csvField(value: unknown): string {
  const text = value == null ? '' : String(value)
  const needsQuotes = /[",\r\n]/.test(text) || text !== text.trim()
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * The amount as a plain decimal — 1500.50, not ₹1,500.50.
 *
 * A currency-formatted figure in a CSV is a string in every spreadsheet that
 * opens it: the grouping commas break the column and the symbol makes it text,
 * so the first thing anyone does is a find-and-replace. The currency gets its
 * own column instead, which is the information without the damage.
 */
export function csvAmount(minor: number, currency = 'INR'): string {
  return toMajor(minor, currency).toFixed(currency === 'INR' ? 2 : 2)
}

export interface CsvOptions {
  from?: string
  to?: string
  currency?: string
}

export function transactionsToCsv(txns: Txn[], options: CsvOptions = {}): string {
  const currency = options.currency ?? 'INR'
  const rows = txns
    .filter(
      (t) => (!options.from || t.date >= options.from) && (!options.to || t.date <= options.to),
    )
    // Oldest first: a ledger export is read top to bottom, and a spreadsheet
    // sorted newest-first is the first thing the recipient re-sorts.
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id))

  const lines = [CSV_COLUMNS.join(',')]
  for (const t of rows) {
    lines.push(
      [
        csvField(t.date),
        csvField(t.kind === 'income' ? 'In' : 'Out'),
        csvField(csvAmount(txnMinor(t), currency)),
        csvField(currency),
        csvField(t.category),
        csvField(t.method ?? ''),
        csvField(t.party ?? ''),
        csvField(t.note ?? ''),
        csvField(t.tags.join(' ')),
        csvField(t.scope),
      ].join(','),
    )
  }
  // A trailing newline: a file without one makes `wc -l` disagree with the row
  // count and upsets a surprising number of line-oriented tools.
  return lines.join('\r\n') + '\r\n'
}

export interface SummaryInput {
  monthKey: string
  transactions: Txn[]
  categories: TxnCategory[]
  debts?: Debt[]
  now?: number
}

/**
 * The month as markdown.
 *
 * Sections appear only when they have something in them — a heading over an
 * empty table is the "grid of zeros" the review checklist rules out, in a
 * different medium. Figures go through formatMinor so a pasted summary reads
 * the same as the screen it came from.
 */
export function monthSummaryMarkdown(input: SummaryInput): string {
  const { monthKey, transactions, categories } = input
  const month = transactions.filter((t) => t.date.startsWith(monthKey))
  const totals = listTotals(month)
  const out: string[] = [`## ${monthLabel(monthKey)}`, '']

  if (!month.length) {
    out.push('No transactions recorded this month.', '')
    return out.join('\n')
  }

  out.push(
    `- **In** ${formatMinor(totals.inMinor)}`,
    `- **Out** ${formatMinor(totals.outMinor)}`,
    `- **Net** ${formatMinor(totals.netMinor, { signed: true })}`,
    `- ${totals.count} transaction${totals.count === 1 ? '' : 's'}`,
    '',
  )

  const spendByCategory = new Map<string, number>()
  for (const t of month) {
    if (t.kind !== 'expense') continue
    spendByCategory.set(t.category, (spendByCategory.get(t.category) ?? 0) + txnMinor(t))
  }
  if (spendByCategory.size) {
    out.push('### Where it went', '', '| Category | Amount | Share |', '| --- | ---: | ---: |')
    const ranked = [...spendByCategory.entries()].sort((a, b) => b[1] - a[1])
    for (const [name, amount] of ranked) {
      const share = totals.outMinor > 0 ? Math.round((amount / totals.outMinor) * 100) : 0
      const known = categories.some((c) => c.name === name)
      out.push(
        `| ${known ? name : `${name} (unclassified)`} | ${formatMinor(amount)} | ${share}% |`,
      )
    }
    out.push('')
  }

  const openDebts = (input.debts ?? []).filter(
    (d) => d.status !== 'settled' && d.status !== 'written_off',
  )
  if (openDebts.length) {
    const asOf = input.now ?? Date.now()
    out.push(
      '### Open debts',
      '',
      '| Counterparty | Direction | Outstanding |',
      '| --- | --- | ---: |',
    )
    for (const d of openDebts) {
      out.push(
        `| ${d.counterparty} | ${d.direction === 'owed_by_me' ? 'I owe' : 'Owed to me'} | ` +
          `${formatMinor(debtOutstanding(d, asOf))} |`,
      )
    }
    out.push('')
  }

  return out.join('\n')
}

/** A stable, sortable filename. No spaces, so it survives every shell. */
export function csvFilename(from: string, to: string): string {
  const range = from && to ? `${from}_${to}` : from || to || 'all'
  return `aureon-transactions-${range}.csv`
}

/** Kept beside the CSV builder so the debt columns cannot drift from the model. */
export function debtsToCsv(debts: Debt[], asOf: number, currency = 'INR'): string {
  const header = ['Counterparty', 'Direction', 'Principal', 'Outstanding', 'Status', 'Due', 'Scope']
  const lines = [header.join(',')]
  for (const d of debts) {
    lines.push(
      [
        csvField(d.counterparty),
        csvField(d.direction === 'owed_by_me' ? 'I owe' : 'Owed to me'),
        csvField(csvAmount(principalMinor(d), currency)),
        csvField(csvAmount(debtOutstanding(d, asOf), currency)),
        csvField(d.status),
        csvField(d.dueDate ?? ''),
        csvField(d.scope),
      ].join(','),
    )
  }
  return lines.join('\r\n') + '\r\n'
}
