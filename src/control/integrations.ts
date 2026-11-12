// GET /api/v1/system/integrations (admin): the server's own summary of each
// integration. The OpenAPI schema types it as a free-form object, so the shapes
// below are written from the backend (app/services/integrations.py) and every
// field is optional: a section that failed carries only `status` and `error`.
//
// The `claude` section (backend docs/26) is built from settings and the usage
// table only: it never calls Anthropic. "Configured" means ANTHROPIC_API_KEY is
// set, not that it works; the live check is Settings → AI → Test connection.

import type { Tone } from '@/control/status'

export interface AgentView {
  registered?: boolean
  /** The registry's effective state: paused | stale | <reported> (e.g. running, idle). */
  state?: string | null
  last_heartbeat_at?: string | null
  age_s?: number | null
}

/** `integrations.claude`: Claude, the only AI provider. */
export interface ClaudeSection {
  /** ok | degraded (the month's cap is reached) | not_configured, or down on a failed read. */
  status?: string
  error?: string
  configured?: boolean
  model_main?: string | null
  /** The model that picks an agent and reads voice; null = off. */
  model_router?: string | null
  month_spent_usd?: string | null
  monthly_budget_usd?: string | null
}

export interface DhanSession {
  client_id_set?: boolean
  api_key_configured?: boolean
  session_active?: boolean
  session_expired?: boolean
  source?: 'session' | 'manual' | 'none'
  valid_until?: string | null
  expires_soon?: boolean
  data_stale?: boolean
}

export interface DhanSection {
  status?: string
  error?: string
  configured?: boolean
  read_only?: boolean
  session?: DhanSession
  /** Absent when there is no valid session (the server then skips the feed check). */
  feed?: AgentView
  reconcile?: { last_status?: string | null; last_run_at?: string | null }
  problems?: string[]
}

export interface Integrations {
  generated_at?: string
  ok?: boolean
  problems?: string[]
  integrations?: Record<string, { status?: string; error?: string } & Record<string, unknown>>
}

/** The backend's "down" states for a registered agent (integrations.DOWN_STATES). */
export const DOWN_STATES = ['stale', 'error', 'stopped']

export const STATUS_TONE: Record<string, Tone> = {
  ok: 'success',
  degraded: 'warning',
  down: 'danger',
  disabled: 'neutral',
  not_configured: 'neutral',
}

export interface ClaudeSummary {
  tone: Tone
  /** "Ready" / "Budget reached" / "Not set up" / "Unreadable". */
  state: string
  /** One line: the models and the month's spend against its cap. */
  detail: string
}

function money(v: string | null | undefined): string {
  const n = Number(v)
  return v == null || v === '' || !Number.isFinite(n) ? '—' : `$${n.toFixed(2)}`
}

/** The Claude section in words, or null when the server sent none. */
export function claudeSummary(section: ClaudeSection | undefined): ClaudeSummary | null {
  if (!section) return null
  if (section.error) return { tone: 'danger', state: 'Unreadable', detail: section.error }
  if (section.configured === false || section.status === 'not_configured') {
    return {
      tone: 'neutral',
      state: 'Not set up',
      detail: 'No ANTHROPIC_API_KEY: every AI feature is off. Add it under Settings → AI.',
    }
  }
  const parts = [
    section.model_main ? `main ${section.model_main}` : '',
    section.model_router ? `router ${section.model_router}` : 'router off',
    `${money(section.month_spent_usd)} of ${money(section.monthly_budget_usd)} this month`,
  ].filter(Boolean)
  const over = section.status === 'degraded'
  return {
    tone: over ? 'warning' : section.status === 'ok' ? 'success' : 'neutral',
    state: over ? 'Budget reached' : 'Ready',
    detail: parts.join(' · '),
  }
}

/**
 * Read the summary. Untyped in the generated client (a free-form object), so it is
 * read as the shape above; a server without the endpoint answers 404.
 */
export async function loadIntegrations(
  get: (path: '/api/v1/system/integrations') => Promise<{
    data?: unknown
    response: { ok: boolean; status: number }
  }>,
): Promise<{ data: Integrations | null; status: number }> {
  const r = await get('/api/v1/system/integrations')
  return {
    data: r.response.ok ? ((r.data ?? null) as Integrations | null) : null,
    status: r.response.status,
  }
}
