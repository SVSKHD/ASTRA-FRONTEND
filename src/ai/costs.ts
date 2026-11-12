// AI spend (backend docs/26 "Settings", budget.py): this month's total against
// AI_MONTHLY_BUDGET_USD, and each budget (investments, business, chat, reserve)
// against its own cap from AI_AGENT_BUDGETS_USD. The month is Asia/Kolkata's;
// every call is reserved against both caps before it is sent, so a cap is a hard
// stop (the chat answers `budget_exceeded`), not a warning after the fact.
//
//   GET /api/ai/usage (admin) → {month_start, resets_at, spent_usd, limit_usd,
//        remaining_usd, calls, budgets: [{budget, spent_usd, limit_usd, remaining_usd}],
//        configured}
//
// Amounts arrive as decimal strings; they are only turned into numbers to draw.

import { aureon, type components } from '@/api/client'

export type AiUsage = components['schemas']['UsageOut']
export type BudgetUsage = components['schemas']['BudgetOut']

/** The budgets the server keeps, in the order they are shown. */
export const BUDGETS = ['investments', 'business', 'chat', 'reserve'] as const

export const BUDGET_LABEL: Record<string, string> = {
  investments: 'Investments',
  business: 'Business',
  chat: 'Chat',
  reserve: 'Reserve',
}

export const BUDGET_HINT: Record<string, string> = {
  investments: 'The Investments agent and research explanations',
  business: 'The Business agent',
  chat: 'The General agent',
  reserve: 'Daily reports and weekly reviews',
}

/** At or above this share of a cap, a meter turns to a warning. */
export const WARN_AT = 0.8

export const num = (v: string | number | null | undefined): number => {
  const n = Number(v)
  return v == null || v === '' || !Number.isFinite(n) ? 0 : n
}

/** "$12.40" / "$0.0123" (four places under a dollar, where single turns live). */
export function usd(v: string | number | null | undefined): string {
  const n = num(v)
  return n !== 0 && Math.abs(n) < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}

/** Share of a cap spent, 0–100 (capped), or null when there is no cap. */
export function usedPct(spent: string | number, limit: string | number): number | null {
  const cap = num(limit)
  if (cap <= 0) return null
  return Math.min(100, Math.round((num(spent) / cap) * 100))
}

export type Level = 'ok' | 'warn' | 'over'

/** ok below 80 %, warn from 80 %, over at the cap. */
export function levelOf(spent: string | number, limit: string | number): Level {
  const cap = num(limit)
  if (cap <= 0) return num(spent) > 0 ? 'over' : 'ok'
  const share = num(spent) / cap
  return share >= 1 ? 'over' : share >= WARN_AT ? 'warn' : 'ok'
}

/** The budgets in display order: the four known ones first, any new one after. */
export function orderedBudgets(u: Pick<AiUsage, 'budgets'>): BudgetUsage[] {
  const rank = (b: string) => {
    const i = (BUDGETS as readonly string[]).indexOf(b)
    return i < 0 ? BUDGETS.length : i
  }
  return [...u.budgets].sort((a, b) => rank(a.budget) - rank(b.budget))
}

/** "resets 1 Dec" from the server's resets_at, in the reader's own calendar. */
export function resetsOn(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export type UsageResult = { ok: true; data: AiUsage } | { ok: false; status: number; error: string }

/** This month's usage; `status` 403 means the caller is not an admin. */
export async function loadUsage(): Promise<UsageResult> {
  try {
    const { data, response } = await aureon.GET('/api/ai/usage')
    if (data) return { ok: true, data }
    const status = response.status
    return {
      ok: false,
      status,
      error:
        status === 403
          ? 'AI spend is server-wide, so only admins see it.'
          : status === 401
            ? 'Sign in to Aureon to see AI spend.'
            : `The server answered ${status}.`,
    }
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message || 'Could not reach Aureon.' }
  }
}
