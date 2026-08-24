// Section 27b — the exports. Byte-exact, because a subtly malformed CSV is not
// noticed until it has been opened elsewhere and the columns have shifted.
import { describe, expect, it } from 'vitest'
import {
  CSV_COLUMNS,
  csvAmount,
  csvField,
  csvFilename,
  debtsToCsv,
  monthSummaryMarkdown,
  transactionsToCsv,
} from '@/utils/financeExport'
import { toMinor } from '@/utils/money'
import type { Debt, Txn, TxnCategory } from '@/types'

const CATEGORIES: TxnCategory[] = [
  { id: 1, name: 'Food', icon: 'rupee', color: '#f00', kind: 'expense' },
  { id: 2, name: 'Rent', icon: 'notebook', color: '#00f', kind: 'expense' },
]

let seq = 0
function txn(over: Partial<Txn> & { amount?: number } = {}): Txn {
  const { amount, ...rest } = over
  return {
    id: ++seq,
    kind: 'expense',
    scope: 'personal',
    amountMinor: toMinor(amount ?? 500),
    date: '2026-07-10',
    note: '',
    category: 'Food',
    tags: [],
    debtId: null,
    createdAt: 0,
    updatedAt: 0,
    ...rest,
  }
}

describe('CSV quoting', () => {
  it('quotes a field with a comma, and only when it has to', () => {
    expect(csvField('Coffee')).toBe('Coffee')
    expect(csvField('Coffee, tea')).toBe('"Coffee, tea"')
  })

  it('doubles an embedded quote, per RFC 4180', () => {
    // Not a backslash. Every hand-rolled escaper reaches for the backslash
    // first, and no spreadsheet on earth reads it.
    expect(csvField('He said "hi"')).toBe('"He said ""hi"""')
  })

  it('quotes a newline rather than letting it end the row', () => {
    expect(csvField('one\ntwo')).toBe('"one\ntwo"')
  })

  it('quotes surrounding whitespace, which some parsers strip', () => {
    expect(csvField(' padded ')).toBe('" padded "')
  })

  it('turns null and undefined into an empty field, not "null"', () => {
    expect(csvField(null)).toBe('')
    expect(csvField(undefined)).toBe('')
  })
})

describe('the amount column', () => {
  it('is a plain decimal, not a formatted currency', () => {
    // ₹1,500.50 is a STRING in every spreadsheet that opens it: the grouping
    // commas break the column and the symbol makes it text. The currency gets
    // its own column instead.
    expect(csvAmount(toMinor(1500.5))).toBe('1500.50')
    expect(csvAmount(toMinor(1500))).toBe('1500.00')
    expect(csvAmount(toMinor(1500.5))).not.toContain('₹')
    expect(csvAmount(toMinor(150000))).not.toContain(',')
  })
})

describe('the transactions CSV', () => {
  const rows = [
    txn({ date: '2026-07-15', amount: 45000, category: 'Rent', method: 'bank', note: 'July' }),
    txn({ date: '2026-07-01', amount: 500, note: 'Coffee, with Ravi', tags: ['work', 'client'] }),
    txn({ date: '2026-08-01', amount: 200 }),
  ]

  it('leads with the header row', () => {
    expect(transactionsToCsv(rows).split('\r\n')[0]).toBe(CSV_COLUMNS.join(','))
  })

  it('sorts oldest first, the way a ledger is read', () => {
    const dates = transactionsToCsv(rows)
      .trim()
      .split('\r\n')
      .slice(1)
      .map((line) => line.split(',')[0])
    expect(dates).toEqual(['2026-07-01', '2026-07-15', '2026-08-01'])
  })

  it('bounds the range inclusively at both ends', () => {
    const csv = transactionsToCsv(rows, { from: '2026-07-01', to: '2026-07-31' })
    expect(csv.trim().split('\r\n')).toHaveLength(3) // header + 2
    expect(csv).not.toContain('2026-08-01')
  })

  it('survives a note with a comma in it', () => {
    // The single most common way a hand-rolled CSV silently shifts every column
    // to the right of the note.
    const csv = transactionsToCsv([rows[1]])
    const cells = csv.trim().split('\r\n')[1]
    expect(cells).toContain('"Coffee, with Ravi"')
    expect(cells.split(',')).toHaveLength(CSV_COLUMNS.length + 1) // the quoted comma
  })

  it('names the direction rather than signing the amount', () => {
    const csv = transactionsToCsv([txn({ kind: 'income', amount: 85000 })])
    expect(csv).toContain(',In,85000.00,INR,')
  })

  it('ends with a newline', () => {
    // A file without one makes wc -l disagree with the row count and upsets a
    // surprising number of line-oriented tools.
    expect(transactionsToCsv(rows).endsWith('\r\n')).toBe(true)
  })

  it('is header-only on an empty range rather than empty', () => {
    expect(transactionsToCsv([])).toBe(CSV_COLUMNS.join(',') + '\r\n')
  })

  it('names the file so it sorts and survives a shell', () => {
    expect(csvFilename('2026-07-01', '2026-07-31')).toBe(
      'aureon-transactions-2026-07-01_2026-07-31.csv',
    )
    expect(csvFilename('', '')).toBe('aureon-transactions-all.csv')
    expect(csvFilename('2026-07-01', '')).not.toContain(' ')
  })
})

describe('the month summary', () => {
  const month = [
    txn({ date: '2026-07-01', kind: 'income', amount: 85000, category: 'Salary' }),
    txn({ date: '2026-07-05', amount: 45000, category: 'Rent' }),
    txn({ date: '2026-07-10', amount: 5000, category: 'Food' }),
    txn({ date: '2026-08-01', amount: 999, category: 'Food' }), // other month
  ]
  const md = monthSummaryMarkdown({
    monthKey: '2026-07',
    transactions: month,
    categories: CATEGORIES,
  })

  it('leads with the month in words', () => {
    expect(md.split('\n')[0]).toBe('## July 2026')
  })

  it('reports in, out and net through the one formatter', () => {
    expect(md).toContain('**In** ₹85,000')
    expect(md).toContain('**Out** ₹50,000')
    expect(md).toContain('**Net** +₹35,000')
  })

  it('counts only the month it says it is', () => {
    expect(md).toContain('3 transactions')
    expect(md).not.toContain('999')
  })

  it('ranks the spend by size with a share of outflow', () => {
    const table = md.slice(md.indexOf('### Where it went'))
    expect(table.indexOf('Rent')).toBeLessThan(table.indexOf('Food'))
    expect(table).toContain('| Rent | ₹45,000 | 90% |')
  })

  it('marks a category that no longer exists rather than pretending it does', () => {
    const out = monthSummaryMarkdown({
      monthKey: '2026-07',
      transactions: [txn({ date: '2026-07-02', category: 'Ghost' })],
      categories: CATEGORIES,
    })
    expect(out).toContain('Ghost (unclassified)')
  })

  it('says so in a sentence when there is nothing, rather than printing a grid of zeros', () => {
    const empty = monthSummaryMarkdown({ monthKey: '2026-09', transactions: month, categories: [] })
    expect(empty).toContain('No transactions recorded this month.')
    expect(empty).not.toContain('### Where it went')
  })

  it('omits the debts section entirely when nothing is open', () => {
    // A heading over an empty table is the "grid of zeros" rule in a different
    // medium.
    expect(md).not.toContain('### Open debts')
  })

  it('lists open debts and their outstanding balance', () => {
    const debt: Debt = {
      id: 1,
      direction: 'owed_by_me',
      scope: 'personal',
      counterparty: 'Ravi',
      principalMinor: toMinor(10000),
      currency: 'INR',
      interestType: 'none',
      startDate: '2026-01-01',
      status: 'open',
      note: '',
      tags: [],
      payments: [{ id: 1, amountMinor: toMinor(4000), date: '2026-06-01', note: '' }],
      createdAt: 0,
      updatedAt: 0,
    }
    const out = monthSummaryMarkdown({
      monthKey: '2026-07',
      transactions: month,
      categories: CATEGORIES,
      debts: [debt, { ...debt, id: 2, status: 'settled' }],
      now: Date.parse('2026-07-31T00:00:00'),
    })
    expect(out).toContain('### Open debts')
    expect(out).toContain('| Ravi | I owe | ₹6,000 |')
    // The settled one is not listed.
    expect(out.match(/\| Ravi \|/g)).toHaveLength(1)
  })
})

describe('the debts CSV', () => {
  it('reports principal and outstanding as separate plain decimals', () => {
    const debt: Debt = {
      id: 1,
      direction: 'owed_to_me',
      scope: 'business',
      counterparty: 'Client, Inc',
      principalMinor: toMinor(10000),
      currency: 'INR',
      interestType: 'none',
      startDate: '2026-01-01',
      status: 'open',
      note: '',
      tags: [],
      payments: [{ id: 1, amountMinor: toMinor(2500), date: '2026-06-01', note: '' }],
      createdAt: 0,
      updatedAt: 0,
    }
    const csv = debtsToCsv([debt], Date.parse('2026-07-31T00:00:00'))
    expect(csv).toContain('"Client, Inc"')
    expect(csv).toContain('10000.00,7500.00')
  })
})
