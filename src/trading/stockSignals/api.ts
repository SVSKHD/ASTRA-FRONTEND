// The backend's Stock Signals API (Aureon docs/37-stock-signals.md), typed from
// the generated contract. Every number on the Stock Signals page comes from here:
// the signal engine's stored states and crossover events, the market rankings,
// the portfolio map and rebalance preview, and the per-user notifications.
//
//   GET  /api/trading/stock-signals                 crossover events
//   GET  /api/trading/stock-signals/{id}            one event + the instrument's current state
//   GET  /api/trading/stock-signals/states          the latest state of every evaluated instrument
//   GET  /api/trading/stock-signals/market-movers   gainers / losers / unusual volume
//   GET  /api/trading/stock-signals/trending        bullish / bearish by trend score
//   GET  /api/trading/stock-signals/portfolio-map   holdings with signal, P&L, class
//   POST /api/trading/stock-signals/rebalance-preview   a preview; no order or intent is created
//   GET  /api/trading/stock-signals/notifications   (+ PATCH /{id}/read, POST /read-all)
//   GET/PUT /api/trading/stock-signals/notifications/preferences
//   GET  /api/trading/stock-signals/stream          SSE: hello / notification / bye

import { aureon, type components } from '@/api/client'
import { must } from '@/trading/useLoad'

type S = components['schemas']
export type StateRow = S['StockSignalStateOut']
export type SignalEvent = S['StockSignalEventOut']
export type SignalDetail = S['StockSignalDetailOut']
export type Ranking = S['RankingOut']
export type PortfolioMap = S['PortfolioMapOut']
export type PortfolioHolding = S['PortfolioHoldingOut']
export type RebalanceIn = S['RebalanceIn']
export type RebalancePreview = S['RebalancePreviewOut']
export type Notification = S['StockSignalNotificationOut']
export type NotificationPage = S['StockSignalNotificationsOut']
export type Prefs = S['StockSignalPrefsOut']
export type SignalState = StateRow['state']
export type NotificationKind = NonNullable<Prefs['kinds']>[number]
export type SignalTf = NonNullable<Prefs['timeframes']>[number]
export type Classification = PortfolioHolding['classification']

export const SIGNAL_TFS: SignalTf[] = ['5m', '15m', '1h', '1d']
export const DEFAULT_TF: SignalTf = '15m'

/** A decimal string (or null) as a number, or null. */
export function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// --- states, events and rankings ------------------------------------------------------------

/** Rows the table reads at most (the API pages by 200). */
export const MAX_STATES = 1000

/** Every stored state on this timeframe, page by page, up to `max`. */
export async function fetchStates(
  tf: SignalTf,
  opts: { inHoldings?: boolean; includeUnavailable?: boolean; max?: number } = {},
): Promise<{ items: StateRow[]; total: number }> {
  const max = opts.max ?? MAX_STATES
  const items: StateRow[] = []
  let total = 0
  for (let offset = 0; offset < max; offset += 200) {
    const page = must(
      await aureon.GET('/api/trading/stock-signals/states', {
        params: {
          query: {
            timeframe: tf,
            include_unavailable: opts.includeUnavailable ?? false,
            ...(opts.inHoldings ? { in_holdings: true } : {}),
            limit: 200,
            offset,
          },
        },
      }),
    )
    items.push(...page.items)
    total = page.total
    if (page.items.length < 200 || items.length >= total) break
  }
  return { items, total }
}

/** Recent crossover events on this timeframe, newest first. */
export async function fetchEvents(tf: SignalTf, limit = 200): Promise<SignalEvent[]> {
  const page = must(
    await aureon.GET('/api/trading/stock-signals', {
      params: { query: { timeframe: tf, sort: '-crossed_at', limit } },
    }),
  )
  return page.items
}

export async function fetchSignal(id: number): Promise<SignalDetail> {
  return must(
    await aureon.GET('/api/trading/stock-signals/{signal_id}', {
      params: { path: { signal_id: id } },
    }),
  )
}

export type MoverKind = 'gainers' | 'losers' | 'unusual_volume'
export async function fetchMovers(kind: MoverKind, tf: SignalTf, limit = 10): Promise<Ranking> {
  return must(
    await aureon.GET('/api/trading/stock-signals/market-movers', {
      params: { query: { kind, timeframe: tf, limit } },
    }),
  )
}
export async function fetchTrending(
  direction: 'bullish' | 'bearish',
  tf: SignalTf,
  limit = 10,
): Promise<Ranking> {
  return must(
    await aureon.GET('/api/trading/stock-signals/trending', {
      params: { query: { direction, timeframe: tf, limit } },
    }),
  )
}

// --- portfolio -------------------------------------------------------------------------------

export async function fetchPortfolio(tf: SignalTf): Promise<PortfolioMap> {
  return must(
    await aureon.GET('/api/trading/stock-signals/portfolio-map', {
      params: { query: { timeframe: tf } },
    }),
  )
}
export async function previewRebalance(body: RebalanceIn): Promise<RebalancePreview> {
  return must(await aureon.POST('/api/trading/stock-signals/rebalance-preview', { body }))
}

// --- notifications ---------------------------------------------------------------------------

export async function fetchNotifications(
  q: {
    afterId?: number
    beforeId?: number
    unreadOnly?: boolean
    limit?: number
  } = {},
): Promise<NotificationPage> {
  return must(
    await aureon.GET('/api/trading/stock-signals/notifications', {
      params: {
        query: {
          limit: q.limit ?? 100,
          ...(q.afterId !== undefined ? { after_id: q.afterId } : {}),
          ...(q.beforeId !== undefined ? { before_id: q.beforeId } : {}),
          ...(q.unreadOnly ? { unread_only: true } : {}),
        },
      },
    }),
  )
}
export async function markNotificationRead(id: number): Promise<Notification> {
  return must(
    await aureon.PATCH('/api/trading/stock-signals/notifications/{notification_id}/read', {
      params: { path: { notification_id: id } },
    }),
  )
}
export async function markAllRead(upToId?: number): Promise<number> {
  const r = must(
    await aureon.POST('/api/trading/stock-signals/notifications/read-all', {
      body: upToId ? { up_to_id: upToId } : {},
    }),
  )
  return r.unread_count
}
export async function fetchPrefs(): Promise<Prefs> {
  return must(await aureon.GET('/api/trading/stock-signals/notifications/preferences'))
}
export async function savePrefs(p: Prefs): Promise<Prefs> {
  return must(
    await aureon.PUT('/api/trading/stock-signals/notifications/preferences', {
      body: {
        enabled: p.enabled,
        kinds: p.kinds,
        timeframes: p.timeframes,
        all_market: p.all_market,
        confirmed_only: p.confirmed_only,
      },
    }),
  )
}

// --- words -------------------------------------------------------------------------------------

/** The table's five buckets (colour + icon); the label keeps the full state. */
export type Bucket = 'bullish' | 'bearish' | 'pending' | 'mixed' | 'unavailable'
export const STATE_BUCKET: Record<SignalState, Bucket> = {
  BULLISH_CONFIRMED: 'bullish',
  BULLISH_TREND: 'bullish',
  BULLISH_PENDING: 'pending',
  BEARISH_CONFIRMED: 'bearish',
  BEARISH_TREND: 'bearish',
  BEARISH_PENDING: 'pending',
  MIXED: 'mixed',
  UNAVAILABLE: 'unavailable',
}
export const STATE_LABEL: Record<SignalState, string> = {
  BULLISH_CONFIRMED: 'Bullish · confirmed',
  BULLISH_TREND: 'Bullish trend',
  BULLISH_PENDING: 'Bullish · awaiting VWAP',
  BEARISH_CONFIRMED: 'Bearish · confirmed',
  BEARISH_TREND: 'Bearish trend',
  BEARISH_PENDING: 'Bearish · awaiting VWAP',
  MIXED: 'Mixed',
  UNAVAILABLE: 'No data',
}
export const STATE_HELP: Record<SignalState, string> = {
  BULLISH_CONFIRMED:
    'EMA 8 crossed above EMA 32 recently and a close since was above the session VWAP.',
  BULLISH_TREND: 'No recent cross; EMA 8 is above EMA 32 and price is above VWAP.',
  BULLISH_PENDING: 'EMA 8 crossed above EMA 32; no close above VWAP yet.',
  BEARISH_CONFIRMED:
    'EMA 8 crossed below EMA 32 recently and a close since was below the session VWAP.',
  BEARISH_TREND: 'No recent cross; EMA 8 is below EMA 32 and price is below VWAP.',
  BEARISH_PENDING: 'EMA 8 crossed below EMA 32; no close below VWAP yet.',
  MIXED: 'The EMAs and VWAP disagree (or there is no VWAP), so there is no signal.',
  UNAVAILABLE:
    'Too little history, or the newest closed candle is too old (counted in trading time).',
}

export const KIND_LABEL: Record<NotificationKind, string> = {
  bullish_cross: 'Bullish EMA 8/32 cross',
  bearish_cross: 'Bearish EMA 8/32 cross',
  vwap_confirmed: 'VWAP confirmation',
  holding_reversal: 'Holding reversal',
  portfolio_trend_change: 'Portfolio trend change',
  replacement_candidate: 'Replacement candidate',
}
export const ALL_KINDS = Object.keys(KIND_LABEL) as NotificationKind[]

export const CLASS_LABEL: Record<Classification, string> = {
  HOLD_CANDIDATE: 'Hold',
  POTENTIAL_ADD: 'Potential add',
  MONITOR: 'Monitor',
  REVIEW_RISK: 'Review risk',
}

/** The candle a close time belongs to: the last bar starting before it. */
export function barForClose(times: readonly number[], closeAt: string | null | undefined): number {
  if (!closeAt) return -1
  const t = Date.parse(closeAt)
  let out = -1
  for (let i = 0; i < times.length; i++) {
    if (times[i] < t) out = i
    else break
  }
  return out
}

/**
 * One stock's newest crossover on a timeframe and its current state there:
 * the events are filtered by symbol (a prefix), so the instrument id picks the
 * right one. Null when it has not crossed on that timeframe within retention.
 */
export async function latestFor(
  instrumentId: number,
  symbol: string,
  tf: SignalTf,
): Promise<SignalDetail | null> {
  const page = must(
    await aureon.GET('/api/trading/stock-signals', {
      params: { query: { timeframe: tf, symbol, sort: '-crossed_at', limit: 50 } },
    }),
  )
  const hit = page.items.find((e) => e.instrument_id === instrumentId)
  return hit ? fetchSignal(hit.id) : null
}
