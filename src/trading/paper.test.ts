import { describe, expect, it } from 'vitest'
import { OPEN, paperAccounts, signalCorrelationId, validQuantity } from './paper'
import type { Account } from '@/components/trading/types'

const acct = (mode: string, is_active = true) => ({ id: mode, mode, is_active }) as Account

describe('paper helpers', () => {
  it('keeps the correlation id stable, short and server-valid', () => {
    const id = signalCorrelationId(
      '3f1c2a8e-0000-4000-8000-000000000000',
      '11111111-2222-4333-8444-555555555555',
    )
    expect(id).toBe('sig-3f1c2a8e-0000-4000-8000-000000000000-11111111')
    expect(id.length).toBeLessThanOrEqual(64)
    expect(id).toMatch(/^[A-Za-z0-9._:-]{8,64}$/)
  })

  it('accepts plain positive decimals only', () => {
    for (const ok of ['1', '0.01', '75', ' 10 ']) expect(validQuantity(ok)).toBe(true)
    for (const bad of ['', '0', '-1', '1e3', 'abc', '1.', '.5'])
      expect(validQuantity(bad)).toBe(false)
  })

  it('only active PAPER accounts can paper-trade', () => {
    expect(
      paperAccounts([acct('OBSERVE'), acct('PAPER'), acct('LIVE'), acct('PAPER', false)]).map(
        (a) => a.mode,
      ),
    ).toEqual(['PAPER'])
    expect([...OPEN]).toEqual(['PENDING_RISK', 'APPROVED', 'SUBMITTED'])
  })
})
