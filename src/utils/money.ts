// Money, and the one rule about colouring it (section 26c).
//
// The bug this exists to make impossible: `₹0` rendered in large red. Red was
// standing for "this is the expenses metric", not for "this number is bad" —
// colour used as a label rather than as meaning. A reader who has spent nothing
// this month gets an alarm about it.
//
// The rule, stated once so it can be applied by a function instead of by
// remembering: a value takes a semantic colour only when its *sign* carries
// meaning. Positive is success, negative is danger, and zero is neither — it is
// --text-primary, because zero is the absence of a signal, not a bad one.
//
// Which metric a figure belongs to is not a reason to colour it. "In" and "Out"
// are labels; the label says which is which, and colouring both leaves the eye
// nothing to compare.

export type ValueTone = 'positive' | 'negative' | 'neutral'

/**
 * The tone for a figure whose sign is the information — a net, a delta, a
 * balance. Zero is neutral, always.
 */
export function signTone(value: number): ValueTone {
  if (!Number.isFinite(value) || value === 0) return 'neutral'
  return value > 0 ? 'positive' : 'negative'
}

/** The CSS colour for a tone. Neutral is the ordinary text colour, not a grey. */
export function toneColor(tone: ValueTone): string {
  if (tone === 'positive') return 'var(--theme-success)'
  if (tone === 'negative') return 'var(--theme-danger)'
  return 'var(--text-primary, var(--theme-text))'
}

/** Shorthand for the common case: colour this figure by its own sign. */
export function valueColor(value: number): string {
  return toneColor(signTone(value))
}

// ---------------------------------------------------------------------------
// Formatting.
//
// One function, so a rupee reads the same everywhere and no call site
// concatenates a symbol by hand. Manual concatenation is what produces "₹1500"
// beside "₹1,50,000" on the same screen: the symbol is easy to remember and the
// grouping is not.

const cache = new Map<string, Intl.NumberFormat>()

function formatter(currency: string, locale: string, decimals: number): Intl.NumberFormat {
  const key = `${locale}|${currency}|${decimals}`
  let found = cache.get(key)
  if (!found) {
    found = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    cache.set(key, found)
  }
  return found
}

/**
 * INR uses en-IN whichever locale the reader is in, because the lakh/crore
 * grouping is a property of the currency's conventions here, not of the
 * browser's language setting: ₹1,50,000 is right for a rupee figure even to a
 * reader whose OS is set to en-US.
 */
function localeFor(currency: string, locale?: string): string {
  if (locale) return locale
  if (currency === 'INR') return 'en-IN'
  return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US'
}

export interface CurrencyOptions {
  currency?: string
  locale?: string
  /** Renders a leading + on a positive value. For deltas, not for totals. */
  signed?: boolean
}

/**
 * Whole amounts show no decimals and amounts with paise show two — a grocery
 * bill of ₹85,000 should not read "₹85,000.00", but ₹85,000.50 must keep its
 * paise.
 */
export function formatCurrency(value: number, options: CurrencyOptions = {}): string {
  const currency = options.currency ?? 'INR'
  const n = Number.isFinite(value) ? value : 0
  const decimals = Number.isInteger(n) ? 0 : 2
  const text = formatter(currency, localeFor(currency, options.locale), decimals).format(
    options.signed ? Math.abs(n) : n,
  )
  if (!options.signed) return text
  // The minus sign, not a hyphen: it is the same width as the plus, so a column
  // of signed figures does not shift by a pixel between rows.
  return (n < 0 ? '−' : '+') + text
}

// ---------------------------------------------------------------------------
// Minor units (section 27b, acceptance 143).
//
// Money is stored as an integer count of the currency's smallest unit — paise
// for INR, cents for USD — and never as a float. The reason is that 0.1 + 0.2
// is 0.30000000000000004 in every language with IEEE-754 doubles, and a ledger
// is precisely a long chain of additions: a month of ₹0.1 entries drifts, a
// running balance drifts faster, and the drift shows up as a total that is off
// by a paisa with no bad row to point at.
//
// Integers do not drift. `formatCurrency` still takes major units, because a
// formatter that takes paise would have every call site dividing by 100 — which
// is the float back again, just later.

/** How many minor units make one major unit. Currency-specific, not always 100. */
const MINOR_PER_MAJOR: Record<string, number> = {
  // The zero-decimal currencies: a yen IS the minor unit, and multiplying it by
  // 100 would store every price a hundred times over.
  JPY: 1,
  KRW: 1,
  VND: 1,
  // Three-decimal currencies, for the same reason in the other direction.
  BHD: 1000,
  KWD: 1000,
  OMR: 1000,
  TND: 1000,
}

export function minorPerMajor(currency = 'INR'): number {
  return MINOR_PER_MAJOR[currency] ?? 100
}

/**
 * Major units in, minor units out, rounded to an integer.
 *
 * The rounding is the point: `12.34 * 100` is 1233.9999999999998, and `Math.trunc`
 * of that is 1233 — a paisa lost on a value the user typed exactly. Rounding is
 * what makes the conversion total rather than lossy.
 */
export function toMinor(major: number, currency = 'INR'): number {
  if (!Number.isFinite(major)) return 0
  return Math.round(major * minorPerMajor(currency))
}

/** Minor units back to major, for display and for arithmetic that must not. */
export function toMajor(minor: number, currency = 'INR'): number {
  if (!Number.isFinite(minor)) return 0
  return minor / minorPerMajor(currency)
}

/** Format an integer minor-unit amount. The only way a stored figure is shown. */
export function formatMinor(minor: number, options: CurrencyOptions = {}): string {
  return formatCurrency(toMajor(minor, options.currency ?? 'INR'), options)
}

/**
 * Parse what a person typed into minor units.
 *
 * Accepts "1500", "₹1,500", "1500.50", "1.5k", "2L" and "1.2cr", because those
 * are what someone actually types into a field labelled "amount" in India. An
 * unparseable string is 0 rather than NaN, so no caller has to guard — and the
 * quick-add row refuses to submit a 0 anyway, which is where the "you typed
 * nonsense" feedback belongs.
 */
const SUFFIXES: Record<string, number> = { k: 1_000, l: 100_000, cr: 10_000_000 }

export function parseMoney(input: string, currency = 'INR'): number {
  if (typeof input !== 'string') return 0
  const cleaned = input.replace(/[₹$€£,\s]/g, '').toLowerCase()
  const match = /^(-?\d*\.?\d+)(cr|k|l)?$/.exec(cleaned)
  if (!match) return 0
  const magnitude = Number(match[1])
  if (!Number.isFinite(magnitude)) return 0
  return toMinor(magnitude * (match[2] ? SUFFIXES[match[2]] : 1), currency)
}
