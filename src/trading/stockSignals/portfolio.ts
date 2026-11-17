// Portfolio Map maths: each holding's weight and P&L, the tile tone from its
// signal, concentration warnings, and a rebalance preview (current vs proposed
// weights, the shares that would move and the cash it needs). A preview only:
// nothing here places, proposes or queues an order.

import type { SignalClass } from './classify'

export interface HoldingInput {
  symbol: string
  quantity: number
  avgCost: number
  /** The newest price we have (stream, candle or the broker's last_price). */
  price: number | null
}

export interface HoldingView extends HoldingInput {
  value: number
  cost: number
  pnl: number | null
  pnlPct: number | null
  /** Share of the portfolio's market value, 0–1. */
  weight: number
}

export function holdingViews(rows: readonly HoldingInput[]): HoldingView[] {
  const valued = rows.map((h) => {
    const value = h.price !== null ? h.price * h.quantity : h.avgCost * h.quantity
    const cost = h.avgCost * h.quantity
    return {
      ...h,
      value,
      cost,
      pnl: h.price !== null ? value - cost : null,
      pnlPct: h.price !== null && cost > 0 ? ((value - cost) / cost) * 100 : null,
      weight: 0,
    }
  })
  const total = valued.reduce((a, h) => a + h.value, 0)
  return valued
    .map((h) => ({ ...h, weight: total > 0 ? h.value / total : 0 }))
    .sort((a, b) => b.weight - a.weight)
}

export type Tone = 'bull' | 'bear' | 'amber' | 'neutral'
export function toneOf(cls: SignalClass | null | undefined, stale = false): Tone {
  if (stale || !cls || cls === 'unavailable') return 'neutral'
  return cls === 'bullish' ? 'bull' : cls === 'bearish' ? 'bear' : 'amber'
}

/** A single holding over this share of the portfolio is a concentration warning. */
export const CONCENTRATION = 0.25

export function concentrated(views: readonly HoldingView[], limit = CONCENTRATION): HoldingView[] {
  return views.filter((h) => h.weight > limit)
}

export interface RebalanceLine {
  symbol: string
  price: number | null
  current: number
  proposed: number
  /** Shares to buy (+) or sell (−), whole shares; null without a price. */
  shares: number | null
  /** Cash out (+) or in (−) for those shares. */
  cash: number | null
}

export interface RebalancePreview {
  lines: RebalanceLine[]
  total: number
  /** Net cash the moves need: positive = cash to add, negative = cash freed. */
  cashNeeded: number
  /** Proposed weights that do not add to 100%. */
  unallocated: number
}

/**
 * Current vs proposed weights (0–1, by symbol) over the same portfolio value.
 * Symbols only in `proposed` are new positions and need a price.
 */
export function rebalance(
  views: readonly HoldingView[],
  proposed: Readonly<Record<string, number>>,
  prices: Readonly<Record<string, number | null>> = {},
): RebalancePreview {
  const total = views.reduce((a, h) => a + h.value, 0)
  const symbols = [...new Set([...views.map((h) => h.symbol), ...Object.keys(proposed)])]
  const lines = symbols.map((symbol) => {
    const h = views.find((v) => v.symbol === symbol)
    const price = h?.price ?? prices[symbol] ?? null
    const current = h?.weight ?? 0
    const target = proposed[symbol] ?? current
    const delta = (target - current) * total
    const shares = price ? Math.trunc(delta / price) : null
    return {
      symbol,
      price,
      current,
      proposed: target,
      shares,
      cash: shares !== null && price ? shares * price : null,
    }
  })
  return {
    lines,
    total,
    cashNeeded: lines.reduce((a, l) => a + (l.cash ?? 0), 0),
    unallocated: 1 - lines.reduce((a, l) => a + l.proposed, 0),
  }
}
