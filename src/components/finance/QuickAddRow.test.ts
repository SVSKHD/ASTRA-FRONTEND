// Section 27b — the quick-add row, acceptance 140.
//
// The tests are about the entry loop rather than the markup: an expenses log
// lives or dies on whether adding a ₹40 chai costs one number or five decisions.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import QuickAddRow from '@/components/finance/QuickAddRow.vue'
import { toMinor } from '@/utils/money'
import type { TxnCategory } from '@/types'

const CATEGORIES: TxnCategory[] = [
  { id: 1, name: 'Food', icon: 'rupee', color: '#f00', kind: 'expense' },
  { id: 2, name: 'Groceries', icon: 'list', color: '#0f0', kind: 'expense' },
  { id: 3, name: 'Salary', icon: 'rupee', color: '#00f', kind: 'income' },
  { id: 4, name: 'Old', icon: 'x', color: '#999', kind: 'expense', archived: true },
]

// GlassDatePicker reads the ui store for the theme, so the row needs a pinia
// even though it holds no state of its own.
beforeEach(() => setActivePinia(createPinia()))

const mountRow = (props: Record<string, unknown> = {}) =>
  mount(QuickAddRow, { props: { categories: CATEGORIES, ...props } })

const amountField = (w: ReturnType<typeof mountRow>) => w.find('input[aria-label="Amount"]')
const sentenceField = (w: ReturnType<typeof mountRow>) => w.find('input[aria-label="Transaction"]')

describe('the fast path', () => {
  it('needs only an amount — everything else is defaulted', async () => {
    // Out, today, and the last category used. A row that demands five decisions
    // to record a chai gets used twice and then abandoned.
    const w = mountRow({ lastCategory: 'Food' })
    await amountField(w).setValue('40')
    await w.find('form').trigger('submit')
    const draft = w.emitted('add')?.[0]?.[0] as Record<string, unknown>
    expect(draft.amountMinor).toBe(toMinor(40))
    expect(draft.kind).toBe('expense')
    expect(draft.category).toBe('Food')
  })

  it('will not submit without one', async () => {
    const w = mountRow()
    await w.find('form').trigger('submit')
    expect(w.emitted('add')).toBeUndefined()
  })

  it('will not submit a zero or an unparseable amount', async () => {
    const w = mountRow()
    for (const value of ['0', 'abc', '']) {
      await amountField(w).setValue(value)
      await w.find('form').trigger('submit')
    }
    expect(w.emitted('add')).toBeUndefined()
  })

  it('takes the shorthand people type', async () => {
    const w = mountRow()
    await amountField(w).setValue('2k')
    await w.find('form').trigger('submit')
    expect((w.emitted('add')![0][0] as { amountMinor: number }).amountMinor).toBe(toMinor(2000))
  })
})

describe('adding three things in a row', () => {
  it('clears the amount but keeps the date, category and direction', async () => {
    // Entering three purchases from the same afternoon should not mean setting
    // the date three times. The amount clears because it is the one field that
    // is always different.
    const w = mountRow({ lastCategory: 'Groceries' })
    await amountField(w).setValue('40')
    await w.find('form').trigger('submit')
    await nextTick()
    expect((amountField(w).element as HTMLInputElement).value).toBe('')

    await amountField(w).setValue('120')
    await w.find('form').trigger('submit')
    const drafts = w.emitted('add')!.map((e) => e[0] as Record<string, unknown>)
    expect(drafts).toHaveLength(2)
    expect(drafts[1].category).toBe('Groceries')
    expect(drafts[1].date).toBe(drafts[0].date)
  })
})

describe('the one-line mode', () => {
  it('shows what it understood before anything is written', async () => {
    // This is what makes an aggressive parser safe: a wrong guess is visible
    // and one click from fixed rather than silently committed.
    const w = mountRow()
    await w
      .findAll('button')
      .find((b) => b.text() === 'One line')!
      .trigger('click')
    await sentenceField(w).setValue('450 groceries upi yesterday')
    await nextTick()
    const chips = w.find('[aria-label="Parsed so far"]').text()
    expect(chips).toContain('Amount: 450')
    expect(chips).toContain('Category: Groceries')
    expect(chips).toContain('Method: UPI')
  })

  it('submits what the chips showed', async () => {
    const w = mountRow()
    await w
      .findAll('button')
      .find((b) => b.text() === 'One line')!
      .trigger('click')
    await sentenceField(w).setValue('450 groceries upi')
    await w.find('form').trigger('submit')
    const draft = w.emitted('add')![0][0] as Record<string, unknown>
    expect(draft.amountMinor).toBe(toMinor(450))
    expect(draft.category).toBe('Groceries')
    expect(draft.method).toBe('upi')
  })

  it('says what to type rather than sitting inert', async () => {
    const w = mountRow()
    await w
      .findAll('button')
      .find((b) => b.text() === 'One line')!
      .trigger('click')
    await sentenceField(w).setValue('groceries')
    await nextTick()
    expect(w.text()).toContain('Start with an amount')
  })

  it('leaves an unrecognised category empty rather than inventing one', async () => {
    // Turning the note's first word into a category is how a category list
    // becomes a list of typos.
    const w = mountRow()
    await w
      .findAll('button')
      .find((b) => b.text() === 'One line')!
      .trigger('click')
    await sentenceField(w).setValue('450 chai at the corner shop')
    await w.find('form').trigger('submit')
    const draft = w.emitted('add')![0][0] as Record<string, unknown>
    expect(draft.category).toBe('')
    expect(draft.note).toBe('chai at the corner shop')
  })
})

describe('the controls', () => {
  it('uses no native form control (26d rule 3)', () => {
    const w = mountRow()
    expect(w.findAll('select')).toHaveLength(0)
  })

  it('asks for a numeric keypad on the amount', () => {
    // On a phone, an alphabetic keyboard for a field that only ever takes
    // digits is a tap and a squint per entry.
    expect(amountField(mountRow()).attributes('inputmode')).toBe('decimal')
  })
})
