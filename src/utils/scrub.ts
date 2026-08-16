// Scrubbing wallet data out of anything that leaves the app (section 14
// SECURITY/PRIVACY). Addresses are not logged to analytics or error reporting,
// and anything key-shaped is redacted outright — including in the one case that
// should never happen, where a secret reached a code path at all.
//
// This is the last line, not the first: utils/address refuses secrets at the
// input. This module exists because an error message, a stack frame or a
// third-party reporter can carry a string nobody meant to send.

// Address shapes, deliberately broad. A false positive costs a log line some
// detail; a false negative puts a user's address in someone else's dataset.
const ADDRESS_PATTERNS: RegExp[] = [
  // EVM
  /\b0x[0-9a-fA-F]{40}\b/g,
  // bech32 families: BTC, LTC, Cardano, Cosmos
  /\b(?:bc1|tb1|ltc1|tltc1)[02-9ac-hj-np-z]{6,80}\b/gi,
  /\baddr(?:_test)?1[02-9ac-hj-np-z]{20,110}\b/gi,
  /\bcosmos1[02-9ac-hj-np-z]{20,60}\b/gi,
  // TON user-friendly
  /\b(?:EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}\b/g,
  // base58 families: BTC/LTC/DOGE legacy, XRP, TRX, SOL, DOT
  /\b[1-9A-HJ-NP-Za-km-z]{26,50}\b/g,
]

// Key/seed shapes. These are redacted rather than masked: there is no version of
// a private key that is safe to keep a fragment of.
const SECRET_PATTERNS: RegExp[] = [
  /\b(?:0x)?[0-9a-fA-F]{64}\b/g,
  /\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/g,
  /\b(?:[xyzt]prv|[Ll]tpv|dgpv)[1-9A-HJ-NP-Za-km-z]{50,}\b/g,
]

export const ADDRESS_PLACEHOLDER = '[address]'
export const SECRET_PLACEHOLDER = '[redacted]'

// A 12/15/18/21/24-word run of lowercase words — a seed phrase, wherever it
// turns up. Matched before addresses so the whole run goes, not word by word.
const MNEMONIC_RE = /\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/g

export function scrubText(input: string): string {
  if (!input) return input
  let out = input.replace(MNEMONIC_RE, (match) => {
    const words = match.trim().split(/\s+/).length
    return [12, 15, 18, 21, 24].includes(words) ? SECRET_PLACEHOLDER : match
  })
  // Secrets first: a 64-hex key would otherwise partly match an address shape.
  for (const re of SECRET_PATTERNS) out = out.replace(re, SECRET_PLACEHOLDER)
  for (const re of ADDRESS_PATTERNS) out = out.replace(re, ADDRESS_PLACEHOLDER)
  return out
}

// Deep scrub for structured payloads (error contexts, breadcrumbs, analytics
// properties). Keys are left alone; values are scrubbed.
export function scrubValue<T>(value: T, depth = 0): T {
  if (depth > 6) return value
  if (typeof value === 'string') return scrubText(value) as unknown as T
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1)) as unknown as T
  if (value instanceof Error) {
    const copy = new Error(scrubText(value.message))
    copy.name = value.name
    copy.stack = value.stack ? scrubText(value.stack) : undefined
    return copy as unknown as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubValue(v, depth + 1)
    }
    return out as unknown as T
  }
  return value
}

// Console/report helpers. Everything that reports an error in this app goes
// through one of these, so scrubbing is not something each call site remembers.
export function scrubArgs(args: unknown[]): unknown[] {
  return args.map((a) => scrubValue(a))
}

export function reportError(context: string, ...details: unknown[]): void {
  console.error(scrubText(context), ...scrubArgs(details))
}
