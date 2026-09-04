// The ingestion's pure half (section 34).
//
// Split from `dacoit.ts` so the two rules that actually decide what happens to a
// signal — which document it lands on, and what may be missing from one — can be
// imported and tested from the app's own test run rather than only from a
// deployed function. Nothing here touches Firestore, the network or a secret.

const SESSIONS = new Set(['Asia', 'London', 'NY'])
const VERDICTS = new Set(['GO', 'NO_GO'])
/**
 * The id a repeat of the same signal will land on.
 *
 * Derived from symbol, session and the MINUTE it fired, so Dacoit retrying a
 * post — or posting the same setup twice in the same minute — overwrites one
 * document instead of filing two. Given explicitly, the sender's id wins: they
 * know better than a derivation does.
 */
export function signalIdFor(given: unknown, symbol: string, session: string, at: Date): string {
  if (typeof given === 'string' && given.trim()) return given.trim().slice(0, 200)
  const minute = at.toISOString().slice(0, 16).replace(/[-:T]/g, '')
  return `${symbol}-${session}-${minute}`.toUpperCase()
}

export interface Envelope {
  symbol: string
  session: string
  verdict: string
  signalAt: Date
  signalId: string
  raw: Record<string, unknown>
}

/** What must be present. Everything else survives untouched in `raw`. */
export function parseEnvelope(
  body: unknown,
  now = new Date(),
): { ok: true; value: Envelope } | { ok: false; why: string } {
  if (!body || typeof body !== 'object') return { ok: false, why: 'Body must be a JSON object.' }
  const b = body as Record<string, unknown>
  const symbol = String(b.symbol ?? '')
    .trim()
    .toUpperCase()
  if (!symbol) return { ok: false, why: 'symbol is required.' }
  const session = String(b.session ?? '').trim()
  if (!SESSIONS.has(session)) return { ok: false, why: 'session must be Asia, London or NY.' }
  const verdict = String(b.verdict ?? '')
    .trim()
    .toUpperCase()
  if (!VERDICTS.has(verdict)) return { ok: false, why: 'verdict must be GO or NO_GO.' }

  const stamp = b.signalAt
  const signalAt =
    typeof stamp === 'number'
      ? new Date(stamp)
      : typeof stamp === 'string' && !Number.isNaN(Date.parse(stamp))
        ? new Date(stamp)
        : now
  if (Number.isNaN(signalAt.getTime())) return { ok: false, why: 'signalAt is not a time.' }

  // Everything that is not envelope, kept exactly as sent.
  const raw: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(b)) {
    if (['symbol', 'session', 'verdict', 'signalAt', 'signalId'].includes(key)) continue
    raw[key] = value
  }

  return {
    ok: true,
    value: {
      symbol,
      session,
      verdict,
      signalAt,
      signalId: signalIdFor(b.signalId, symbol, session, signalAt),
      raw,
    },
  }
}
