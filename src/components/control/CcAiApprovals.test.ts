// AI approvals (POST /api/ai/approvals/{id}): a proposed paper trade shows every
// number that matters, approving asks for the password and never keeps it, a wrong
// password or an already-decided request is said in words, and rejecting confirms.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }))
vi.mock('@/api/client', () => ({ aureon: api }))

import CcAiApprovals from './CcAiApprovals.vue'
import { aiApprovals, expiresIn, rewardRisk, tradeOf } from '@/ai/approvals'

const res = (data: unknown, status = 200) => ({
  data: status < 400 ? data : undefined,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status },
})

const TRADE = {
  id: '11111111-1111-4111-8111-111111111111',
  agent: 'investments',
  action: 'paper_trade',
  summary:
    'PAPER BUY 5 TCS at 3900 (stop 3850, target 4000); risk 250.00 INR, size 19500.00 INR, R:R 2.00',
  payload: {
    symbol: 'TCS',
    instrument_id: 7,
    segment: 'NSE_EQ',
    side: 'BUY',
    qty: '5',
    entry: '3900',
    stop: '3850',
    target: '4000',
    risk_inr: '250.00',
    notional_inr: '19500.00',
    reason: 'Broke out of a 20-day range on volume.',
  },
  status: 'pending',
  conversation_id: null,
  created_at: '2026-11-12T09:00:00Z',
  expires_at: new Date(Date.now() + 90 * 60_000).toISOString(),
  decided_at: null,
  result: null,
  error: null,
}

async function mountAt(path = '/dev/ai-approvals') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/dev/ai-approvals', component: CcAiApprovals },
    ],
  })
  await router.push(path)
  const w = mount(CcAiApprovals, { attachTo: document.body, global: { plugins: [router] } })
  mounted = w
  await flushPromises()
  return w
}
let mounted: ReturnType<typeof mount> | null = null

const modalButton = (label: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!

describe('<CcAiApprovals />', () => {
  // The server: the trade is pending until a decision succeeds.
  let decided = false
  beforeEach(() => {
    decided = false
    api.GET.mockReset()
    api.POST.mockReset()
    aiApprovals.pending = [TRADE as never]
    api.GET.mockImplementation(
      async (_p: string, init: { params: { query: { status: string } } }) =>
        res(init.params.query.status === 'pending' && !decided ? [TRADE] : []),
    )
  })
  afterEach(() => {
    mounted?.unmount()
    mounted = null
    document.body.innerHTML = ''
  })
  /** A decision the server accepts: the request leaves the pending list. */
  const accept = (row: unknown) => async () => {
    decided = true
    return res(row)
  }

  it('lists a pending paper trade with entry, stop, target, qty, max loss and reason', async () => {
    const w = await mountAt()
    expect(api.GET).toHaveBeenCalledWith('/api/ai/approvals', {
      params: { query: { status: 'pending', limit: 100 } },
    })
    const card = w.get('[data-testid="ai-approval"]')
    const details = card.get('[data-testid="trade-details"]').text()
    for (const want of [
      'TCS',
      'BUY',
      '5',
      '₹3,900.00',
      '₹3,850.00',
      '₹4,000.00',
      '₹250.00',
      '₹19,500.00',
    ]) {
      expect(details).toContain(want)
    }
    expect(details).toContain('2.0') // reward : risk
    expect(card.text()).toContain('Broke out of a 20-day range on volume.')
    expect(card.text()).toContain('Investments agent')
    expect(card.text()).toMatch(/expires in 1 h 30 min|expires in 1 h 29 min/)
    expect(w.text()).toContain('PAPER')
    w.unmount()
  })

  it('approves with the password, says it is a paper intent, and keeps no password', async () => {
    api.POST.mockImplementation(
      accept({ ...TRADE, status: 'executed', result: { intent_id: 'pi-9' } }),
    )
    const w = await mountAt()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Approve…')!
      .trigger('click')
    await flushPromises()
    const pass = document.body.querySelector<HTMLInputElement>('input[type="password"]')!
    pass.value = 'hunter2'
    pass.dispatchEvent(new Event('input'))
    await flushPromises()
    modalButton('Approve').click()
    await flushPromises()
    expect(api.POST).toHaveBeenCalledWith('/api/ai/approvals/{approval_id}', {
      params: { path: { approval_id: TRADE.id } },
      body: { action: 'approve', password: 'hunter2' },
    })
    expect(w.text()).toContain('A PAPER order intent was created')
    expect(aiApprovals.pending).toEqual([])
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('hunter2')
    w.unmount()
  })

  it('says a wrong password and an already-decided request in words', async () => {
    api.POST.mockResolvedValueOnce(
      res({ detail: { code: 'reauth_failed', message: 'password re-authentication failed' } }, 403),
    )
    const w = await mountAt()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Approve…')!
      .trigger('click')
    await flushPromises()
    const pass = document.body.querySelector<HTMLInputElement>('input[type="password"]')!
    pass.value = 'wrong'
    pass.dispatchEvent(new Event('input'))
    await flushPromises()
    modalButton('Approve').click()
    await flushPromises()
    expect(document.body.textContent).toContain('That password was not accepted.')

    // The password is cleared after every attempt, so it is typed again.
    expect(pass.value).toBe('')
    pass.value = 'right'
    pass.dispatchEvent(new Event('input'))
    await flushPromises()
    api.POST.mockResolvedValueOnce(res({ detail: { code: 'not_pending', message: 'x' } }, 409))
    modalButton('Approve').click()
    await flushPromises()
    expect(document.body.textContent).toContain('already decided or has expired')
    w.unmount()
  })

  it('rejects after a confirm, with no password', async () => {
    api.POST.mockImplementation(accept({ ...TRADE, status: 'rejected' }))
    const w = await mountAt()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Reject…')!
      .trigger('click')
    await flushPromises()
    expect(api.POST).not.toHaveBeenCalled()
    expect(document.body.querySelector('input[type="password"]')).toBeNull()
    modalButton('Reject').click()
    await flushPromises()
    expect(api.POST).toHaveBeenCalledWith('/api/ai/approvals/{approval_id}', {
      params: { path: { approval_id: TRADE.id } },
      body: { action: 'reject' },
    })
    expect(w.text()).toContain('Rejected. Nothing was done.')
    w.unmount()
  })

  it('outlines the request a chat linked to', async () => {
    const w = await mountAt(`/dev/ai-approvals?id=${TRADE.id}`)
    expect(w.get('[data-testid="ai-approval"]').classes()).toContain('is-focus')
    w.unmount()
  })
})

describe('approval helpers', () => {
  it('reads a trade, its reward : risk and the time left', () => {
    const t = tradeOf(TRADE)!
    expect(t.riskInr).toBe('250.00')
    expect(rewardRisk(t)).toBe('2.0')
    expect(tradeOf({ action: 'draft_aquakart_blog', payload: {} })).toBeNull()
    const now = Date.parse('2026-11-12T10:00:00Z')
    expect(expiresIn('2026-11-12T10:45:00Z', now)).toBe('expires in 45 min')
    expect(expiresIn('2026-11-12T12:05:00Z', now)).toBe('expires in 2 h 5 min')
    expect(expiresIn('2026-11-12T09:00:00Z', now)).toBe('expired')
  })
})
