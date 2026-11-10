// Named watchlists, behind one interface so the storage can change underneath.
//
// TODAY: there is no watchlist API on the backend (checked against the OpenAPI
// contract and the backend source), so lists are kept on THIS DEVICE and every
// screen that shows them says so (`WATCHLIST_STORAGE`). They are not synced
// across devices, and nothing pretends they are.
//
// WHEN THE BACKEND SHIPS IT: the contract the frontend needs is written down in
// docs/market-terminal.md §5 (CRUD for lists and their items, keyed by
// instrument id). Implement a `WatchlistStore` against it and swap
// `watchlistStore`; the screens only talk to the interface.
//
// The old single list (src/trading/watchlist.ts, key aureon.trading.watchlist)
// is migrated once into a list called "My watchlist", and `readWatchlist()` there
// keeps returning every instrument on every list, so the live stream still
// subscribes to all of them.

import { reactive } from 'vue'
import { WATCHLIST_KEY, type Watched } from '@/trading/watchlist'

export const WATCHLISTS_KEY = 'aureon.trading.watchlists.v2'
export const MAX_LISTS = 20
export const MAX_ITEMS = 200

export interface WatchlistItem extends Watched {
  /** When it was added (ISO). */
  added_at: string
}

export interface Watchlist {
  id: string
  name: string
  items: WatchlistItem[]
}

export type WatchlistStorage = 'device' | 'server'

export interface WatchlistStore {
  readonly storage: WatchlistStorage
  all(): Watchlist[]
  create(name: string): Watchlist
  rename(id: string, name: string): void
  remove(id: string): void
  add(listId: string, item: Watched): void
  removeItem(listId: string, instrumentId: number): void
}

function newId(): string {
  return `wl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function cleanName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ').slice(0, 40)
  if (!n) throw new Error('Give the watchlist a name.')
  return n
}

function isItem(w: unknown): w is WatchlistItem {
  const x = w as WatchlistItem
  return !!x && typeof x === 'object' && Number.isInteger(x.id) && typeof x.symbol === 'string'
}

/** Parse what is stored; anything malformed is dropped rather than trusted. */
export function parseLists(raw: string | null): Watchlist[] {
  try {
    const data = JSON.parse(raw || '[]') as unknown
    if (!Array.isArray(data)) return []
    return data
      .filter(
        (l): l is Watchlist =>
          !!l && typeof l === 'object' && typeof (l as Watchlist).id === 'string',
      )
      .slice(0, MAX_LISTS)
      .map((l) => ({
        id: l.id,
        name: typeof l.name === 'string' && l.name.trim() ? l.name.slice(0, 40) : 'Watchlist',
        items: (Array.isArray(l.items) ? l.items : [])
          .filter(isItem)
          .slice(0, MAX_ITEMS)
          .map((i) => ({
            id: i.id,
            symbol: i.symbol,
            broker: typeof i.broker === 'string' ? i.broker : 'dhan',
            added_at: typeof i.added_at === 'string' ? i.added_at : new Date(0).toISOString(),
          })),
      }))
  } catch {
    return []
  }
}

/** The v1 single list becomes "My watchlist" the first time v2 is read. */
export function migrateV1(v1Raw: string | null, now = new Date()): Watchlist[] {
  try {
    const old = JSON.parse(v1Raw || '[]') as unknown
    if (!Array.isArray(old)) return []
    const items = old
      .filter(
        (w): w is Watched => !!w && typeof w === 'object' && Number.isInteger((w as Watched).id),
      )
      .map((w) => ({ ...w, added_at: now.toISOString() }))
    return items.length ? [{ id: newId(), name: 'My watchlist', items }] : []
  } catch {
    return []
  }
}

/** Every instrument on any list, once each — what the live stream subscribes to. */
export function allInstruments(lists: Watchlist[]): Watched[] {
  const seen = new Map<number, Watched>()
  for (const l of lists) for (const i of l.items) if (!seen.has(i.id)) seen.set(i.id, i)
  return [...seen.values()].map(({ id, symbol, broker }) => ({ id, symbol, broker }))
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** This device's store (localStorage), reactive so every screen sees one copy. */
export function deviceStore(): WatchlistStore & { lists: Watchlist[] } {
  const ls = storage()
  let initial = parseLists(ls?.getItem(WATCHLISTS_KEY) ?? null)
  if (!initial.length && ls?.getItem(WATCHLISTS_KEY) == null) {
    initial = migrateV1(ls?.getItem(WATCHLIST_KEY) ?? null)
  }
  const state = reactive({ lists: initial })

  function save() {
    try {
      ls?.setItem(WATCHLISTS_KEY, JSON.stringify(state.lists))
      // Keep v1 in step: it is what readWatchlist() (the stream's subscriptions) reads.
      ls?.setItem(WATCHLIST_KEY, JSON.stringify(allInstruments(state.lists)))
    } catch {
      /* private window: the lists last for this page only */
    }
  }
  function find(id: string): Watchlist {
    const l = state.lists.find((x) => x.id === id)
    if (!l) throw new Error('That watchlist no longer exists.')
    return l
  }

  return {
    storage: 'device',
    get lists() {
      return state.lists
    },
    all: () => state.lists,
    create(name) {
      if (state.lists.length >= MAX_LISTS) throw new Error(`At most ${MAX_LISTS} watchlists.`)
      const l: Watchlist = { id: newId(), name: cleanName(name), items: [] }
      state.lists.push(l)
      save()
      return l
    },
    rename(id, name) {
      find(id).name = cleanName(name)
      save()
    },
    remove(id) {
      state.lists = state.lists.filter((l) => l.id !== id)
      save()
    },
    add(listId, item) {
      const l = find(listId)
      if (l.items.some((i) => i.id === item.id)) return
      if (l.items.length >= MAX_ITEMS) throw new Error(`At most ${MAX_ITEMS} instruments per list.`)
      l.items.push({
        id: item.id,
        symbol: item.symbol,
        broker: item.broker,
        added_at: new Date().toISOString(),
      })
      save()
    },
    removeItem(listId, instrumentId) {
      const l = find(listId)
      l.items = l.items.filter((i) => i.id !== instrumentId)
      save()
    },
  }
}

let store: (WatchlistStore & { lists: Watchlist[] }) | null = null
/** The app's one watchlist store. */
export function watchlistStore(): WatchlistStore & { lists: Watchlist[] } {
  store ??= deviceStore()
  return store
}
/** Tests only: forget the store so the next call re-reads storage. */
export function resetWatchlistStore(): void {
  store = null
}

export const STORAGE_NOTE: Record<WatchlistStorage, string> = {
  device:
    'Saved on this device only. Watchlists sync across devices once the backend watchlist API exists (docs/market-terminal.md §5).',
  server: 'Saved to your Aureon account.',
}
