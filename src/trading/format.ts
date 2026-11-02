// Display helpers for the trading panel.
//
// The API sends every price, quantity and amount as a Decimal STRING ("2650.55").
// They are shown as strings, never parsed into floats: the thousands separators
// and trimming below are string work, so a value is displayed exactly as the
// server computed it (hard rule: Decimal for money, never float).

import type { ValueTone } from '@/utils/money'

const NUM = /^-?\d+(\.\d+)?$/

/** "-1234567.50000" → "-1,234,567.5"; at most `dp` decimals, truncated not rounded. */
export function dec(value: string | number | null | undefined, dp = 8): string {
  if (value === null || value === undefined || value === '') return '—'
  const s = String(value).trim()
  if (!NUM.test(s)) return s
  const neg = s.startsWith('-')
  const [int, frac = ''] = (neg ? s.slice(1) : s).split('.')
  const grouped = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const f = frac.slice(0, dp).replace(/0+$/, '')
  const out = f ? `${grouped}.${f}` : grouped
  return neg && /[1-9]/.test(out) ? `-${out}` : out
}

/** The sign of a decimal string, for colouring a value by its own sign. */
export function toneOf(value: string | number | null | undefined): ValueTone {
  if (value === null || value === undefined) return 'neutral'
  const s = String(value).trim()
  if (!NUM.test(s) || !/[1-9]/.test(s)) return 'neutral'
  return s.startsWith('-') ? 'negative' : 'positive'
}

/** "+12.5" for a positive, "-4" for a negative, "0" for zero. */
export function signed(value: string | number | null | undefined, dp = 8): string {
  const d = dec(value, dp)
  return toneOf(value) === 'positive' ? `+${d}` : d
}

/** A percent from a 0..1 ratio string ("0.6" → "60%"), exact to 2 decimals. */
export function pct(ratio: string | number | null | undefined): string {
  if (ratio === null || ratio === undefined || ratio === '') return '—'
  const s = String(ratio)
  if (!NUM.test(s)) return s
  const neg = s.startsWith('-')
  const [int, frac = ''] = (neg ? s.slice(1) : s).split('.')
  const digits = (frac + '00').slice(0, 2)
  const rest = frac.slice(2, 4).replace(/0+$/, '')
  const whole = (Number(int) * 100 + Number(digits)).toString()
  return `${neg ? '-' : ''}${whole}${rest ? '.' + rest : ''}%`
}

const dtf = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function when(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dtf.format(d)
}

/** "12 s ago", "4 min ago", "3 h ago". */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never'
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 90) return `${s} s ago`
  if (s < 5400) return `${Math.round(s / 60)} min ago`
  if (s < 172800) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

export type Source = 'broker' | 'simulated' | 'calculated'

export const SOURCE_LABEL: Record<Source, string> = {
  broker: 'Broker-reported',
  simulated: 'Simulated',
  calculated: 'Calculated',
}

/**
 * Exact sum of decimal strings (BigInt at 10^-8), for totals shown in the UI —
 * no float ever touches the money. Null/blank entries are skipped; returns null
 * when nothing was summed.
 */
export function sumDec(values: Array<string | null | undefined>, scale = 8): string | null {
  const unit = 10n ** BigInt(scale)
  let total = 0n
  let any = false
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue
    const s = String(v).trim()
    if (!NUM.test(s)) continue
    const neg = s.startsWith('-')
    const [int, frac = ''] = (neg ? s.slice(1) : s).split('.')
    const n = BigInt(int) * unit + BigInt((frac + '0'.repeat(scale)).slice(0, scale) || '0')
    total += neg ? -n : n
    any = true
  }
  if (!any) return null
  const neg = total < 0n
  const abs = neg ? -total : total
  const int = abs / unit
  const frac = (abs % unit).toString().padStart(scale, '0').replace(/0+$/, '')
  return `${neg ? '-' : ''}${int}${frac ? '.' + frac : ''}`
}
