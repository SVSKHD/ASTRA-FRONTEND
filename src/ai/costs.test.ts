// AI spend helpers (GET /api/ai/usage): amounts stay strings until drawn, a meter
// warns from 80 % and is over at the cap, and the four budgets keep their order.
import { describe, expect, it } from 'vitest'
import { levelOf, orderedBudgets, usd, usedPct, WARN_AT } from './costs'

describe('costs', () => {
  it('formats dollars, with four places under a dollar', () => {
    expect(usd('12.4')).toBe('$12.40')
    expect(usd('0.0123')).toBe('$0.0123')
    expect(usd('0')).toBe('$0.00')
    expect(usd(null)).toBe('$0.00')
  })

  it('works out the share of a cap, capped at 100, and none without a cap', () => {
    expect(usedPct('25', '100')).toBe(25)
    expect(usedPct('130', '100')).toBe(100)
    expect(usedPct('5', '0')).toBeNull()
  })

  it('warns from 80 % and is over at the cap', () => {
    expect(WARN_AT).toBe(0.8)
    expect(levelOf('79.99', '100')).toBe('ok')
    expect(levelOf('80', '100')).toBe('warn')
    expect(levelOf('100', '100')).toBe('over')
    // A spend with a zero cap is already over: the server refuses every call.
    expect(levelOf('0.01', '0')).toBe('over')
    expect(levelOf('0', '0')).toBe('ok')
  })

  it('shows the four known budgets in order, and a new one after them', () => {
    const b = (budget: string) => ({ budget, spent_usd: '0', limit_usd: '1', remaining_usd: '1' })
    const out = orderedBudgets({
      budgets: [b('reserve'), b('experiments'), b('chat'), b('investments'), b('business')],
    })
    expect(out.map((x) => x.budget)).toEqual([
      'investments',
      'business',
      'chat',
      'reserve',
      'experiments',
    ])
  })
})
