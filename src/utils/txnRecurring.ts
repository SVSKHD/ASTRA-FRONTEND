// Recurring transactions (section 27b).
//
// Built on the goals occurrence code rather than beside it: `Recurrence` and
// `occurrenceDatesInRange` already encode the date maths, the DST-safety and
// the start/end bounds, and a second implementation would be a second set of
// off-by-one bugs to find. The one thing it lacked was a monthly rule, which is
// added there rather than here — rent-on-the-5th is not a finance-specific idea.
//
// The generation rule is idempotence. Materialising an occurrence writes a real
// transaction, and a real transaction is money in a total: generating one twice
// is not a cosmetic duplicate, it is a month that says the rent was paid twice.
// So each occurrence is keyed by (recurringId, date) and a date that already
// has a row is skipped — which makes running the generator on every app load,
// on two devices at once, safe.

import type { Txn } from '@/types'
import type { Recurrence } from '@/utils/recurrence'
import { occurrenceDatesInRange } from '@/utils/recurrence'

/** A template a series is generated from. It is itself a Txn, flagged. */
export type RecurringTemplate = Txn & { isRecurring: true }

export function isTemplate(t: Txn): t is RecurringTemplate {
  return t.isRecurring === true
}

/** Occurrences already written for a template, by date. */
export function existingDates(txns: Txn[], recurringId: number): Set<string> {
  const dates = new Set<string>()
  for (const t of txns) if (t.recurringId === recurringId) dates.add(t.date)
  return dates
}

export interface GeneratedOccurrence {
  fields: Omit<Txn, 'id' | 'createdAt' | 'updatedAt'>
  date: string
}

/**
 * The occurrences a template still owes, from its start through `throughDate`.
 *
 * Generated up to TODAY and no further. A future rent row would sit in the list
 * as if it had been paid and drag the running balance down by money that has
 * not moved — the whole point of the balance column is that it reflects what
 * actually happened.
 *
 * An income occurrence is written unconfirmed, because a salary that is due is
 * not a salary that has arrived; monthTotals already separates the two.
 */
export function pendingOccurrences(
  template: Txn,
  recurrence: Recurrence,
  allTxns: Txn[],
  throughDate: string,
): GeneratedOccurrence[] {
  if (!recurrence.enabled) return []
  const already = existingDates(allTxns, template.id)
  const from = recurrence.startDate || template.date
  if (throughDate < from) return []

  return occurrenceDatesInRange(recurrence, from, throughDate)
    .filter((date) => !already.has(date))
    .map((date) => ({
      date,
      fields: {
        kind: template.kind,
        scope: template.scope,
        amountMinor: template.amountMinor,
        date,
        note: template.note,
        category: template.category,
        tags: [...template.tags],
        method: template.method,
        source: template.source,
        party: template.party,
        // The occurrence is NOT itself a template — otherwise every generated
        // row would start generating rows of its own.
        isRecurring: false,
        recurringId: template.id,
        confirmed: template.kind === 'income' ? false : undefined,
        debtId: null,
      },
    }))
}

/**
 * A one-line description of a rule, for the row that shows it.
 *
 * Written from the rule rather than stored, so editing a schedule cannot leave
 * a stale sentence describing the old one.
 */
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ORDINAL_SUFFIX = (n: number): string => {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
}

export function describeRecurrence(rec: Recurrence): string {
  if (!rec.enabled) return 'Not repeating'
  switch (rec.freq) {
    case 'daily':
      return 'Every day'
    case 'weekdays':
      return 'Every weekday'
    case 'monthly': {
      const day = rec.dayOfMonth ?? 1
      return `Monthly on the ${day}${ORDINAL_SUFFIX(day)}`
    }
    case 'weekly':
    case 'custom': {
      const days = [...rec.daysOfWeek].sort((a, b) => a - b).map((d) => DOW[d] ?? '?')
      if (!days.length) return 'Not repeating'
      return `Every ${days.join(', ')}`
    }
    default:
      return 'Not repeating'
  }
}

// ---- the rule, as it is stored ---------------------------------------------
//
// `Txn.recurrenceRule` is a string on a document that has been in the field
// since before this feature, so it is parsed defensively rather than cast: a
// malformed rule must degrade to "not recurring" and leave the transaction
// alone, not throw on load and take the whole workspace with it.
//
// JSON rather than an RRULE string. RRULE is the right answer when something
// else has to read it — the calendar sync does, and that path already converts
// through `recurrenceToRepeat`. Here nothing does, and hand-rolling an RRULE
// parser to read back what we ourselves wrote is a parser to get wrong for no
// benefit.

const FREQS = new Set(['daily', 'weekdays', 'weekly', 'custom', 'monthly'])

export function serializeTxnRecurrence(rec: Recurrence): string {
  return JSON.stringify(rec)
}

export function parseTxnRecurrence(raw: string | null | undefined): Recurrence | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const r = parsed as Partial<Recurrence>
  if (typeof r.freq !== 'string' || !FREQS.has(r.freq)) return null
  if (typeof r.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.startDate)) return null
  return {
    // A rule that does not say it is enabled is not enabled. Defaulting the
    // other way would have a corrupted field start writing transactions.
    enabled: r.enabled === true,
    freq: r.freq as Recurrence['freq'],
    daysOfWeek: Array.isArray(r.daysOfWeek)
      ? r.daysOfWeek.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6)
      : [],
    timeOfDay: typeof r.timeOfDay === 'string' ? r.timeOfDay : '09:00',
    timezone: typeof r.timezone === 'string' ? r.timezone : 'UTC',
    startDate: r.startDate,
    endDate: typeof r.endDate === 'string' ? r.endDate : null,
    dayOfMonth: typeof r.dayOfMonth === 'number' ? r.dayOfMonth : undefined,
  }
}
