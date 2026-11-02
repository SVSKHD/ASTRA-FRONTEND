// The client half of device activity: reads the subtree, calls the functions,
// and knows nothing it should not.
//
// Note what is NOT in this file. There is no IP, no geo lookup, no salt, and no
// write. Every one of those is a deliberate omission rather than an oversight —
// see functions/src/index.ts for why each one has to be on the server. What the
// client contributes is the two things only it knows: the id this install has
// been using, and the user-agent string.

import { auth, loadFirestore, loadFunctions } from '@/firebase'
import { aureon, errorMessage } from '@/api/client'
import { authProvider } from '@/auth/provider'
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

export async function revokeSession(id: string, hard = false): Promise<{ ok: boolean } | null> {
  if (onAureon()) {
    await aureonRevoke(id)
    return { ok: true }
  }
  return call<{ ok: boolean }>('revokeSession', { sessionId: id, hard })
}

export async function revokeOtherSessions(): Promise<{ revoked: number } | null> {
  if (onAureon()) {
    // One DELETE per other session: revoke-all would end this one too.
    const others = (await fetchAureonSessions()).filter((s) => !s.current)
    for (const s of others) await aureonRevoke(s.id)
    return { revoked: others.length }
  }
  return call<{ revoked: number }>('revokeOtherSessions', { sessionId: sessionId() })
}

export function clearActivityHistory(): Promise<{ deleted: number } | null> {
  // Aureon keeps its sign-in history in the audit log, which the owner does not edit.
  if (onAureon()) return Promise.resolve({ deleted: 0 })
  return call<{ deleted: number }>('clearActivityHistory', { sessionId: sessionId() })
}

// ---- Aureon (VITE_AUTH_PROVIDER=aureon) -------------------------------------
//
// The server keeps the sessions (core.sessions): GET /api/auth/sessions lists
// your live ones, DELETE /api/auth/sessions/{id} ends one, and
// POST /api/auth/sessions/revoke-all ends every one, this device included.
// There is no location and no activity feed: Aureon stores the IP and the user
// agent of each session, and nothing else.

/** Whether Security → Devices reads Aureon's sessions. */
export function onAureon(): boolean {
  return authProvider() === 'aureon'
}

async function aureonRevoke(id: string): Promise<void> {
  const { error, response } = await aureon.DELETE('/api/auth/sessions/{session_id}', {
    params: { path: { session_id: id } },
  })
  // Already gone (revoked or expired elsewhere) is the outcome that was asked for.
  if (!response.ok && response.status !== 404)
    throw new Error(
      errorMessage(error, `That device could not be signed out (HTTP ${response.status}).`),
    )
}

async function fetchAureonSessions(): Promise<DeviceSession[]> {
  const { data, error, response } = await aureon.GET('/api/auth/sessions')
  if (!data)
    throw new Error(errorMessage(error, `Could not load your devices (HTTP ${response.status}).`))
  return data
    .map((s) => {
      const device = describeDevice(s.user_agent ?? '')
      const created = Date.parse(s.created_at) || Date.now()
      return {
        id: s.id,
        deviceLabel: device.deviceLabel,
        deviceType: device.deviceType,
        os: device.os,
        browser: device.browser,
        ipHash: null,
        city: null,
        region: null,
        country: null,
        approxLat: null,
        approxLng: null,
        createdAt: created,
        // Aureon does not track activity per session; the sign-in time stands in.
        lastActiveAt: created,
        revokedAt: null,
        userAgent: s.user_agent ?? '',
        current: s.current,
      } satisfies DeviceSession
    })
    .sort((a, b) => Number(b.current) - Number(a.current) || b.createdAt - a.createdAt)
}

/** Every session, this device included. The caller returns to sign-in after it. */
export async function revokeAllSessions(): Promise<number> {
  const { data, error, response } = await aureon.POST('/api/auth/sessions/revoke-all')
  if (!data)
    throw new Error(errorMessage(error, `Could not sign out everywhere (HTTP ${response.status}).`))
  return data.revoked
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
  if (onAureon()) return fetchAureonSessions()
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
  if (onAureon()) return []
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
