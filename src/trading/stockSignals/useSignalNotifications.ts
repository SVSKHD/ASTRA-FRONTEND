// The stock-signal notification centre (docs/37 §5): one copy for the page, so
// the bell, the toasts and the Alerts tab read the same list.
//
// The research worker creates notifications after every run, whether or not
// anyone has the page open. Here: a first page read (history, not news), then
// the SSE stream (GET /api/trading/stock-signals/stream; `notification` events
// whose id is the cursor, so a reconnect replays what was missed), and while the
// stream is not open, polling GET /notifications?after_id= every 30 seconds.
// Read state lives on the server (it survives a refresh, on any device); the ids
// already toasted are kept on this device so a refresh never toasts them again.

import { computed, reactive } from 'vue'
import { apiUrl } from '@/api/config'
import { openStream, type StreamHandle, type StreamStatus } from '@/api/sse'
import { fetchNotifications, markAllRead, markNotificationRead, type Notification } from './api'

const TOASTED_KEY = 'aureon.stocksignals.toasted.v2'
const POLL_MS = 30_000

const state = reactive({
  items: [] as Notification[],
  unread: 0,
  loaded: false,
  loading: false,
  error: '',
  stream: 'closed' as StreamStatus,
})

function readToasted(): Set<number> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(TOASTED_KEY) ?? '[]')
    return new Set(Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [])
  } catch {
    return new Set()
  }
}
let toasted = readToasted()
function rememberToasted(ids: number[]) {
  for (const id of ids) toasted.add(id)
  try {
    localStorage.setItem(TOASTED_KEY, JSON.stringify([...toasted].slice(-500)))
  } catch {
    /* private window: may toast again after a refresh */
  }
}

/** Merge newer notifications in, newest first, one per id. */
export function mergeNotifications(
  known: readonly Notification[],
  incoming: readonly Notification[],
): Notification[] {
  const byId = new Map(known.map((n) => [n.id, n]))
  for (const n of incoming) byId.set(n.id, { ...byId.get(n.id), ...n })
  return [...byId.values()].sort((a, b) => b.id - a.id)
}

let toastFn: ((n: Notification) => void) | null = null
let handle: StreamHandle | null = null
let timer: ReturnType<typeof setInterval> | undefined
let users = 0

function lastId(): number | undefined {
  return state.items.length ? state.items[0].id : undefined
}

function take(incoming: Notification[], announce: boolean) {
  const fresh = incoming.filter((n) => !state.items.some((k) => k.id === n.id))
  if (!fresh.length) return
  state.items = mergeNotifications(state.items, fresh)
  state.unread += fresh.filter((n) => !n.read_at).length
  if (!announce) return rememberToasted(fresh.map((n) => n.id))
  const news = fresh.filter((n) => !n.read_at && !toasted.has(n.id))
  rememberToasted(news.map((n) => n.id))
  for (const n of news.slice(0, 3)) toastFn?.(n)
}

async function firstLoad() {
  state.loading = true
  try {
    const page = await fetchNotifications({ limit: 100 })
    state.items = mergeNotifications([], page.items)
    state.unread = page.unread_count
    state.loaded = true
    state.error = ''
    rememberToasted(page.items.map((n) => n.id))
  } catch (e) {
    state.error = (e as Error).message || 'The alerts could not be loaded.'
  } finally {
    state.loading = false
  }
}

async function poll() {
  if (!state.loaded) return firstLoad()
  try {
    const page = await fetchNotifications({ afterId: lastId() ?? 0, limit: 100 })
    take(page.items, true)
    state.unread = page.unread_count
    state.error = ''
  } catch (e) {
    state.error = (e as Error).message
  }
}

function openFeed() {
  handle?.close()
  handle = openStream(apiUrl('/api/trading/stock-signals/stream'), {
    events: ['hello', 'notification', 'bye'],
    onEvent: (e) => {
      let data: unknown
      try {
        data = JSON.parse(e.data)
      } catch {
        return
      }
      if (e.event === 'notification' && data && typeof (data as Notification).id === 'number')
        take([data as Notification], true)
      else if (e.event === 'hello') {
        const unread = (data as { unread_count?: unknown })?.unread_count
        if (typeof unread === 'number') state.unread = unread
      }
    },
    onStatus: (s) => (state.stream = s),
  })
}

const unread = computed(() => state.unread)

async function markRead(ids: number[] | 'all') {
  const before = state.items
  const beforeUnread = state.unread
  const stamp = new Date().toISOString()
  state.items = state.items.map((n) =>
    (ids === 'all' || ids.includes(n.id)) && !n.read_at ? { ...n, read_at: stamp } : n,
  )
  try {
    if (ids === 'all') state.unread = await markAllRead(lastId())
    else {
      for (const id of ids) await markNotificationRead(id)
      state.unread = Math.max(
        0,
        beforeUnread - before.filter((n) => ids.includes(n.id) && !n.read_at).length,
      )
    }
  } catch (e) {
    state.items = before
    state.unread = beforeUnread
    throw e
  }
}

/** Join the notification centre; `toast` shows a new notification. */
export function useSignalNotifications(toast?: (n: Notification) => void) {
  if (toast) toastFn = toast
  function start() {
    users++
    if (users > 1) return
    void firstLoad().then(() => openFeed())
    timer = setInterval(() => {
      if (state.stream === 'open') return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      void poll()
    }, POLL_MS)
  }
  function stop() {
    users = Math.max(0, users - 1)
    if (users) return
    clearInterval(timer)
    handle?.close()
    handle = null
    state.stream = 'closed'
  }
  return { state, unread, refresh: poll, markRead, start, stop }
}
export type SignalCenter = ReturnType<typeof useSignalNotifications>

/** Tests only. */
export function resetSignalNotifications(): void {
  state.items = []
  state.unread = 0
  state.loaded = false
  state.loading = false
  state.error = ''
  state.stream = 'closed'
  users = 0
  clearInterval(timer)
  handle?.close()
  handle = null
  toasted = readToasted()
}
