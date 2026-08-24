// The device's identity, which is a thing it keeps rather than a thing it gets.
//
// The single most important line in section 27a is "generated client-side once
// per install, stored in localStorage — do not create a new session doc per page
// load". Get that wrong and the feature inverts: instead of "here are your three
// devices", the user sees four hundred rows, one per reload, all called Chrome
// on macOS, and the one that matters — the sign-in from a country they have
// never visited — is somewhere on page nineteen.
//
// So the id is minted exactly once and then read forever. Everything below is in
// service of "exactly once" surviving the ways localStorage can fail.

import { nanoid } from '@/utils/nanoid'

export const SESSION_KEY = 'aureon:session-id'

/** Matches the server's validator, so a bad value never reaches a call. */
const VALID = /^[A-Za-z0-9_-]{8,64}$/

// Private browsing and "block all cookies" both make localStorage throw on
// access rather than return null. A device that cannot persist an id still gets
// one — held in memory for the tab's lifetime — because the alternative is
// failing the sign-in, and a browser that forgets is not a browser that is
// attacking us.
let memoryFallback: string | null = null

function readStored(): string | null {
  try {
    return globalThis.localStorage?.getItem(SESSION_KEY) ?? null
  } catch {
    return null
  }
}

function writeStored(id: string): void {
  try {
    globalThis.localStorage?.setItem(SESSION_KEY, id)
  } catch {
    // Nothing to do and nothing worth telling the user: the id works for this
    // tab, and next time it will simply be a new "device".
  }
}

/**
 * This install's session id, minting one on first call.
 *
 * A stored value that does not match the format is replaced rather than
 * repaired — it can only have come from a hand-edited localStorage or a version
 * of this app that used a different scheme, and in both cases a fresh id is
 * correct and a rejected call is not.
 */
export function sessionId(): string {
  const stored = readStored()
  if (stored && VALID.test(stored)) return stored
  if (memoryFallback) return memoryFallback

  const minted = nanoid(24)
  memoryFallback = minted
  writeStored(minted)
  return minted
}

/**
 * Forget this device's identity.
 *
 * Called on sign-out, and it is the reason a revoked device stays revoked: the
 * next sign-in on that machine mints a NEW id, so it appears as a new session
 * rather than resurrecting the row someone deliberately killed.
 */
export function clearSessionId(): void {
  memoryFallback = null
  try {
    globalThis.localStorage?.removeItem(SESSION_KEY)
  } catch {
    /* see writeStored */
  }
}

// ---- the heartbeat clock ---------------------------------------------------

/** Spec: at most once every 5 minutes. */
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000

/**
 * Whether enough time has passed to be worth a write.
 *
 * This is a pure function of two numbers so the rule can be tested without a
 * clock, a store or a network. The rule itself is the whole point: `lastActiveAt`
 * is a "roughly when did you last use this" field, and updating it per route
 * change turns a page of tabs into a write per navigation — thousands of writes
 * a day to record a fact whose useful precision is about an hour.
 */
export function shouldHeartbeat(lastSentAt: number | null, now: number): boolean {
  if (lastSentAt == null) return true
  // A clock that has gone backwards (a laptop waking, an NTP correction) would
  // otherwise wedge the heartbeat off until real time caught up.
  if (now < lastSentAt) return true
  return now - lastSentAt >= HEARTBEAT_INTERVAL_MS
}
