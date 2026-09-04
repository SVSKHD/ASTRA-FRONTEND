// The expense model's arithmetic (section 35). Every test here is really the
// same question asked five ways: is this single-signed, and is the rate honest?
import { describe, expect, it } from 'vitest'
import {
  SPEND_STEPS,
  byCategory,
  byDay,
  dayTitle,
  daysInMonth,
  elapsedDays,
  expenseTotals,
  spendStep,
  spendWashVar,
} from '@/utils/expenseMath'
import type { Expense } from '@/types'

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    userId: 'u1',
    date: '2026-09-02',
    amount: 40,
    category: 'Data feed',
    note: '',
    kind: 'one-off',
    createdAt: 0,
    ...over,
  }
}

describe('the month’s figures', () => {
  it('adds what was spent and takes it off the budget', () => {
    const totals = expenseTotals([expense(), expense({ id: 'e2', amount: 60 })], 500, 10)
    expect(totals.spent).toBe(100)
    expect(totals.remaining).toBe(400)
    expect(totals.count).toBe(2)
  })

  it('lets the remainder go negative, because that is the useful case', () => {
    // Clamping at zero would hide the only state anybody needs warning about.
    expect(expenseTotals([expense({ amount: 600 })], 500, 10).remaining).toBe(-100)
  })

  it('averages over the days ELAPSED, not the days in the month', () => {
    // Divided by thirty, a week of heavy spending reads as a quiet month.
    expect(expenseTotals([expense({ amount: 70 })], 500, 7).perDay).toBe(10)
    expect(expenseTotals([expense({ amount: 70 })], 500, 30).perDay).toBe(2.33)
  })

  it('never divides by zero on the first of the month', () => {
    expect(expenseTotals([expense()], 500, 0).perDay).toBe(40)
  })

  it('reports no percentage at all when no budget has been set', () => {
    // A bar filled against nothing is a bar that means nothing.
    expect(expenseTotals([expense()], 0, 10).pct).toBe(0)
  })
})

describe('how much of the month has happened', () => {
  it('is the day of the month while you are in it', () => {
    expect(elapsedDays('2026-09', '2026-09-04')).toBe(4)
  })

  it('is the whole month once it is past, and one before it starts', () => {
    expect(elapsedDays('2026-08', '2026-09-04')).toBe(31)
    expect(elapsedDays('2026-10', '2026-09-04')).toBe(1)
  })

  it('knows how long a month is, February included', () => {
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-09')).toBe(30)
  })
})

describe('the single-hue ramp', () => {
  it('gives a day that spent nothing no step at all', () => {
    expect(spendStep(0, 3000, 30)).toBe(0)
    expect(spendWashVar(0)).toBe('var(--pl-flat)')
  })

  it('deepens with the amount against the day’s share of the budget', () => {
    // 3000 over 30 days is 100 a day; the ramp tops out at twice that.
    expect(spendStep(40, 3000, 30)).toBeLessThan(spendStep(150, 3000, 30))
    expect(spendStep(200, 3000, 30)).toBe(SPEND_STEPS)
    expect(spendStep(5000, 3000, 30)).toBe(SPEND_STEPS)
  })

  it('reads an amount by its size, never by a sign', () => {
    // There is no negative expense. A minus that reached here is a typo, and it
    // is the SIZE that was meant.
    expect(spendStep(-150, 3000, 30)).toBe(spendStep(150, 3000, 30))
  })

  it('sits every spending day on one middle step when there is no budget', () => {
    // With nothing to key to, a scale would be inventing a judgement.
    expect(spendStep(5, 0, 30)).toBe(3)
    expect(spendStep(5000, 0, 30)).toBe(3)
  })
})

describe('the day and the category buckets', () => {
  it('sums a day and counts it', () => {
    const cells = byDay([
      expense(),
      expense({ id: 'e2', amount: 10 }),
      expense({ id: 'e3', date: '2026-09-03' }),
    ])
    expect(cells.get('2026-09-02')).toEqual({ date: '2026-09-02', amount: 50, count: 2 })
    expect(cells.get('2026-09-03')?.count).toBe(1)
  })

  it('says what a day holds in words, not only in a colour', () => {
    expect(dayTitle(byDay([expense()]).get('2026-09-02'))).toBe('1 expense · 40.00')
    expect(dayTitle(undefined)).toBe('Nothing spent')
  })

  it('ranks categories by what they cost, biggest first', () => {
    const rows = byCategory([
      expense({ category: 'Data feed', amount: 40 }),
      expense({ id: 'e2', category: 'Rent', amount: 900 }),
      expense({ id: 'e3', category: 'Data feed', amount: 40 }),
    ])
    expect(rows.map((r) => r.category)).toEqual(['Rent', 'Data feed'])
    expect(rows[1]).toEqual({ category: 'Data feed', amount: 80, count: 2 })
  })
})
