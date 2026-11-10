// Market-data health as SEPARATE checks (docs/market-terminal.md §7):
//
//   session                 the Dhan login                   GET /api/v1/dhan/auth/status
//   instrument_master       is there a master, how fresh     GET /api/trading/instruments?limit=1 (count only)
//   market_data_permission  the Dhan data plan               only a refusal is visible (feed code auth_failed)
//   live_feed               the dhan-feed worker             GET /api/v1/dhan/feed/health
//   historical_candles      stored candles, for one probe    GET /api/trading/candles?instrument_id&timeframe=1d&limit=1
//   research_worker         the technical-analysis agent     GET /api/trading/agents
//   screener                screener freshness               no endpoint (§6)
//
// The backend has no single market-health endpoint yet (contract requested in
// §7). Whatever it cannot report is UNKNOWN, never OK. A Dhan login is a login:
// it is never read as "market data is ready", and no check borrows another's
// result. Read-only.

import { dhanChecks, type DhanInputs, type Level } from '@/trading/dhanHealth'

export type MarketCheckKey =
  | 'session'
  | 'instrument_master'
  | 'market_data_permission'
  | 'live_feed'
  | 'historical_candles'
  | 'research_worker'
  | 'screener'

export interface MarketCheck {
  key: MarketCheckKey
  label: string
  level: Level
  /** A badge label more precise than the level's own ("Market closed"). */
  badge?: string
  text: string
}

export const DOC = 'docs/market-terminal.md'

/** GET /api/v1/dhan/feed/health, loosely: an unexpected body must read as unknown. */
export interface FeedHealthLike {
  status?: string
  healthy?: boolean
  problems?: string[]
  codes?: string[]
}

export interface ResearchAgentLike {
  id: string
  name: string
  state: string
  last_heartbeat_at: string | null
}

export interface MarketInputs {
  session: DhanInputs['session']
  sessionError: string
  feed: FeedHealthLike | null
  feedError: string
  /** The instrument search's total for an unfiltered query; null when unread. */
  masterTotal: number | null
  masterError: string
  /** One instrument's stored daily candles; null when no instrument was probed. */
  candles: { symbol: string; count: number; newest: string | null } | null
  candlesError: string
  agents: ResearchAgentLike[] | null
  agentsError: string
  now?: number
}

/** The agent whose heartbeat stands for the research worker (backend app/workers/research.py). */
export const RESEARCH_AGENT_ID = 'technical-analysis'
/** Daily candles older than this (calendar days) are stale: allows a long weekend. */
const CANDLE_STALE_DAYS = 5

function span(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 90) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 90) return `${m} min`
  const h = Math.round(m / 60)
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`
}

function session(i: MarketInputs, now: number): MarketCheck {
  const base = { key: 'session', label: 'Dhan session' } as const
  if (!i.session) {
    return {
      ...base,
      level: 'unknown',
      text: i.sessionError
        ? `The login status could not be read: ${i.sessionError}`
        : 'The login status has not been read yet.',
    }
  }
  const c = dhanChecks({
    session: i.session,
    integration: null,
    admin: false,
    hasAccount: false,
    health: null,
    fundsAsOf: null,
    fundsError: '',
    quotes: [],
    now,
  }).find((x) => x.key === 'session')!
  return {
    ...base,
    level: c.level,
    text: `${c.text} A login is not market-data readiness; see the checks below.`,
  }
}

function master(i: MarketInputs): MarketCheck {
  const base = { key: 'instrument_master', label: 'Instrument master' } as const
  if (i.masterError) {
    return { ...base, level: 'error', text: `The instrument search failed: ${i.masterError}` }
  }
  if (i.masterTotal == null) {
    return { ...base, level: 'unknown', text: 'The instrument search has not answered yet.' }
  }
  if (i.masterTotal === 0) {
    return {
      ...base,
      level: 'missing',
      text: `No instruments are stored. The master may never have been synced (run the instrument refresh). Sync status is not reported (${DOC} §2).`,
    }
  }
  return {
    ...base,
    level: 'unknown',
    badge: 'Sync unknown',
    text: `${i.masterTotal.toLocaleString()} instruments stored. When they were last synced is not reported, so freshness is unknown (${DOC} §2).`,
  }
}

const FEED: Record<string, { level: Level; badge: string }> = {
  ok: { level: 'ok', badge: 'OK' },
  degraded: { level: 'stale', badge: 'Degraded' },
  down: { level: 'error', badge: 'Down' },
  market_closed: { level: 'disabled', badge: 'Market closed' },
  not_running: { level: 'disabled', badge: 'Not running' },
  not_configured: { level: 'disabled', badge: 'Not configured' },
  unknown: { level: 'unknown', badge: 'Not reported' },
}

function feed(i: MarketInputs): MarketCheck {
  const base = { key: 'live_feed', label: 'Live feed' } as const
  if (i.feedError) {
    return { ...base, level: 'unknown', text: `Feed health could not be read: ${i.feedError}` }
  }
  const f = i.feed
  const known = f?.status ? FEED[f.status] : undefined
  if (!f || !known) {
    return { ...base, level: 'unknown', text: 'Feed health has not been reported.' }
  }
  const auth = f.codes?.includes('auth_failed')
  const problems = (f.problems ?? []).join('; ')
  const text =
    f.status === 'ok'
      ? 'Connected, and every subscribed instrument is fresh.'
      : f.status === 'market_closed'
        ? 'The market is closed; silence is expected. Not the same as OK.'
        : problems || `Feed status: ${f.status}.`
  return {
    ...base,
    level: auth ? 'auth' : known.level,
    badge: auth ? 'Auth failed' : known.badge,
    text,
  }
}

function permission(i: MarketInputs): MarketCheck {
  const base = { key: 'market_data_permission', label: 'Market-data permission' } as const
  if (i.feed?.codes?.includes('auth_failed')) {
    return {
      ...base,
      level: 'auth',
      text: 'Dhan refused the feed: the token is invalid or the account has no data plan.',
    }
  }
  return {
    ...base,
    level: 'unknown',
    text: `Not reported: the backend cannot say whether the Dhan data plan covers each segment (${DOC} §7).`,
  }
}

function candles(i: MarketInputs, now: number): MarketCheck {
  const base = { key: 'historical_candles', label: 'Historical candles' } as const
  if (i.candlesError) {
    return { ...base, level: 'error', text: `Reading stored candles failed: ${i.candlesError}` }
  }
  const c = i.candles
  if (!c) {
    return {
      ...base,
      level: 'unknown',
      text: `Coverage is not reported (${DOC} §7). Open an instrument to probe its stored candles.`,
    }
  }
  if (!c.count) {
    return { ...base, level: 'missing', text: `No daily candles are stored for ${c.symbol}.` }
  }
  const age = c.newest ? now - Date.parse(c.newest) : NaN
  const tail = `Coverage for other instruments is not reported (${DOC} §7).`
  if (Number.isFinite(age) && age > CANDLE_STALE_DAYS * 86_400_000) {
    return {
      ...base,
      level: 'stale',
      text: `${c.symbol}: newest daily candle is ${span(age)} old. ${tail}`,
    }
  }
  return {
    ...base,
    level: 'ok',
    badge: `OK for ${c.symbol}`,
    text: `${c.symbol}: daily candles stored${Number.isFinite(age) ? `, newest ${span(age)} old` : ''}. ${tail}`,
  }
}

function research(i: MarketInputs, now: number): MarketCheck {
  const base = { key: 'research_worker', label: 'Research worker' } as const
  if (i.agentsError) {
    return { ...base, level: 'unknown', text: `The agents could not be read: ${i.agentsError}` }
  }
  if (!i.agents) return { ...base, level: 'unknown', text: 'The agents have not been read yet.' }
  const a = i.agents.find((x) => x.id === RESEARCH_AGENT_ID)
  if (!a) {
    return {
      ...base,
      level: 'missing',
      text: 'The technical-analysis agent has never registered: the research worker may not be running.',
    }
  }
  const beat = a.last_heartbeat_at
    ? `heartbeat ${span(now - Date.parse(a.last_heartbeat_at))} ago`
    : 'no heartbeat'
  const level: Level =
    a.state === 'idle' || a.state === 'busy'
      ? 'ok'
      : a.state === 'paused'
        ? 'disabled'
        : a.state === 'stale'
          ? 'stale'
          : 'error'
  return { ...base, level, text: `${a.name}: ${a.state}, ${beat}.` }
}

function screener(): MarketCheck {
  return {
    key: 'screener',
    label: 'Screener freshness',
    level: 'unknown',
    text: `There is no screener status endpoint yet (${DOC} §6, §7).`,
  }
}

/** The seven checks, in reading order. */
export function marketChecks(i: MarketInputs): MarketCheck[] {
  const now = i.now ?? Date.now()
  return [
    session(i, now),
    master(i),
    permission(i),
    feed(i),
    candles(i, now),
    research(i, now),
    screener(),
  ]
}
