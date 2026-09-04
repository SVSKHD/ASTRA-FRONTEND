// Signals and trades on one timeline (section 34).
//
// Combined mode exists to answer one question the two separate tables cannot:
// which signals were acted on. That is a claim about a PAIR, so it is computed
// here rather than drawn in a component — a link the renderer invents is a link
// nobody can test.
//
// The matching rule, in order of how much it is trusted:
//
//   1. An explicit `signalId` on the trade. Somebody said so; nothing overrides
//      it, not even a closer signal.
//   2. Otherwise the first GO for the same symbol whose instant is at or before
//      the trade's, within the window. Ninety minutes because that is how long
//      a setup is worth acting on; after that the trade is its own decision and
//      calling it "taken on" the signal would be a story rather than a record.
//
// Every link is one-to-one in both directions. A signal that two trades both
// followed belongs to the first of them: the second is a separate trade, and
// counting one signal twice would inflate the only number this view produces.

import type { DacoitSignal, Trade } from '@/types'

export const LINK_WINDOW_MS = 90 * 60_000

export interface TimelineRow {
  kind: 'signal' | 'trade'
  /** The instant, which is what the row is sorted by — never a clock string. */
  at: number
  id: string
  signal?: DacoitSignal
  trade?: Trade
  /** On a signal: the id of the trade taken on it. On a trade: its signal. */
  linkedId?: string
  /** Minutes from the signal to the trade, on a linked pair. */
  gapMinutes?: number
}

export interface Linked {
  /** Trade id → signal id. */
  tradeToSignal: Record<string, string>
  /** Signal id → trade id. */
  signalToTrade: Record<string, string>
  /** GOs nobody traded, in order. The number the view is actually about. */
  untaken: DacoitSignal[]
}

/**
 * Pair the GOs with the trades that followed them.
 *
 * Signals are walked oldest first and each takes the earliest eligible trade
 * that is still free, which is what makes the result independent of the order
 * the arrays arrive in.
 */
export function linkSignals(
  trades: Trade[],
  signals: DacoitSignal[],
  windowMs = LINK_WINDOW_MS,
): Linked {
  const tradeToSignal: Record<string, string> = {}
  const signalToTrade: Record<string, string> = {}
  const takenTrades = new Set<string>()

  // Explicit links first, so a later proximity match cannot steal either side.
  for (const trade of trades) {
    if (!trade.signalId) continue
    const signal = signals.find((s) => s.signalId === trade.signalId || s.id === trade.signalId)
    if (!signal || signalToTrade[signal.id]) continue
    tradeToSignal[trade.id] = signal.id
    signalToTrade[signal.id] = trade.id
    takenTrades.add(trade.id)
  }

  const gos = signals.filter((s) => s.verdict === 'GO').sort((a, b) => a.signalAt - b.signalAt)
  const byTime = trades.filter((t) => t.entryAt > 0).sort((a, b) => a.entryAt - b.entryAt)

  for (const signal of gos) {
    if (signalToTrade[signal.id]) continue
    const match = byTime.find(
      (t) =>
        !takenTrades.has(t.id) &&
        t.symbol === signal.symbol &&
        t.entryAt >= signal.signalAt &&
        t.entryAt - signal.signalAt <= windowMs,
    )
    if (!match) continue
    tradeToSignal[match.id] = signal.id
    signalToTrade[signal.id] = match.id
    takenTrades.add(match.id)
  }

  return {
    tradeToSignal,
    signalToTrade,
    untaken: gos.filter((s) => !signalToTrade[s.id]),
  }
}

/**
 * One day's signals and trades, interleaved in the order they happened.
 *
 * Sorted by the instant with signals first on a tie, because a signal that
 * fired in the same minute as the trade it prompted came first — a stable
 * order matters here, since the link is drawn between adjacent rows.
 */
export function dayTimeline(
  trades: Trade[],
  signals: DacoitSignal[],
  links: Linked,
): TimelineRow[] {
  const rows: TimelineRow[] = [
    ...signals.map<TimelineRow>((s) => ({
      kind: 'signal',
      at: s.signalAt,
      id: s.id,
      signal: s,
      linkedId: links.signalToTrade[s.id],
    })),
    ...trades.map<TimelineRow>((t) => ({
      kind: 'trade',
      at: t.entryAt,
      id: t.id,
      trade: t,
      linkedId: links.tradeToSignal[t.id],
    })),
  ].sort((a, b) => a.at - b.at || (a.kind === 'signal' ? -1 : 1))

  const at = new Map(rows.map((r) => [r.id, r.at]))
  for (const row of rows) {
    if (!row.linkedId) continue
    const other = at.get(row.linkedId)
    if (other === undefined) continue
    row.gapMinutes = Math.round(Math.abs(row.at - other) / 60_000)
  }
  return rows
}

/** How many GOs were acted on, as a rate. Zero signals is 0, not a division. */
export function takeRate(links: Linked, signals: DacoitSignal[]): number {
  const gos = signals.filter((s) => s.verdict === 'GO').length
  if (!gos) return 0
  return Math.round((Object.keys(links.signalToTrade).length / gos) * 10000) / 100
}
