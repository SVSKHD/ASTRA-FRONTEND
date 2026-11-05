// The panel's real-time feed: one GET /api/trading/stream (SSE) per tab.
//
// Resumable (the server's cursor rides on every event, src/api/sse.ts reconnects
// with it after a hard failure), so a dropped connection loses no signal or risk
// decision. Pages read the reactive state below; nothing here writes anything.

import { reactive } from 'vue'
import { apiUrl } from '@/api/config'
import { openStream, type StreamHandle, type StreamStatus } from '@/api/sse'
import { onSchemaFingerprint } from '@/modules/manifest'

export interface StreamSignal {
  id: string
  instrument_id: number
  strategy_version_id: string
  timeframe: string
  candle_time: string
  session: string
  side: 'BUY' | 'SELL' | 'NO_TRADE'
  created_at: string
}
export interface StreamRisk {
  id: number
  broker_account_id: string
  signal_id: string | null
  approved: boolean
  reason: string
  created_at: string
}
export interface StreamAgent {
  id: string
  name: string
  state: string
  last_heartbeat_at: string | null
}
export interface StreamQuote {
  instrument_id: number
  ref: string
  ltp: string | null
  ltt: string | null
  volume: string | null
  stale: boolean
  received_at: string | null
  source: 'broker'
}
/** The MT5 bot pushed, or its open failures changed (backend docs/12 §3). */
export interface StreamMt5 {
  push_id: string
  seq: number | null
  received_at: string
  generated_at: string
  open_failures: number
}
export interface StreamBacktest {
  id: string
  status: string
  error: string | null
}

const KEEP = 100

export const live = reactive({
  status: 'closed' as StreamStatus,
  signals: [] as StreamSignal[],
  risks: [] as StreamRisk[],
  agents: {} as Record<string, StreamAgent>,
  quotes: {} as Record<number, StreamQuote>,
  backtests: {} as Record<string, StreamBacktest>,
  mt5: null as StreamMt5 | null,
  lastEventAt: null as string | null,
  /** The instrument ids this tab's stream follows (one EventSource per tab, never more). */
  subscribed: [] as number[],
  /** When the stream last reached `open` (browser clock; for "connected for …" only). */
  openedAt: null as string | null,
})

let handle: StreamHandle | null = null
let subscribed: number[] = []

function unshiftUnique<T extends { id: unknown }>(list: T[], item: T) {
  if (list.some((x) => x.id === item.id)) return
  list.unshift(item)
  if (list.length > KEEP) list.length = KEEP
}

/** Apply one event. Exported for the tests. */
export function applyEvent(event: string, raw: string): void {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return
  }
  live.lastEventAt = new Date().toISOString()
  switch (event) {
    case 'signal':
      unshiftUnique(live.signals, data as StreamSignal)
      break
    case 'risk':
      unshiftUnique(live.risks, data as StreamRisk)
      break
    case 'agent': {
      const a = data as StreamAgent
      live.agents[a.id] = a
      break
    }
    case 'quote': {
      const q = data as StreamQuote
      live.quotes[q.instrument_id] = q
      break
    }
    case 'backtest': {
      const b = data as StreamBacktest
      live.backtests[b.id] = b
      break
    }
    case 'mt5':
      live.mt5 = data as StreamMt5
      break
    case 'schema_changed': {
      // A deploy changed the API: the Modules nav re-reads its manifest.
      const hash = (data as { schema_hash?: unknown })?.schema_hash
      onSchemaFingerprint(typeof hash === 'string' ? hash : '')
      break
    }
  }
}

const EVENTS = [
  'hello',
  'signal',
  'risk',
  'agent',
  'quote',
  'backtest',
  'mt5',
  'schema_changed',
  'bye',
]

/** (Re)open the stream; `instrumentIds` are the quotes to follow. */
export function connect(
  instrumentIds: number[] = subscribed,
  impl?: { EventSourceImpl?: typeof EventSource },
): void {
  const ids = [...new Set(instrumentIds)].sort((a, b) => a - b)
  // Same set and a live handle: nothing to do, so a re-render or a remount never
  // opens a second stream or a duplicate subscription.
  if (handle && ids.join() === subscribed.join()) return
  handle?.close()
  subscribed = ids
  live.subscribed = ids
  // A quote for an instrument no longer followed would never update again: drop
  // it rather than leave it on screen looking current.
  for (const key of Object.keys(live.quotes)) {
    if (!ids.includes(Number(key))) delete live.quotes[Number(key)]
  }
  const q = ids.map((i) => `instrument_id=${i}`).join('&')
  handle = openStream(apiUrl(`/api/trading/stream${q ? `?${q}` : ''}`), {
    events: EVENTS,
    onEvent: (e) => applyEvent(e.event, e.data),
    onStatus: (s) => {
      live.status = s
      if (s === 'open') live.openedAt = new Date().toISOString()
    },
    ...impl,
  })
}

/** Close and reopen the same subscription (the operator's "Reconnect stream"). */
export function reconnect(impl?: { EventSourceImpl?: typeof EventSource }): void {
  handle?.close()
  handle = null
  connect(subscribed, impl)
}

export function disconnect(): void {
  handle?.close()
  handle = null
  live.status = 'closed'
}
