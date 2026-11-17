// Stock-signal alerts: the typed boundary to the backend's stock-signal monitor.
//
// The monitor (EMA 8/32 crosses, VWAP confirmation, portfolio reversals, new
// candidates and concentration warnings, stored per user with read state) is
// being built in Aureon; its endpoints are not in the generated contract yet.
// Every call goes through here, untyped, through the same client (session
// cookie, CSRF, the client's retry policy). A 404 / 405 / 501 means "not
// shipped" and turns the whole feature into an honest "not available yet",
// never into sample alerts.
//
// Expected contract (reconcile with the backend's OpenAPI when it lands, then
// replace the casts with typed calls and run `pnpm api:gen`):
//   GET  /api/trading/stock-signals/events?limit&offset&type&instrument_id&unread
//          → { items: StockSignalEvent[], total, unread }
//   POST /api/trading/stock-signals/events/read   { ids?: string[], all?: true } → { unread }
//   GET  /api/trading/stock-signals/subscriptions → { items: Subscription[] }
//   PUT  /api/trading/stock-signals/subscriptions/{instrument_id} { types } → Subscription
//   DELETE /api/trading/stock-signals/subscriptions/{instrument_id}
//   SSE  /api/trading/stream  event `stock_signal`, data StockSignalEvent

import { aureon } from '@/api/client'

export type StockSignalEventType =
  | 'bullish_cross'
  | 'bearish_cross'
  | 'vwap_confirmed'
  | 'trend_reversal'
  | 'new_candidate'
  | 'concentration'

export const EVENT_LABEL: Record<StockSignalEventType, string> = {
  bullish_cross: 'Bullish EMA 8/32 cross',
  bearish_cross: 'Bearish EMA 8/32 cross',
  vwap_confirmed: 'VWAP confirmation',
  trend_reversal: 'Portfolio trend reversal',
  new_candidate: 'New qualified candidate',
  concentration: 'Concentration warning',
}
/** What a person can subscribe to for one stock. */
export const SUBSCRIBABLE: StockSignalEventType[] = [
  'bullish_cross',
  'bearish_cross',
  'vwap_confirmed',
]

export interface StockSignalEvent {
  id: string
  type: StockSignalEventType
  instrument_id: number | null
  symbol: string | null
  timeframe: string | null
  price: string | null
  /** When the event happened (the candle or the check), ISO. */
  at: string
  detail: string | null
  read: boolean
}
export interface EventPage {
  items: StockSignalEvent[]
  total: number
  unread: number
}
export interface Subscription {
  instrument_id: number
  types: StockSignalEventType[]
}

export const BASE = '/api/trading/stock-signals'

export class AlertsUnavailable extends Error {
  constructor() {
    super('Stock-signal alerts are not available on this server yet.')
  }
}

type Untyped = (
  path: string,
  init?: { params?: { query?: Record<string, unknown> }; body?: unknown },
) => Promise<{ data?: unknown; error?: unknown; response: Response }>

const NOT_SHIPPED = new Set([404, 405, 501])

async function call(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  init?: Parameters<Untyped>[1],
) {
  const fn = (aureon as unknown as Record<string, Untyped>)[method]
  const r = await fn(path, init)
  if (NOT_SHIPPED.has(r.response.status)) throw new AlertsUnavailable()
  if (!r.response.ok) {
    const detail = (r.error as { detail?: unknown } | undefined)?.detail
    throw new Error(
      typeof detail === 'string' ? detail : `The server answered ${r.response.status}.`,
    )
  }
  return r.data
}

function isEvent(x: unknown): x is StockSignalEvent {
  const e = x as StockSignalEvent
  return !!e && typeof e.id === 'string' && typeof e.type === 'string' && typeof e.at === 'string'
}

export async function fetchEvents(
  q: {
    limit?: number
    offset?: number
    type?: StockSignalEventType
    instrumentId?: number
    unread?: boolean
  } = {},
): Promise<EventPage> {
  const data = (await call('GET', `${BASE}/events`, {
    params: {
      query: {
        limit: q.limit ?? 100,
        offset: q.offset ?? 0,
        ...(q.type ? { type: q.type } : {}),
        ...(q.instrumentId ? { instrument_id: q.instrumentId } : {}),
        ...(q.unread ? { unread: true } : {}),
      },
    },
  })) as Partial<EventPage> | undefined
  const items = (data?.items ?? []).filter(isEvent)
  return {
    items,
    total: data?.total ?? items.length,
    unread: data?.unread ?? items.filter((e) => !e.read).length,
  }
}

export async function markRead(ids: string[] | 'all'): Promise<number | null> {
  const data = (await call('POST', `${BASE}/events/read`, {
    body: ids === 'all' ? { all: true } : { ids },
  })) as { unread?: number } | undefined
  return typeof data?.unread === 'number' ? data.unread : null
}

export async function fetchSubscriptions(): Promise<Subscription[]> {
  const data = (await call('GET', `${BASE}/subscriptions`)) as
    { items?: Subscription[] } | undefined
  return data?.items ?? []
}

export async function saveSubscription(
  instrumentId: number,
  types: StockSignalEventType[],
): Promise<void> {
  if (types.length) await call('PUT', `${BASE}/subscriptions/${instrumentId}`, { body: { types } })
  else await call('DELETE', `${BASE}/subscriptions/${instrumentId}`)
}

/** New events not seen before, newest first, without duplicates (by id). */
export function mergeEvents(
  known: readonly StockSignalEvent[],
  incoming: readonly StockSignalEvent[],
): StockSignalEvent[] {
  const byId = new Map(known.map((e) => [e.id, e]))
  for (const e of incoming) byId.set(e.id, { ...byId.get(e.id), ...e })
  return [...byId.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}
