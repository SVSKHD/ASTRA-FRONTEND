// The stock-signal notification centre's state: one copy for the page (the bell,
// the toasts and the Alerts tab read the same list).
//
// Events come from the backend's monitor: first a page read, then the trading
// stream's `stock_signal` events while it is open, and a poll every minute when
// it is not (or when the stream is up but the event never comes). Read state
// lives on the server, so it survives a refresh on any device; the ids already
// toasted are kept on this device, so a refresh never toasts them again.

import { computed, reactive, watch } from 'vue'
import { live } from '@/trading/stream'
import {
  AlertsUnavailable,
  fetchEvents,
  markRead as postRead,
  mergeEvents,
  type StockSignalEvent,
} from './alertsApi'

export type Availability = 'unknown' | 'available' | 'unavailable' | 'error'

const TOASTED_KEY = 'aureon.stocksignals.toasted.v1'
const POLL_MS = 60_000

const state = reactive({
  events: [] as StockSignalEvent[],
  unreadServer: null as number | null,
  availability: 'unknown' as Availability,
  error: '',
  loading: false,
  lastLoadedAt: 0,
})

function readToasted(): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(TOASTED_KEY) ?? '[]')
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}
const toasted = readToasted()
function rememberToasted(ids: string[]) {
  for (const id of ids) toasted.add(id)
  try {
    localStorage.setItem(TOASTED_KEY, JSON.stringify([...toasted].slice(-500)))
  } catch {
    /* private window: may toast again after a refresh */
  }
}

let toastFn: ((e: StockSignalEvent) => void) | null = null
let timer: ReturnType<typeof setInterval> | undefined
let users = 0
let firstLoad = true

async function refresh(): Promise<void> {
  if (state.loading) return
  state.loading = true
  try {
    const page = await fetchEvents({ limit: 200 })
    const fresh = page.items.filter((e) => !state.events.some((k) => k.id === e.id))
    state.events = mergeEvents(state.events, page.items)
    state.unreadServer = page.unread
    state.availability = 'available'
    state.error = ''
    state.lastLoadedAt = Date.now()
    // The first read is history, not news: only events after it are toasted.
    if (firstLoad) rememberToasted(page.items.map((e) => e.id))
    else announce(fresh)
    firstLoad = false
  } catch (e) {
    if (e instanceof AlertsUnavailable) state.availability = 'unavailable'
    else {
      state.availability = state.availability === 'available' ? 'available' : 'error'
      state.error = (e as Error).message || 'The alerts could not be loaded.'
    }
  } finally {
    state.loading = false
  }
}

function announce(events: StockSignalEvent[]) {
  const news = events.filter((e) => !e.read && !toasted.has(e.id))
  if (!news.length) return
  rememberToasted(news.map((e) => e.id))
  for (const e of news.slice(0, 3)) toastFn?.(e)
}

// Stream events: merged at once, without waiting for the poll.
watch(
  () => live.stockSignals[0]?.id,
  () => {
    if (state.availability !== 'available') return
    const incoming = live.stockSignals as unknown as StockSignalEvent[]
    const fresh = incoming.filter((e) => !state.events.some((k) => k.id === e.id))
    if (!fresh.length) return
    state.events = mergeEvents(state.events, fresh)
    if (state.unreadServer !== null) state.unreadServer += fresh.filter((e) => !e.read).length
    announce(fresh)
  },
)

const unread = computed(() => state.unreadServer ?? state.events.filter((e) => !e.read).length)

async function markRead(ids: string[] | 'all') {
  const before = state.events
  state.events = state.events.map((e) =>
    ids === 'all' || ids.includes(e.id) ? { ...e, read: true } : e,
  )
  try {
    const left = await postRead(ids)
    state.unreadServer = left ?? state.events.filter((e) => !e.read).length
  } catch (e) {
    state.events = before
    throw e
  }
}

/**
 * Join the notification centre. `toast` shows a new event; the poll runs while
 * at least one screen uses it, and only as a fallback when the stream is down.
 */
export function useSignalNotifications(toast?: (e: StockSignalEvent) => void) {
  if (toast) toastFn = toast
  function start() {
    users++
    if (users === 1) {
      void refresh()
      timer = setInterval(() => {
        if (state.availability === 'unavailable') return
        if (live.status === 'open' && Date.now() - state.lastLoadedAt < POLL_MS * 5) return
        void refresh()
      }, POLL_MS)
    }
  }
  function stop() {
    users = Math.max(0, users - 1)
    if (!users) clearInterval(timer)
  }
  return { state, unread, refresh, markRead, start, stop }
}

/** Tests only. */
export function resetSignalNotifications(): void {
  state.events = []
  state.unreadServer = null
  state.availability = 'unknown'
  state.error = ''
  state.loading = false
  firstLoad = true
  users = 0
  clearInterval(timer)
}
