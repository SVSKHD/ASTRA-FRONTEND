// Writes Claude asked to make (backend docs/26 "Agents and tools"): a tool like
// propose_trade never acts, it files an approval. An admin approves (with their
// password) or rejects it here; the server then runs the executor itself.
//
//   GET  /api/ai/approvals?status=pending|approved|rejected|executed|failed|expired
//   POST /api/ai/approvals/{id}  {action: "approve"|"reject", password?}
//        403 reauth_failed (approve needs the password), 409 not_pending
//
// An approved `paper_trade` becomes a PAPER order intent; the paper engine's own
// risk check and paper approval still apply. LIVE trading stays off.

import { reactive } from 'vue'
import { aureon, type components } from '@/api/client'

export type AiApproval = components['schemas']['app__api__v1__ai__ApprovalOut']
export const APPROVAL_STATUSES = [
  'pending',
  'approved',
  'executed',
  'failed',
  'rejected',
  'expired',
] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export const STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  executed: 'Executed',
  failed: 'Failed',
  rejected: 'Rejected',
  expired: 'Expired',
}

export const STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  pending: 'warning',
  approved: 'info',
  executed: 'success',
  failed: 'danger',
  rejected: 'neutral',
  expired: 'neutral',
}

const ACTION_LABEL: Record<string, string> = {
  paper_trade: 'Paper trade',
  draft_aquakart_blog: 'Blog draft',
  add_todo: 'Todo',
}
export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/_/g, ' ')
}

/** The trade fields of a `paper_trade` payload (strings, as the server sends them). */
export interface TradeProposal {
  symbol: string
  side: string
  qty: string
  entry: string
  stop: string
  target: string
  riskInr: string
  notionalInr: string
  reason: string
}

function s(v: unknown): string {
  return v == null ? '' : String(v)
}

/** A paper trade's fields, or null for any other kind of approval. */
export function tradeOf(a: Pick<AiApproval, 'action' | 'payload'>): TradeProposal | null {
  if (a.action !== 'paper_trade') return null
  const p = a.payload as Record<string, unknown>
  return {
    symbol: s(p.symbol),
    side: s(p.side),
    qty: s(p.qty),
    entry: s(p.entry),
    stop: s(p.stop),
    target: s(p.target),
    riskInr: s(p.risk_inr),
    notionalInr: s(p.notional_inr),
    reason: s(p.reason),
  }
}

/** "₹1,234.50" from the server's decimal string; the string itself when it is not a number. */
export function inr(v: string): string {
  const n = Number(v)
  if (v === '' || !Number.isFinite(n)) return v
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Reward : risk from the trade's own numbers, e.g. "2.0"; '' when it cannot be worked out. */
export function rewardRisk(t: TradeProposal): string {
  const entry = Number(t.entry)
  const risk = Math.abs(entry - Number(t.stop))
  const reward = Math.abs(Number(t.target) - entry)
  if (!Number.isFinite(risk) || !Number.isFinite(reward) || risk === 0) return ''
  return (reward / risk).toFixed(1)
}

/** "expires in 3 h 20 min" / "expired"; from the server's expires_at. */
export function expiresIn(expiresAt: string, now = Date.now()): string {
  const ms = Date.parse(expiresAt) - now
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'expired'
  const min = Math.ceil(ms / 60_000)
  if (min < 60) return `expires in ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `expires in ${h} h${m ? ` ${m} min` : ''}`
}

const DECIDE_ERROR: Record<string, string> = {
  reauth_failed: 'That password was not accepted.',
  not_pending: 'This request was already decided or has expired.',
  not_found: 'This request no longer exists.',
  expired: 'This request has expired.',
}

export function decideError(code: string | null, status: number): string {
  if (code && DECIDE_ERROR[code]) return DECIDE_ERROR[code]
  if (status === 403) return 'Only an admin can decide this.'
  if (status === 401) return 'Sign in again to decide this.'
  return code ? code.replace(/[^a-z0-9]+/gi, ' ').trim() : `The server answered ${status}.`
}

function codeOf(error: unknown): string | null {
  const d = (error as { detail?: unknown } | null)?.detail
  if (d && typeof d === 'object' && 'code' in d) {
    const c = (d as { code?: unknown }).code
    return typeof c === 'string' ? c : null
  }
  return null
}

// --- the pending count, for the nav badge -----------------------------------------------------

export const aiApprovals = reactive({
  pending: [] as AiApproval[],
  loaded: false,
  error: '',
})

export async function listApprovals(status: ApprovalStatus | null): Promise<AiApproval[]> {
  const { data, error, response } = await aureon.GET('/api/ai/approvals', {
    params: { query: { status, limit: 100 } },
  })
  if (!data) throw new Error(decideError(codeOf(error), response.status))
  return data
}

/** Refresh the pending list (the nav badge reads its length). */
export async function loadPending(): Promise<void> {
  try {
    aiApprovals.pending = await listApprovals('pending')
    aiApprovals.error = ''
  } catch (e) {
    aiApprovals.error = (e as Error).message
  } finally {
    aiApprovals.loaded = true
  }
}

const POLL_MS = 30_000
let timer: ReturnType<typeof setInterval> | null = null

/** Poll the pending list while the control center is open (visible tabs only). */
export function startAiApprovals(): void {
  void loadPending()
  if (timer) return
  timer = setInterval(() => {
    if (globalThis.document?.visibilityState !== 'hidden') void loadPending()
  }, POLL_MS)
}
export function stopAiApprovals(): void {
  if (timer) clearInterval(timer)
  timer = null
}

/**
 * Approve (needs the admin's password) or reject one request. Returns the
 * decided row; throws an Error whose message is in words.
 */
export async function decide(
  id: string,
  action: 'approve' | 'reject',
  password?: string,
): Promise<AiApproval> {
  // The client adds the CSRF header to every write (src/api/client.ts).
  const { data, error, response } = await aureon.POST('/api/ai/approvals/{approval_id}', {
    params: { path: { approval_id: id } },
    body: { action, ...(action === 'approve' ? { password: password ?? '' } : {}) },
  })
  if (!data) throw new Error(decideError(codeOf(error), response.status))
  aiApprovals.pending = aiApprovals.pending.filter((a) => a.id !== id)
  return data
}
