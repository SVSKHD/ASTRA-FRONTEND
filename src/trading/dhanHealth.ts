// Dhan's health as seven separate checks (backend docs/27-dhan-audit.md), so a
// healthy API never stands in for a healthy feed:
//
//   credentials   client id + API key/secret set          GET /api/v1/dhan/auth/status
//   session       the login session (or manual token)     same, + /accounts/{id}/health
//   auto login    PIN + TOTP login by the scheduler        GET /api/v1/dhan/auth/status
//   account data  how old the funds snapshot is           GET /accounts/{id}/funds (as_of)
//   feed worker   the dhan-feed agent's heartbeat          GET /api/v1/system/integrations (admin)
//   ticks         the newest quote on the trading stream   GET /api/trading/stream (quote events)
//   reconcile     the dhan-reconcile job's last run        GET /api/v1/system/integrations (admin)
//
// Each check says which of these it is: ok, stale, missing (no data), disabled
// (switched off or never started), auth (authentication failed), error, or
// unknown (not reported to this user). Nothing is inferred from another check.
// Read-only: nothing here places, changes or cancels an order.

import type { DhanSection } from '@/control/integrations'
import { DOWN_STATES } from '@/control/integrations'

export type Level = 'ok' | 'stale' | 'missing' | 'disabled' | 'auth' | 'error' | 'unknown'

export interface Check {
  key: 'credentials' | 'session' | 'autologin' | 'account' | 'feed' | 'ticks' | 'reconcile'
  label: string
  level: Level
  text: string
}

export interface DhanInputs {
  /** GET /api/v1/dhan/auth/status (any signed-in user); null when it could not be read. */
  session: {
    client_id_set: boolean
    api_key_configured: boolean
    session_active: boolean
    session_expired: boolean
    source: 'session' | 'manual' | 'none'
    valid_until?: string | null
    expires_soon: boolean
    data_stale: boolean
    /** DHAN_PIN + DHAN_TOTP_SECRET set: the scheduler logs in before the session expires. */
    auto_login_configured?: boolean
    /** Its last attempt. Never the PIN, the secret or the token. */
    auto_login_last?: {
      at: string
      outcome: string
      code?: string | null
      expires_at?: string | null
    } | null
  } | null
  /** The `dhan` section of the integrations summary; null for non-admins or when unread. */
  integration: DhanSection | null
  /** Whether this user may read the integrations summary at all. */
  admin: boolean
  /** A Dhan account is registered and picked. */
  hasAccount: boolean
  /** GET /accounts/{id}/health. */
  health: { supported: boolean; ok: boolean; detail?: string | null } | null
  /** GET /accounts/{id}/funds `as_of`, or the error reading it. */
  fundsAsOf: string | null
  fundsError: string
  /** Dhan quotes seen on the trading stream (received_at, and the feed's own stale flag). */
  quotes: { received_at: string | null; stale: boolean }[]
  now?: number
}

/** Account data older than this is stale: reconciliation runs every 5 minutes. */
export const ACCOUNT_STALE_MS = 15 * 60_000
/** A tick older than this during market hours is stale. */
export const TICK_STALE_MS = 2 * 60_000

function age(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : now - t
}

function span(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 90) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 90) return `${m} min`
  const h = Math.round(m / 60)
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`
}

/** NSE cash hours, 09:15–15:30 IST, Monday to Friday (exchange holidays are not known here). */
export function marketOpen(now: number): boolean {
  const ist = new Date(now + 5.5 * 3_600_000)
  const day = ist.getUTCDay()
  if (day === 0 || day === 6) return false
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30
}

function credentials(i: DhanInputs): Check {
  const base = { key: 'credentials', label: 'Credentials' } as const
  const s = i.session
  if (!s) return { ...base, level: 'unknown', text: 'The login status could not be read.' }
  if (!s.client_id_set) return { ...base, level: 'missing', text: 'Not configured: no client id.' }
  if (!s.api_key_configured) {
    return {
      ...base,
      level: 'missing',
      text: 'Client id set; API key and secret missing, so Log in to Dhan is unavailable.',
    }
  }
  return { ...base, level: 'ok', text: 'Client id, API key and secret are set (not a login).' }
}

function session(i: DhanInputs, now: number): Check {
  const base = { key: 'session', label: 'Authentication session' } as const
  const s = i.session
  if (!s) return { ...base, level: 'unknown', text: 'The login status could not be read.' }
  if (!s.client_id_set) return { ...base, level: 'disabled', text: 'Dhan is not configured.' }
  // The broker refused the credentials: an authentication failure, whatever the settings say.
  if (i.health?.supported && !i.health.ok) {
    return {
      ...base,
      level: 'auth',
      text: `Authentication failed at Dhan${i.health.detail ? `: ${i.health.detail}` : ''}.`,
    }
  }
  if (s.source === 'none') {
    return {
      ...base,
      level: 'auth',
      text: s.session_expired
        ? 'The login session expired. Log in to Dhan again.'
        : 'No valid session or token. Log in to Dhan.',
    }
  }
  const left = s.valid_until ? age(s.valid_until, now) : null
  const until = left != null ? ` for ${span(-left)} more` : ''
  const what = s.source === 'session' ? 'Login session' : 'Manual access token'
  const renew = s.auto_login_configured ? ' Automatic login will replace it.' : ''
  return s.expires_soon
    ? { ...base, level: 'stale', text: `${what} valid${until}; expires soon.${renew}` }
    : { ...base, level: 'ok', text: `${what} valid${until}.` }
}

function autologin(i: DhanInputs, now: number): Check {
  const base = { key: 'autologin', label: 'Automatic login' } as const
  const s = i.session
  if (!s) return { ...base, level: 'unknown', text: 'The login status could not be read.' }
  if (!s.auto_login_configured) {
    return {
      ...base,
      level: 'disabled',
      text: 'Off. Set DHAN_PIN and DHAN_TOTP_SECRET in Settings → Dhan to log in automatically before each session expires.',
    }
  }
  const last = s.auto_login_last
  const ago = last ? age(last.at, now) : null
  const when = ago != null ? ` ${span(Math.max(ago, 0))} ago` : ''
  if (!last) {
    return { ...base, level: 'ok', text: 'On. It logs in when the session is about to expire.' }
  }
  if (last.outcome === 'logged_in') {
    return { ...base, level: 'ok', text: `On. Last logged in${when}.` }
  }
  if (last.outcome === 'paused') {
    return {
      ...base,
      level: 'disabled',
      text: 'Paused after a logout. Log in to Dhan once to turn it back on.',
    }
  }
  if (last.code === 'dhan_refused' || last.outcome === 'blocked') {
    return {
      ...base,
      level: 'auth',
      text: `Dhan refused the PIN or TOTP${when}. It will not retry until DHAN_PIN or DHAN_TOTP_SECRET changes (so the account is not locked).`,
    }
  }
  if (last.outcome === 'failed') {
    return {
      ...base,
      level: 'error',
      text: `Last attempt failed${when} (${last.code ?? 'unknown error'}). It retries on the next run.`,
    }
  }
  return { ...base, level: 'ok', text: 'On. It logs in when the session is about to expire.' }
}

function account(i: DhanInputs, now: number): Check {
  const base = { key: 'account', label: 'Account data' } as const
  if (!i.hasAccount) return { ...base, level: 'missing', text: 'No Dhan account is registered.' }
  if (i.fundsError) {
    return { ...base, level: 'error', text: `Could not read the account: ${i.fundsError}` }
  }
  if (!i.fundsAsOf) return { ...base, level: 'missing', text: 'No account snapshot yet.' }
  const a = age(i.fundsAsOf, now)
  if (i.session?.data_stale) {
    return {
      ...base,
      level: 'stale',
      text: 'Stale: without a valid session these figures cannot refresh.',
    }
  }
  if (a != null && a > ACCOUNT_STALE_MS) {
    return { ...base, level: 'stale', text: `Stale: last read ${span(a)} ago.` }
  }
  return { ...base, level: 'ok', text: a != null ? `Read ${span(Math.max(0, a))} ago.` : 'Read.' }
}

function feed(i: DhanInputs): Check {
  const base = { key: 'feed', label: 'Market feed worker' } as const
  if (!i.admin) return { ...base, level: 'unknown', text: 'Only admins can see the feed worker.' }
  const d = i.integration
  if (!d) return { ...base, level: 'unknown', text: 'The integrations summary could not be read.' }
  if (d.error) return { ...base, level: 'unknown', text: `Not checked: ${d.error}.` }
  if (d.status === 'not_configured' || d.configured === false) {
    return { ...base, level: 'disabled', text: 'Dhan is not configured, so the feed is off.' }
  }
  if (!d.feed) {
    return {
      ...base,
      level: 'unknown',
      text: 'Not checked: the server skips the feed without a valid session.',
    }
  }
  if (!d.feed.registered) {
    return {
      ...base,
      level: 'disabled',
      text: 'Not running: the dhan-feed worker never registered (is "dhan" in COMPOSE_PROFILES?).',
    }
  }
  const beat = d.feed.age_s != null ? `, last heartbeat ${span(d.feed.age_s * 1000)} ago` : ''
  const state = d.feed.state ?? 'unknown'
  if (state === 'paused') return { ...base, level: 'disabled', text: `Paused${beat}.` }
  if (DOWN_STATES.includes(state)) return { ...base, level: 'error', text: `${state}${beat}.` }
  return { ...base, level: 'ok', text: `${state}${beat}.` }
}

function ticks(i: DhanInputs, feedCheck: Check, now: number): Check {
  const base = { key: 'ticks', label: 'Tick freshness' } as const
  if (feedCheck.level === 'disabled') {
    return { ...base, level: 'disabled', text: 'No ticks: the feed is off.' }
  }
  const newest = i.quotes
    .map((q) => ({ q, a: age(q.received_at, now) }))
    .filter((x): x is { q: (typeof i.quotes)[number]; a: number } => x.a != null)
    .sort((x, y) => x.a - y.a)[0]
  if (!newest) {
    return { ...base, level: 'missing', text: 'No Dhan ticks have reached this page yet.' }
  }
  const last = `last tick ${span(Math.max(0, newest.a))} ago`
  if (!marketOpen(now)) return { ...base, level: 'ok', text: `Market closed; ${last}.` }
  if (newest.q.stale) return { ...base, level: 'stale', text: `The feed marked it stale; ${last}.` }
  if (newest.a > TICK_STALE_MS) return { ...base, level: 'stale', text: `Stale: ${last}.` }
  return { ...base, level: 'ok', text: `Live; ${last}.` }
}

function reconcile(i: DhanInputs, now: number): Check {
  const base = { key: 'reconcile', label: 'Reconciliation' } as const
  if (!i.admin) return { ...base, level: 'unknown', text: 'Only admins can see reconciliation.' }
  const d = i.integration
  if (!d || d.error) {
    return { ...base, level: 'unknown', text: 'The integrations summary could not be read.' }
  }
  if (d.status === 'not_configured' || d.configured === false) {
    return { ...base, level: 'disabled', text: 'Dhan is not configured, so no job runs.' }
  }
  if (!d.reconcile) {
    return {
      ...base,
      level: 'unknown',
      text: 'Not checked: the server skips it without a session.',
    }
  }
  const { last_status: st, last_run_at: at } = d.reconcile
  const when = at ? ` ${span(Math.max(0, age(at, now) ?? 0))} ago` : ''
  if (!st)
    return { ...base, level: 'missing', text: 'Never run yet (09:00–15:55 IST, every 5 min).' }
  if (st === 'failed') return { ...base, level: 'error', text: `Last run failed${when}.` }
  return { ...base, level: 'ok', text: `Last run ${st}${when}.` }
}

/** The seven checks, in reading order. */
export function dhanChecks(i: DhanInputs): Check[] {
  const now = i.now ?? Date.now()
  const f = feed(i)
  return [
    credentials(i),
    session(i, now),
    autologin(i, now),
    account(i, now),
    f,
    ticks(i, f, now),
    reconcile(i, now),
  ]
}

export const LEVEL_TONE: Record<Level, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  ok: 'success',
  stale: 'warning',
  missing: 'neutral',
  disabled: 'neutral',
  auth: 'danger',
  error: 'danger',
  unknown: 'info',
}

export const LEVEL_LABEL: Record<Level, string> = {
  ok: 'OK',
  stale: 'Stale',
  missing: 'No data',
  disabled: 'Off',
  auth: 'Auth failed',
  error: 'Failing',
  unknown: 'Not reported',
}

// --- per-quote freshness (the market-data monitor and the watchlist) ---------------------------

export type Freshness = 'live' | 'stale' | 'last_known' | 'closed' | 'unknown'

export interface FreshnessView {
  level: Freshness
  label: string
  tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info'
  text: string
}

/**
 * How much a quote can be trusted right now. Only "live" may be read as a current
 * price: it needs the stream open, the market open, the feed's own stale flag
 * clear, and a tick younger than TICK_STALE_MS. Times are the server's
 * `received_at`. A stream that is not open turns every quote into "last known".
 */
export function quoteFreshness(
  q: { received_at: string | null; stale: boolean },
  streamStatus: string,
  now: number,
): FreshnessView {
  const a = age(q.received_at, now)
  const when = a != null ? `${span(Math.max(0, a))} ago` : 'at an unknown time'
  if (streamStatus !== 'open') {
    return {
      level: 'last_known',
      label: 'Last known',
      tone: 'warning',
      text: `Live feed ${streamStatus}; this tick arrived ${when} and is not updating.`,
    }
  }
  if (a == null) {
    return { level: 'unknown', label: 'No time', tone: 'neutral', text: 'The tick has no time.' }
  }
  if (q.stale) {
    return {
      level: 'stale',
      label: 'Stale',
      tone: 'warning',
      text: `The feed marked it stale; ${when}.`,
    }
  }
  if (!marketOpen(now)) {
    return { level: 'closed', label: 'Market closed', tone: 'neutral', text: `Last tick ${when}.` }
  }
  if (a > TICK_STALE_MS) {
    return { level: 'stale', label: 'Stale', tone: 'warning', text: `No tick for ${span(a)}.` }
  }
  return { level: 'live', label: 'Live', tone: 'success', text: `Tick ${when}.` }
}

/** The newest tick among the quotes, by the server's received_at. */
export function newestTick<T extends { received_at: string | null }>(quotes: T[]): T | null {
  let best: T | null = null
  let bestAt = -Infinity
  for (const q of quotes) {
    const t = q.received_at ? Date.parse(q.received_at) : NaN
    if (!Number.isNaN(t) && t > bestAt) {
      best = q
      bestAt = t
    }
  }
  return best
}

export interface FeedSummary {
  level: 'live' | 'stale' | 'interrupted' | 'idle' | 'closed' | 'unauthorized'
  tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info'
  label: string
  text: string
}

/**
 * The market-data feed in one line, for the top of the monitor. Interruptions win
 * over everything else so they are seen at once.
 */
export function feedSummary(i: {
  streamStatus: string
  sessionSource: 'session' | 'manual' | 'none' | null
  subscribed: number
  quotes: { received_at: string | null; stale: boolean }[]
  now: number
}): FeedSummary {
  if (i.sessionSource === 'none') {
    return {
      level: 'unauthorized',
      tone: 'danger',
      label: 'Unauthorized',
      text: 'No valid Dhan session: the feed cannot receive ticks. Reconnect Dhan.',
    }
  }
  if (i.streamStatus === 'reconnecting' || i.streamStatus === 'closed') {
    return {
      level: 'interrupted',
      tone: 'danger',
      label: i.streamStatus === 'closed' ? 'Disconnected' : 'Reconnecting',
      text:
        i.streamStatus === 'closed'
          ? 'The live stream to Aureon is off. Prices below are last known, not live.'
          : 'The live stream to Aureon dropped and is reconnecting. Prices below are last known.',
    }
  }
  if (i.streamStatus === 'connecting') {
    return { level: 'idle', tone: 'info', label: 'Connecting', text: 'Opening the live stream…' }
  }
  if (!i.subscribed) {
    return {
      level: 'idle',
      tone: 'neutral',
      label: 'No subscriptions',
      text: 'The stream is open, but this page follows no instruments. Add some to the watchlist.',
    }
  }
  const n = newestTick(i.quotes)
  if (!n) {
    return {
      level: marketOpen(i.now) ? 'stale' : 'closed',
      tone: marketOpen(i.now) ? 'warning' : 'neutral',
      label: marketOpen(i.now) ? 'No ticks' : 'Market closed',
      text: 'No Dhan tick has reached this page since it opened.',
    }
  }
  const f = quoteFreshness(n, i.streamStatus, i.now)
  if (f.level === 'live') return { level: 'live', tone: 'success', label: 'Live', text: f.text }
  if (f.level === 'closed')
    return { level: 'closed', tone: 'neutral', label: 'Market closed', text: f.text }
  return { level: 'stale', tone: 'warning', label: 'Stale', text: f.text }
}
