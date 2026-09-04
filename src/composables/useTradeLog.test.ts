// The trade log's data layer, against a fake Firestore.
//
// What is worth testing here is not the query builder — it is the three things
// that go wrong in an optimistic listener: a row that appears twice because the
// snapshot echoed a local write, a row that stays on screen after the write was
// rejected, and a listener that outlives the month or the component it was
// opened for.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

type Listener = { next: (snap: unknown) => void; error: (err: unknown) => void }

const listeners: Record<string, Listener> = {}
const writes: { setDoc: unknown[]; deleteDoc: string[] } = { setDoc: [], deleteDoc: [] }
let nextId = 0
let failWrites = false
let failCode = 'permission-denied'
// When set, a write parks here until the test releases it — which is the only
// way to look at the screen while a write is genuinely still in flight.
let heldWrites: (() => void)[] | null = null

/** Only the surface useTradeLog actually reaches for. */
function makeFs() {
  return {
    collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
    doc: (dbOrCol: { path?: string }, ...path: string[]) =>
      path.length
        ? { id: path[path.length - 1], path: path.join('/') }
        : { id: `doc${++nextId}`, path: `${dbOrCol.path}/doc${nextId}` },
    query: (col: { path: string }) => ({ path: col.path }),
    where: () => ({}),
    orderBy: () => ({}),
    Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
    serverTimestamp: () => ({ server: true }),
    // The SDK takes either (ref, next, error) or (ref, options, next, error);
    // the trades listener uses the second because it asks for metadata changes.
    onSnapshot: (target: { path: string }, ...rest: unknown[]) => {
      const [next, error] = (typeof rest[0] === 'function' ? rest : rest.slice(1)) as [
        (snap: unknown) => void,
        (err: unknown) => void,
      ]
      // Keyed by the last path segment: 'trades', 'secured' or 'logger'.
      const key = target.path.split('/').pop() as string
      listeners[key] = { next, error }
      return () => delete listeners[key]
    },
    setDoc: (ref: { path: string }, data: unknown) => {
      if (failWrites) return Promise.reject(Object.assign(new Error(failCode), { code: failCode }))
      writes.setDoc.push({ path: ref.path, data })
      if (!heldWrites) return Promise.resolve()
      return new Promise<void>((resolve) => heldWrites!.push(resolve))
    },
    deleteDoc: (ref: { id: string }) => {
      if (failWrites) return Promise.reject(Object.assign(new Error(failCode), { code: failCode }))
      writes.deleteDoc.push(ref.id)
      return Promise.resolve()
    },
  }
}

// Partial: the auth store reads `firebaseEnabled` and `auth` from the same
// module, and replacing the whole thing would take those with it.
vi.mock('@/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/firebase')>()),
  loadFirestore: () => Promise.resolve({ db: {}, fs: makeFs() }),
}))

// jsdom has no IndexedDB, and the outbox is the whole point of section 30, so
// here is one: just enough of the API surface the service actually calls, with
// the same callback shape, so the service is exercised rather than stubbed out.
const idbStore = new Map<string, unknown>()
function fakeRequest<T>(result: T) {
  const request = { result, onsuccess: null, onerror: null } as unknown as {
    result: T
    onsuccess: (() => void) | null
    onerror: (() => void) | null
  }
  queueMicrotask(() => request.onsuccess?.())
  return request
}
vi.stubGlobal('indexedDB', {
  open() {
    const db = {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => {},
      transaction: () => ({
        objectStore: () => ({
          getAll: () => fakeRequest([...idbStore.values()]),
          put: (value: { id: string }) => {
            idbStore.set(value.id, value)
            return fakeRequest(undefined)
          },
          delete: (id: string) => {
            idbStore.delete(id)
            return fakeRequest(undefined)
          },
        }),
      }),
    }
    return fakeRequest(db)
  },
})

// The composable is imported after the mock is registered.
const { useTradeLog } = await import('@/composables/useTradeLog')
const { useAuthStore } = await import('@/stores/auth')
const { resetOutboxConnection, MAX_ATTEMPTS } = await import('@/services/outbox')

function docsOf(rows: Record<string, unknown>[], pending = false) {
  return {
    docs: rows.map((r) => ({
      id: String(r.id),
      data: () => r,
      // What Firestore says about a row it is still holding locally.
      metadata: { hasPendingWrites: r.pending === true || pending },
    })),
  }
}

const TRADE = {
  id: 'server1',
  date: '2026-09-02',
  ts: { toMillis: () => 2 },
  symbol: 'XAUUSD',
  session: 'London',
  side: 'buy',
  lot: 1,
  entry: 2400,
  exit: 2410,
  move: 10,
  pl: 1000,
  note: '',
  createdAt: { toMillis: () => 2 },
}

/** Two microtask turns and a render: what an awaited `loadFirestore` needs. */
async function flush() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

/**
 * Enough turns for the outbox to finish. IndexedDB answers on a microtask here
 * as it does in a browser, and one queue operation is several round trips —
 * open, read, write, read back — so a fixed `flush()` is not enough for it.
 */
async function settle(turns = 60) {
  for (let i = 0; i < turns; i += 1) await Promise.resolve()
  await nextTick()
}

/** The trade documents that were written, ignoring the settings doc. */
function tradeWrites() {
  return (writes.setDoc as { path: string; data: Record<string, unknown> }[]).filter((w) =>
    w.path.includes('/trades/'),
  )
}

/** Fast-forward the backoff. Nothing here is a test of the clock. */
function due() {
  for (const entry of idbStore.values()) (entry as { nextAttemptAt: number }).nextAttemptAt = 0
}

/** The composable inside a component, so onUnmounted is a real lifecycle. */
async function mountLog(month = ref('2026-09')) {
  const holder: { log?: ReturnType<typeof useTradeLog> } = {}
  const wrapper = mount(
    defineComponent({
      setup() {
        holder.log = useTradeLog(ref('XAUUSD'), month)
        return () => null
      },
    }),
  )
  // The listener attaches after `loadFirestore` resolves.
  await flush()
  return { wrapper, log: holder.log!, month }
}

describe('useTradeLog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // Two of these tests reject a write on purpose; the composable reports that
    // to the console, and the run should not read as if something broke.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const key of Object.keys(listeners)) delete listeners[key]
    writes.setDoc = []
    writes.deleteDoc = []
    nextId = 0
    failWrites = false
    failCode = 'permission-denied'
    heldWrites = null
    idbStore.clear()
    resetOutboxConnection()
    useAuthStore().user = {
      uid: 'u1',
      name: 'T',
      email: 't@example.com',
      provider: 'google',
      initial: 'T',
      color: '',
    }
  })

  it('opens a listener per collection once a uid is known', async () => {
    const { wrapper } = await mountLog()
    expect(Object.keys(listeners).sort()).toEqual(['logger', 'secured', 'trades'])
    wrapper.unmount()
  })

  it('recomputes move and P/L from the row rather than trusting what is stored', async () => {
    const { wrapper, log } = await mountLog()
    listeners.trades.next(docsOf([{ ...TRADE, move: 999, pl: -1 }]))
    await nextTick()
    expect(log.trades.value[0].move).toBe(10)
    // XAUUSD is 100 per point by default, so ten points on one lot is 1000.
    expect(log.trades.value[0].pl).toBe(1000)
    wrapper.unmount()
  })

  it('shows an added trade before the server has confirmed it', async () => {
    const { wrapper, log } = await mountLog()
    listeners.trades.next(docsOf([]))
    await nextTick()
    heldWrites = []
    const done = log.addTrade({
      date: '2026-09-03',
      symbol: 'us30',
      session: 'NY',
      side: 'sell',
      lot: 2,
      entry: 41000,
      exit: 40900,
      note: 'break',
    })
    // The form is told the trade is captured while the write is still in
    // flight. This is the whole of section 30 in one assertion: awaiting the
    // server here is what used to hang a submit made with no network.
    expect(await done).toBe(true)
    await flush()
    // The write has not resolved and no snapshot has carried the row, so this
    // is the optimistic copy and nothing else.
    expect(tradeWrites()).toHaveLength(1)
    expect(log.trades.value).toHaveLength(1)
    expect(log.trades.value[0].symbol).toBe('US30')
    expect(log.trades.value[0].move).toBe(100)
    for (const release of heldWrites!) release()
    heldWrites = null
    wrapper.unmount()
  })

  it('does not show it twice when the snapshot brings the same row back', async () => {
    const { wrapper, log } = await mountLog()
    listeners.trades.next(docsOf([]))
    await nextTick()
    await log.addTrade({
      date: '2026-09-03',
      symbol: 'XAUUSD',
      session: 'NY',
      side: 'buy',
      lot: 1,
      entry: 2400,
      exit: 2405,
      note: '',
    })
    const written = writes.setDoc[0] as { path: string }
    const id = written.path.split('/').pop() as string
    listeners.trades.next(
      docsOf([{ ...TRADE, id, date: '2026-09-03', entry: 2400, exit: 2405, move: 5, pl: 500 }]),
    )
    await nextTick()
    expect(log.trades.value).toHaveLength(1)
    wrapper.unmount()
  })

  it('parks a refused write instead of throwing the trade away', async () => {
    const { wrapper, log } = await mountLog()
    listeners.trades.next(docsOf([]))
    await nextTick()
    failWrites = true
    const ok = await log.addTrade({
      date: '2026-09-03',
      symbol: 'XAUUSD',
      session: 'NY',
      side: 'buy',
      lot: 1,
      entry: 2400,
      exit: 2405,
      note: '',
    })
    await settle()
    // Captured is captured. What was refused is the delivery, and a rollback
    // there would mean the user typed a trade and watched it vanish.
    expect(ok).toBe(true)
    expect(log.trades.value).toHaveLength(1)
    expect(log.outbox.value).toHaveLength(1)
    expect(log.outbox.value[0].lastError).toBe('permission-denied')
    expect(log.outbox.value[0].blocked).toBe(false)
    expect(log.rowState.value[log.outbox.value[0].id]).toBe('queued')
    // And the reason is named rather than described, because the two codes
    // that reach here have two different fixes.
    expect(log.error.value).toContain('permission-denied')
    wrapper.unmount()
  })

  it('hides a deleted row immediately and restores it if the delete fails', async () => {
    const { wrapper, log } = await mountLog()
    listeners.trades.next(docsOf([TRADE]))
    await nextTick()
    await log.deleteTrade('server1')
    await nextTick()
    expect(log.trades.value).toHaveLength(0)
    expect(writes.deleteDoc).toEqual(['server1'])

    listeners.trades.next(docsOf([TRADE]))
    await nextTick()
    failWrites = true
    await log.deleteTrade('server1')
    await nextTick()
    expect(log.trades.value).toHaveLength(1)
    expect(log.error.value).toContain('still in the log')
    wrapper.unmount()
  })

  it('keeps the secured ledger apart from the trades', async () => {
    const { wrapper, log } = await mountLog()
    listeners.trades.next(docsOf([TRADE]))
    listeners.secured.next(docsOf([{ id: 's1', date: '2026-09-02', amt: 250, note: 'bank' }]))
    await nextTick()
    expect(log.trades.value).toHaveLength(1)
    expect(log.secured.value).toEqual([
      { id: 's1', date: '2026-09-02', amt: 250, note: 'bank', createdAt: 0 },
    ])
    wrapper.unmount()
  })

  it('re-scopes its listeners when the month changes', async () => {
    const month = ref('2026-09')
    const { wrapper, log } = await mountLog(month)
    listeners.trades.next(docsOf([TRADE]))
    await nextTick()
    expect(log.trades.value).toHaveLength(1)

    const before = listeners.trades
    month.value = '2026-08'
    await flush()
    // A new subscription, and the old month's rows are gone rather than being
    // mixed into the new one.
    expect(listeners.trades).not.toBe(before)
    expect(log.trades.value).toHaveLength(0)
    wrapper.unmount()
  })

  it('tears every listener down when the view goes away', async () => {
    const { wrapper } = await mountLog()
    expect(Object.keys(listeners)).toHaveLength(3)
    wrapper.unmount()
    expect(Object.keys(listeners)).toHaveLength(0)
  })

  it('remembers the symbol that was traded', async () => {
    const { wrapper, log } = await mountLog()
    listeners.trades.next(docsOf([]))
    await nextTick()
    await log.addTrade({
      date: '2026-09-03',
      symbol: 'nas100',
      session: 'NY',
      side: 'buy',
      lot: 1,
      entry: 1,
      exit: 2,
      note: '',
    })
    // Fire-and-forget, so it has not necessarily happened by the time addTrade
    // returns — which is the point.
    await settle()
    const settingsWrite = (writes.setDoc as { path: string; data: Record<string, unknown> }[]).find(
      (w) => w.path.endsWith('settings/logger') && w.data.lastSymbol === 'NAS100',
    )
    expect(settingsWrite).toBeTruthy()
    expect(log.settings.value.lastSymbol).toBe('NAS100')
    wrapper.unmount()
  })

  it('writes a contract size for a symbol nobody has sized yet', async () => {
    const { wrapper, log } = await mountLog()
    await log.setContractSize('nas100', 20)
    expect(log.settings.value.contractSizes.NAS100).toBe(20)
    wrapper.unmount()
  })
})

// The three ways a trade can be lost, each one walked end to end (section 30).
//
// A trade is worth money, so "it usually works" is not a standard. Each of
// these follows one path from the submit button to the server and asserts the
// two things that matter at every step along it: the trade is still there, and
// there is still only one of it.
const NEW_TRADE = {
  date: '2026-09-03',
  symbol: 'XAUUSD',
  session: 'London',
  side: 'buy',
  lot: 1,
  entry: 2400,
  exit: 2410,
  note: 'offline',
} as const

describe('no trade is lost and none is counted twice', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const key of Object.keys(listeners)) delete listeners[key]
    writes.setDoc = []
    writes.deleteDoc = []
    nextId = 0
    failWrites = false
    failCode = 'permission-denied'
    heldWrites = null
    idbStore.clear()
    resetOutboxConnection()
    useAuthStore().user = {
      uid: 'u1',
      name: 'T',
      email: 't@example.com',
      provider: 'google',
      initial: 'T',
      color: '',
    }
  })

  it('offline submit, reload, reconnect', async () => {
    const first = await mountLog()
    listeners.trades.next(docsOf([]))
    await nextTick()

    // Offline. With `persistentLocalCache` on, this is precisely what the SDK
    // does: it takes the write, keeps it, and leaves the promise unsettled
    // until a server answers. Held for the whole offline stretch below.
    heldWrites = []
    expect(await first.log.addTrade({ ...NEW_TRADE })).toBe(true)
    await settle()
    const id = tradeWrites()[0].path.split('/').pop() as string

    // Captured: on screen at once, and honestly marked as not yet safe.
    expect(first.log.trades.value).toHaveLength(1)
    expect(first.log.rowState.value[id]).toBe('pending')

    // The cache echoes it back while still holding it. One row, not two.
    listeners.trades.next(docsOf([{ ...TRADE, id, date: '2026-09-03', pending: true }]))
    await nextTick()
    expect(first.log.trades.value).toHaveLength(1)
    expect(first.log.rowState.value[id]).toBe('pending')

    // Reload. Every optimistic row in memory is gone; what comes back comes
    // back from Firestore's own cache, still unacknowledged.
    first.wrapper.unmount()
    const second = await mountLog()
    listeners.trades.next(docsOf([{ ...TRADE, id, date: '2026-09-03', pending: true }]))
    await nextTick()
    expect(second.log.trades.value).toHaveLength(1)
    expect(second.log.rowState.value[id]).toBe('pending')

    // Reconnect: the write lands and the snapshot drops its pending flag.
    for (const release of heldWrites!) release()
    heldWrites = null
    listeners.trades.next(docsOf([{ ...TRADE, id, date: '2026-09-03' }]))
    await settle()
    expect(second.log.trades.value).toHaveLength(1)
    expect(second.log.rowState.value[id]).toBeUndefined()
    // And nothing was ever queued: a write that has not settled is not a write
    // that was refused, and treating the two alike is the double-send bug.
    expect(second.log.outbox.value).toHaveLength(0)
    second.wrapper.unmount()
  })

  it('replays onto the id it minted, so a repeat is an overwrite', async () => {
    const { wrapper, log } = await mountLog()
    listeners.trades.next(docsOf([]))
    await nextTick()
    failWrites = true
    await log.addTrade({ ...NEW_TRADE })
    await settle()
    expect(log.outbox.value).toHaveLength(1)
    const id = log.outbox.value[0].id

    // Whatever was refusing is fixed out of band, and the queue is swept twice
    // — which is what an `online` event landing next to the 30s timer does.
    failWrites = false
    due()
    await log.flushOutbox()
    await settle()
    due()
    await log.flushOutbox()
    await settle()

    // Two sweeps, one document written, and it carries the id the optimistic
    // row already had. The entry is gone because the server acknowledged it,
    // which is the only thing that removes one.
    const replays = tradeWrites().filter((w) => w.path.endsWith(`/trades/${id}`))
    expect(replays).toHaveLength(1)
    expect(log.outbox.value).toHaveLength(0)

    // The row the replay produced is the row that was already on screen.
    listeners.trades.next(docsOf([{ ...TRADE, id, date: '2026-09-03' }]))
    await nextTick()
    expect(log.trades.value).toHaveLength(1)
    wrapper.unmount()
  })

  it('gives up after eight refusals and hands the trade back rather than dropping it', async () => {
    const { wrapper, log } = await mountLog()
    listeners.trades.next(docsOf([]))
    await nextTick()
    failWrites = true
    await log.addTrade({ ...NEW_TRADE })
    await settle()
    expect(log.outbox.value[0].attempts).toBe(1)
    const id = log.outbox.value[0].id

    // The submit was the first attempt; seven sweeps make eight.
    for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
      due()
      await log.flushOutbox()
      await settle()
    }
    expect(log.outbox.value).toHaveLength(1)
    expect(log.outbox.value[0].attempts).toBe(MAX_ATTEMPTS)
    expect(log.outbox.value[0].blocked).toBe(true)

    // Blocked means it stops asking. A due sweep walks straight past it.
    due()
    await log.flushOutbox()
    await settle()
    expect(log.outbox.value[0].attempts).toBe(MAX_ATTEMPTS)

    // Still on screen, still exactly once, now red instead of amber, and the
    // message names the code so the cause can actually be fixed.
    expect(log.trades.value).toHaveLength(1)
    expect(log.rowState.value[id]).toBe('blocked')
    expect(log.error.value).toContain('permission-denied')
    expect(log.error.value).toContain(String(MAX_ATTEMPTS))

    // The one way it ever leaves is somebody deciding it should.
    await log.discard(id)
    await settle()
    expect(log.outbox.value).toHaveLength(0)
    expect(log.trades.value).toHaveLength(0)
    wrapper.unmount()
  })
})
