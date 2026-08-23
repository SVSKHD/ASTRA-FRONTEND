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
