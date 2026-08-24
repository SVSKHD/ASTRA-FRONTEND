// "450 groceries upi yesterday" → a transaction (section 27b).
//
// The single-field entry exists because the quick-add row, fast as it is, is
// still five controls: amount, direction, category, date, note. Typing one line
// is faster than tabbing through five, and the line is roughly what a person
// would write in a paper cash book anyway.
//
// Two rules shape the whole parser:
//
//  1. **Every token is claimed by at most one field, and the leftovers are the
//     note.** A parser that reads the amount but silently drops "groceries"
//     produces a row that is technically correct and useless a month later.
//  2. **A guess the parser is unsure of is shown, not applied.** It returns
//     chips describing what it understood so the reader can see "Out · Food ·
//     UPI · yesterday" BEFORE committing. That is what makes an aggressive
//     parser safe: being wrong is visible and one click from fixed.
//
// It follows the shorthand pattern the goals importer established — recognise a
// token by its shape, strip it, keep the remainder as prose — rather than
// inventing a second grammar for the same job.

import { parseDateFragment, ymdOf } from '@/utils/dateParse'
import { parseMoney } from '@/utils/money'
import type { TxnMethod, TxnKind } from '@/types'

export interface ParsedChip {
  /** Which field this token filled. */
  field: 'amount' | 'direction' | 'category' | 'method' | 'date' | 'tag' | 'note'
  /** What the reader sees on the chip. */
  label: string
  /** The exact substring that produced it, so the UI can point at it. */
  source: string
}

export interface ParsedTxn {
  amountMinor: number
  kind: TxnKind
  category: string | null
  method: TxnMethod | null
  date: string
  tags: string[]
  note: string
  chips: ParsedChip[]
  /** False when there is no usable amount — the one field with no default. */
  valid: boolean
}

// Direction words. "spent"/"paid" are the common ones; "got"/"received" flip it.
// Deliberately short: a long synonym list starts claiming words that were meant
// to be the note ("charge" is a bank charge AND a verb).
const OUT_WORDS = new Set(['spent', 'paid', 'out', 'expense', 'bought'])
const IN_WORDS = new Set(['got', 'received', 'in', 'income', 'earned', 'refund', 'salary'])

const METHOD_WORDS: Record<string, TxnMethod> = {
  cash: 'cash',
  upi: 'upi',
  gpay: 'upi',
  googlepay: 'upi',
  phonepe: 'upi',
  paytm: 'upi',
  card: 'card',
  credit: 'card',
  debit: 'card',
  bank: 'bank',
  neft: 'bank',
  imps: 'bank',
  rtgs: 'bank',
  transfer: 'bank',
  cheque: 'bank',
}

// Date words that are a single token. Multi-word phrases ("next monday", "in 3
// days") are handled by scanning windows below, because splitting on spaces
// first would have already torn them apart.
const DATE_WORDS = new Set([
  'today',
  'tod',
  'tomorrow',
  'tmrw',
  'tmr',
  'tom',
  'yesterday',
  'yest',
  'mon',
  'tue',
  'tues',
  'wed',
  'thu',
  'thur',
  'thurs',
  'fri',
  'sat',
  'sun',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
])

/** A bare number, or one with a k/l/cr suffix or a currency symbol. */
const AMOUNT_RE = /^₹?-?\d[\d,]*(?:\.\d+)?(?:k|l|cr)?$/i

export interface ParseOptions {
  now?: Date
  /** Known category names, matched case-insensitively before the note. */
  categories?: string[]
  /** Applied when no direction word appears. The spec's default is Out. */
  defaultKind?: TxnKind
}

export function parseTxnInput(raw: string, options: ParseOptions = {}): ParsedTxn {
  const now = options.now ?? new Date()
  const defaultKind = options.defaultKind ?? 'expense'
  const categories = options.categories ?? []
  const chips: ParsedChip[] = []

  const tokens = raw.trim().split(/\s+/).filter(Boolean)
  const claimed = new Array<boolean>(tokens.length).fill(false)

  let amountMinor = 0
  let kind: TxnKind | null = null
  let method: TxnMethod | null = null
  let category: string | null = null
  let date: string | null = null
  const tags: string[] = []

  // Multi-word dates first, longest window first, before anything can claim
  // "next" or "3" for itself. "in 3 days" is three tokens and "next monday" is
  // two, so a single-token pass would have destroyed both.
  for (let width = 3; width >= 2 && !date; width--) {
    for (let i = 0; i + width <= tokens.length; i++) {
      if (claimed.slice(i, i + width).some(Boolean)) continue
      const phrase = tokens.slice(i, i + width).join(' ')
      const parsed = parseDateFragment(phrase, now)
      if (!parsed) continue
      date = parsed
      for (let j = i; j < i + width; j++) claimed[j] = true
      chips.push({ field: 'date', label: parsed, source: phrase })
      break
    }
  }

  // Multi-word categories, likewise before the single-token pass: a category
  // called "Eating out" must not lose "out" to the direction rule.
  const sortedCategories = [...categories].sort((a, b) => b.length - a.length)
  for (const name of sortedCategories) {
    if (category) break
    const parts = name.trim().split(/\s+/)
    if (parts.length < 2) continue
    for (let i = 0; i + parts.length <= tokens.length; i++) {
      if (claimed.slice(i, i + parts.length).some(Boolean)) continue
      const window = tokens
        .slice(i, i + parts.length)
        .join(' ')
        .toLowerCase()
      if (window !== name.toLowerCase()) continue
      category = name
      for (let j = i; j < i + parts.length; j++) claimed[j] = true
      chips.push({ field: 'category', label: name, source: window })
      break
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    if (claimed[i]) continue
    const token = tokens[i]
    const word = token.toLowerCase().replace(/[.,;:!?]+$/, '')

    if (word.startsWith('#') && word.length > 1) {
      const tag = word.slice(1)
      tags.push(tag)
      claimed[i] = true
      chips.push({ field: 'tag', label: `#${tag}`, source: token })
      continue
    }

    // The amount is taken once. A second number in the line is part of the note
    // — "450 uber 2 rides" is one payment, not two.
    if (!amountMinor && AMOUNT_RE.test(word)) {
      const parsed = parseMoney(word)
      if (parsed) {
        amountMinor = Math.abs(parsed)
        // A leading minus is a direction, not a negative amount: amounts are
        // stored unsigned and `kind` carries the sign.
        if (parsed < 0 && kind === null) kind = 'expense'
        claimed[i] = true
        chips.push({ field: 'amount', label: word, source: token })
        continue
      }
    }

    if (kind === null && (OUT_WORDS.has(word) || IN_WORDS.has(word))) {
      kind = OUT_WORDS.has(word) ? 'expense' : 'income'
      claimed[i] = true
      chips.push({ field: 'direction', label: kind === 'expense' ? 'Out' : 'In', source: token })
      continue
    }

    if (!method && METHOD_WORDS[word]) {
      method = METHOD_WORDS[word]
      claimed[i] = true
      chips.push({ field: 'method', label: method.toUpperCase(), source: token })
      continue
    }

    if (!date && DATE_WORDS.has(word)) {
      const parsed = parseDateFragment(word, now)
      if (parsed) {
        date = parsed
        claimed[i] = true
        chips.push({ field: 'date', label: parsed, source: token })
        continue
      }
    }

    // A numeric date — "25/12", "2026-07-04". Checked after the amount so a bare
    // "450" is money rather than a date.
    if (!date && /[/\-.]/.test(word) && /\d/.test(word)) {
      const parsed = parseDateFragment(word, now)
      if (parsed) {
        date = parsed
        claimed[i] = true
        chips.push({ field: 'date', label: parsed, source: token })
        continue
      }
    }

    if (!category) {
      const match = sortedCategories.find((c) => c.toLowerCase() === word)
      if (match) {
        category = match
        claimed[i] = true
        chips.push({ field: 'category', label: match, source: token })
        continue
      }
    }
  }

  // Everything nobody claimed is the note, in the order it was typed.
  const note = tokens.filter((_, i) => !claimed[i]).join(' ')
  if (note) chips.push({ field: 'note', label: note, source: note })

  return {
    amountMinor,
    kind: kind ?? defaultKind,
    category,
    method,
    date: date ?? ymdOf(now),
    tags,
    note,
    chips,
    valid: amountMinor > 0,
  }
}
