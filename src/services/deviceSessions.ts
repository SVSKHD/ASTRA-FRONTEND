// The client half of device activity: reads the subtree, calls the functions,
// and knows nothing it should not.
//
// Note what is NOT in this file. There is no IP, no geo lookup, no salt, and no
// write. Every one of those is a deliberate omission rather than an oversight —
// see functions/src/index.ts for why each one has to be on the server. What the
// client contributes is the two things only it knows: the id this install has
// been using, and the user-agent string.

import { auth, loadFirestore, loadFunctions } from '@/firebase'
import type { ActivityEvent, ActivityKind, DeviceKind, DeviceSession } from '@/types'
import { describeDevice } from '@/utils/device'
import { sessionId } from '@/utils/sessionId'

/** How many activity rows the page shows (spec: last 20, newest first). */
export const ACTIVITY_LIMIT = 20

export interface RegisterResult {
  revoked: boolean
  isNew?: boolean
  newCountry?: boolean
  city?: string | null
  country?: string | null
}

/**
 * A Firestore Timestamp, a Date, or already a number — normalised to epoch ms.
 *
 * `serverTimestamp()` resolves to null in the brief window between the local
 * write landing in the offline cache and the server's value coming back, so
 * every timestamp read has to survive being absent. Falling back to `now` keeps
 * a freshly-written row sorting where the user expects rather than in 1970.
 */
function ms(value: unknown, fallback = Date.now()): number {
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  const ts = value as { toMillis?: () => number } | null
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : fallback
}

async function call<T>(name: string, payload: Record<string, unknown>): Promise<T | null> {
  const handle = await loadFunctions()
  if (!handle) return null
  const fn = handle.fx.httpsCallable<Record<string, unknown>, T>(handle.functions, name)
  const res = await fn(payload)
  return res.data
}

/**
 * Announce this device. Called once per app load, not once per navigation.
 *
 * Returns `{ revoked: true }` when the session has been signed out from
 * elsewhere; the caller signs out on that answer.
 */
export async function registerSession(): Promise<RegisterResult | null> {
  const ua = globalThis.navigator?.userAgent ?? ''
  const device = describeDevice(ua)
  return call<RegisterResult>('registerSession', {
    sessionId: sessionId(),
    deviceLabel: device.deviceLabel,
    deviceType: device.deviceType,
    os: device.os,
    browser: device.browser,
    userAgent: ua,
  })
}

/** The liveness ping. Throttled by the caller; also floored on the server. */
export function heartbeat(): Promise<{ revoked: boolean } | null> {
  return call<{ revoked: boolean }>('heartbeat', { sessionId: sessionId() })
}

export function revokeSession(id: string, hard = false): Promise<{ ok: boolean } | null> {
  return call<{ ok: boolean }>('revokeSession', { sessionId: id, hard })
}

export function revokeOtherSessions(): Promise<{ revoked: number } | null> {
  return call<{ revoked: number }>('revokeOtherSessions', { sessionId: sessionId() })
}

export function clearActivityHistory(): Promise<{ deleted: number } | null> {
  return call<{ deleted: number }>('clearActivityHistory', { sessionId: sessionId() })
}

// ---- reads -----------------------------------------------------------------

function toSession(id: string, data: Record<string, unknown>, currentId: string): DeviceSession {
  return {
    id,
    deviceLabel: String(data.deviceLabel ?? 'Unknown device'),
    deviceType: (data.deviceType as DeviceKind) ?? 'desktop',
    os: String(data.os ?? 'Unknown'),
    browser: String(data.browser ?? 'Unknown'),
    ipHash: (data.ipHash as string | null) ?? null,
    city: (data.city as string | null) ?? null,
    region: (data.region as string | null) ?? null,
    country: (data.country as string | null) ?? null,
    approxLat: (data.approxLat as number | null) ?? null,
    approxLng: (data.approxLng as number | null) ?? null,
    createdAt: ms(data.createdAt),
    lastActiveAt: ms(data.lastActiveAt),
    revokedAt: data.revokedAt ? ms(data.revokedAt) : null,
    userAgent: String(data.userAgent ?? ''),
    current: id === currentId,
  }
}

/**
 * Every live session, current device first and the rest by recency.
 *
 * The sort is done here rather than in the query because "current first" is not
 * expressible as an orderBy, and a second index for a list that is never more
 * than a handful of rows is not worth having.
 */
export async function fetchSessions(): Promise<DeviceSession[]> {
  const uid = auth?.currentUser?.uid
  const cloud = await loadFirestore()
  if (!uid || !cloud) return []
  const { db, fs } = cloud
  const snap = await fs.getDocs(fs.collection(db, 'users', uid, 'sessions'))
  const current = sessionId()
  return snap.docs
    .map((d) => toSession(d.id, d.data(), current))
    .sort((a, b) => Number(b.current) - Number(a.current) || b.lastActiveAt - a.lastActiveAt)
}

export async function fetchActivity(limit = ACTIVITY_LIMIT): Promise<ActivityEvent[]> {
  const uid = auth?.currentUser?.uid
  const cloud = await loadFirestore()
  if (!uid || !cloud) return []
  const { db, fs } = cloud
  const snap = await fs.getDocs(
    fs.query(
      fs.collection(db, 'users', uid, 'activity'),
      fs.orderBy('at', 'desc'),
      fs.limit(limit),
    ),
  )
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      type: (data.type as ActivityKind) ?? 'login',
      sessionId: String(data.sessionId ?? ''),
      city: (data.city as string | null) ?? null,
      country: (data.country as string | null) ?? null,
      detail: (data.detail as string | null) ?? null,
      at: ms(data.at),
    }
  })
}
