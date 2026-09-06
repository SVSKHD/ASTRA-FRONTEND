// The settings singleton, and the one thing it must never get wrong.
//
// `ready` is the gate every owned-month listener waits behind — trades,
// signals, expenses, the secured ledger. If it never flips, none of them ever
// query, the Trades tab sits on its skeleton, and there is no error anywhere to
// explain it. So the test that matters is not "settings load"; it is "settings
// load WHENEVER the uid arrives", including when the singleton was created
// before anyone was signed in.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, ref } from 'vue'

interface DocSub {
  uid: string
  next: (snap: { exists: () => boolean; data: () => Record<string, unknown> }) => void
  closed: boolean
}
const subs: DocSub[] = []
const open = () => subs.filter((s) => !s.closed)

const fs = {
  doc: (_db: unknown, _coll: string, uid: string) => ({ uid }),
  onSnapshot: (
    ref_: { uid: string },
    next: (snap: { exists: () => boolean; data: () => Record<string, unknown> }) => void,
  ) => {
    const sub: DocSub = { uid: ref_.uid, next, closed: false }
    subs.push(sub)
    return () => {
      sub.closed = true
    }
  },
  setDoc: () => Promise.resolve(),
  collection: () => ({}),
}

vi.mock('@/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/firebase')>()),
  loadFirestore: () => Promise.resolve({ db: {}, fs }),
}))

// The auth store reaches for the Firebase auth SDK at module scope; only the
// `user` ref matters here, so the store is stubbed down to it.
const user = ref<{ uid: string } | null>(null)
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user }) }))

import { resetSettings, useSettings } from '@/composables/useSettings'

const settle = () => new Promise<void>((r) => setTimeout(r, 0))

describe('the settings singleton', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    subs.length = 0
    user.value = null
    resetSettings()
  })
  afterEach(() => resetSettings())

  it('attaches when the uid arrives, even though it was created signed out', async () => {
    // THE REGRESSION THIS FILE EXISTS FOR. The first component to want settings
    // can mount before `onAuthStateChanged` has resolved. The old code compared
    // a ref seeded with the current uid against the current uid — a check that
    // can never be true — so nothing re-attached, `ready` stayed false for the
    // rest of the session, and every collection stayed empty.
    const store = useSettings()
    await settle()
    expect(store.ready.value).toBe(false)
    expect(subs).toHaveLength(0)

    user.value = { uid: 'u1' }
    await nextTick()
    await settle()
    expect(open()).toHaveLength(1)

    open()[0].next({ exists: () => true, data: () => ({ tradesCollection: 'my-trades' }) })
    expect(store.ready.value).toBe(true)
    expect(store.settings.value.tradesCollection).toBe('my-trades')
  })

  it('follows the uid to another account, and closes the first listener', async () => {
    user.value = { uid: 'u1' }
    const store = useSettings()
    await settle()
    open()[0].next({ exists: () => true, data: () => ({ tradesCollection: 'first-trades' }) })
    expect(store.settings.value.tradesCollection).toBe('first-trades')

    user.value = { uid: 'u2' }
    await nextTick()
    await settle()
    expect(subs[0].closed).toBe(true)
    expect(open()).toHaveLength(1)
    expect(open()[0].uid).toBe('u2')
    // Not ready until the SECOND account's document has actually landed —
    // querying on the first account's collection names would read the wrong
    // collection under the right uid.
    expect(store.ready.value).toBe(false)
  })

  it('is ready on the first snapshot even when the document does not exist', async () => {
    user.value = { uid: 'new-account' }
    const store = useSettings()
    await settle()
    open()[0].next({ exists: () => false, data: () => ({}) })
    // A brand-new account has no settings document. Waiting for one would block
    // every other collection behind a document that is never written.
    expect(store.ready.value).toBe(true)
    expect(store.settings.value.tradesCollection).toBe('astra-trades')
  })

  it('hands every caller the same instance, and outlives any one of them', async () => {
    user.value = { uid: 'u1' }
    const a = useSettings()
    const b = useSettings()
    expect(a).toBe(b)
    await settle()
    // One document, one listener — however many tabs are reading it.
    expect(open()).toHaveLength(1)
  })

  it('drops back to the defaults on sign-out', async () => {
    user.value = { uid: 'u1' }
    const store = useSettings()
    await settle()
    open()[0].next({ exists: () => true, data: () => ({ tradesCollection: 'my-trades' }) })

    user.value = null
    await nextTick()
    await settle()
    expect(store.ready.value).toBe(false)
    expect(store.settings.value.tradesCollection).toBe('astra-trades')
    expect(open()).toHaveLength(0)
  })
})
