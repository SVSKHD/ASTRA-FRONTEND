// Section 27b — recurring transactions, acceptance 142.
import { describe, expect, it } from 'vitest'
import {
  describeRecurrence,
  existingDates,
  parseTxnRecurrence,
  pendingOccurrences,
  serializeTxnRecurrence,
} from '@/utils/txnRecurring'
import { toMinor } from '@/utils/money'
import type { Recurrence } from '@/utils/recurrence'
import type { Txn } from '@/types'

let seq = 0
function txn(over: Partial<Txn> & { amount?: number } = {}): Txn {
  const { amount, ...rest } = over
  return {
    id: ++seq,
    kind: 'expense',
    scope: 'personal',
    amountMinor: toMinor(amount ?? 45000),
    date: '2026-01-05',
    note: 'Rent',
    category: 'Rent',
    tags: [],
    debtId: null,
    createdAt: 0,
    updatedAt: 0,
    ...rest,
  }
}

const monthly = (day: number, over: Partial<Recurrence> = {}): Recurrence => ({
  enabled: true,
  freq: 'monthly',
  daysOfWeek: [],
  timeOfDay: '09:00',
  timezone: 'Asia/Kolkata',
  startDate: '2026-01-01',
  endDate: null,
  dayOfMonth: day,
  ...over,
})

describe('generating occurrences', () => {
  it('produces one row per firing date up to today', () => {
    const template = txn({ isRecurring: true })
    const out = pendingOccurrences(template, monthly(5), [template], '2026-03-31')
    expect(out.map((o) => o.date)).toEqual(['2026-01-05', '2026-02-05', '2026-03-05'])
  })

  it('never generates into the future', () => {
    // A future rent row sits in the list as if it had been paid and drags the
    // running balance down by money that has not moved.
    const template = txn({ isRecurring: true })
    const out = pendingOccurrences(template, monthly(5), [template], '2026-02-10')
    expect(out.map((o) => o.date)).toEqual(['2026-01-05', '2026-02-05'])
  })

  it('is idempotent — running it twice writes nothing the second time', () => {
    // This is the property the whole design rests on. An occurrence is real
    // money in a real total: generating one twice is not a cosmetic duplicate,
    // it is a month that says the rent was paid twice. Running on every app
    // load, on two devices at once, has to be safe.
    const template = txn({ isRecurring: true })
    const first = pendingOccurrences(template, monthly(5), [template], '2026-03-31')
    const written: Txn[] = [
      template,
      ...first.map((o, i) => ({ ...(o.fields as Txn), id: 1000 + i, createdAt: 0, updatedAt: 0 })),
    ]
    expect(pendingOccurrences(template, monthly(5), written, '2026-03-31')).toEqual([])
  })

  it('fills a gap without re-writing the rows around it', () => {
    const template = txn({ isRecurring: true })
    const already: Txn[] = [
      template,
      txn({ id: 900, date: '2026-01-05', recurringId: template.id }),
      txn({ id: 901, date: '2026-03-05', recurringId: template.id }),
    ]
    const out = pendingOccurrences(template, monthly(5), already, '2026-03-31')
    expect(out.map((o) => o.date)).toEqual(['2026-02-05'])
  })

  it('does not let a generated row generate rows of its own', () => {
    const template = txn({ isRecurring: true })
    const out = pendingOccurrences(template, monthly(5), [template], '2026-02-28')
    expect(out.every((o) => o.fields.isRecurring === false)).toBe(true)
    expect(out.every((o) => o.fields.recurringId === template.id)).toBe(true)
  })

  it('writes a recurring income unconfirmed, since due is not received', () => {
    const template = txn({ isRecurring: true, kind: 'income', category: 'Salary' })
    const out = pendingOccurrences(template, monthly(1), [template], '2026-02-28')
    expect(out.every((o) => o.fields.confirmed === false)).toBe(true)
  })

  it('carries the template through unchanged otherwise', () => {
    const template = txn({ isRecurring: true, method: 'bank', tags: ['home'], party: 'Landlord' })
    const [first] = pendingOccurrences(template, monthly(5), [template], '2026-01-31')
    expect(first.fields).toMatchObject({
      amountMinor: toMinor(45000),
      category: 'Rent',
      method: 'bank',
      party: 'Landlord',
      tags: ['home'],
    })
  })

  it('generates nothing while the rule is off', () => {
    const template = txn({ isRecurring: true })
    expect(pendingOccurrences(template, monthly(5, { enabled: false }), [], '2026-12-31')).toEqual(
      [],
    )
  })

  it('generates nothing before the rule starts', () => {
    const template = txn({ isRecurring: true })
    const rec = monthly(5, { startDate: '2026-06-01' })
    expect(pendingOccurrences(template, rec, [template], '2026-03-31')).toEqual([])
  })
})

describe('finding what is already written', () => {
  it('keys by date, so two devices agree on what exists', () => {
    const dates = existingDates(
      [txn({ recurringId: 7, date: '2026-01-05' }), txn({ recurringId: 8, date: '2026-01-06' })],
      7,
    )
    expect([...dates]).toEqual(['2026-01-05'])
  })
})

describe('describing a rule', () => {
  it('says it in words a person would use', () => {
    expect(describeRecurrence(monthly(5))).toBe('Monthly on the 5th')
    expect(describeRecurrence(monthly(1))).toBe('Monthly on the 1st')
    expect(describeRecurrence(monthly(2))).toBe('Monthly on the 2nd')
    expect(describeRecurrence(monthly(3))).toBe('Monthly on the 3rd')
    expect(describeRecurrence(monthly(22))).toBe('Monthly on the 22nd')
  })

  it('gets the teens right, which is where every ordinal helper breaks', () => {
    expect(describeRecurrence(monthly(11))).toBe('Monthly on the 11th')
    expect(describeRecurrence(monthly(12))).toBe('Monthly on the 12th')
    expect(describeRecurrence(monthly(13))).toBe('Monthly on the 13th')
  })

  it('describes the other frequencies', () => {
    expect(describeRecurrence(monthly(5, { freq: 'daily' }))).toBe('Every day')
    expect(describeRecurrence(monthly(5, { freq: 'weekdays' }))).toBe('Every weekday')
    expect(describeRecurrence(monthly(5, { freq: 'weekly', daysOfWeek: [1, 5] }))).toBe(
      'Every Mon, Fri',
    )
  })

  it('is derived from the rule, so an edited schedule cannot leave a stale sentence', () => {
    expect(describeRecurrence(monthly(5, { enabled: false }))).toBe('Not repeating')
    expect(describeRecurrence(monthly(5, { freq: 'weekly', daysOfWeek: [] }))).toBe('Not repeating')
  })
})

describe('reading a stored rule', () => {
  const rule = monthly(5)

  it('round-trips', () => {
    expect(parseTxnRecurrence(serializeTxnRecurrence(rule))).toEqual(rule)
  })

  it('degrades to null rather than throwing on a malformed rule', () => {
    // This field has been on the document since before the feature existed. A
    // parse error here would take the whole workspace load down with it.
    expect(parseTxnRecurrence('not json')).toBeNull()
    expect(parseTxnRecurrence('{"freq":"hourly","startDate":"2026-01-01"}')).toBeNull()
    expect(parseTxnRecurrence('{"freq":"monthly"}')).toBeNull()
    expect(parseTxnRecurrence('null')).toBeNull()
    expect(parseTxnRecurrence('')).toBeNull()
    expect(parseTxnRecurrence(undefined)).toBeNull()
  })

  it('treats a rule that does not say it is enabled as disabled', () => {
    // Defaulting the other way would have a corrupted field start writing
    // transactions.
    const parsed = parseTxnRecurrence('{"freq":"monthly","startDate":"2026-01-01"}')
    expect(parsed?.enabled).toBe(false)
    expect(pendingOccurrences(txn({ isRecurring: true }), parsed!, [], '2026-12-31')).toEqual([])
  })

  it('drops a weekday that is not a weekday', () => {
    const parsed = parseTxnRecurrence(
      '{"enabled":true,"freq":"weekly","startDate":"2026-01-01","daysOfWeek":[1,9,"x",-2,5]}',
    )
    expect(parsed?.daysOfWeek).toEqual([1, 5])
  })
})
