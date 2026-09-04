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
    onSnapshot: (
      target: { path: string },
      next: (snap: unknown) => void,
      error: (err: unknown) => void,
    ) => {
      // Keyed by the last path segment: 'trades', 'secured' or 'logger'.
      const key = target.path.split('/').pop() as string
      listeners[key] = { next, error }
      return () => delete listeners[key]
    },
    setDoc: (ref: { path: string }, data: unknown) => {
      if (failWrites) return Promise.reject(new Error('permission-denied'))
      writes.setDoc.push({ path: ref.path, data })
      if (!heldWrites) return Promise.resolve()
      return new Promise<void>((resolve) => heldWrites!.push(resolve))
    },
    deleteDoc: (ref: { id: string }) => {
      if (failWrites) return Promise.reject(new Error('permission-denied'))
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

// The composable is imported after the mock is registered.
const { useTradeLog } = await import('@/composables/useTradeLog')
const { useAuthStore } = await import('@/stores/auth')

function docsOf(rows: Record<string, unknown>[]) {
  return { docs: rows.map((r) => ({ id: String(r.id), data: () => r })) }
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
    heldWrites = null
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
    await flush()
    // The write has not resolved and no snapshot has carried the row, so this
    // is the optimistic copy and nothing else.
    expect(writes.setDoc).toHaveLength(1)
    expect(log.trades.value).toHaveLength(1)
    expect(log.trades.value[0].symbol).toBe('US30')
    expect(log.trades.value[0].move).toBe(100)
    for (const release of heldWrites!) release()
    heldWrites = null
    await done
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

  it('rolls the row back and says so when the write is rejected', async () => {
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
    await nextTick()
    expect(ok).toBe(false)
    expect(log.trades.value).toHaveLength(0)
    expect(log.error.value).toContain('rolled back')
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
