// Two clocks, one instant (section 31).
//
// A trade is logged in IST because that is where the trader is sitting, and it
// is reasoned about in broker time because that is what the platform's chart,
// the session boundaries and the server's own candles use. Those are two
// readings of ONE moment, and the single rule this whole module exists to
// enforce is that the moment is what gets stored:
//
//   entryAt   a Timestamp — the instant, and the only thing anything is derived
//             from
//   istDate   'YYYY-MM-DD' in Asia/Kolkata, the day the trader will look for it
//             under
//   istTime   'HH:mm' in Asia/Kolkata, so the row reads back as it was typed
//             even if the broker's zone is later corrected
//   brokerOffsetMinutes
//             what the broker's clock was doing AT that instant, recorded so a
//             historical row is never re-read through today's offset
//
// Broker time, UTC and the session are all computed, never stored. Which means
// the one thing this module never does — anywhere — is add an offset to a
// formatted string. "17:12" plus three hours is a string operation that gets
// the date wrong twice a day and the DST boundary wrong twice a year. Every
// conversion below goes through an epoch instant and `Intl.DateTimeFormat`,
// which is the only thing that knows that Athens was +2 in January and +3 in
// July.

import type { SessionBounds, Trade, TradeSession } from '@/types'
import { DEFAULT_SESSION_BOUNDS, round2, signOf } from '@/utils/tradeMath'

export type { SessionBounds }
export { DEFAULT_SESSION_BOUNDS }

/** Where the trader is. Kolkata has never observed DST, but it is resolved the
 *  same way as everything else rather than being special-cased at +05:30. */
export const IST_ZONE = 'Asia/Kolkata'

/**
 * A clock, as much as is known about it.
 *
 * `zone` is the real answer: an IANA name resolves per instant, so a year of
 * history reads correctly across both of its DST transitions. `offsetMinutes`
 * is the fallback for a broker whose zone nobody has named yet — a fixed
 * offset, honest about being fixed.
 */
export interface Clock {
  zone: string
  offsetMinutes: number
}

export const IST: Clock = { zone: IST_ZONE, offsetMinutes: 330 }

interface Parts {
  y: number
  mo: number
  d: number
  h: number
  mi: number
}

const FORMATTERS = new Map<string, Intl.DateTimeFormat>()

function formatter(zone: string): Intl.DateTimeFormat {
  let f = FORMATTERS.get(zone)
  if (!f) {
    // `en-CA` for the ISO-shaped date and `hourCycle: 'h23'` so midnight is 00
    // and not 24 — the two things that silently corrupt a hand-rolled parse.
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    FORMATTERS.set(zone, f)
  }
  return f
}

function partsIn(zone: string, at: number): Parts {
  const map: Record<string, string> = {}
  for (const part of formatter(zone).formatToParts(new Date(at))) map[part.type] = part.value
  return {
    y: Number(map.year),
    mo: Number(map.month),
    d: Number(map.day),
    h: Number(map.hour),
    mi: Number(map.minute),
  }
}

/**
 * How far ahead of UTC a zone was AT a given instant. The whole DST story is
 * this one function: read the zone's wall clock for the instant, read UTC's,
 * and the difference is the offset that was actually in force that day.
 */
export function zoneOffsetMinutes(zone: string, at: number): number {
  const p = partsIn(zone, at)
  const asIfUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi)
  // The instant is floored to the minute on both sides so a stray second in
  // the input cannot round the offset to 1439 or 1441.
  return Math.round((asIfUtc - Math.floor(at / 60_000) * 60_000) / 60_000)
}

/** The offset a clock was on at an instant: resolved if it has a zone, fixed if not. */
export function offsetAt(clock: Clock, at: number): number {
  if (!clock.zone) return clock.offsetMinutes
  try {
    return zoneOffsetMinutes(clock.zone, at)
  } catch {
    // An unknown IANA name (a typo in settings, an old browser) falls back to
    // the number beside it rather than throwing on every row of the table.
    return clock.offsetMinutes
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** The wall clock a instant reads as, on a given clock. */
export function partsOn(clock: Clock, at: number): Parts {
  const shifted = at + offsetAt(clock, at) * 60_000
  return partsIn('UTC', shifted)
}

export function ymdOn(clock: Clock, at: number): string {
  const p = partsOn(clock, at)
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`
}

export function hhmmOn(clock: Clock, at: number): string {
  const p = partsOn(clock, at)
  return `${pad(p.h)}:${pad(p.mi)}`
}

export function minutesOfDayOn(clock: Clock, at: number): number {
  const p = partsOn(clock, at)
  return p.h * 60 + p.mi
}

export function hourOn(clock: Clock, at: number): number {
  return partsOn(clock, at).h
}

/** 'HH:mm' as minutes past midnight, or null if it is not a time at all. */
export function minutesOfDay(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

export function hhmm(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`
}

/**
 * A wall-clock reading on some clock, back to the instant it names.
 *
 * Two passes, because the offset depends on the instant and the instant is
 * what we are solving for: guess with the offset at the naive reading, then
 * re-read the offset at the guess. That second pass is what puts a 01:30 on a
 * spring-forward morning in the right place instead of an hour out.
 */
export function instantFromWall(clock: Clock, ymd: string, time: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  const mins = minutesOfDay(time)
  if (!m || mins == null) return null
  const naive = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, mins)
  const first = naive - offsetAt(clock, naive) * 60_000
  return naive - offsetAt(clock, first) * 60_000
}

// ---- sessions ---------------------------------------------------------------

// The boundaries themselves live in tradeMath beside the other stored defaults
// (they are settings, not arithmetic about time) and are re-exported above so a
// caller reasoning about sessions only has to import one module.

/**
 * Which session an instant falls in, read on the broker's clock.
 *
 * `null` is a real answer and not a failure: between the New York close and the
 * Asian open there is no session, and naming that stretch after whichever one
 * is nearest would put trades in a session that was shut.
 */
export function sessionAt(clock: Clock, bounds: SessionBounds, at: number): TradeSession | null {
  const now = minutesOfDayOn(clock, at)
  const asia = minutesOfDay(bounds.asia)
  const london = minutesOfDay(bounds.london)
  const ny = minutesOfDay(bounds.ny)
  const end = minutesOfDay(bounds.nyEnd)
  if (asia == null || london == null || ny == null || end == null) return null
  if (now >= asia && now < london) return 'Asia'
  if (now >= london && now < ny) return 'London'
  if (now >= ny && now < end) return 'NY'
  return null
}

// ---- what a row knows about its own time ------------------------------------

/** A trade with no `entryAt` at all: logged before section 31, never backfilled. */
export function hasTime(trade: Trade): boolean {
  return trade.entryAt > 0
}

/**
 * A time that is really a placeholder. The backfill writes midnight IST so the
 * ordering is defined, and marks it — so every hour-of-day view can leave it
 * out instead of reporting a spike of trades at 00:00 that nobody made.
 */
export function isEstimated(trade: Trade): boolean {
  return !hasTime(trade) || trade.timeEstimated === true
}

export function timed(trades: Trade[]): Trade[] {
  return trades.filter((t) => !isEstimated(t))
}

export interface TradeClocks {
  /** 'HH:mm' as it was typed, and as it reads back. */
  ist: string
  /** 'HH:mm' on the broker's clock, recomputed from the instant every time. */
  broker: string
  /** 'HH:mm' UTC, for the column that is off by default. */
  utc: string
  /** The offset in force at that instant, as '+03:00'. */
  brokerOffset: string
}

export function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+'
  const abs = Math.abs(minutes)
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/**
 * The three readings of one instant.
 *
 * The broker's offset comes from the ROW when it has one, not from settings: a
 * trade taken in January was taken on a +02:00 broker, and re-reading it
 * through today's +03:00 would move a year of history by an hour.
 */
export function clocksFor(trade: Trade, broker: Clock): TradeClocks | null {
  if (!hasTime(trade)) return null
  const at = trade.entryAt
  const stored = trade.brokerOffsetMinutes
  const clock: Clock =
    broker.zone || typeof stored !== 'number' ? broker : { zone: '', offsetMinutes: stored }
  return {
    ist: hhmmOn(IST, at),
    broker: hhmmOn(clock, at),
    utc: hhmmOn({ zone: '', offsetMinutes: 0 }, at),
    brokerOffset: offsetLabel(offsetAt(clock, at)),
  }
}

// ---- the hour of the day ----------------------------------------------------

export interface HourCell {
  /** 0–23, IST. */
  hour: number
  /** What the broker's clock read at that hour — 'HH:mm', because IST is not
   *  a whole number of hours from anywhere. */
  broker: string
  count: number
  move: number
  wins: number
  /** Percent, 0–100. Scratches count as neither win nor loss. */
  hitRate: number
  /** Under three trades, so the hit rate is noise and is drawn as such. */
  thin: boolean
}

/** Three is the point at which one trade stops being the whole statistic. */
export const THIN_HOURS_BELOW = 3

/**
 * The month by IST hour. Estimated rows are excluded rather than counted at
 * midnight, which is the entire reason they are marked.
 *
 * The broker axis is read at each hour's own instant on the reference date, so
 * a month that straddles a DST change shows the offset that month actually had
 * rather than the one today happens to have.
 */
export function hourlyStats(trades: Trade[], broker: Clock, reference: number): HourCell[] {
  const cells: HourCell[] = Array.from({ length: 24 }, (_, hour) => {
    const at = reference + hour * 3_600_000
    return {
      hour,
      broker: hhmmOn(broker, at),
      count: 0,
      move: 0,
      wins: 0,
      hitRate: 0,
      thin: true,
    }
  })
  const losses = new Array<number>(24).fill(0)
  for (const trade of timed(trades)) {
    const cell = cells[hourOn(IST, trade.entryAt)]
    cell.count += 1
    cell.move = round2(cell.move + trade.move)
    if (trade.move > 0) cell.wins += 1
    else if (trade.move < 0) losses[cell.hour] += 1
  }
  for (const cell of cells) {
    const decided = cell.wins + losses[cell.hour]
    cell.hitRate = decided ? round2((cell.wins / decided) * 100) : 0
    cell.thin = cell.count < THIN_HOURS_BELOW
  }
  return cells
}

/**
 * The best and worst hour, chosen only from hours with enough trades to mean
 * something. One 40-point winner at 04:00 is not a discovery about 04:00.
 */
export function hourExtremes(cells: HourCell[]): { best: number | null; worst: number | null } {
  const solid = cells.filter((c) => !c.thin)
  if (!solid.length) return { best: null, worst: null }
  const sorted = solid.slice().sort((a, b) => a.move - b.move)
  const best = sorted[sorted.length - 1]
  const worst = sorted[0]
  return {
    best: signOf(best.move) === 'pos' ? best.hour : null,
    worst: signOf(worst.move) === 'neg' ? worst.hour : null,
  }
}

/** The busiest hour's count, so the strip's bars have something to scale to. */
export function peakCount(cells: HourCell[]): number {
  return cells.reduce((max, c) => Math.max(max, c.count), 0)
}
