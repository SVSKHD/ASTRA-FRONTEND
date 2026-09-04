// One trade, in both directions (section 33).
//
// Reading and writing live together because they are one contract: every field
// the writer derives, the reader has to un-derive, and a change made to one
// half in a different file is how a stored `move` stops matching the prices
// beside it. Both halves are pure — no Firestore handle beyond the Timestamp
// constructor, no refs — so the arithmetic is testable without a database.
//
// The stored shape is deliberately small. `entryAt` is the fact; the IST day,
// the IST time and the broker offset are the readings that were taken of it,
// kept so a row reads back as it was typed. Broker time, UTC, the session
// boundary and the hour bucket are all derived at the point of use and none of
// them is stored (section 31).

import type { DocumentData } from 'firebase/firestore'
import type { FirestoreModule } from '@/firebase'
import { contractSizeFor, tradeMove, tradePl } from '@/utils/tradeMath'
import { IST, hhmmOn, instantFromWall, offsetAt, ymdOn } from '@/utils/tradeTime'
import type { AstraSettings, Trade, TradeSession, TradeSide } from '@/types'

/** What the form hands over. `move` and `pl` are derived, never typed. */
export interface TradeDraft {
  istDate: string
  istTime: string
  /** '' when the close was not recorded. */
  exitTime: string
  symbol: string
  session: TradeSession
  side: TradeSide
  lot: number
  entry: number
  exit: number
  note: string
  /** The Dacoit signal this was taken on, when the desk linked them. */
  signalId?: string
  /** Carried through an edit so a backfilled time is not re-labelled as typed. */
  timeEstimated?: boolean
}

function millis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis(): number }).toMillis()
  }
  return typeof value === 'number' ? value : 0
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function readTrade(id: string, data: DocumentData): Trade {
  return {
    id,
    userId: String(data.userId ?? ''),
    istDate: String(data.istDate ?? ''),
    ts: millis(data.ts),
    entryAt: millis(data.entryAt),
    exitAt: millis(data.exitAt),
    istTime: String(data.istTime ?? ''),
    brokerOffsetMinutes: num(data.brokerOffsetMinutes, 180),
    timeEstimated: data.timeEstimated === true,
    symbol: String(data.symbol ?? ''),
    session: (data.session as TradeSession) ?? 'London',
    side: (data.side as TradeSide) ?? 'buy',
    lot: num(data.lot, 1),
    entry: num(data.entry),
    exit: num(data.exit),
    move: num(data.move),
    pl: num(data.pl),
    note: String(data.note ?? ''),
    createdAt: millis(data.createdAt),
    signalId: String(data.signalId ?? '') || undefined,
  }
}

/** The draft form of a stored row, for an edit that starts from what is there. */
export function toDraft(trade: Trade): TradeDraft {
  return {
    istDate: trade.istDate,
    istTime: trade.istTime,
    exitTime: trade.exitAt ? hhmmOn(IST, trade.exitAt) : '',
    symbol: trade.symbol,
    session: trade.session,
    side: trade.side,
    lot: trade.lot,
    entry: trade.entry,
    exit: trade.exit,
    note: trade.note,
    signalId: trade.signalId,
    timeEstimated: trade.timeEstimated,
  }
}

/**
 * The document to store.
 *
 * The whole of the time model is the two lines that resolve `entryAt`: the IST
 * wall clock somebody typed, turned into the instant it names, and the broker's
 * offset AT that instant. Nothing downstream adds hours to a string.
 */
export function tradeDocument(
  draft: TradeDraft,
  settings: AstraSettings,
  fs: FirestoreModule,
): Record<string, unknown> {
  const symbol = draft.symbol.trim().toUpperCase()
  const move = tradeMove(draft.side, draft.entry, draft.exit)
  const pl = tradePl(move, draft.lot, contractSizeFor(settings.contractSizes, symbol))
  const entryAt = instantFromWall(IST, draft.istDate, draft.istTime) ?? Date.now()
  // A close reading earlier than the open is a trade that ran past midnight
  // IST — 23:40 to 00:20 is forty minutes, not minus twenty-three hours.
  let exitAt = draft.exitTime ? instantFromWall(IST, draft.istDate, draft.exitTime) : null
  if (exitAt != null && exitAt < entryAt) exitAt += 86_400_000
  const broker = { zone: settings.brokerTimezone, offsetMinutes: settings.brokerOffsetMinutes }
  return {
    // Derived from the instant, so there is one day field and no doubt which
    // zone it is in — and it is the field the composite index ranges over.
    istDate: ymdOn(IST, entryAt),
    istTime: hhmmOn(IST, entryAt),
    entryAt: fs.Timestamp.fromMillis(entryAt),
    exitAt: exitAt == null ? null : fs.Timestamp.fromMillis(exitAt),
    brokerOffsetMinutes: offsetAt(broker, entryAt),
    ts: fs.Timestamp.fromMillis(entryAt),
    symbol,
    session: draft.session,
    side: draft.side,
    lot: draft.lot,
    entry: draft.entry,
    exit: draft.exit,
    move,
    pl,
    note: draft.note,
    signalId: draft.signalId ?? '',
    timeEstimated: draft.timeEstimated === true,
    createdAt: fs.serverTimestamp(),
  }
}
