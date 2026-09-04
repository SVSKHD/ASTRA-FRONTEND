// The ingestion's two decisions, tested from the front end's side of the fence
// (section 34).
//
// The function itself runs in the Node runtime and its Firestore half needs the
// Admin SDK, but the two rules that actually matter are pure and they are the
// two worth pinning: which document a signal lands on (idempotency), and what
// is allowed to be missing from one (the envelope). They are re-implemented
// nowhere — this imports the same source the function does, so a change to
// either fails here rather than in production.
import { describe, expect, it } from 'vitest'
import { parseEnvelope, signalIdFor } from '../../functions/src/dacoitPure'

const AT = new Date('2026-09-02T06:00:30.000Z')

describe('the id a signal lands on', () => {
  it('is the sender’s when they gave one', () => {
    // They know which signal this is; a derivation does not get to disagree.
    expect(signalIdFor('abc-123', 'XAUUSD', 'London', AT)).toBe('abc-123')
  })

  it('is derived from symbol, session and the minute when they did not', () => {
    expect(signalIdFor(undefined, 'xauusd', 'London', AT)).toBe('XAUUSD-LONDON-202609020600')
  })

  it('is the same for two posts in the same minute, so a retry is one document', () => {
    const later = new Date('2026-09-02T06:00:59.000Z')
    expect(signalIdFor(null, 'XAUUSD', 'London', AT)).toBe(
      signalIdFor(null, 'XAUUSD', 'London', later),
    )
  })

  it('differs the next minute, because that is a different signal', () => {
    const next = new Date('2026-09-02T06:01:00.000Z')
    expect(signalIdFor(null, 'XAUUSD', 'London', AT)).not.toBe(
      signalIdFor(null, 'XAUUSD', 'London', next),
    )
  })

  it('is bounded, so a hostile id cannot make an unusable document path', () => {
    expect(signalIdFor('x'.repeat(500), 'XAUUSD', 'London', AT)).toHaveLength(200)
  })
})

describe('the envelope is validated and the body is not', () => {
  const good = { symbol: 'xauusd', session: 'London', verdict: 'go', signalAt: AT.toISOString() }

  it('takes the four fields it needs and normalises them', () => {
    const parsed = parseEnvelope(good)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.symbol).toBe('XAUUSD')
    expect(parsed.value.verdict).toBe('GO')
    expect(parsed.value.signalAt.toISOString()).toBe(AT.toISOString())
  })

  it('keeps every field it has never heard of, exactly as sent', () => {
    // The whole point: a strategy that starts reporting a new number must not
    // have to wait for a release here, and the signal must not be dropped to
    // protect a schema.
    const parsed = parseEnvelope({ ...good, confidence: 0.82, tags: ['a'], nested: { x: 1 } })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.raw).toEqual({ confidence: 0.82, tags: ['a'], nested: { x: 1 } })
  })

  it('does not copy the envelope into raw as well', () => {
    const parsed = parseEnvelope(good)
    if (!parsed.ok) return
    expect(parsed.value.raw).toEqual({})
  })

  it('refuses a signal it could not file', () => {
    expect(parseEnvelope({ ...good, symbol: '' }).ok).toBe(false)
    expect(parseEnvelope({ ...good, session: 'Tokyo' }).ok).toBe(false)
    expect(parseEnvelope({ ...good, verdict: 'MAYBE' }).ok).toBe(false)
    expect(parseEnvelope('not an object').ok).toBe(false)
  })

  it('falls back to now when no time was sent, rather than refusing', () => {
    // A signal with no timestamp is still a signal; the time it arrived is a
    // worse answer than the time it fired and a much better one than nothing.
    const now = new Date('2026-09-02T07:00:00.000Z')
    const parsed = parseEnvelope({ symbol: 'US30', session: 'NY', verdict: 'NO_GO' }, now)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.signalAt).toEqual(now)
  })

  it('takes epoch milliseconds as readily as an ISO string', () => {
    const parsed = parseEnvelope({ ...good, signalAt: AT.getTime() })
    if (!parsed.ok) return
    expect(parsed.value.signalAt.toISOString()).toBe(AT.toISOString())
  })
})
