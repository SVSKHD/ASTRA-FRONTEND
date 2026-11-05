// Dhan operations (Control center → Dhan ops): the pure half, so every state
// and label can be tested without a server.
//
// Sources, all real endpoints:
//   health checks   src/trading/dhanHealth.ts (auth status, integrations, account health)
//   feed worker     GET /api/agents (the agent whose name or kind mentions dhan)
//   incidents       GET /api/v1/repairs/incidents (matched to Dhan by title/fingerprint)
//   approvals       the shared approval inbox (src/control/approvals.ts)
//
// The backend has no Dhan-specific incident or recovery API yet: incidents are the
// self-repair detector's, and "recovery attempts" are its `recovery_attempts` and
// `last_recovery_at` fields. A recovery is shown as successful only when the
// backend reports the incident resolved (docs/dhan-integration.md).

import type { Schemas } from '@/control/api'
import type { Approval } from '@/control/approvals'
import type { Check } from '@/trading/dhanHealth'

export type Incident = Schemas['IncidentOut']
export type Agent = Schemas['AgentOut']

const DHAN = /dhan/i

/** An incident about Dhan, by what the detector wrote into its title or fingerprint. */
export function isDhanIncident(i: Pick<Incident, 'title' | 'fingerprint'>): boolean {
  return DHAN.test(i.title) || DHAN.test(i.fingerprint)
}

/** The market-feed worker: the registered agent whose name or kind mentions dhan and feed. */
export function feedAgent(agents: Agent[]): Agent | null {
  return (
    agents.find((a) => DHAN.test(a.name) && /feed/i.test(a.name)) ??
    agents.find((a) => DHAN.test(a.kind) && /feed/i.test(a.kind)) ??
    null
  )
}

export const ACTIVE_INCIDENT = ['open', 'recovering', 'repair_queued']
/** A resolved incident counts as a fresh recovery for this long. */
export const RECOVERED_WINDOW_MS = 60 * 60_000

export type OpsState = 'healthy' | 'recovered' | 'reconnecting' | 'degraded' | 'failed' | 'unknown'

export interface OpsView {
  state: OpsState
  tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info'
  label: string
  text: string
}

/**
 * The one line at the top of the page. Failures win, then an incident the backend
 * is recovering, then staleness; "recovered" needs the backend's resolved_at.
 */
export function opsState(checks: Check[], incidents: Incident[], now = Date.now()): OpsView {
  const failing = checks.filter((c) => c.level === 'auth' || c.level === 'error')
  if (failing.length) {
    return {
      state: 'failed',
      tone: 'danger',
      label: 'Failed',
      text: failing.map((c) => `${c.label}: ${c.text}`).join(' '),
    }
  }
  const active = incidents.filter((i) => ACTIVE_INCIDENT.includes(i.status))
  const recovering = active.find((i) => i.status === 'recovering' || i.status === 'repair_queued')
  if (recovering) {
    return {
      state: 'reconnecting',
      tone: 'warning',
      label: 'Recovering',
      text: `${recovering.title}: recovery attempt ${recovering.recovery_attempts} in progress (not yet confirmed).`,
    }
  }
  if (active.length) {
    return {
      state: 'degraded',
      tone: 'warning',
      label: 'Degraded',
      text: `${active.length} open Dhan incident${active.length > 1 ? 's' : ''}: ${active[0].title}.`,
    }
  }
  const stale = checks.filter((c) => c.level === 'stale')
  if (stale.length) {
    return {
      state: 'degraded',
      tone: 'warning',
      label: 'Degraded',
      text: stale.map((c) => `${c.label}: ${c.text}`).join(' '),
    }
  }
  if (checks.length && checks.every((c) => c.level === 'unknown')) {
    return {
      state: 'unknown',
      tone: 'info',
      label: 'Not reported',
      text: 'The server reported none of the checks.',
    }
  }
  const recent = incidents.find(
    (i) =>
      i.status === 'resolved' &&
      i.resolved_at &&
      now - Date.parse(i.resolved_at) < RECOVERED_WINDOW_MS,
  )
  if (recent) {
    return {
      state: 'recovered',
      tone: 'success',
      label: 'Recovered',
      text: `${recent.title}: resolved ${new Date(recent.resolved_at!).toLocaleTimeString()} (confirmed by the server).`,
    }
  }
  return {
    state: 'healthy',
    tone: 'success',
    label: 'Healthy',
    text: 'No failing check or open Dhan incident.',
  }
}

// --- approvals ---------------------------------------------------------------------------------

export type Scope = 'trading' | 'market_data' | 'other'

/** Trading (can move money or orders) vs Dhan market-data / connection (read-only). */
export function approvalScope(a: Pick<Approval, 'kind' | 'target'>): Scope {
  const k = a.kind.toLowerCase()
  if (k.startsWith('trading') || /order|position|execution|mode/.test(k)) return 'trading'
  if (DHAN.test(a.kind) || DHAN.test(a.target)) return 'market_data'
  return 'other'
}

export const SCOPE_LABEL: Record<Scope, string> = {
  trading: 'Trading operation',
  market_data: 'Market data · read-only',
  other: 'Other',
}

/** The approvals this page lists: trading ones and anything naming Dhan. */
export function dhanApprovals(items: Approval[]): Approval[] {
  return items.filter((a) => {
    if (approvalScope(a) !== 'other') return true
    try {
      return DHAN.test(JSON.stringify(a.payload ?? {}))
    } catch {
      return false
    }
  })
}

/** The affected account, as the request names it. */
export function approvalAccount(a: Pick<Approval, 'payload' | 'target'>): string {
  const p = (a.payload ?? {}) as Record<string, unknown>
  for (const k of ['broker_account_id', 'account_id', 'account']) {
    if (typeof p[k] === 'string' && p[k]) return p[k] as string
  }
  return a.target
}

/** Only a pending request that has not expired can be taken to the inbox to approve. */
export function actionable(a: Pick<Approval, 'status' | 'expires_at'>, now = Date.now()): boolean {
  const exp = Date.parse(a.expires_at)
  return a.status === 'pending' && !Number.isNaN(exp) && exp > now
}

// --- diagnostics -------------------------------------------------------------------------------

const SECRET_KEY = /token|secret|password|passcode|api[_-]?key|authorization|cookie|credential/i

/** A copy of an incident's details with anything credential-shaped replaced. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[…]'
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? '[redacted]' : redact(v, depth + 1)
    }
    return out
  }
  if (typeof value === 'string' && /^(Bearer\s+|eyJ)[\w.-]{10,}/i.test(value)) return '[redacted]'
  return value
}
