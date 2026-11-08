// Which build is running here, and which one the server has.
//
// An open tab keeps the JavaScript it loaded until it reloads — the service
// worker swaps in a new deploy for the NEXT load, not this one — so a fix that
// has shipped can still look broken on screen. Every build is stamped with its
// commit and time (vite.config.ts: __APP_BUILD__ in the bundle, /version.json
// beside it). This polls /version.json and says when the two differ.
import { computed, reactive } from 'vue'

export interface BuildStamp {
  version: string
  commit: string
  branch: string
  builtAt: string
}

export const runningBuild: BuildStamp = __APP_BUILD__

export const buildStatus = reactive({
  server: null as BuildStamp | null,
  checkedAt: 0,
  checking: false,
  /** Why the last check failed; '' when it did not (or none has run). */
  error: '',
})

/** True when the server is serving a different build from the one running here. */
export function isNewerBuild(running: BuildStamp, server: BuildStamp | null): boolean {
  if (!server || !server.commit || server.commit === 'unknown') return false
  return server.commit !== running.commit
}

export const updateAvailable = computed(() => isNewerBuild(runningBuild, buildStatus.server))

function isStamp(v: unknown): v is BuildStamp {
  const o = v as Record<string, unknown> | null
  return !!o && typeof o.commit === 'string' && typeof o.builtAt === 'string'
}

export async function checkServerBuild(): Promise<void> {
  if (buildStatus.checking) return
  buildStatus.checking = true
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    // `vite` (dev) has no /version.json: the SPA fallback answers with HTML.
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.includes('json')) {
      buildStatus.error = res.ok ? 'No build stamp on this server' : `HTTP ${res.status}`
      return
    }
    const body: unknown = await res.json()
    if (!isStamp(body)) {
      buildStatus.error = 'Unreadable build stamp'
      return
    }
    buildStatus.server = body
    buildStatus.error = ''
  } catch (e) {
    buildStatus.error = e instanceof Error ? e.message : 'Offline'
  } finally {
    buildStatus.checkedAt = Date.now()
    buildStatus.checking = false
  }
}

const POLL_MS = 5 * 60_000
let timer = 0

function onVisible() {
  if (document.visibilityState === 'visible' && Date.now() - buildStatus.checkedAt > 60_000)
    void checkServerBuild()
}

/** Check now, every five minutes, and whenever the tab comes back into view. */
export function startBuildStatusPolling(): void {
  // Not under Vitest: a test mount should not start timers or hit the network.
  if (timer || typeof window === 'undefined' || import.meta.env.MODE === 'test') return
  void checkServerBuild()
  timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void checkServerBuild()
  }, POLL_MS)
  document.addEventListener('visibilitychange', onVisible)
}

/** Undo startBuildStatusPolling: the timer and the focus listener both go. */
export function stopBuildStatusPolling(): void {
  if (!timer) return
  window.clearInterval(timer)
  timer = 0
  document.removeEventListener('visibilitychange', onVisible)
}

/** Load the server's build: let the service worker pick it up, then reload. */
export async function reloadToLatest(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.()
    await reg?.update()
  } catch {
    /* no worker, or the update check failed: a plain reload still fetches index.html */
  }
  window.location.reload()
}

/** "3m ago", "2h ago", "Nov 7" — short enough for a badge's popover. */
export function ago(iso: string | number, now = Date.now()): string {
  const t = typeof iso === 'number' ? iso : Date.parse(iso)
  if (!Number.isFinite(t)) return '—'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
