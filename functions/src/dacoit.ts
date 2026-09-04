// Dacoit's ingestion endpoint (section 34).
//
// WHY THIS IS A FUNCTION AND NOT A ROUTE. A Vue route cannot receive a POST:
// the SPA is static files, the "route" is a history entry the browser invented,
// and there is no server on the other end of it to hand a body to. Dacoit runs
// outside the browser and has no Firebase session, so it needs a real HTTP
// endpoint with its own authentication — which is this.
//
// THREE RULES THIS FILE EXISTS TO ENFORCE.
//
//   1. THE UID COMES FROM THE KEY, NEVER FROM THE BODY. A body field naming the
//      account is an open invitation: anyone holding any valid key could write
//      into anyone else's trade log by changing one string. The key IS the
//      identity, and the mapping is server-side.
//   2. THE FUNCTION STAMPS `userId` ITSELF, AND REFUSES TO WRITE IF IT CANNOT.
//      The Admin SDK bypasses security rules, so nothing downstream will catch
//      a missing owner field — and a document written without one is not merely
//      private, it is unreachable forever, because every rule that could read
//      it needs the field that is not there.
//   3. THE ENVELOPE IS VALIDATED; THE BODY IS NOT. Symbol, session, verdict and
//      time have to be there or the signal cannot be filed. Everything else is
//      kept whole in `raw` and never rejected: a field this build has not heard
//      of is the field the next build will want, and dropping the signal to
//      protect a schema nobody reads loses the only copy of it.

import { timingSafeEqual } from 'node:crypto'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'
import { parseEnvelope } from './dacoitPure'

/**
 * `{"<shared key>": "<uid>"}`, as JSON. A map rather than a single key so a
 * second machine — or a rotation — does not need a redeploy of anything but
 * the secret itself.
 */
const DACOIT_KEYS = defineSecret('DACOIT_KEYS')

const DEFAULT_COLLECTION = 'astra-dacoit-signals'
/** The trader's clock. The day a signal belongs to is the trader's day. */
const IST_ZONE = 'Asia/Kolkata'

/**
 * Constant-time comparison that does not leak WHICH key was close.
 *
 * `timingSafeEqual` throws on a length mismatch, which is itself a signal, so
 * both sides are padded to a fixed width first — and the loop below never
 * short-circuits, so the number of configured keys is not observable either.
 */
function sameKey(a: string, b: string): boolean {
  const left = Buffer.from(a.padEnd(64, '\0').slice(0, 64))
  const right = Buffer.from(b.padEnd(64, '\0').slice(0, 64))
  return timingSafeEqual(left, right)
}

function uidForKey(presented: string, keys: Record<string, string>): string {
  let found = ''
  for (const [key, uid] of Object.entries(keys)) {
    // No early return: the time taken must not depend on where the match is.
    if (sameKey(key, presented)) found = uid
  }
  return found
}

/** The IST calendar day of an instant, the field the month query ranges over. */
function istDateOf(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export const dacoitSignal = onRequest(
  { region: 'asia-south1', secrets: [DACOIT_KEYS], cors: false, maxInstances: 10 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST only.' })
      return
    }

    let keys: Record<string, string> = {}
    try {
      keys = JSON.parse(DACOIT_KEYS.value() || '{}') as Record<string, string>
    } catch {
      logger.error('DACOIT_KEYS is not valid JSON')
      res.status(500).json({ error: 'Server misconfigured.' })
      return
    }

    const presented = String(req.get('X-Dacoit-Key') ?? '')
    const uid = presented ? uidForKey(presented, keys) : ''
    if (!uid) {
      // The same answer for a missing key, a wrong key and a key with no
      // account behind it: the caller learns whether they are in, and nothing
      // about why they are not.
      res.status(401).json({ error: 'Unauthorised.' })
      return
    }

    const parsed = parseEnvelope(req.body)
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.why })
      return
    }
    const signal = parsed.value

    const db = getFirestore()
    // The collection is the user's own choice, read from the same document the
    // app builds every one of its query paths from — a hard-coded name here
    // would write somewhere the app never looks.
    const settings = await db.collection('Astra-users').doc(uid).get()
    const collection = String(settings.get('dacoitCollection') ?? '') || DEFAULT_COLLECTION

    const document = {
      // Rule 2: stamped here, by the server, from the key's uid.
      userId: uid,
      signalId: signal.signalId,
      signalAt: Timestamp.fromDate(signal.signalAt),
      receivedAt: Timestamp.now(),
      istDate: istDateOf(signal.signalAt),
      symbol: signal.symbol,
      session: signal.session,
      verdict: signal.verdict,
      raw: signal.raw,
      source: 'dacoit',
    }
    if (!document.userId) {
      // Belt and braces around the one mistake that is unrecoverable.
      logger.error('Refusing to write a signal with no owner', { signalId: signal.signalId })
      res.status(500).json({ error: 'Could not attribute the signal; nothing was written.' })
      return
    }

    // Idempotent: the same signal posted twice is one document.
    await db.collection(collection).doc(signal.signalId).set(document)
    logger.info('Signal stored', { collection, signalId: signal.signalId, verdict: signal.verdict })
    res.status(200).json({ ok: true, signalId: signal.signalId, collection })
  },
)
