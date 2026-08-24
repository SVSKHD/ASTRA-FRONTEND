// Section 27b — the grouped list, acceptance 141.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import TransactionList from '@/components/finance/TransactionList.vue'
import TxnRow from '@/components/finance/TxnRow.vue'
import { toMinor } from '@/utils/money'
import type { Txn, TxnCategory } from '@/types'

const CATEGORIES: TxnCategory[] = [
  { id: 1, name: 'Food', icon: 'rupee', color: 'oklch(0.72 0.14 45)', kind: 'expense' },
  { id: 2, name: 'Salary', icon: 'rupee', color: 'oklch(0.72 0.14 150)', kind: 'income' },
]

let seq = 0
function txn(over: Partial<Txn> & { amount?: number }): Txn {
  const { amount, ...rest } = over
  return {
    id: ++seq,
    kind: 'expense',
    scope: 'personal',
    amountMinor: toMinor(amount ?? 100),
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

const mountList = (transactions: Txn[], props: Record<string, unknown> = {}) =>
  mount(TransactionList, { props: { transactions, categories: CATEGORIES, ...props } })

describe('the grouping', () => {
  it('puts a heading on each month and each day', () => {
    const w = mountList([
      txn({ date: '2026-07-20', amount: 500 }),
      txn({ date: '2026-06-15', amount: 200 }),
    ])
    expect(w.text()).toContain('July 2026')
    expect(w.text()).toContain('June 2026')
    expect(w.findAll('.txl__day')).toHaveLength(2)
  })

  it('nets each day rather than summing magnitudes', () => {
    const w = mountList([
      txn({ kind: 'income', amount: 1000, date: '2026-07-01', category: 'Salary' }),
      txn({ kind: 'expense', amount: 400, date: '2026-07-01' }),
    ])
    expect(w.find('.txl__daynet').text()).toBe('+₹600')
  })

  it('keeps the month header stuck, since a scrolled list stops saying which month', () => {
    const source = readFileSync(resolve(__dirname, 'TransactionList.vue'), 'utf8')
    const at = source.indexOf('.txl__monthhead {')
    const rule = source.slice(at, source.indexOf('}', at))
    expect(rule).toContain('position: sticky')
    // Opaque, not a tint: a translucent sticky header lets the rows it is meant
    // to cover read straight through it.
    expect(rule).toContain('background: var(--bg-base')
  })
})

describe('the running balance', () => {
  it('shows the balance after each row', () => {
    const w = mountList([
      txn({ kind: 'income', amount: 1000, date: '2026-07-01', category: 'Salary' }),
      txn({ kind: 'expense', amount: 300, date: '2026-07-02' }),
    ])
    const balances = w.findAll('.txr__balance').map((b) => b.text())
    // Newest first: ₹700 then ₹1,000.
    expect(balances).toEqual(['₹700', '₹1,000'])
  })

  it('continues from an opening balance rather than restarting at zero', () => {
    const w = mountList([txn({ amount: 200, date: '2026-07-01' })], {
      openingMinor: toMinor(5000),
    })
    expect(w.find('.txr__balance').text()).toBe('₹4,800')
  })

  it('can be turned off', () => {
    const w = mountList([txn({ amount: 200 })], { showBalance: false })
    expect(w.findAll('.txr__balance')).toHaveLength(0)
  })
})

describe('the empty states', () => {
  it('invites a first transaction when there is nothing', () => {
    // Not a grid of zeros: four rows of ₹0 look like data and are not.
    const w = mountList([])
    expect(w.text()).toContain('No transactions yet')
    expect(w.findAll('button').some((b) => b.text() === 'Add transaction')).toBe(true)
  })

  it('says the filters are the reason when they are', () => {
    // "Nothing matches" is a filter problem and "nothing yet" is an invitation.
    // One message for both sends half the readers looking for lost data.
    const w = mountList([], { filtered: true })
    expect(w.text()).toContain('No transactions match these filters')
    const clear = w.findAll('button').find((b) => b.text() === 'Clear filters')
    expect(clear).toBeDefined()
    clear!.trigger('click')
    expect(w.emitted('clear-filters')).toBeTruthy()
  })
})

describe('a row', () => {
  const mountRow = (over: Partial<Txn> & { amount?: number } = {}) =>
    mount(TxnRow, { props: { txn: txn(over), categories: CATEGORIES } })

  it('colours the amount by its sign and nothing else', () => {
    // 26c's rule, unchanged: red for "this is bad", never for "this is the
    // expenses column".
    expect(
      mountRow({ kind: 'expense', amount: 400 }).find('.txr__amount').attributes('style'),
    ).toContain('--theme-danger')
    expect(
      mountRow({ kind: 'income', amount: 400, category: 'Salary' })
        .find('.txr__amount')
        .attributes('style'),
    ).toContain('--theme-success')
  })

  it('puts the category colour on a bar, never on the text', () => {
    const source = readFileSync(resolve(__dirname, 'TxnRow.vue'), 'utf8')
    expect(source).toContain('border-left: 3px solid var(--row-bar)')
    const at = source.indexOf('.txr__title {')
    expect(source.slice(at, source.indexOf('}', at))).not.toContain('--row-bar')
  })

  it('shows the note, falling back to the category', () => {
    expect(mountRow({ note: 'Chai at the corner shop' }).find('.txr__title').text()).toBe(
      'Chai at the corner shop',
    )
    expect(mountRow({ note: '' }).find('.txr__title').text()).toBe('Food')
  })

  it('names the method as a chip rather than a colour', () => {
    expect(mountRow({ method: 'upi' }).text()).toContain('UPI')
  })

  it('gives every text cell a width it may not exceed (26d rule 3)', () => {
    const source = readFileSync(resolve(__dirname, 'TxnRow.vue'), 'utf8')
    for (const selector of ['.txr__text', '.txr__title', '.txr__meta', '.txr__cell']) {
      const at = source.indexOf(`${selector} {`)
      expect(at, `${selector} has no rule`).toBeGreaterThan(-1)
      expect(source.slice(at, source.indexOf('}', at))).toContain('min-width: 0')
    }
  })

  it('keeps the row actions reachable where there is no hover', () => {
    // Hover-only actions on a phone are actions that do not exist.
    const source = readFileSync(resolve(__dirname, 'TxnRow.vue'), 'utf8')
    expect(source).toContain('@media (hover: none)')
  })
})
