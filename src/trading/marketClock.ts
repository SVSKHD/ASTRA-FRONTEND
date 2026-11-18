// The Indian equity market's clock (NSE and BSE cash), for the corner of the
// Stocks tab: is it open, when does it open or close next, and how long until.
//
//   Pre-open   09:00 to 09:15 IST (orders collected, no trading yet)
//   Open       09:15 to 15:30 IST
//   Closed     otherwise, and all of Saturday and Sunday
//
// Exchange holidays are not known in the browser (the server keeps them in
// DHAN_MARKET_HOLIDAYS), so on a holiday this says "open" on the clock alone.
// Plain functions of `now`, so the tests need no clock.

const IST_MS = 5.5 * 3_600_000
const MIN = 60_000

const PRE_OPEN = 9 * 60
const OPEN = 9 * 60 + 15
const CLOSE = 15 * 60 + 30

export type MarketPhase = 'pre' | 'open' | 'closed'

export interface MarketClock {
  phase: MarketPhase
  /** When the phase next changes: open → close, pre → open, closed → next open (epoch ms). */
  next: number
  /** Milliseconds until then. */
  until: number
  /** Share of today's session gone, 0 to 1 (open only). */
  progress: number
  /** "Market open", "Pre-open", "Market closed". */
  title: string
  /** "Closes 15:30 · in 2h 14m", "Opens Mon 09:15 · in 2d 3h". */
  detail: string
}

/** Midnight IST of the IST day of `now`, as epoch ms. */
function istMidnight(now: number): number {
  const ist = new Date(now + IST_MS)
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_MS
}
const istDay = (t: number) => new Date(t + IST_MS).getUTCDay()
const isWeekday = (t: number) => istDay(t) !== 0 && istDay(t) !== 6

/** The next 09:15 IST on a weekday, strictly after `now`. */
export function nextOpen(now: number): number {
  let day = istMidnight(now)
  for (let i = 0; i < 8; i++) {
    const open = day + OPEN * MIN
    if (open > now && isWeekday(open)) return open
    day += 24 * 3_600_000
  }
  return day + OPEN * MIN
}

/** "2h 14m", "45m", "2d 3h", "under a minute". */
export function countdown(ms: number): string {
  if (ms < MIN) return 'under a minute'
  const mins = Math.floor(ms / MIN)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d) return h ? `${d}d ${h}h` : `${d}d`
  if (h) return m ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "09:15" today, "tomorrow 09:15" or "Mon 09:15", in IST. */
function whenLabel(at: number, now: number): string {
  const hhmm = new Date(at + IST_MS).toISOString().slice(11, 16)
  const days = Math.round((istMidnight(at) - istMidnight(now)) / (24 * 3_600_000))
  if (days === 0) return hhmm
  if (days === 1) return `tomorrow ${hhmm}`
  return `${DAYS[istDay(at)]} ${hhmm}`
}

export function marketClock(now: number): MarketClock {
  const midnight = istMidnight(now)
  const mins = Math.floor((now - midnight) / MIN)
  const weekday = isWeekday(now)

  if (weekday && mins >= OPEN && mins < CLOSE) {
    const next = midnight + CLOSE * MIN
    const start = midnight + OPEN * MIN
    return {
      phase: 'open',
      next,
      until: next - now,
      progress: Math.min(1, Math.max(0, (now - start) / (next - start))),
      title: 'Market open',
      detail: `Closes 15:30 · in ${countdown(next - now)}`,
    }
  }
  if (weekday && mins >= PRE_OPEN && mins < OPEN) {
    const next = midnight + OPEN * MIN
    return {
      phase: 'pre',
      next,
      until: next - now,
      progress: 0,
      title: 'Pre-open',
      detail: `Opens 09:15 · in ${countdown(next - now)}`,
    }
  }
  const next = nextOpen(now)
  return {
    phase: 'closed',
    next,
    until: next - now,
    progress: 0,
    title: 'Market closed',
    detail: `Opens ${whenLabel(next, now)} · in ${countdown(next - now)}`,
  }
}
