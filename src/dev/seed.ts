// The demo month, generated rather than recorded (section 38).
//
// One module, two consumers: `scripts/seed.mjs` writes it into the demo
// account's real collections, and the dev fixture serves it with no network at
// all. Same function, same seed, same ids — so a screenshot taken against
// Firestore and one taken against the fixture are the same picture, and a
// difference between them is a real difference.
//
// EVERYTHING HERE IS DETERMINISTIC. A demo built from `Math.random()` and
// `new Date()` is a demo whose screenshots differ every run, which makes a
// visual diff useless and a bug report unreproducible. So:
//
//   • the clock is `SEED_TODAY`, pinned;
//   • the randomness is a seeded LCG, so run n is identical to run n+1;
//   • the ids are derived from the row's own position, so re-seeding
//     overwrites rather than duplicating.
//
// AND IT INCLUDES THE AWKWARD CASES on purpose, because those are the ones a
// layout gets wrong: a legacy trade with no time at all, a Dacoit document
// carrying fields this build has never heard of, a day that loses badly, and a
// day that lands exactly on the target.

/** The pinned clock. Every date below is relative to this, never to `now`. */
export const SEED_TODAY = '2026-09-04'
export const SEED_DAYS = 60

export const SEED_SYMBOLS = ['XAUUSD', 'XAGUSD', 'US30'] as const
export type SeedSymbol = (typeof SEED_SYMBOLS)[number]

const CONTRACT: Record<SeedSymbol, number> = { XAUUSD: 100, XAGUSD: 5000, US30: 1 }
const PRICE: Record<SeedSymbol, number> = { XAUUSD: 2400, XAGUSD: 28, US30: 41000 }

export interface SeedTrade {
  id: string
  istDate: string
  istTime: string
  entryAtMs: number
  exitAtMs: number
  symbol: SeedSymbol
  session: 'Asia' | 'London' | 'NY'
  side: 'buy' | 'sell'
  lot: number
  entry: number
  exit: number
  move: number
  pl: number
  note: string
  brokerOffsetMinutes: number
  timeEstimated: boolean
  signalId: string
}

export interface SeedSignal {
  id: string
  signalId: string
  istDate: string
  signalAtMs: number
  symbol: SeedSymbol
  session: 'Asia' | 'London' | 'NY'
  verdict: 'GO' | 'NO_GO'
  raw: Record<string, unknown>
}

export interface SeedExpense {
  id: string
  date: string
  amount: number
  category: string
  note: string
  kind: 'one-off' | 'recurring'
  recurDay?: number
}

/** A linear congruential generator — small, seeded, and the same everywhere. */
function rng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function addDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d + delta))
  return at.toISOString().slice(0, 10)
}

/** IST is +05:30 and has never moved, so this is exact rather than resolved. */
function istInstant(ymd: string, hhmm: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  return Date.UTC(y, m - 1, d, h, mi) - 330 * 60_000
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const SESSION_TIMES: Record<SeedTrade['session'], string[]> = {
  Asia: ['06:10', '07:35', '08:20'],
  London: ['12:05', '13:40', '14:25'],
  NY: ['18:15', '19:42', '20:30'],
}

/**
 * Sixty days, about five trading days a month.
 *
 * "About" is the point: a demo that trades every weekday looks like a bot, and
 * the calendar's empty cells are half of what it is showing.
 */
export function seedTrades(today = SEED_TODAY, days = SEED_DAYS): SeedTrade[] {
  const random = rng(20260904)
  const out: SeedTrade[] = []
  for (let back = days; back >= 0; back -= 1) {
    const date = addDays(today, -back)
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    // Roughly a quarter of weekdays, which lands near five a month.
    if (random() > 0.26) continue

    const count = 1 + Math.floor(random() * 3)
    const dayIndex = out.length
    for (let n = 0; n < count; n += 1) {
      const symbol: SeedSymbol = SEED_SYMBOLS[Math.floor(random() * SEED_SYMBOLS.length)]
      const session: SeedTrade['session'] = (['Asia', 'London', 'NY'] as const)[
        Math.floor(random() * 3)
      ]
      const istTime = SESSION_TIMES[session][n % 3]
      const side: SeedTrade['side'] = random() > 0.42 ? 'buy' : 'sell'
      const lot = round2(0.5 + random() * 1.5)
      const entry = round2(PRICE[symbol] * (1 + (random() - 0.5) * 0.01))
      // Winners are a little more likely and a little smaller than the losers,
      // which is what a real log looks like and what makes the P/L ramp use its
      // whole range rather than three of five steps.
      const win = random() > 0.42
      const size = (0.2 + random() * 1.4) * (symbol === 'US30' ? 60 : symbol === 'XAGUSD' ? 0.2 : 6)
      const delta = win ? size : -size * 1.25
      const exit = round2(side === 'buy' ? entry + delta : entry - delta)
      const move = round2(side === 'buy' ? exit - entry : entry - exit)
      const entryAtMs = istInstant(date, istTime)
      out.push({
        id: `demo-t-${date}-${n}`,
        istDate: date,
        istTime,
        entryAtMs,
        exitAtMs: entryAtMs + (20 + Math.floor(random() * 90)) * 60_000,
        symbol,
        session,
        side,
        lot,
        entry,
        exit,
        move,
        pl: round2(move * lot * CONTRACT[symbol]),
        note: '',
        brokerOffsetMinutes: 180,
        timeEstimated: false,
        signalId: '',
      })
      void dayIndex
    }
  }
  return withAwkwardCases(out, today)
}

/**
 * The four cases a layout gets wrong, added by hand.
 *
 * Generated data is well-behaved by construction, which is exactly why it is a
 * poor test of a screen. Each of these has broken something before.
 */
function withAwkwardCases(trades: SeedTrade[], today: string): SeedTrade[] {
  const legacyDate = addDays(today, -47)
  const bigLossDate = addDays(today, -9)
  const exactDate = addDays(today, -2)
  const extra: SeedTrade[] = [
    // 1. Logged before times were recorded: no instant, no IST time, and it has
    //    to show a dash rather than a plausible-looking midnight.
    {
      id: `demo-t-${legacyDate}-legacy`,
      istDate: legacyDate,
      istTime: '',
      entryAtMs: 0,
      exitAtMs: 0,
      symbol: 'XAUUSD',
      session: 'London',
      side: 'buy',
      lot: 1,
      entry: 2390,
      exit: 2398.4,
      move: 8.4,
      pl: 840,
      note: 'Logged before times were recorded',
      brokerOffsetMinutes: 180,
      timeEstimated: false,
      signalId: '',
    },
    // 2. A day that loses badly: the deep end of the negative ramp, which is
    //    the step that disappears against a warm ground if the theme is wrong.
    {
      id: `demo-t-${bigLossDate}-loss`,
      istDate: bigLossDate,
      istTime: '19:42',
      entryAtMs: istInstant(bigLossDate, '19:42'),
      exitAtMs: istInstant(bigLossDate, '20:58'),
      symbol: 'US30',
      session: 'NY',
      side: 'buy',
      lot: 2,
      entry: 41200,
      exit: 40880,
      move: -320,
      pl: -640,
      note: 'Held it through the number',
      brokerOffsetMinutes: 180,
      timeEstimated: false,
      signalId: '',
    },
    // 3. A day that lands EXACTLY on the daily move target of 10, which is the
    //    boundary the progress bar and the "target met" copy both hinge on.
    {
      id: `demo-t-${exactDate}-exact`,
      istDate: exactDate,
      istTime: '13:40',
      entryAtMs: istInstant(exactDate, '13:40'),
      exitAtMs: istInstant(exactDate, '14:05'),
      symbol: 'XAUUSD',
      session: 'London',
      side: 'buy',
      lot: 1,
      entry: 2400,
      exit: 2410,
      move: 10,
      pl: 1000,
      note: 'Exactly the day target',
      brokerOffsetMinutes: 180,
      timeEstimated: false,
      signalId: `demo-s-${exactDate}-0`,
    },
  ]
  return [
    ...trades.filter((t) => ![legacyDate, bigLossDate, exactDate].includes(t.istDate)),
    ...extra,
  ].sort((a, b) => (a.istDate < b.istDate ? -1 : a.istDate > b.istDate ? 1 : 0))
}

/**
 * A signal for most trades and several nobody took.
 *
 * The untaken ones are the point of Combined mode, so the demo has to contain
 * them — a seed where every GO was traded shows the feature working on data
 * that could never exercise it.
 */
export function seedSignals(trades: SeedTrade[], today = SEED_TODAY): SeedSignal[] {
  const random = rng(777)
  const out: SeedSignal[] = []
  for (const trade of trades) {
    if (!trade.entryAtMs) continue
    const roll = random()
    // Two thirds of trades followed a GO; the rest were the trader's own idea.
    if (roll > 0.66) continue
    out.push({
      id: `demo-s-${trade.istDate}-${out.length}`,
      signalId: `demo-s-${trade.istDate}-${out.length}`,
      istDate: trade.istDate,
      // Between five and forty minutes before the trade, so the 90-minute link
      // has something inside it and something outside it.
      signalAtMs: trade.entryAtMs - (5 + Math.floor(random() * 35)) * 60_000,
      symbol: trade.symbol,
      session: trade.session,
      verdict: 'GO',
      raw: { confidence: round2(0.55 + random() * 0.4), atr: round2(random() * 12) },
    })
  }

  // The ones nobody acted on, spread through the month, plus the NO_GOs that
  // were correctly ignored.
  for (let i = 0; i < 9; i += 1) {
    const date = addDays(today, -(2 + Math.floor(random() * 40)))
    const symbol = SEED_SYMBOLS[Math.floor(random() * SEED_SYMBOLS.length)]
    out.push({
      id: `demo-s-untaken-${i}`,
      signalId: `demo-s-untaken-${i}`,
      istDate: date,
      signalAtMs: istInstant(date, i % 2 ? '12:20' : '18:05'),
      symbol,
      session: i % 2 ? 'London' : 'NY',
      verdict: i % 3 === 0 ? 'NO_GO' : 'GO',
      raw:
        i === 0
          ? // A document carrying fields this build has never heard of. It must
            // render as key/value and must never be a reason to drop a signal.
            { confidence: 0.71, regime: 'chop', vol_bucket: 3, notes: ['thin book'] }
          : { confidence: round2(0.5 + random() * 0.4) },
    })
  }
  return out.sort((a, b) => a.signalAtMs - b.signalAtMs)
}

/** Two months of spending: a few recurring commitments and everyday one-offs. */
export function seedExpenses(today = SEED_TODAY, days = SEED_DAYS): SeedExpense[] {
  const random = rng(4242)
  const out: SeedExpense[] = []
  const months = new Set<string>()
  for (let back = days; back >= 0; back -= 1) months.add(addDays(today, -back).slice(0, 7))

  for (const month of months) {
    out.push(
      {
        id: `demo-e-${month}-feed`,
        date: `${month}-03`,
        amount: 8400,
        category: 'Data feed',
        note: 'Monthly terminal',
        kind: 'recurring',
        recurDay: 3,
      },
      {
        id: `demo-e-${month}-desk`,
        date: `${month}-05`,
        amount: 15000,
        category: 'Desk',
        note: 'Co-working',
        kind: 'recurring',
        recurDay: 5,
      },
    )
  }

  for (let back = days; back >= 0; back -= 1) {
    const date = addDays(today, -back)
    if (random() > 0.35) continue
    const categories = ['Coffee', 'Books', 'Travel', 'Software', 'Groceries']
    out.push({
      id: `demo-e-${date}-${Math.floor(random() * 1000)}`,
      date,
      amount: round2(120 + random() * 2400),
      category: categories[Math.floor(random() * categories.length)],
      note: '',
      kind: 'one-off',
    })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** The settings the demo account carries, including its own collection names. */
export const SEED_SETTINGS = {
  startingBalance: 250000,
  dayTarget: 10,
  monthTarget: 50,
  monthlyBudget: 40000,
  netExpenses: true,
  defaultLot: 1,
  lastSymbol: 'XAUUSD',
  contractSizes: { ...CONTRACT },
  theme: 'espresso',
  brokerTimezone: 'Europe/Athens',
  brokerOffsetMinutes: 180,
  sessionBounds: { asia: '03:00', london: '09:00', ny: '15:00', nyEnd: '22:00' },
  tradesCollection: 'demo-trades',
  dacoitCollection: 'demo-dacoit-signals',
  expensesCollection: 'demo-expenses',
  securedCollection: 'demo-secured',
}
