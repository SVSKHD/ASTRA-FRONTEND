// Foreign-currency expenses (section 35c): paid in one currency, logged in INR.
//
// THE MODEL. `amount` on an expense is ALWAYS in the base currency, because
// every total, budget, chart and piece of advice on the tab adds amounts
// together and a sum of dollars and rupees is not a number. A foreign expense
// additionally keeps what was actually paid — the currency, the amount in it,
// and the rate used — so the conversion can be read back and audited later
// rather than trusted.
//
// THE RATE is the reference rate for the DAY THE MONEY WAS SPENT, not today's:
// a dinner in New York in March costs what it cost in March. Rates come from
// Frankfurter (European Central Bank reference rates, no key, CORS-open). The
// ECB publishes on working days only, so a Sunday is answered with Friday's
// rate and the response says so — that date is shown beside the rate.
//
// The fetched rate is a suggestion, not a verdict: a card statement converts at
// its own rate plus a markup, and the form lets the rate be overwritten with
// the one actually charged.

import { round2 } from '@/utils/tradeMath'

/** What every expense amount is stored in. */
export const BASE_CURRENCY = 'INR'

/** The currencies offered when logging, base first. ECB publishes all of them. */
export const CURRENCIES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'AED',
  'SGD',
  'AUD',
  'CAD',
  'JPY',
  'CHF',
  'THB',
  'MYR',
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]

const API = 'https://api.frankfurter.dev/v1'

export interface FxRate {
  from: string
  to: string
  /** Units of `to` per one unit of `from`. */
  rate: number
  /** The day the rate was published for — may be before the day asked for. */
  date: string
}

const memory = new Map<string, FxRate>()
const STORE_KEY = 'astra.fx.v1'

function cacheKey(from: string, to: string, date: string) {
  return `${from}>${to}@${date}`
}

function readStore(): Record<string, FxRate> {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? '{}') as Record<string, FxRate>
  } catch {
    return {}
  }
}

function writeStore(key: string, value: FxRate) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), [key]: value }))
  } catch {
    // Private mode or a full store: the in-memory cache still holds it.
  }
}

/**
 * The rate for one day. Today and future days ask for the latest published
 * rate, since nothing has been published for them yet; a past day's rate never
 * changes, so it is cached for the session.
 */
export async function fetchRate(
  from: string,
  to: string,
  date: string,
  today: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<FxRate> {
  if (from === to) return { from, to, rate: 1, date }
  const day = date >= today ? 'latest' : date
  const key = cacheKey(from, to, day)
  const held = memory.get(key) ?? readStore()[key]
  if (held) return held
  const res = await fetcher(`${API}/${day}?base=${from}&symbols=${to}`, { signal })
  if (!res.ok) throw new Error(`Rate lookup failed (${res.status})`)
  const body = (await res.json()) as { date?: string; rates?: Record<string, number> }
  const rate = body.rates?.[to]
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`No ${from}→${to} rate was published`)
  }
  const found = { from, to, rate, date: String(body.date ?? date) }
  memory.set(key, found)
  // Only past days persist: "latest" moves every working day.
  if (day !== 'latest') writeStore(key, found)
  return found
}

/** What a foreign amount comes to in the base currency, to the paisa. */
export function toBase(amount: number, rate: number): number {
  return round2(Math.abs(amount) * rate)
}

/** For tests: forget every rate held. */
export function clearRateCache() {
  memory.clear()
  try {
    sessionStorage.removeItem(STORE_KEY)
  } catch {
    // Nothing to clear.
  }
}
