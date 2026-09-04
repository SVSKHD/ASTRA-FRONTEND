// The trade logger's arithmetic (section 28), kept out of the view and out of
// the composable so every number on the screen is a pure function of the rows.
//
// Two rules run through all of it:
//
//   1. `move` and `pl` are written to Firestore — a query cannot order by a
//      value that only exists in a computed — but nothing here trusts the
//      stored copy. `recomputed()` derives both from entry, exit, side, lot and
//      the symbol's contract size, so a row written by an older build, or by a
//      hand edit in the console, is corrected on screen instead of quietly
//      shifting a month's total.
//   2. Secured money is a ledger of its own. It comes OUT of the traded balance
//      and is never netted against a trade, because "profit" and "money I have
//      taken off the table" answer different questions and adding them makes
//      both unanswerable.

import type {
  LoggerSettings,
  SecuredEntry,
  SessionBounds,
  Trade,
  TradeSession,
  TradeSide,
} from '@/types'
import { csvField } from '@/utils/financeExport'

export const TRADE_SESSIONS: readonly TradeSession[] = ['Asia', 'London', 'NY'] as const
export const TRADE_SIDES: readonly TradeSide[] = ['buy', 'sell'] as const

/** Points per whole unit of price movement, per symbol. */
export const DEFAULT_CONTRACT_SIZES: Record<string, number> = {
  XAUUSD: 100,
  XAGUSD: 5000,
  US30: 1,
  US500: 1,
}

/**
 * When each session opens, and when New York shuts, on the BROKER's clock
 * (section 31). Broker time because that is the frame the boundaries are quoted
 * in everywhere else — a London open stated in IST would have to be restated
 * twice a year.
 *
 * Between the New York close and the Asian open there is no session at all,
 * which is why there are four numbers and not three.
 */
export const DEFAULT_SESSION_BOUNDS: SessionBounds = {
  asia: '03:00',
  london: '09:00',
  ny: '15:00',
  nyEnd: '22:00',
}

/** The usual MT5 server clock. A named zone in settings beats it. */
export const DEFAULT_BROKER_OFFSET_MINUTES = 180

export const DEFAULT_LOGGER_SETTINGS: LoggerSettings = {
  startingBalance: 0,
  dayTarget: 10,
  monthTarget: 50,
  defaultLot: 1,
  lastSymbol: 'XAUUSD',
  contractSizes: { ...DEFAULT_CONTRACT_SIZES },
  // Empty rather than a theme name: "nothing chosen" and "chose the default"
  // are different states, and only the first one lets the operating system's
  // preference decide (section 29).
  theme: '',
  // Empty rather than a guess at an IANA name: an unnamed broker falls back to
  // the fixed offset below, which is honest about being fixed. A named zone
  // resolves per trade date and is what makes a year of history survive DST.
  brokerTimezone: '',
  brokerOffsetMinutes: DEFAULT_BROKER_OFFSET_MINUTES,
  sessionBounds: { ...DEFAULT_SESSION_BOUNDS },
}

/**
 * Two decimals everywhere, so a column of figures is a column.
 *
 * Half rounds AWAY from zero rather than towards positive infinity, which is
 * what `Math.round` does: a −12.345 loss and a +12.345 gain must round to the
 * same magnitude, or a month of half-cent ties drifts the total in one
 * direction and the P/L stops matching the broker's.
 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0
  const scaled = value * 100
  return (Math.sign(scaled) * Math.round(Math.abs(scaled))) / 100
}

export function fmt2(value: number): string {
  return round2(value).toFixed(2)
}

/** A figure whose sign is the information — a move, a P/L, a net. */
export function signed2(value: number): string {
  const rounded = round2(value)
  // `-0.00` is the same number as `0.00` and reads as a loss. Normalised here
  // rather than at four call sites.
  if (rounded === 0) return '0.00'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(2)}`
}

export type ValueSign = 'pos' | 'neg' | 'flat'

export function signOf(value: number): ValueSign {
  const rounded = round2(value)
  return rounded > 0 ? 'pos' : rounded < 0 ? 'neg' : 'flat'
}

/** A buy makes money going up, a sell going down. The whole model in one line. */
export function tradeMove(side: TradeSide, entry: number, exit: number): number {
  return round2(side === 'buy' ? exit - entry : entry - exit)
}

export function tradePl(move: number, lot: number, contractSize: number): number {
  return round2(move * lot * contractSize)
}

/**
 * The contract size for a symbol.
 *
 * Falls back to 1 rather than 0: an unknown symbol should log a P/L equal to
 * its move until somebody supplies the real multiplier, and a 0 would silently
 * report every trade on it as break-even. The UI asks for the real number the
 * first time a symbol is used, so this is the gap between typing the symbol and
 * answering that question.
 */
export function contractSizeFor(sizes: Record<string, number>, symbol: string): number {
  const size = sizes[symbol.trim().toUpperCase()]
  return typeof size === 'number' && size > 0 ? size : 1
}

export function isKnownSymbol(sizes: Record<string, number>, symbol: string): boolean {
  return Object.hasOwn(sizes, symbol.trim().toUpperCase())
}

/** The stored row with `move` and `pl` derived again from its own inputs. */
export function recomputed(trade: Trade, sizes: Record<string, number>): Trade {
  const move = tradeMove(trade.side, trade.entry, trade.exit)
  return { ...trade, move, pl: tradePl(move, trade.lot, contractSizeFor(sizes, trade.symbol)) }
}

export function recomputeAll(trades: Trade[], sizes: Record<string, number>): Trade[] {
  return trades.map((t) => recomputed(t, sizes))
}

/** Oldest first within the day, so the table reads in the order it happened. */
export function sortTrades(trades: Trade[]): Trade[] {
  return trades
    .slice()
    .sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.ts - b.ts || a.id.localeCompare(b.id),
    )
}

// ---- day buckets -----------------------------------------------------------

export interface DayTotals {
  date: string
  move: number
  pl: number
  count: number
}

export function byDay(trades: Trade[]): Map<string, DayTotals> {
  const out = new Map<string, DayTotals>()
  for (const t of trades) {
    const cell = out.get(t.date) ?? { date: t.date, move: 0, pl: 0, count: 0 }
    cell.move = round2(cell.move + t.move)
    cell.pl = round2(cell.pl + t.pl)
    cell.count += 1
    out.set(t.date, cell)
  }
  return out
}

export function dayTotals(trades: Trade[], date: string): DayTotals {
  return byDay(trades).get(date) ?? { date, move: 0, pl: 0, count: 0 }
}

/** What the calendar paints on a day: which way it went, and how hard. */
export interface TradeDayMeta {
  tone: ValueSign
  /** 0–1, the day's absolute move against the day target. */
  intensity: number
  title: string
}

/**
 * Colour is the day's P/L sign; intensity is the day's move against the target.
 * Two different quantities on purpose — a small move on a large lot is a large
 * P/L, and the calendar is a picture of the *trading*, not of the position size.
 */
export function dayMetaFor(trades: Trade[], dayTarget: number): Record<string, TradeDayMeta> {
  const target = dayTarget > 0 ? dayTarget : 1
  const out: Record<string, TradeDayMeta> = {}
  for (const cell of byDay(trades).values()) {
    out[cell.date] = {
      tone: signOf(cell.pl),
      intensity: Math.min(1, Math.abs(cell.move) / target),
      title: `${cell.count} trade${cell.count === 1 ? '' : 's'} · move ${signed2(cell.move)} · P/L ${signed2(cell.pl)}`,
    }
  }
  return out
}

// ---- account ---------------------------------------------------------------

export interface AccountTotals {
  totalProfit: number
  securedTotal: number
  balance: number
}

/**
 * Secured is booked OUT of the balance and is not a loss: total profit is the
 * trades alone, and the balance is what is left in the account after money has
 * been taken off the table.
 */
export function accountTotals(
  trades: Trade[],
  secured: SecuredEntry[],
  startingBalance: number,
): AccountTotals {
  const totalProfit = round2(trades.reduce((sum, t) => sum + t.pl, 0))
  const securedTotal = round2(secured.reduce((sum, s) => sum + s.amt, 0))
  return {
    totalProfit,
    securedTotal,
    balance: round2(startingBalance + totalProfit - securedTotal),
  }
}

// ---- stats -----------------------------------------------------------------

export interface TradeStats {
  count: number
  wins: number
  /** Percent, 0–100. Scratches (a zero move) count as neither win nor loss. */
  hitRate: number
  avgMove: number
  bestDay: DayTotals | null
  worstDay: DayTotals | null
  daysTraded: number
  totalMove: number
  bySession: Record<TradeSession, number>
}

export function tradeStats(trades: Trade[]): TradeStats {
  const wins = trades.filter((t) => t.move > 0).length
  const losses = trades.filter((t) => t.move < 0).length
  const decided = wins + losses
  const totalMove = round2(trades.reduce((sum, t) => sum + t.move, 0))
  const days = [...byDay(trades).values()].sort((a, b) => a.pl - b.pl)
  const bySession: Record<TradeSession, number> = { Asia: 0, London: 0, NY: 0 }
  for (const t of trades) bySession[t.session] = round2(bySession[t.session] + t.move)
  return {
    count: trades.length,
    wins,
    hitRate: decided ? round2((wins / decided) * 100) : 0,
    avgMove: trades.length ? round2(totalMove / trades.length) : 0,
    // Best and worst are the same list read from both ends; with one trading
    // day they are the same day, which is the truth rather than a bug.
    bestDay: days.length ? days[days.length - 1] : null,
    worstDay: days.length ? days[0] : null,
    daysTraded: days.length,
    totalMove,
    bySession,
  }
}

// ---- targets ---------------------------------------------------------------

export interface TargetProgress {
  move: number
  target: number
  /** Percent of the target, clamped to 0–100 for the bar. */
  pct: number
  /** What is still owed. Zero once the target is met, never negative. */
  remaining: number
}

export function targetProgress(move: number, target: number): TargetProgress {
  const safeTarget = target > 0 ? target : 0
  return {
    move: round2(move),
    target: safeTarget,
    pct: safeTarget ? Math.max(0, Math.min(100, round2((move / safeTarget) * 100))) : 0,
    remaining: safeTarget ? Math.max(0, round2(safeTarget - move)) : 0,
  }
}

// ---- month helpers ---------------------------------------------------------

/** The 'YYYY-MM' a 'YYYY-MM-DD' falls in. */
export function monthOf(date: string): string {
  return date.slice(0, 7)
}

/** The inclusive string bounds of a month, for the Firestore range query. */
export function monthBounds(monthKey: string): { from: string; to: string } {
  return { from: `${monthKey}-01`, to: `${monthKey}-31` }
}

export function inMonth(trade: { date: string }, monthKey: string): boolean {
  return trade.date.startsWith(monthKey)
}

/** Local, not UTC: the day a trade belongs to is the trader's day. */
export function todayYmd(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// ---- export ----------------------------------------------------------------

export const TRADE_CSV_COLUMNS = [
  'date',
  'symbol',
  'session',
  'side',
  'lot',
  'entry',
  'exit',
  'move',
  'pl',
] as const

/**
 * The rows as a spreadsheet. Figures are plain decimals with no sign prefix and
 * no thousands separator — a "+12.30" is text in every spreadsheet that opens
 * it, which is the first thing the recipient has to undo.
 */
export function tradesToCsv(trades: Trade[]): string {
  const lines = [TRADE_CSV_COLUMNS.join(',')]
  for (const t of sortTrades(trades)) {
    lines.push(
      [
        csvField(t.date),
        csvField(t.symbol),
        csvField(t.session),
        csvField(t.side),
        csvField(fmt2(t.lot)),
        csvField(fmt2(t.entry)),
        csvField(fmt2(t.exit)),
        csvField(fmt2(t.move)),
        csvField(fmt2(t.pl)),
      ].join(','),
    )
  }
  return lines.join('\r\n') + '\r\n'
}

export function tradeCsvFilename(monthKey: string): string {
  return `aureon-trades-${monthKey || 'all'}.csv`
}
