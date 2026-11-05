// GET /api/v1/system/integrations (admin): the server's own summary of each
// integration. The OpenAPI schema types it as a free-form object, so the shapes
// below are written from the backend (app/services/integrations.py at the
// docs/26 change) and every field is optional: a section that failed carries
// only `status` and `error`.
//
// The `ai_providers` section is built from SETTINGS ONLY: it never calls a
// provider. "Configured" means a key is set, not that it works; the live check
// is Settings → <provider> → Test.

import type { Tone } from '@/control/status'

export interface AgentView {
  registered?: boolean
  /** The registry's effective state: paused | stale | <reported> (e.g. running, idle). */
  state?: string | null
  last_heartbeat_at?: string | null
  age_s?: number | null
}

export interface AiProviderEntry {
  enabled?: boolean
  configured?: boolean
  usable?: boolean
  reason?: string | null
  default_model?: string | null
  daily_limit_usd?: string | null
}

export interface AiProvidersSection {
  status?: string
  error?: string
  providers?: Record<string, AiProviderEntry>
  default_external_provider?: string | null
  global_daily_limit_usd?: string | null
  local_default?: boolean
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

const AI_NAME: Record<string, string> = {
  openrouter: 'OpenRouter',
  anthropic: 'Claude (Anthropic)',
  gemini: 'Gemini (Google)',
}

export interface AiProviderRow {
  provider: string
  name: string
  enabled: boolean
  configured: boolean
  usable: boolean
  reason: string | null
  defaultModel: string | null
  dailyLimitUsd: string | null
  tone: Tone
  /** "usable" / "enabled, unusable: no_pricing" / "disabled". */
  state: string
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

/** One row per external provider the server listed, in a fixed order. */
export function aiProviderRows(section: AiProvidersSection | undefined): AiProviderRow[] {
  const providers = section?.providers ?? {}
  const order = ['openrouter', 'anthropic', 'gemini']
  return Object.keys(providers)
    .sort((a, b) => {
      const ia = order.indexOf(a)
      const ib = order.indexOf(b)
      return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib) || a.localeCompare(b)
    })
    .map((p) => {
      const e = providers[p] ?? {}
      const enabled = e.enabled === true
      const usable = e.usable === true
      return {
        provider: p,
        name: AI_NAME[p] ?? p,
        enabled,
        configured: e.configured === true,
        usable,
        reason: e.reason ?? null,
        defaultModel: e.default_model ?? null,
        dailyLimitUsd: e.daily_limit_usd ?? null,
        tone: usable ? 'success' : enabled ? 'warning' : 'neutral',
        state: usable ? 'usable' : enabled ? 'enabled, not usable' : 'disabled',
      }
    })
}
