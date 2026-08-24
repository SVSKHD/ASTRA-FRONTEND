// Keeping the session row alive, and noticing when it has been killed.
//
// Two rules from the spec drive everything here:
//
//   "lastActiveAt updates at most once every 5 minutes, on app focus, not per
//    route change"
//
// — because a workspace with sixteen tabs and keyboard navigation would
// otherwise issue a write per keystroke-driven navigation, thousands a day, to
// maintain a field whose useful precision is about an hour.
//
//   "force a sign-out on that device at next heartbeat"
//
// — because the Firestore rule stops a revoked device READING, but a tab already
// sitting on a rendered workspace keeps showing what it has in memory until
// something tells it to stop. The heartbeat's return value is that something.

import { onScopeDispose, ref, type Ref } from 'vue'
import { heartbeat, registerSession, type RegisterResult } from '@/services/deviceSessions'
import { clearSessionId, HEARTBEAT_INTERVAL_MS, shouldHeartbeat } from '@/utils/sessionId'

export interface DeviceSessionOptions {
  /** Called when the server says this session has been revoked. */
  onRevoked: () => void | Promise<void>
  /** Called once when this install is seen from an unfamiliar country. */
  onNewCountry?: (result: RegisterResult) => void
}

export interface DeviceSessionHandle {
  /** True between the first register call and its answer. */
  registering: Ref<boolean>
  /** Ping now if the throttle allows it. Safe to call as often as you like. */
  ping: () => void
  stop: () => void
}

export function useDeviceSession(options: DeviceSessionOptions): DeviceSessionHandle {
  const registering = ref(false)
  let lastSentAt: number | null = null
  let inFlight = false
  let stopped = false
  let timer: ReturnType<typeof setInterval> | null = null

  async function revoke(): Promise<void> {
    // Forget the id first. Otherwise the next sign-in on this machine reuses the
    // id someone deliberately killed, and the server — correctly — refuses to
    // resurrect it, leaving the user signed in to nothing.
    clearSessionId()
    stop()
    await options.onRevoked()
  }

  async function send(): Promise<void> {
    // One in flight at a time. Focus events arrive in bursts (alt-tab through a
    // window group fires several in a few hundred milliseconds) and the throttle
    // below only closes after the answer comes back.
    if (stopped || inFlight) return
    const now = Date.now()
    if (!shouldHeartbeat(lastSentAt, now)) return
    inFlight = true
    lastSentAt = now
    try {
      const result = await heartbeat()
      if (result?.revoked) await revoke()
    } catch {
      // A failed heartbeat is a network problem, not a revocation. Signing the
      // user out because their train went into a tunnel would be a worse bug
      // than the one this feature fixes.
      lastSentAt = null
    } finally {
      inFlight = false
    }
  }

  function ping(): void {
    void send()
  }

  function onFocus(): void {
    if (document.visibilityState === 'visible') ping()
  }

  async function start(): Promise<void> {
    registering.value = true
    try {
      const result = await registerSession()
      if (result?.revoked) {
        await revoke()
        return
      }
      lastSentAt = Date.now()
      if (result?.newCountry) options.onNewCountry?.(result)
    } catch (err) {
      console.warn('[Aureon] session registration failed', err)
    } finally {
      registering.value = false
    }

    if (stopped) return
    globalThis.addEventListener?.('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    // A backstop for the tab left open on a second monitor, which never blurs
    // and so never focuses either. The throttle makes it a no-op whenever the
    // focus handler has already fired.
    timer = setInterval(ping, HEARTBEAT_INTERVAL_MS)
  }

  function stop(): void {
    stopped = true
    if (timer) clearInterval(timer)
    timer = null
    globalThis.removeEventListener?.('focus', onFocus)
    document.removeEventListener('visibilitychange', onFocus)
  }

  void start()
  onScopeDispose(stop)

  return { registering, ping, stop }
}
