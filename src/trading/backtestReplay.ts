// A backtest, replayed bar by bar: where each trade sits on the candles, what has
// happened by the replay's cursor (trades closed, the one still open, the equity
// so far, the worst drawdown) and the trade log's rows. Plain functions of the
// trades, the candle times and the cursor, so the tests need no DOM or clock.
//
// The server's trades (GET /api/trading/backtests/{id}) are simulated fills at
// the next bar's open; nothing here places or proposes an order.

import type { components } from '@/api/client'

export type BacktestTrade = components['schemas']['BacktestTradeOut']

/** A long trade buys first; the server writes the side as buy/sell (or long/short). */
export function isLong(side: string): boolean {
  return /^(buy|long)$/i.test(side.trim())
}

/** The bar a moment falls in: the last candle at or before it, or -1 before the first. */
export function barAt(times: readonly number[], t: number): number {
  let lo = 0
  let hi = times.length - 1
  let out = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= t) {
      out = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return out
}

export interface PlacedTrade {
  /** 1-based, in entry order. */
  n: number
  trade: BacktestTrade
  long: boolean
  entryBar: number
  /** -1 while it has no exit (open at the end of the test). */
  exitBar: number
  entryAt: number
  exitAt: number | null
  entry: number
  exit: number | null
  qty: number
  pnl: number | null
  fees: number
  /** P&L as a share of the money put in (entry × quantity). */
  ret: number | null
}

/** The trades in entry order, each placed on the candles. */
export function placeTrades(
  trades: readonly BacktestTrade[],
  times: readonly number[],
): PlacedTrade[] {
  return [...trades]
    .sort((a, b) => Date.parse(a.entry_time) - Date.parse(b.entry_time))
    .map((trade, i) => {
      const entryAt = Date.parse(trade.entry_time)
      const exitAt = trade.exit_time ? Date.parse(trade.exit_time) : null
      const entry = Number(trade.entry_price)
      const qty = Number(trade.quantity) || 0
      const pnl = trade.pnl === null || trade.pnl === undefined ? null : Number(trade.pnl)
      const outlay = entry * Math.abs(qty)
      return {
        n: i + 1,
        trade,
        long: isLong(trade.side),
        entryBar: barAt(times, entryAt),
        exitBar: exitAt === null ? -1 : barAt(times, exitAt),
        entryAt,
        exitAt,
        entry,
        exit: trade.exit_price ? Number(trade.exit_price) : null,
        qty,
        pnl,
        fees: Number(trade.fees) || 0,
        ret: pnl !== null && outlay > 0 ? pnl / outlay : null,
      }
    })
}

export type TradeState = 'pending' | 'open' | 'closed'

/** Where a trade stands at bar `cursor`. */
export function stateAt(t: PlacedTrade, cursor: number): TradeState {
  if (t.entryBar > cursor || t.entryBar < 0) return 'pending'
  if (t.exitBar >= 0 && t.exitBar <= cursor) return 'closed'
  return 'open'
}

/** An open trade's P&L at a price, before fees. */
export function unrealised(t: PlacedTrade, price: number): number {
  return (price - t.entry) * Math.abs(t.qty) * (t.long ? 1 : -1)
}

export interface ReplayStats {
  closed: number
  wins: number
  losses: number
  /** wins / closed, or null with nothing closed. */
  winRate: number | null
  net: number
  fees: number
  /** The deepest fall of closed P&L from its high so far (≥ 0). */
  maxDrawdown: number
  best: number | null
  worst: number | null
  /** The trade open at the cursor, if any. */
  open: PlacedTrade | null
  /** Closed P&L after each closed trade, starting at 0: the equity curve. */
  equity: { bar: number; value: number }[]
}

export function statsAt(placed: readonly PlacedTrade[], cursor: number): ReplayStats {
  const closed = placed
    .filter((t) => stateAt(t, cursor) === 'closed' && t.pnl !== null)
    .sort((a, b) => a.exitBar - b.exitBar || a.n - b.n)
  let net = 0
  let peak = 0
  let maxDrawdown = 0
  let wins = 0
  let fees = 0
  let best: number | null = null
  let worst: number | null = null
  const equity = [{ bar: closed[0]?.entryBar ?? 0, value: 0 }]
  for (const t of closed) {
    const p = t.pnl as number
    net += p
    fees += t.fees
    if (p > 0) wins++
    best = best === null ? p : Math.max(best, p)
    worst = worst === null ? p : Math.min(worst, p)
    peak = Math.max(peak, net)
    maxDrawdown = Math.max(maxDrawdown, peak - net)
    equity.push({ bar: t.exitBar, value: net })
  }
  const open = [...placed].reverse().find((t) => stateAt(t, cursor) === 'open') ?? null
  return {
    closed: closed.length,
    wins,
    losses: closed.length - wins,
    winRate: closed.length ? wins / closed.length : null,
    net,
    fees,
    maxDrawdown,
    best,
    worst,
    open,
    equity,
  }
}

export interface Marker {
  index: number
  kind: 'buy' | 'sell'
  confirmed: boolean
  label: string
}

/** Entry and exit marks for the trades that have happened by the cursor. */
export function markersAt(placed: readonly PlacedTrade[], cursor: number): Marker[] {
  const out: Marker[] = []
  for (const t of placed) {
    if (t.entryBar < 0 || t.entryBar > cursor) continue
    out.push({
      index: t.entryBar,
      kind: t.long ? 'buy' : 'sell',
      confirmed: true,
      label: `#${t.n} ${t.long ? 'Long' : 'Short'} entry ${t.trade.entry_price}`,
    })
    if (t.exitBar >= 0 && t.exitBar <= cursor)
      out.push({
        index: t.exitBar,
        kind: t.long ? 'sell' : 'buy',
        confirmed: true,
        label: `#${t.n} exit ${t.trade.exit_price ?? ''}`.trim(),
      })
  }
  return out
}

/** "3 bars", "1 bar"; how long a trade was held, in candles. */
export function heldBars(t: PlacedTrade, cursor: number): number {
  const end = t.exitBar >= 0 && t.exitBar <= cursor ? t.exitBar : cursor
  return Math.max(0, end - t.entryBar)
}

/** Replay speeds, in candles per second. */
export const SPEEDS = [1, 4, 12, 40, 120] as const
