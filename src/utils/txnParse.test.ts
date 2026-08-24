// Section 27b — the single-field entry, against what people actually type.
import { describe, expect, it } from 'vitest'
import { parseTxnInput } from '@/utils/txnParse'
import { toMinor } from '@/utils/money'

const NOW = new Date(2026, 6, 10) // Friday 10 July 2026
const CATEGORIES = ['Food', 'Groceries', 'Rent', 'Fuel', 'Eating out']
const parse = (raw: string) => parseTxnInput(raw, { now: NOW, categories: CATEGORIES })

describe('the example from the spec', () => {
  it('reads "450 groceries upi yesterday" completely', () => {
    const p = parse('450 groceries upi yesterday')
    expect(p.amountMinor).toBe(toMinor(450))
    expect(p.category).toBe('Groceries')
    expect(p.method).toBe('upi')
    expect(p.date).toBe('2026-07-09')
    expect(p.kind).toBe('expense')
    // Nothing left over: every token found a home.
    expect(p.note).toBe('')
    expect(p.valid).toBe(true)
  })

  it('describes what it understood, for review before committing', () => {
    // The chips are what make an aggressive parser safe: a wrong guess is
    // visible and one click from fixed, rather than silently written.
    const fields = parse('450 groceries upi yesterday').chips.map((c) => c.field)
    expect(fields).toContain('amount')
    expect(fields).toContain('category')
    expect(fields).toContain('method')
    expect(fields).toContain('date')
  })
})

describe('the amount', () => {
  it('takes the shorthand and the symbol', () => {
    expect(parse('₹1,250 rent').amountMinor).toBe(toMinor(1250))
    expect(parse('2k fuel').amountMinor).toBe(toMinor(2000))
    expect(parse('1.5L rent').amountMinor).toBe(toMinor(150000))
  })

  it('takes only the first number — the rest is prose', () => {
    // "450 uber 2 rides" is one payment, not two, and "2 rides" is exactly the
    // detail that makes the row identifiable later.
    const p = parse('450 uber 2 rides')
    expect(p.amountMinor).toBe(toMinor(450))
    expect(p.note).toBe('uber 2 rides')
  })

  it('stores an amount unsigned, with the direction carrying the sign', () => {
    const p = parse('-450 coffee')
    expect(p.amountMinor).toBe(toMinor(450))
    expect(p.kind).toBe('expense')
  })

  it('is not valid without one', () => {
    // The one field with no sensible default. Everything else is defaulted; a
    // missing amount is the only thing that stops a submit.
    const p = parse('groceries upi')
    expect(p.valid).toBe(false)
    expect(p.amountMinor).toBe(0)
  })
})

describe('the direction', () => {
  it('defaults to Out, because most rows are', () => {
    expect(parse('450 coffee').kind).toBe('expense')
  })

  it('flips on an income word', () => {
    expect(parse('85000 salary').kind).toBe('income')
    expect(parse('1200 received from ravi').kind).toBe('income')
  })

  it('honours an explicit out word', () => {
    expect(parse('450 spent on coffee').kind).toBe('expense')
  })

  it('can be overridden by the caller', () => {
    expect(parseTxnInput('450 coffee', { now: NOW, defaultKind: 'income' }).kind).toBe('income')
  })
})

describe('the method', () => {
  it('knows the apps people name instead of the rail', () => {
    // Nobody types "UPI" — they type the app they paid from.
    expect(parse('450 gpay').method).toBe('upi')
    expect(parse('450 phonepe').method).toBe('upi')
    expect(parse('450 paytm').method).toBe('upi')
  })

  it('maps the bank rails to one method', () => {
    expect(parse('45000 neft rent').method).toBe('bank')
    expect(parse('45000 imps rent').method).toBe('bank')
  })

  it('is null when nothing says', () => {
    expect(parse('450 coffee').method).toBeNull()
  })
})

describe('the date', () => {
  it('defaults to today', () => {
    expect(parse('450 coffee').date).toBe('2026-07-10')
  })

  it('reads a multi-word phrase before anything can tear it apart', () => {
    // "in 3 days" is three tokens; a single-token pass would have claimed "3"
    // as an amount and left "in" to the direction rule.
    expect(parse('450 coffee in 3 days').date).toBe('2026-07-13')
    expect(parse('450 coffee next monday').date).toBe('2026-07-13')
  })

  it('reads a weekday on its own', () => {
    expect(parse('450 coffee yesterday').date).toBe('2026-07-09')
  })

  it('reads a numeric date, but not at the cost of the amount', () => {
    // A bare "450" must stay money. Only a token with a separator in it is
    // considered as a date.
    const p = parse('450 rent 25/12')
    expect(p.amountMinor).toBe(toMinor(450))
    expect(p.date).toBe('2026-12-25')
  })
})

describe('tags and the leftovers', () => {
  it('takes #tags out of the note', () => {
    const p = parse('450 coffee #work #client-a')
    expect(p.tags).toEqual(['work', 'client-a'])
    expect(p.note).toBe('coffee')
  })

  it('keeps every unclaimed word, in the order it was typed', () => {
    // A parser that reads the amount and drops the rest produces a row that is
    // technically correct and useless a month later.
    const p = parse('450 dinner with the team at nandini')
    expect(p.note).toBe('dinner with the team at nandini')
  })

  it('does not let a category eat a word the note needed', () => {
    const p = parse('450 food for the dog')
    expect(p.category).toBe('Food')
    expect(p.note).toBe('for the dog')
  })
})

describe('the ordering traps', () => {
  it('matches a multi-word category before the direction rule takes "out"', () => {
    // "Eating out" ends in a direction word. Scanned as single tokens, the
    // category would lose its second half and the row would still say Out —
    // right answer, wrong reason, and the category silently gone.
    const p = parse('900 eating out card')
    expect(p.category).toBe('Eating out')
    expect(p.method).toBe('card')
    expect(p.note).toBe('')
  })

  it('claims each token exactly once', () => {
    const p = parse('450 groceries upi yesterday #home')
    const sources = p.chips.filter((c) => c.field !== 'note').map((c) => c.source)
    expect(new Set(sources).size).toBe(sources.length)
  })
})

describe('degenerate input', () => {
  it('does not throw on an empty line', () => {
    const p = parse('   ')
    expect(p.valid).toBe(false)
    expect(p.note).toBe('')
    expect(p.date).toBe('2026-07-10')
  })

  it('does not throw on punctuation alone', () => {
    expect(parse('...').valid).toBe(false)
  })
})
