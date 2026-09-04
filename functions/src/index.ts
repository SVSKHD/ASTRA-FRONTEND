// Aureon device activity — the server half.
//
// Everything here exists because it CANNOT correctly run in the browser:
//
//   • the IP address, which the client does not know and must not be trusted to
//     report;
//   • the salt it is hashed with, which is a secret;
//   • the geo lookup, which would otherwise put the user's raw IP in a third
//     party's logs and ship an API key to devtools;
//   • `revokeRefreshTokens`, which is an admin-SDK privilege by definition — a
//     client that could revoke its own tokens could revoke anyone's;
//   • retention, which must happen whether or not anyone opens the app.
//
// Session documents are therefore written ONLY from here. The security rules
// give the client read access to its own sessions and no write access at all,
// so a client cannot forge a device row, backdate a heartbeat, or un-revoke
// itself.

import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import { clientIp, hashIp } from './ip'
import { resolveLocation } from './geo'

initializeApp()
const db = getFirestore()

// ---- shared shapes ---------------------------------------------------------

export type DeviceType = 'desktop' | 'mobile' | 'tablet'
export type ActivityType =
  'login' | 'logout' | 'revoke' | 'password-change' | 'new-device' | 'new-country'

const DEVICE_TYPES: readonly DeviceType[] = ['desktop', 'mobile', 'tablet']

/** A country not seen in this long counts as new (spec: 90 days). */
const NEW_COUNTRY_WINDOW_DAYS = 90
/** Activity older than this is deleted by the retention job. */
const ACTIVITY_RETENTION_DAYS = 90
/** A revoked session row is kept this long so the user can see it happened. */
const REVOKED_SESSION_RETENTION_DAYS = 30
/**
 * The client is asked to heartbeat at most every 5 minutes; the server enforces
 * a slightly looser floor so a clock skew or a double-focus event is a no-op
 * rather than a write. Without this, "on focus" on a tab-heavy desktop is a
 * write per alt-tab.
 */
const HEARTBEAT_FLOOR_MS = 4 * 60 * 1000

const sessionsOf = (uid: string) => db.collection('users').doc(uid).collection('sessions')
const activityOf = (uid: string) => db.collection('users').doc(uid).collection('activity')

function requireUid(req: CallableRequest): string {
  const uid = req.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.')
  return uid
}

/**
 * Session ids come from the client (one per install, held in localStorage), so
 * they are validated as a document id and nothing more. They are not a secret
 * and confer no authority: every path below is already scoped to the caller's
 * own uid, so the worst a forged id does is create a session row in the
 * caller's own list.
 */
function requireSessionId(raw: unknown): string {
  const id = typeof raw === 'string' ? raw.trim() : ''
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    throw new HttpsError('invalid-argument', 'Bad session id.')
  }
  return id
}

function str(raw: unknown, max = 120): string {
  return typeof raw === 'string' ? raw.trim().slice(0, max) : ''
}

function daysAgo(days: number): Timestamp {
  return Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000)
}

interface ActivityInput {
  type: ActivityType
  sessionId: string
  city?: string | null
  country?: string | null
  detail?: string
}

async function logActivity(uid: string, event: ActivityInput): Promise<void> {
  await activityOf(uid).add({
    type: event.type,
    sessionId: event.sessionId,
    city: event.city ?? null,
    country: event.country ?? null,
    detail: event.detail ?? null,
    at: FieldValue.serverTimestamp(),
  })
}

// ---- registerSession -------------------------------------------------------

/**
 * Called once per app load with the id this install has been using since it was
 * first opened. It is an upsert, NOT an insert: a new document per page load
 * would turn one laptop into forty "devices" in a week, which is precisely the
 * failure that makes a device list useless.
 */
export const registerSession = onCall(async (req) => {
  const uid = requireUid(req)
  const data = (req.data ?? {}) as Record<string, unknown>
  const sessionId = requireSessionId(data.sessionId)

  const ip = clientIp(req.rawRequest)
  const location = await resolveLocation(req.rawRequest, ip)
  const ref = sessionsOf(uid).doc(sessionId)
  const existing = await ref.get()

  const deviceTypeRaw = str(data.deviceType, 16) as DeviceType
  const deviceType: DeviceType = DEVICE_TYPES.includes(deviceTypeRaw) ? deviceTypeRaw : 'desktop'

  const common = {
    deviceLabel: str(data.deviceLabel) || 'Unknown device',
    deviceType,
    os: str(data.os, 64) || 'Unknown',
    browser: str(data.browser, 64) || 'Unknown',
    // The raw address is used to derive these two and is then discarded. It is
    // never written to a document and never returned to the caller.
    ipHash: ip ? hashIp(ip) : null,
    ...location,
    userAgent: str(data.userAgent, 400),
    lastActiveAt: FieldValue.serverTimestamp(),
  }

  // A revoked session that comes back is NOT silently resurrected: the whole
  // point of "sign out everywhere" is that the revoked device stays out until
  // its user signs in again, which mints a new session id.
  if (existing.exists && existing.data()?.revokedAt) {
    return { revoked: true as const }
  }

  if (existing.exists) {
    await ref.update(common)
    return { revoked: false as const, isNew: false, newCountry: false, ...location }
  }

  await ref.set({ ...common, revokedAt: null, createdAt: FieldValue.serverTimestamp() })
  await logActivity(uid, {
    type: 'new-device',
    sessionId,
    city: location.city,
    country: location.country,
    detail: common.deviceLabel,
  })

  const newCountry = await isUnfamiliarCountry(uid, sessionId, location.country)
  if (newCountry) {
    await logActivity(uid, {
      type: 'new-country',
      sessionId,
      city: location.city,
      country: location.country,
      // `detail` is an optional string, and a coarse lookup that found no
      // country gives null — which is "not known", not the string "null".
      detail: location.country ?? undefined,
    })
  }

  return { revoked: false as const, isNew: true, newCountry, ...location }
})

/**
 * "New" means: we have a country for this sign-in, and no OTHER session created
 * in the last 90 days came from it.
 *
 * A user with no location data never gets an alert — an unknown country is not
 * a suspicious one, and crying wolf on every local-emulator sign-in trains the
 * user to dismiss the banner that matters.
 */
async function isUnfamiliarCountry(
  uid: string,
  sessionId: string,
  country: string | null,
): Promise<boolean> {
  if (!country) return false
  const recent = await sessionsOf(uid)
    .where('createdAt', '>=', daysAgo(NEW_COUNTRY_WINDOW_DAYS))
    .get()
  return !recent.docs.some((d) => d.id !== sessionId && d.data().country === country)
}

// ---- heartbeat -------------------------------------------------------------

/**
 * The liveness ping, and the revocation channel in the same call.
 *
 * Returning `{ revoked: true }` is what makes "sign out everywhere else"
 * actually reach the other device: the rules already stop it reading data, but
 * a tab sitting on an open workspace would keep showing what it had in memory
 * until someone reloaded it. The client signs itself out on this answer.
 */
export const heartbeat = onCall(async (req) => {
  const uid = requireUid(req)
  const sessionId = requireSessionId((req.data ?? {}).sessionId)
  const ref = sessionsOf(uid).doc(sessionId)
  const snap = await ref.get()

  if (!snap.exists) return { revoked: false as const, known: false }
  const data = snap.data() ?? {}
  if (data.revokedAt) return { revoked: true as const, known: true }

  const last = data.lastActiveAt as Timestamp | undefined
  if (!last || Date.now() - last.toMillis() > HEARTBEAT_FLOOR_MS) {
    await ref.update({ lastActiveAt: FieldValue.serverTimestamp() })
  }
  return { revoked: false as const, known: true }
})

// ---- revoke ----------------------------------------------------------------

/**
 * Soft revoke writes `revokedAt` — the rules then refuse reads from that
 * session and its next heartbeat signs it out.
 *
 * Hard revoke additionally calls `revokeRefreshTokens`, which invalidates every
 * refresh token the account holds. That is the only thing that stops a device
 * whose ID token has not yet expired, so it is what "sign out everywhere else"
 * uses — but it logs THIS device out too unless the client refreshes, which is
 * why the single-device case defaults to soft.
 */
export const revokeSession = onCall(async (req) => {
  const uid = requireUid(req)
  const data = (req.data ?? {}) as Record<string, unknown>
  const sessionId = requireSessionId(data.sessionId)
  const ref = sessionsOf(uid).doc(sessionId)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'No such session.')

  await ref.update({ revokedAt: FieldValue.serverTimestamp() })
  await logActivity(uid, {
    type: 'revoke',
    sessionId,
    city: snap.data()?.city ?? null,
    country: snap.data()?.country ?? null,
    detail: snap.data()?.deviceLabel ?? null,
  })
  if (data.hard === true) await getAuth().revokeRefreshTokens(uid)
  return { ok: true as const }
})

/** "Sign out everywhere else": every session but the caller's, in one write. */
export const revokeOtherSessions = onCall(async (req) => {
  const uid = requireUid(req)
  const keep = requireSessionId((req.data ?? {}).sessionId)
  const all = await sessionsOf(uid).get()
  const others = all.docs.filter((d) => d.id !== keep && !d.data().revokedAt)

  const batch = db.batch()
  for (const doc of others) batch.update(doc.ref, { revokedAt: FieldValue.serverTimestamp() })
  await batch.commit()

  await logActivity(uid, {
    type: 'revoke',
    sessionId: keep,
    detail: `Signed out ${others.length} other device${others.length === 1 ? '' : 's'}`,
  })

  // A hard revoke here is the point: the other devices may hold ID tokens valid
  // for up to an hour, and "sign out everywhere" that leaves them working for
  // another hour is not a security control.
  if (others.length > 0) await getAuth().revokeRefreshTokens(uid)
  return { revoked: others.length }
})

// ---- clear history ---------------------------------------------------------

/**
 * The privacy control: delete every activity event older than the current
 * session. Bounded rather than "delete everything", so the user does not erase
 * the record of the sign-in they are currently looking at.
 */
export const clearActivityHistory = onCall(async (req) => {
  const uid = requireUid(req)
  const sessionId = requireSessionId((req.data ?? {}).sessionId)
  const session = await sessionsOf(uid).doc(sessionId).get()
  const cutoff = (session.data()?.createdAt as Timestamp | undefined) ?? Timestamp.now()

  const stale = await activityOf(uid).where('at', '<', cutoff).limit(500).get()
  const batch = db.batch()
  for (const doc of stale.docs) batch.delete(doc.ref)
  await batch.commit()
  return { deleted: stale.size }
})

// ---- retention -------------------------------------------------------------

/**
 * Retention runs on a schedule and not on app open, because data the user was
 * promised would be deleted must be deleted whether or not they come back.
 */
export const purgeExpiredActivity = onSchedule('every day 03:00', async () => {
  const users = await db.collection('users').listDocuments()
  let activityDeleted = 0
  let sessionsDeleted = 0

  for (const user of users) {
    const oldActivity = await user
      .collection('activity')
      .where('at', '<', daysAgo(ACTIVITY_RETENTION_DAYS))
      .limit(500)
      .get()
    const oldSessions = await user
      .collection('sessions')
      .where('revokedAt', '<', daysAgo(REVOKED_SESSION_RETENTION_DAYS))
      .limit(500)
      .get()

    if (oldActivity.empty && oldSessions.empty) continue
    const batch = db.batch()
    for (const doc of oldActivity.docs) batch.delete(doc.ref)
    for (const doc of oldSessions.docs) batch.delete(doc.ref)
    await batch.commit()
    activityDeleted += oldActivity.size
    sessionsDeleted += oldSessions.size
  }

  logger.info('retention sweep', { activityDeleted, sessionsDeleted })
})

// Dacoit's ingestion endpoint (section 34). Kept in its own module: it is the
// only thing here that is not about device activity, and it is the only one
// that authenticates with a shared key rather than with a Firebase session.
export { dacoitSignal } from './dacoit'
