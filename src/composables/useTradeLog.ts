// The trade logger's data layer (section 28).
//
// This is the app's second Firestore listener, and the first one that is not
// the workspace document. The workspace is one blob per uid because everything
// in it is small and read whole; a trading history is neither, so trades, the
// secured ledger and the logger's settings are real subcollections under the
// uid and this composable is the only thing that touches them:
//
//   users/{uid}/trades/{tradeId}    ranged by `date`, ordered by (date, ts)
//   users/{uid}/secured/{id}        the withdrawal ledger
//   users/{uid}/settings/logger     targets, defaults and contract sizes
//
// Three rules the rest of the feature depends on:
//
//   1. Every listener is scoped to one month AND one uid, and both are watched:
//      a month change or a sign-out tears the old subscription down before the
//      new one goes up, so a stale snapshot can never write into the new month.
//   2. `move` and `pl` are written (a query cannot order by a value that only
//      exists in a computed) and recomputed on read, so a bad stored value is
//      corrected on screen instead of propagating into a total.
//   3. Writes are optimistic with an explicit rollback. Firestore's offline
//      cache already echoes a local write into the snapshot, so the pending row
//      is keyed by the id we mint for the document and dropped the moment the
//      snapshot carries that id — one row on the screen, never two.
//
// Firestore itself arrives through `loadFirestore()` rather than a static
// import, like everywhere else: a value import of firebase/firestore anywhere
// pulls the SDK back into the first paint.

import { computed, onMounted, onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { storeToRefs } from 'pinia'
import type { DocumentData, Unsubscribe } from 'firebase/firestore'
import { loadFirestore } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { isThemeKey, type ThemeSetting } from '@/themes'
import { currentMonthKey } from '@/utils/budget'
import {
  MAX_ATTEMPTS,
  discardOutbox,
  isDue,
  listOutbox,
  queueFailure,
  removeOutbox,
  type OutboxEntry,
} from '@/services/outbox'
import {
  DEFAULT_LOGGER_SETTINGS,
  contractSizeFor,
  monthBounds,
  recomputeAll,
  sortTrades,
  tradeMove,
  tradePl,
} from '@/utils/tradeMath'
import type { LoggerSettings, SecuredEntry, Trade, TradeSession, TradeSide } from '@/types'

/** What the form hands over. `move` and `pl` are derived here, never typed. */
export interface NewTrade {
  date: string
  symbol: string
  session: TradeSession
  side: TradeSide
  lot: number
  entry: number
  exit: number
  note: string
}

export interface NewSecured {
  date: string
  amt: number
  note: string
}

const SIGNED_OUT = 'Sign in to log trades.'
const OFFLINE = 'The trade log could not reach Firestore.'

/** A Firestore Timestamp, a number, or nothing at all — flattened to epoch ms. */
function millis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis(): number }).toMillis()
  }
  return typeof value === 'number' ? value : 0
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readTrade(id: string, data: DocumentData): Trade {
  return {
    id,
    date: String(data.date ?? ''),
    ts: millis(data.ts),
    symbol: String(data.symbol ?? ''),
    session: (data.session as TradeSession) ?? 'London',
    side: (data.side as TradeSide) ?? 'buy',
    lot: num(data.lot, 1),
    entry: num(data.entry),
    exit: num(data.exit),
    move: num(data.move),
    pl: num(data.pl),
    note: String(data.note ?? ''),
    createdAt: millis(data.createdAt),
  }
}

function readSecured(id: string, data: DocumentData): SecuredEntry {
  return {
    id,
    date: String(data.date ?? ''),
    amt: num(data.amt),
    note: String(data.note ?? ''),
    createdAt: millis(data.createdAt),
  }
}

function readSettings(data: DocumentData | undefined): LoggerSettings {
  if (!data) return { ...DEFAULT_LOGGER_SETTINGS }
  return {
    startingBalance: num(data.startingBalance, DEFAULT_LOGGER_SETTINGS.startingBalance),
    dayTarget: num(data.dayTarget, DEFAULT_LOGGER_SETTINGS.dayTarget),
    monthTarget: num(data.monthTarget, DEFAULT_LOGGER_SETTINGS.monthTarget),
    defaultLot: num(data.defaultLot, DEFAULT_LOGGER_SETTINGS.defaultLot),
    lastSymbol: String(data.lastSymbol || DEFAULT_LOGGER_SETTINGS.lastSymbol),
    contractSizes: {
      ...DEFAULT_LOGGER_SETTINGS.contractSizes,
      ...(typeof data.contractSizes === 'object' && data.contractSizes
        ? (data.contractSizes as Record<string, number>)
        : {}),
    },
    theme: String(data.theme ?? ''),
  }
}

export function useTradeLog(
  symbol: MaybeRefOrGetter<string>,
  month: MaybeRefOrGetter<string> = currentMonthKey(),
) {
  const { user } = storeToRefs(useAuthStore())
  const ui = useUiStore()
  const { themeSetting } = storeToRefs(ui)
  const uid = computed(() => user.value?.uid ?? '')
  const monthKey = computed(() => toValue(month))
  // An empty symbol means "whatever was traded last" — the caller's field is
  // blank until the form has been touched, and the contract size still has to
  // resolve to something.
  const activeSymbol = computed(() =>
    (toValue(symbol) || storedSettings.value.lastSymbol).trim().toUpperCase(),
  )

  // What the server has said, per collection.
  const storedTrades = ref<Trade[]>([])
  const storedSecured = ref<SecuredEntry[]>([])
  const storedSettings = ref<LoggerSettings>({ ...DEFAULT_LOGGER_SETTINGS })

  // What we have said and the server has not confirmed. Both are keyed by the
  // document id we minted, so the snapshot's own copy replaces the optimistic
  // row rather than appearing beside it.
  const pendingTrades = ref<Trade[]>([])
  const pendingSecured = ref<SecuredEntry[]>([])
  // Kept per collection rather than as one set: the trades snapshot prunes its
  // own pending deletes on every update, and a shared set would take the
  // secured ledger's with it — resurrecting a withdrawal the user had removed.
  const removedTradeIds = ref<string[]>([])
  const removedSecuredIds = ref<string[]>([])

  const loading = ref(true)
  const error = ref('')

  // Which rows the server has not acknowledged yet, from the snapshot's own
  // metadata rather than from anything we track: `hasPendingWrites` is
  // Firestore telling us it holds the write locally and has not been told it
  // landed. That is the difference between "captured" and "safe", and it is the
  // only honest source for it (section 30).
  const pendingIds = ref<string[]>([])
  /** Refused writes, parked in IndexedDB. Never dropped without being seen. */
  const outbox = ref<OutboxEntry[]>([])
  let replayTimer: ReturnType<typeof setInterval> | undefined

  let tradesUnsub: Unsubscribe | null = null
  let securedUnsub: Unsubscribe | null = null
  let settingsUnsub: Unsubscribe | null = null

  function unsubscribe() {
    tradesUnsub?.()
    securedUnsub?.()
    settingsUnsub?.()
    tradesUnsub = null
    securedUnsub = null
    settingsUnsub = null
  }

  const settings = computed<LoggerSettings>(() => storedSettings.value)

  /**
   * The rows the view renders: the server's, plus anything still in flight,
   * minus anything optimistically deleted — with move and P/L derived again
   * from each row's own inputs.
   */
  const trades = computed<Trade[]>(() => {
    const seen = new Set(storedTrades.value.map((t) => t.id))
    const gone = new Set(removedTradeIds.value)
    const merged = [
      ...storedTrades.value,
      ...pendingTrades.value.filter((t) => !seen.has(t.id)),
    ].filter((t) => !gone.has(t.id))
    return sortTrades(recomputeAll(merged, settings.value.contractSizes))
  })

  const secured = computed<SecuredEntry[]>(() => {
    const seen = new Set(storedSecured.value.map((s) => s.id))
    const gone = new Set(removedSecuredIds.value)
    return [...storedSecured.value, ...pendingSecured.value.filter((s) => !seen.has(s.id))]
      .filter((s) => !gone.has(s.id))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)))
  })

  /** The contract size in force for the symbol the form is on. */
  const contractSize = computed(() =>
    contractSizeFor(settings.value.contractSizes, activeSymbol.value),
  )

  // --- listeners ------------------------------------------------------------

  async function attach(): Promise<void> {
    unsubscribe()
    const owner = uid.value
    const key = monthKey.value
    // Everything held here belongs to the month (and the user) being left, so
    // it goes before the new listener opens. Keeping it until the first
    // snapshot arrives would show August's rows under September's heading, and
    // fold them into September's totals for as long as the round trip takes.
    storedTrades.value = []
    storedSecured.value = []
    pendingTrades.value = []
    pendingSecured.value = []
    removedTradeIds.value = []
    removedSecuredIds.value = []
    if (!owner || !key) {
      loading.value = false
      return
    }
    loading.value = true
    const cloud = await loadFirestore()
    // The await is a window in which the uid or the month can have changed
    // again. Without this guard the listener for last month attaches after the
    // one for this month and wins.
    if (!cloud || owner !== uid.value || key !== monthKey.value) {
      if (!cloud) {
        error.value = OFFLINE
        loading.value = false
      }
      return
    }
    const { db, fs } = cloud
    const { from, to } = monthBounds(key)

    // Ranged on `date` and ordered by (date, ts): the composite index this
    // needs is declared in firestore.indexes.json. `ts` is the tie-break, so
    // two trades logged on the same day come back in the order they happened.
    tradesUnsub = fs.onSnapshot(
      fs.query(
        fs.collection(db, 'users', owner, 'trades'),
        fs.where('date', '>=', from),
        fs.where('date', '<=', to),
        fs.orderBy('date', 'asc'),
        fs.orderBy('ts', 'asc'),
      ),
      // includeMetadataChanges, because the transition that matters here — a row
      // going from held-locally to acknowledged — changes no data at all. Without
      // it the pending dot would never clear until something else moved.
      { includeMetadataChanges: true },
      (snap) => {
        storedTrades.value = snap.docs.map((d) => readTrade(d.id, d.data()))
        pendingIds.value = snap.docs.filter((d) => d.metadata.hasPendingWrites).map((d) => d.id)
        // Anything the server now carries is no longer pending, and anything it
        // no longer carries is no longer waiting to be deleted.
        const ids = new Set(storedTrades.value.map((t) => t.id))
        pendingTrades.value = pendingTrades.value.filter((t) => !ids.has(t.id))
        // A pending delete stays pending only while the server still has the
        // row. It is NOT a place to clear `error`: a snapshot arrives moments
        // after a rejected write, and clearing here would wipe the rollback
        // message before it had been read.
        removedTradeIds.value = removedTradeIds.value.filter((id) => ids.has(id))
        loading.value = false
      },
      (err) => {
        console.error('[Aureon] Trade listener failed:', err)
        error.value = 'Live updates for the trade log stopped. Reload to reconnect.'
        loading.value = false
      },
    )

    securedUnsub = fs.onSnapshot(
      fs.query(
        fs.collection(db, 'users', owner, 'secured'),
        fs.where('date', '>=', from),
        fs.where('date', '<=', to),
        fs.orderBy('date', 'asc'),
      ),
      (snap) => {
        storedSecured.value = snap.docs.map((d) => readSecured(d.id, d.data()))
        const ids = new Set(storedSecured.value.map((s) => s.id))
        pendingSecured.value = pendingSecured.value.filter((s) => !ids.has(s.id))
        removedSecuredIds.value = removedSecuredIds.value.filter((id) => ids.has(id))
      },
      (err) => {
        console.error('[Aureon] Secured listener failed:', err)
        error.value = 'Live updates for the secured ledger stopped. Reload to reconnect.'
      },
    )

    const settingsRef = fs.doc(db, 'users', owner, 'settings', 'logger')
    settingsUnsub = fs.onSnapshot(
      settingsRef,
      (snap) => {
        // A first run has no settings document. Seeding it here rather than
        // leaving the defaults in memory is what makes `lastSymbol` and the
        // contract sizes survive a reload on a second device.
        if (!snap.exists()) {
          storedSettings.value = { ...DEFAULT_LOGGER_SETTINGS }
          void fs.setDoc(settingsRef, { ...DEFAULT_LOGGER_SETTINGS }).catch(() => {
            /* A read-only session still works; it just does not remember. */
          })
          applyStoredTheme('')
          return
        }
        storedSettings.value = readSettings(snap.data())
        applyStoredTheme(storedSettings.value.theme)
      },
      (err) => {
        console.error('[Aureon] Logger settings listener failed:', err)
      },
    )
  }

  watch([uid, monthKey], () => void attach(), { immediate: true })
  onUnmounted(() => {
    unsubscribe()
    clearInterval(replayTimer)
    globalThis.window?.removeEventListener('online', onOnline)
  })

  // --- the theme, kept in this document (section 29) -------------------------
  //
  // The choice lives beside the logger's other settings rather than in the
  // workspace document the theme picker writes to. That is a second place a
  // theme can be stored, so the two are reconciled in one direction only: what
  // this document says wins when it says anything, and a change made while the
  // logger is on screen is written back here.
  //
  // `prefers-color-scheme` gets a say exactly once — when the document has no
  // theme at all. After that the stored answer is the answer, because an
  // operating system that switches to dark at sunset should not overrule a
  // choice somebody made at noon.
  let themeSynced = false

  function osPrefersDark(): boolean {
    return globalThis.window?.matchMedia?.('(prefers-color-scheme: dark)').matches === true
  }

  function applyStoredTheme(stored: string) {
    if (themeSynced) return
    themeSynced = true
    if (stored && isThemeKey(stored)) {
      if (stored !== themeSetting.value) ui.setTheme(stored as ThemeSetting)
      return
    }
    // Nothing stored: the one moment the operating system decides. Espresso is
    // this app's answer to "the user wants dark"; anything else stays as it is.
    if (osPrefersDark() && themeSetting.value !== 'espresso') {
      ui.setTheme('espresso')
      void saveSettings({ theme: 'espresso' })
    }
  }

  // A change made while the logger is mounted is persisted here. Guarded on the
  // stored value so the round trip — write, snapshot, read — does not write
  // again.
  watch(themeSetting, (next) => {
    if (!themeSynced || !uid.value) return
    if (next === 'auto' || next === storedSettings.value.theme) return
    void saveSettings({ theme: next })
  })

  // --- writes ---------------------------------------------------------------

  async function handle() {
    if (!uid.value) {
      error.value = SIGNED_OUT
      return null
    }
    const cloud = await loadFirestore()
    if (!cloud) {
      error.value = OFFLINE
      return null
    }
    return cloud
  }

  /** The code Firestore refused with, for the message and for the outbox. */
  function errorCode(err: unknown): string {
    return typeof err === 'object' && err && 'code' in err
      ? String((err as { code: unknown }).code)
      : 'unknown'
  }

  /**
   * A trade is captured the moment it is written locally — NOT when the server
   * acknowledges it (section 30).
   *
   * This is the whole fix. `setDoc` with persistent local cache does not settle
   * until the server acks, so awaiting it means a submit with no network hangs
   * forever: the button spins, the form never clears, and the trade looks lost
   * although Firestore has it safely in IndexedDB and will replay it. So the
   * write is started and NOT awaited; the local snapshot echo is the capture
   * signal, `hasPendingWrites` says whether it has reached the server yet, and
   * a rejection — which with persistence on means a refusal, not a network
   * problem — parks the payload in the outbox.
   */
  async function addTrade(input: NewTrade): Promise<boolean> {
    const cloud = await handle()
    if (!cloud) return false
    const { db, fs } = cloud
    const owner = uid.value
    const symbolKey = input.symbol.trim().toUpperCase()
    const move = tradeMove(input.side, input.entry, input.exit)
    const pl = tradePl(move, input.lot, contractSizeFor(settings.value.contractSizes, symbolKey))
    // The id is minted client-side so the optimistic row and the document that
    // lands are the same row — and so a replay overwrites rather than
    // duplicating. `addDoc` would leave them as two.
    const ref = fs.doc(fs.collection(db, 'users', owner, 'trades'))
    const ts = Date.now()
    const payload: Record<string, unknown> = {
      date: input.date,
      ts: fs.Timestamp.fromMillis(ts),
      symbol: symbolKey,
      session: input.session,
      side: input.side,
      lot: input.lot,
      entry: input.entry,
      exit: input.exit,
      move,
      pl,
      note: input.note,
      createdAt: fs.serverTimestamp(),
    }
    pendingTrades.value = [
      ...pendingTrades.value,
      { ...input, symbol: symbolKey, id: ref.id, ts, move, pl, createdAt: ts },
    ]
    error.value = ''
    // Started, not awaited. The catch runs whenever it runs.
    void fs.setDoc(ref, payload).catch((err) => {
      void onRefused({ id: ref.id, collection: 'trades', uid: owner, payload }, err)
    })
    // Same treatment for the setting: remembering the symbol must never be able
    // to hold up the trade that taught us it.
    void saveSettings({ lastSymbol: symbolKey })
    return true
  }

  /**
   * A refusal: park it, and say so once.
   *
   * The message names the code rather than describing the symptom, because the
   * two codes that get here have two different fixes — `permission-denied` is
   * rules that have not been deployed and `failed-precondition` is an index
   * that does not exist. "Could not save" sends nobody to either of them.
   */
  async function onRefused(
    seed: {
      id: string
      collection: 'trades' | 'secured'
      uid: string
      payload: Record<string, unknown>
    },
    err: unknown,
  ): Promise<void> {
    const code = errorCode(err)
    console.error(`[Aureon] Firestore refused a ${seed.collection} write (${code}):`, err)
    const entry = await queueFailure(seed, code)
    await refreshOutbox()
    // Set from the stored entry, not from this attempt: a replay that is the
    // eighth refusal has to change the message, or the row goes red while the
    // banner still promises another try.
    error.value = entry.blocked
      ? `A trade could not be saved after ${MAX_ATTEMPTS} attempts (${code}). It is held below — discard it once you have dealt with the cause.`
      : `Firestore refused a write (${code}). It is queued and will be retried.`
  }

  async function refreshOutbox(): Promise<void> {
    outbox.value = (await listOutbox()).filter((e) => e.uid === uid.value)
  }

  /**
   * Replay, automatically. Never a button: a queue the user has to remember to
   * flush is a queue that does not get flushed.
   */
  async function flushOutbox(): Promise<void> {
    if (!uid.value) return
    const cloud = await loadFirestore()
    if (!cloud) return
    const { db, fs } = cloud
    for (const entry of await listOutbox()) {
      if (entry.uid !== uid.value || !isDue(entry)) continue
      try {
        // setDoc on the entry's own id: a replay of something that did land is
        // an overwrite with identical content, not a second trade.
        await fs.setDoc(fs.doc(db, 'users', entry.uid, entry.collection, entry.id), entry.payload)
        // Removed only after the acknowledgement, never before.
        await removeOutbox(entry.id)
      } catch (err) {
        // Through the same path as a first refusal, so the eighth one is
        // reported as the end of the road rather than as another retry.
        await onRefused(entry, err)
      }
    }
    await refreshOutbox()
  }

  /** The user's one manual action, and only for an entry that stopped trying. */
  async function discard(id: string): Promise<void> {
    await discardOutbox(id)
    pendingTrades.value = pendingTrades.value.filter((t) => t.id !== id)
    pendingSecured.value = pendingSecured.value.filter((s) => s.id !== id)
    await refreshOutbox()
  }

  function onOnline(): void {
    void flushOutbox()
  }

  onMounted(() => {
    void refreshOutbox().then(() => flushOutbox())
    globalThis.window?.addEventListener('online', onOnline)
    // A 30s sweep while anything is parked. It costs nothing when the outbox is
    // empty, which is the normal case.
    replayTimer = setInterval(() => {
      if (outbox.value.length) void flushOutbox()
    }, 30_000)
  })

  async function deleteTrade(id: string): Promise<boolean> {
    const cloud = await handle()
    if (!cloud) return false
    const { db, fs } = cloud
    // Pending rows never reached Firestore; dropping one locally is the whole
    // delete, and asking the server to remove a document it has not accepted
    // yet is how you get a "not found" on a row the user can see.
    if (pendingTrades.value.some((t) => t.id === id)) {
      pendingTrades.value = pendingTrades.value.filter((t) => t.id !== id)
      return true
    }
    removedTradeIds.value = [...removedTradeIds.value, id]
    try {
      await fs.deleteDoc(fs.doc(db, 'users', uid.value, 'trades', id))
      error.value = ''
      return true
    } catch (err) {
      console.error('[Aureon] Trade delete failed:', err)
      removedTradeIds.value = removedTradeIds.value.filter((x) => x !== id)
      error.value = 'That trade could not be deleted — it is still in the log.'
      return false
    }
  }

  async function addSecured(input: NewSecured): Promise<boolean> {
    const cloud = await handle()
    if (!cloud) return false
    const { db, fs } = cloud
    const owner = uid.value
    const ref = fs.doc(fs.collection(db, 'users', owner, 'secured'))
    const ts = Date.now()
    pendingSecured.value = [...pendingSecured.value, { ...input, id: ref.id, createdAt: ts }]
    const payload: Record<string, unknown> = {
      date: input.date,
      amt: input.amt,
      note: input.note,
      createdAt: fs.serverTimestamp(),
    }
    error.value = ''
    void fs.setDoc(ref, payload).catch((err) => {
      void onRefused({ id: ref.id, collection: 'secured', uid: owner, payload }, err)
    })
    return true
  }

  async function deleteSecured(id: string): Promise<boolean> {
    const cloud = await handle()
    if (!cloud) return false
    const { db, fs } = cloud
    if (pendingSecured.value.some((s) => s.id === id)) {
      pendingSecured.value = pendingSecured.value.filter((s) => s.id !== id)
      return true
    }
    removedSecuredIds.value = [...removedSecuredIds.value, id]
    try {
      await fs.deleteDoc(fs.doc(db, 'users', uid.value, 'secured', id))
      error.value = ''
      return true
    } catch (err) {
      console.error('[Aureon] Secured delete failed:', err)
      removedSecuredIds.value = removedSecuredIds.value.filter((x) => x !== id)
      error.value = 'That withdrawal could not be deleted — it is still in the ledger.'
      return false
    }
  }

  /** Merged, never replaced: two devices editing different settings must not clobber. */
  async function saveSettings(patch: Partial<LoggerSettings>): Promise<boolean> {
    const cloud = await handle()
    if (!cloud) return false
    const { db, fs } = cloud
    const before = storedSettings.value
    storedSettings.value = { ...before, ...patch }
    try {
      await fs.setDoc(fs.doc(db, 'users', uid.value, 'settings', 'logger'), patch, { merge: true })
      return true
    } catch (err) {
      console.error('[Aureon] Logger settings write failed:', err)
      storedSettings.value = before
      error.value = 'That setting could not be saved.'
      return false
    }
  }

  /** The answer to "what is this symbol worth per point?", asked once per symbol. */
  function setContractSize(nextSymbol: string, size: number): Promise<boolean> {
    const key = nextSymbol.trim().toUpperCase()
    return saveSettings({
      contractSizes: { ...settings.value.contractSizes, [key]: size },
      lastSymbol: key,
    })
  }

  function dismissError() {
    error.value = ''
  }

  /**
   * What to draw beside a row: nothing when the server has it, a dot when it is
   * only here yet, amber when it was refused and is waiting, red when it has
   * stopped trying (section 30).
   */
  const rowState = computed<Record<string, 'pending' | 'queued' | 'blocked'>>(() => {
    const out: Record<string, 'pending' | 'queued' | 'blocked'> = {}
    for (const id of pendingIds.value) out[id] = 'pending'
    // A row we are holding that the snapshot has not echoed yet is pending too.
    const echoed = new Set(storedTrades.value.map((t) => t.id))
    for (const t of pendingTrades.value) if (!echoed.has(t.id)) out[t.id] = 'pending'
    for (const entry of outbox.value) out[entry.id] = entry.blocked ? 'blocked' : 'queued'
    return out
  })

  return {
    trades,
    secured,
    settings,
    contractSize,
    loading,
    error,
    outbox,
    rowState,
    flushOutbox,
    discard,
    addTrade,
    deleteTrade,
    addSecured,
    deleteSecured,
    saveSettings,
    setContractSize,
    dismissError,
  }
}
