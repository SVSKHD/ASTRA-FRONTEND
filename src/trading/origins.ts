// Trade origins (/trading/origins): who opened each MT5 trade — me by hand, the
// Aureon bot, or something unknown — and how each side is doing.
//
// Read-only. The backend classifies every deal from MT5's own fields (magic +
// deal reason, see the backend's trade-origins contract) and serves:
//   GET /api/trading/mt5/trades            the journal (TradeRow)
//   GET /api/trading/mt5/trades/stats      per-origin stats, buckets, sessions, split check
//   GET /api/trading/mt5/positions/open    open positions with their origin
//   GET /api/trading/mt5/trades/gaps       detected holes in the pushed deal history
//   GET /api/trading/dhan/orders/origins   Dhan orders tagged aureon | manual
//
// The shapes below are written by hand from that contract: the endpoints were
// not yet in src/api/openapi.json when this page was built. Once they are,
// these aliases can point at components['schemas'] instead.

import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import { aureon } from '@/api/client'
import { must } from '@/trading/useLoad'
import { sumDec, toneOf } from '@/trading/format'

/** A Decimal as the API sends it: a string, or a plain JSON number. */
export type Num = string | number

/** Who opened a position. "broker" (SL/TP/stop-out) can close, never open. */
export type Origin = 'bot' | 'manual' | 'unknown'
/** The page's filter chips. "managed" = manual and touched by the guardian. */
export type OriginFilter = 'all' | 'manual' | 'bot' | 'managed'
export type Bucket = 'day' | 'week' | 'month'
export type SessionKey = 'asia' | 'london' | 'ny' | 'off'

export interface TradeRow {
  acct: string
  position_id: number
  symbol: string
  side: 'buy' | 'sell' | string
  volume: Num
  entry_time: string
  entry_price: Num
  exit_time: string | null
  exit_price: Num | null
  initial_sl: Num | null
  tp: Num | null
  profit: Num
  commission: Num
  swap: Num
  net: Num
  origin: Origin | string
  guardian_touched: boolean
  open_reason: string | null
  close_reason: string | null
  close_actor: string | null
  duration_s: number | null
  r_multiple: Num | null
  session: SessionKey | string | null
  comment: string | null
  magic: number | null
  status: 'open' | 'closed' | string
}
export interface TradesOut {
  items: TradeRow[]
  total: number
}

export interface OriginStats {
  trades: number
  wins: number
  losses: number
  win_rate: Num | null
  net: Num
  gross_profit: Num
  gross_loss: Num
  avg_r: Num | null
  max_drawdown: Num
  avg_duration_s: number | null
}
export interface TradeStatsOut {
  from: string
  to: string
  currency: string | null
  account_total_net: Num
  origins: Partial<Record<OriginFilter | 'unknown', OriginStats>>
  by_session: Partial<Record<'manual' | 'bot' | 'all', Partial<Record<SessionKey, OriginStats>>>>
  buckets: { start: string; manual?: OriginStats; bot?: OriginStats; all?: OriginStats }[]
  check: { split_sum_net: Num; account_total_net: Num; ok: boolean }
}

export interface OpenPositionRow {
  ticket: number
  position_id: number
  symbol: string
  side: 'buy' | 'sell' | string
  volume: Num
  price_open: Num
  price_current: Num | null
  sl: Num | null
  tp: Num | null
  profit: Num | null
  swap: Num | null
  time: string | number | null
  origin: Origin | string
  guardian_touched: boolean
  initial_sl?: Num | null
  comment?: string | null
}
export interface OpenPositionsOut {
  items: OpenPositionRow[]
  as_of: string | null
}

export interface TradeGap {
  acct: string
  detected_at: string
  window_from: string | number | null
  window_to: string | number | null
  missing: number
  tickets: number[]
  kind: string
}
export interface TradeGapsOut {
  items: TradeGap[]
}

export interface DhanOriginOrder {
  order_id: string
  correlation_id: string | null
  tag: string | null
  symbol: string
  side: string
  qty: Num
  price: Num | null
  status: string
  origin: 'aureon' | 'manual' | string
  placed_at: string | null
}
export interface DhanOriginOrdersOut {
  items: DhanOriginOrder[]
}

// ---- filter chips ↔ URL query ---------------------------------------------

export const ORIGIN_FILTERS: { value: OriginFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'manual', label: 'My trades' },
  { value: 'bot', label: 'Bot trades' },
  { value: 'managed', label: 'Guardian-managed' },
]

const FILTER_VALUES = new Set<string>(ORIGIN_FILTERS.map((f) => f.value))

function first(v: LocationQuery[string] | undefined): string {
  return String((Array.isArray(v) ? v[0] : v) ?? '')
}

/** `?origin=bot` → 'bot'; anything missing or unknown is 'all'. */
export function originFromQuery(q: LocationQuery): OriginFilter {
  const v = first(q.origin)
  return (FILTER_VALUES.has(v) ? v : 'all') as OriginFilter
}

/** The route query for a chip: other keys kept, `origin` dropped for "All". */
export function queryForOrigin(q: LocationQuery, origin: OriginFilter): LocationQueryRaw {
  const out: LocationQueryRaw = { ...q }
  if (origin === 'all') delete out.origin
  else out.origin = origin
  return out
}

/** The `origin` query param the trades API gets for a chip ("all" is sent as-is). */
export function apiOrigin(origin: OriginFilter): OriginFilter {
  return origin
}

/** Dhan only knows aureon | manual; "bot" maps to aureon, "managed" has no Dhan meaning. */
export function dhanOrigin(origin: OriginFilter): 'aureon' | 'manual' | null {
  if (origin === 'bot') return 'aureon'
  if (origin === 'manual' || origin === 'managed') return 'manual'
  return null
}

/** Client-side filter for rows that carry origin + guardian_touched. */
export function matchesOrigin(
  row: { origin: string; guardian_touched?: boolean | null },
  origin: OriginFilter,
): boolean {
  if (origin === 'all') return true
  if (origin === 'managed') return row.origin === 'manual' && !!row.guardian_touched
  return row.origin === origin
}

// ---- period + buckets ------------------------------------------------------

export const PERIODS = [
  { value: '1', label: 'Today' },
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
] as const
export type Period = (typeof PERIODS)[number]['value']
const PERIOD_VALUES = new Set<string>(PERIODS.map((p) => p.value))

export const BUCKETS: { value: Bucket; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]
const BUCKET_VALUES = new Set<string>(BUCKETS.map((b) => b.value))

export function periodFromQuery(q: LocationQuery): Period {
  const v = first(q.period)
  return (PERIOD_VALUES.has(v) ? v : '7') as Period
}
export function bucketFromQuery(q: LocationQuery): Bucket {
  const v = first(q.bucket)
  return (BUCKET_VALUES.has(v) ? v : 'day') as Bucket
}

/** `[from, to]` as ISO strings. "Today" starts at 00:00 UTC; N days go back N×24 h. */
export function periodRange(period: Period, now = Date.now()): { from: string; to: string } {
  const to = new Date(now)
  const from =
    period === '1'
      ? new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()))
      : new Date(now - Number(period) * 86_400_000)
  return { from: from.toISOString(), to: to.toISOString() }
}

// ---- badges ----------------------------------------------------------------

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

/** The origin badge for a trade or position. */
export function originBadge(
  origin: string | null | undefined,
  guardianTouched?: boolean | null,
): { label: string; tone: Tone } {
  if (origin === 'manual')
    return guardianTouched
      ? { label: 'Guardian-managed', tone: 'success' }
      : { label: 'My trade', tone: 'info' }
  if (origin === 'bot') return { label: 'Bot', tone: 'neutral' }
  return { label: 'Unknown', tone: 'warning' }
}

export function dhanOriginBadge(origin: string | null | undefined): { label: string; tone: Tone } {
  if (origin === 'aureon') return { label: 'Aureon', tone: 'neutral' }
  if (origin === 'manual') return { label: 'Manual', tone: 'info' }
  return { label: 'Unknown', tone: 'warning' }
}

// ---- comparison ------------------------------------------------------------

/** a − b as an exact decimal string (null when either side is missing). */
export function subDec(a: Num | null | undefined, b: Num | null | undefined): string | null {
  if (a === null || a === undefined || b === null || b === undefined) return null
  const nb = String(b).trim()
  const neg = nb.startsWith('-') ? nb.slice(1) : `-${nb}`
  return sumDec([String(a), neg])
}

export interface Comparison {
  manual: OriginStats | null
  bot: OriginStats | null
  /** Who made more net P&L over the period; null when neither side traded. */
  winner: 'manual' | 'bot' | 'tie' | null
  /** manual.net − bot.net */
  diff: string | null
}

/** My trading vs the bot's, from one stats response (same period for both by construction). */
export function compareOrigins(stats: TradeStatsOut | null | undefined): Comparison {
  const manual = stats?.origins?.manual ?? null
  const bot = stats?.origins?.bot ?? null
  if (!manual?.trades && !bot?.trades) return { manual, bot, winner: null, diff: null }
  const diff = subDec(manual?.net ?? '0', bot?.net ?? '0')
  const t = toneOf(diff)
  const winner = t === 'positive' ? 'manual' : t === 'negative' ? 'bot' : 'tie'
  return { manual, bot, winner, diff }
}

// ---- small formatting ------------------------------------------------------

/** 4332 → "1h12m"; 59 → "59s"; 90061 → "1d1h". */
export function duration(s: number | null | undefined): string {
  if (s === null || s === undefined || !Number.isFinite(s)) return '—'
  const t = Math.max(0, Math.round(s))
  const d = Math.floor(t / 86400)
  const h = Math.floor((t % 86400) / 3600)
  const m = Math.floor((t % 3600) / 60)
  if (d) return `${d}d${h ? `${h}h` : ''}`
  if (h) return `${h}h${m ? `${String(m).padStart(2, '0')}m` : ''}`
  if (m) return `${m}m`
  return `${t}s`
}

export const SESSIONS: { value: SessionKey; label: string }[] = [
  { value: 'asia', label: 'Asia' },
  { value: 'london', label: 'London' },
  { value: 'ny', label: 'New York' },
  { value: 'off', label: 'Off-session' },
]

/** Close reasons as MT5 names them → short words. */
const CLOSE_REASON: Record<string, string> = {
  client: 'Manual (desktop)',
  mobile: 'Manual (mobile)',
  web: 'Manual (web)',
  expert: 'Bot / guardian',
  sl: 'Stop loss',
  tp: 'Take profit',
  so: 'Stop-out',
}
export function closeReasonLabel(r: string | null | undefined): string {
  if (!r) return '—'
  return CLOSE_REASON[r.toLowerCase()] ?? r
}

// ---- API -------------------------------------------------------------------
//
// The paths are not in the generated schema yet, so the typed client is called
// through a loose signature; every response is unwrapped with `must` like the
// rest of the trading panel (an error body becomes an ApiFailure).

type Query = Record<string, string | number | undefined>
type LooseGet = (
  path: string,
  init: { params: { query: Query } },
) => Promise<{ data?: unknown; error?: unknown; response: Response }>

async function get<T>(path: string, query: Query = {}): Promise<T> {
  const clean: Query = {}
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') clean[k] = v
  const loose = aureon.GET as unknown as LooseGet
  return must(await loose(path, { params: { query: clean } })) as T
}

export const originsApi = {
  trades: (q: {
    origin: OriginFilter
    from: string
    to: string
    symbol?: string
    limit?: number
  }) =>
    get<TradesOut>('/api/trading/mt5/trades', {
      origin: apiOrigin(q.origin),
      from: q.from,
      to: q.to,
      symbol: q.symbol,
      limit: q.limit ?? 200,
      offset: 0,
    }),
  stats: (q: { from: string; to: string; bucket: Bucket }) =>
    get<TradeStatsOut>('/api/trading/mt5/trades/stats', q),
  openPositions: () => get<OpenPositionsOut>('/api/trading/mt5/positions/open'),
  gaps: (limit = 50) => get<TradeGapsOut>('/api/trading/mt5/trades/gaps', { limit }),
  dhanOrders: (q: { from: string; to: string; origin: OriginFilter }) =>
    get<DhanOriginOrdersOut>('/api/trading/dhan/orders/origins', {
      from: q.from,
      to: q.to,
      origin: dhanOrigin(q.origin) ?? undefined,
    }),
}
