// INR formatting + parsing, in one place so every rupee reads the same.
//
// Indian grouping (lakh/crore: ₹1,50,000 / ₹1,00,00,000) comes from the en-IN
// locale. Whole rupees show no decimals; paise show two — a grocery bill of
// ₹85,000 should not read "₹85,000.00", but ₹85,000.50 must keep its paise.

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const inrPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatINR(value: number): string {
  const n = Number.isFinite(value) ? value : 0
  // "Has paise" = a non-zero fractional part. Integers use the no-decimals
  // formatter; anything with paise uses two.
  return Number.isInteger(n) ? inrWhole.format(n) : inrPaise.format(n)
}

// Parse user input back to a number: strip the ₹ symbol, grouping commas and
// whitespace, then coerce. Invalid input is 0, never NaN, so callers never have
// to guard.
export function parseINR(input: string): number {
  if (typeof input !== 'string') return Number.isFinite(input) ? (input as number) : 0
  const cleaned = input.replace(/[₹,\s]/g, '')
  if (cleaned === '' || cleaned === '-') return 0
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}
