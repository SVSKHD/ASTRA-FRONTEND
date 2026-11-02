// Paper trading (Aureon Trading Phase F): order intents, approval, the paper book.
//
// An intent is risk-checked on the server when it is created and again when an
// admin approves it; only then is it filled, with a SIMULATED fill. Nothing here
// can reach a broker's order API. LIVE stays unreachable (Phase G).
import { aureon, type components } from '@/api/client'
import { ApiFailure, must } from './useLoad'
import type { Account } from '@/components/trading/types'

export type Intent = components['schemas']['OrderIntentOut']
export type IntentDetail = components['schemas']['OrderIntentDetail']
export type IntentIn = components['schemas']['OrderIntentIn']
export type PaperSummary = components['schemas']['PaperSummaryOut']
export type Reconciliation = components['schemas']['ReconciliationOut']

export const STATUS_TEXT: Record<string, string> = {
  PENDING_RISK: 'Risk passed: waiting for admin approval',
  REJECTED: 'Rejected by risk',
  APPROVED: 'Approved',
  SUBMITTED: 'Resting: waits for a marketable price',
  FILLED: 'Filled (simulated)',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired (DAY order)',
}

export const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  PENDING_RISK: 'info',
  REJECTED: 'danger',
  APPROVED: 'info',
  SUBMITTED: 'warning',
  FILLED: 'success',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
}

export const OPEN = new Set(['PENDING_RISK', 'APPROVED', 'SUBMITTED'])

export function paperAccounts(accounts: Account[]): Account[] {
  return accounts.filter((a) => a.mode === 'PAPER' && a.is_active)
}

/** Stable per signal + account, so a double click or a retry returns the same intent. */
export function signalCorrelationId(signalId: string, accountId: string): string {
  return `sig-${signalId}-${accountId.slice(0, 8)}`
}

/** A plain positive decimal ("1", "0.01", "75"); no exponent, no sign. */
export const DECIMAL = /^\d+(\.\d+)?$/

export function validQuantity(q: string): boolean {
  return DECIMAL.test(q.trim()) && Number(q) > 0
}

export async function createIntent(body: IntentIn): Promise<IntentDetail> {
  return must(await aureon.POST('/api/trading/order-intents', { body }))
}

export type ApprovalFiled = components['schemas']['ApprovalFiledOut']
export type ApproveResult =
  { kind: 'filled'; intent: IntentDetail } | { kind: 'filed'; approval: ApprovalFiled }

/**
 * Approve a paper intent through the approval engine (backend Phase 20).
 *
 * With the admin's password the server re-authenticates, and when the policy
 * needs one approval it fills at once (200, the intent). Without a password, or
 * when the policy needs more approvers, it files a `trading.paper_intent`
 * request (202) that is approved from the /dev approval inbox.
 */
export async function approveIntent(id: string, password?: string): Promise<ApproveResult> {
  const r = await aureon.POST('/api/trading/order-intents/{intent_id}/approve', {
    params: { path: { intent_id: id } },
    body: password ? { password } : {},
  })
  if (r.response.status === 202 && r.data && 'approval_id' in r.data)
    return { kind: 'filed', approval: r.data }
  if (r.response.status === 403)
    throw new ApiFailure('That password is not right. Nothing was filled.', 403)
  const d = must(r)
  if ('approval_id' in d) return { kind: 'filed', approval: d }
  return { kind: 'filled', intent: d }
}

export async function cancelIntent(id: string): Promise<IntentDetail> {
  return must(
    await aureon.POST('/api/trading/order-intents/{intent_id}/cancel', {
      params: { path: { intent_id: id } },
    }),
  )
}

/** Why the latest risk run rejected it (or that it passed). */
export function riskLine(i: IntentDetail): string {
  const last = i.risk_decisions.at(-1)
  if (!last) return ''
  return last.approved ? 'Risk: all checks passed' : `Risk: ${last.reason}`
}

/** The simulated fill as one line: "10 @ 1000.20 · fees 4.21". */
export function fillLine(i: IntentDetail): string {
  const e = i.executions[0]
  return e ? `${e.quantity} @ ${e.price} · fees ${e.fees} ${e.currency}` : ''
}
