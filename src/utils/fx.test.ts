import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRateCache, fetchRate, toBase } from '@/utils/fx'
import { expenseDocument, readExpense } from '@/services/expenseDoc'

function respond(body: unknown, ok = true) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response,
  )
}

const fsLike = { serverTimestamp: () => 0 }

describe('fetchRate', () => {
  beforeEach(() => clearRateCache())

  it('asks for the rate of the day the money was spent', async () => {
    const fetcher = respond({ date: '2026-10-30', rates: { INR: 84.12 } })
    const got = await fetchRate('USD', 'INR', '2026-10-30', '2026-10-31', fetcher)
    expect(got.rate).toBe(84.12)
    expect(fetcher.mock.calls[0][0]).toContain('/2026-10-30?base=USD&symbols=INR')
  })

  it('asks for the latest rate for today, which has none published yet', async () => {
    const fetcher = respond({ date: '2026-10-30', rates: { INR: 84 } })
    const got = await fetchRate('USD', 'INR', '2026-10-31', '2026-10-31', fetcher)
    expect(fetcher.mock.calls[0][0]).toContain('/latest?')
    // The day it was actually published, so the form can say so.
    expect(got.date).toBe('2026-10-30')
  })

  it('asks once per currency and day', async () => {
    const fetcher = respond({ date: '2026-09-01', rates: { INR: 90 } })
    await fetchRate('EUR', 'INR', '2026-09-01', '2026-10-31', fetcher)
    await fetchRate('EUR', 'INR', '2026-09-01', '2026-10-31', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('needs no lookup to convert a currency into itself', async () => {
    const fetcher = respond({})
    expect((await fetchRate('INR', 'INR', '2026-09-01', '2026-10-31', fetcher)).rate).toBe(1)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fails loudly rather than inventing a rate', async () => {
    await expect(
      fetchRate('USD', 'INR', '2026-09-01', '2026-10-31', respond({}, false)),
    ).rejects.toThrow()
    await expect(
      fetchRate('USD', 'INR', '2026-09-02', '2026-10-31', respond({ rates: {} })),
    ).rejects.toThrow()
  })
})

describe('a foreign expense', () => {
  it('converts to the paisa', () => {
    expect(toBase(12.5, 84.1234)).toBe(1051.54)
  })

  it('stores INR as the amount and keeps what was paid beside it', () => {
    const doc = expenseDocument(
      {
        date: '2026-10-30',
        amount: 1051.54,
        category: 'Software',
        note: '',
        kind: 'one-off',
        method: 'card',
        need: 'essential',
        currency: 'USD',
        originalAmount: 12.5,
        fxRate: 84.1234,
      },
      fsLike,
    )
    const back = readExpense('e1', doc)
    expect(back.amount).toBe(1051.54)
    expect(back.currency).toBe('USD')
    expect(back.originalAmount).toBe(12.5)
    expect(back.fxRate).toBe(84.1234)
  })

  it('clears the conversion when an expense is set back to INR', () => {
    const doc = expenseDocument(
      {
        date: '2026-10-30',
        amount: 500,
        category: 'Food',
        note: '',
        kind: 'one-off',
        method: 'cash',
        need: 'essential',
        currency: 'INR',
        originalAmount: 6,
        fxRate: 83,
      },
      fsLike,
    )
    // Nulls, not absent keys: a merge must overwrite the old conversion.
    expect(doc).toMatchObject({ currency: 'INR', originalAmount: null, fxRate: null })
    expect(readExpense('e2', doc).originalAmount).toBeUndefined()
  })

  it('reads an older row with no currency as INR', () => {
    expect(readExpense('e3', { date: '2026-01-01', amount: 10 }).currency).toBe('INR')
  })
})
