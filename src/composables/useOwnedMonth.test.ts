// The month cache (section 32, invariant 3).
//
// What is asserted here is not "a listener opens". It is that opening the same
// month twice is one listener, that leaving a tab does not throw the rows away,
// and that coming back renders them without a loading state — which is the
// difference between a tab change costing nothing and a tab change costing a
// round trip and a skeleton.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'

// --- the fake Firestore -----------------------------------------------------
// Only what `ownedMonthQuery` and the listener actually touch. The query
// builders return plain markers: this is about how many subscriptions are
// opened and when, not about what Firestore does with them.
interface FakeSub {
  path: string
  next: (snap: FakeSnap) => void
  fail: (err: unknown) => void
  closed: boolean
}
interface FakeDoc {
  id: string
  data(): Record<string, unknown>
  metadata: { hasPendingWrites: boolean }
}
interface FakeSnap {
  docs: FakeDoc[]
}

const subs: FakeSub[] = []
/** Subscriptions still open right now. */
const open = () => subs.filter((s) => !s.closed)

function doc(id: string): FakeDoc {
  return { id, data: () => ({ id, istDate: '2026-09-04' }), metadata: { hasPendingWrites: false } }
}

const fs = {
  collection: (_db: unknown, name: string) => ({ name }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string) => ({ field }),
  query: (base: { name: string }, ...rest: unknown[]) => ({ path: base.name, rest }),
  doc: () => ({ id: 'x' }),
  onSnapshot: (
    q: { path: string },
    _opts: unknown,
    next: (snap: FakeSnap) => void,
    fail: (err: unknown) => void,
  ) => {
    const sub: FakeSub = { path: q.path, next, fail, closed: false }
    subs.push(sub)
    return () => {
      sub.closed = true
    }
  },
}

vi.mock('@/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/firebase')>()),
  loadFirestore: () => Promise.resolve({ db: {}, fs }),
}))

// The settings singleton is a Firestore listener of its own and an auth store
// behind it; this file is about the month cache, so it is stubbed down to the
// three values the cache actually reads off it.
const uid = ref('u1')
const ready = ref(true)
const settings = ref({ tradesCollection: 'astra-trades', expensesCollection: 'astra-expenses' })

vi.mock('@/composables/useSettings', () => ({
  useSettings: () => ({ uid, settings, ready }),
}))

import { listenerMessage, useOwnedMonth, resetOwnedMonths } from '@/composables/useOwnedMonth'

interface Row {
  id: string
}
const read = (id: string): Row => ({ id })

/** One "mounted component" reading one month. */
function mountReader(
  month: string,
  key: 'tradesCollection' | 'expensesCollection' = 'tradesCollection',
) {
  const scope = effectScope()
  const live = scope.run(() =>
    useOwnedMonth<Row>({ key, field: 'istDate', read, month: () => month }),
  )!
  return { scope, live }
}

/** The listener attaches after an await, so settle the microtask queue. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0))

let scopes: EffectScope[] = []

describe('the shared month cache', () => {
  beforeEach(() => {
    subs.length = 0
    scopes = []
    uid.value = 'u1'
    ready.value = true
    resetOwnedMonths()
  })
  afterEach(() => {
    for (const s of scopes) s.stop()
    resetOwnedMonths()
    vi.useRealTimers()
  })

  it('opens ONE listener for two readers of the same month', async () => {
    const a = mountReader('2026-09')
    const b = mountReader('2026-09')
    scopes.push(a.scope, b.scope)
    await settle()
    // The Dashboard and the Trades tab are two readers of one month. Before the
    // cache this was two subscriptions on identical queries.
    expect(open()).toHaveLength(1)
    expect(open()[0].path).toBe('astra-trades')
  })

  it('gives both readers the same rows from one snapshot', async () => {
    const a = mountReader('2026-09')
    const b = mountReader('2026-09')
    scopes.push(a.scope, b.scope)
    await settle()
    open()[0].next({ docs: [doc('t1'), doc('t2')] })
    expect(a.live.rows.value.map((r) => r.id)).toEqual(['t1', 't2'])
    expect(b.live.rows.value.map((r) => r.id)).toEqual(['t1', 't2'])
    expect(a.live.loading.value).toBe(false)
  })

  it('keeps the listener while any reader is left', async () => {
    const a = mountReader('2026-09')
    const b = mountReader('2026-09')
    scopes.push(b.scope)
    await settle()
    a.scope.stop()
    expect(open()).toHaveLength(1)
    expect(b.live.loading.value).toBe(true)
  })

  it('renders a month it already fetched with no loading state and no second query', async () => {
    const first = mountReader('2026-09')
    await settle()
    open()[0].next({ docs: [doc('t1')] })
    // Leaving the tab. The listener is held for a grace period rather than torn
    // down on the spot, precisely because coming back is the common case.
    first.scope.stop()

    const second = mountReader('2026-09')
    scopes.push(second.scope)
    await settle()
    // No skeleton, and the rows are on screen in the tick the tab mounts.
    expect(second.live.loading.value).toBe(false)
    expect(second.live.rows.value.map((r) => r.id)).toEqual(['t1'])
    expect(subs).toHaveLength(1)
  })

  it('re-attaches without clearing the rows once the idle window has passed', async () => {
    vi.useFakeTimers()
    const first = mountReader('2026-09')
    await vi.advanceTimersByTimeAsync(0)
    open()[0].next({ docs: [doc('t1')] })
    first.scope.stop()
    // Long enough that the held subscription is dropped.
    await vi.advanceTimersByTimeAsync(6 * 60_000)
    expect(open()).toHaveLength(0)

    const second = mountReader('2026-09')
    scopes.push(second.scope)
    await vi.advanceTimersByTimeAsync(0)
    // A new subscription, but the reader never saw an empty screen: the cached
    // rows are what it painted while the query was in flight.
    expect(open()).toHaveLength(1)
    expect(second.live.loading.value).toBe(false)
    expect(second.live.rows.value.map((r) => r.id)).toEqual(['t1'])
  })

  it('keeps months apart, and does not reuse one month for another', async () => {
    const sep = mountReader('2026-09')
    const aug = mountReader('2026-08')
    scopes.push(sep.scope, aug.scope)
    await settle()
    expect(open()).toHaveLength(2)
    open()[0].next({ docs: [doc('sep')] })
    expect(sep.live.rows.value.map((r) => r.id)).toEqual(['sep'])
    expect(aug.live.rows.value).toEqual([])
  })

  it('keeps collections apart even at the same month', async () => {
    const trades = mountReader('2026-09', 'tradesCollection')
    const expenses = mountReader('2026-09', 'expensesCollection')
    scopes.push(trades.scope, expenses.scope)
    await settle()
    expect(
      open()
        .map((s) => s.path)
        .sort(),
    ).toEqual(['astra-expenses', 'astra-trades'])
  })

  it('drops another account’s months the moment the uid changes', async () => {
    const reader = mountReader('2026-09')
    scopes.push(reader.scope)
    await settle()
    open()[0].next({ docs: [doc('mine')] })
    expect(reader.live.rows.value).toHaveLength(1)

    // Signing in as somebody else must not leave the first account's rows in
    // memory, and must not show them for a single frame either.
    uid.value = 'u2'
    await settle()
    expect(reader.live.rows.value).toEqual([])
    expect(open()).toHaveLength(1)
    expect(subs[0].closed).toBe(true)
  })

  it('waits for the collection names before it queries anything', async () => {
    ready.value = false
    const reader = mountReader('2026-09')
    scopes.push(reader.scope)
    await settle()
    // Nothing has been queried: a listener opened now would use the DEFAULT
    // collection name, and silently show the wrong data to anyone who renamed.
    expect(subs).toHaveLength(0)
    // Signed in and waiting on settings IS a loading state, though.
    expect(reader.live.loading.value).toBe(true)

    ready.value = true
    await settle()
    expect(open()).toHaveLength(1)
  })

  it('is not loading when there is nobody signed in', async () => {
    uid.value = ''
    const reader = mountReader('2026-09')
    scopes.push(reader.scope)
    await settle()
    expect(subs).toHaveLength(0)
    // An empty screen, not a skeleton: there is no query to wait for.
    expect(reader.live.loading.value).toBe(false)
  })

  it('says an index is missing rather than telling you to reload', () => {
    // `failed-precondition` is the one failure a reload can never fix, and it
    // was the one hidden behind the generic message.
    const message = listenerMessage('astra-trades', 'failed-precondition')
    expect(message).toContain('composite index')
    expect(message).not.toContain('Reload to reconnect')
  })

  it('surfaces a listener failure to every reader of that month', async () => {
    const a = mountReader('2026-09')
    const b = mountReader('2026-09')
    scopes.push(a.scope, b.scope)
    await settle()
    open()[0].fail({ code: 'permission-denied' })
    // The message names the actual cause, not "reload to reconnect" — reloading
    // has never fixed a row that has no userId on it.
    expect(a.live.error.value).toContain('astra-trades')
    expect(a.live.error.value).toContain('userId')
    expect(b.live.error.value).toBe(a.live.error.value)
    // And a reader can dismiss it.
    a.live.error.value = ''
    expect(b.live.error.value).toBe('')
  })
})
