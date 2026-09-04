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

import { computed, onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { storeToRefs } from 'pinia'
import type { DocumentData, Unsubscribe } from 'firebase/firestore'
import { loadFirestore } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import { currentMonthKey } from '@/utils/budget'
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
  }
}

export function useTradeLog(
  symbol: MaybeRefOrGetter<string>,
  month: MaybeRefOrGetter<string> = currentMonthKey(),
) {
  const { user } = storeToRefs(useAuthStore())
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
      (snap) => {
        storedTrades.value = snap.docs.map((d) => readTrade(d.id, d.data()))
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
          return
        }
        storedSettings.value = readSettings(snap.data())
      },
      (err) => {
        console.error('[Aureon] Logger settings listener failed:', err)
      },
    )
  }

  watch([uid, monthKey], () => void attach(), { immediate: true })
  onUnmounted(unsubscribe)

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

  /**
   * Optimistic: the row is on screen before the write is acknowledged, and off
   * again — with the reason visible — if Firestore rejects it.
   */
  async function addTrade(input: NewTrade): Promise<boolean> {
    const cloud = await handle()
    if (!cloud) return false
    const { db, fs } = cloud
    const symbolKey = input.symbol.trim().toUpperCase()
    const move = tradeMove(input.side, input.entry, input.exit)
    const pl = tradePl(move, input.lot, contractSizeFor(settings.value.contractSizes, symbolKey))
    // The id is minted client-side so the optimistic row and the document that
    // lands are the same row. `addDoc` would leave them as two.
    const ref = fs.doc(fs.collection(db, 'users', uid.value, 'trades'))
    const ts = Date.now()
    pendingTrades.value = [
      ...pendingTrades.value,
      { ...input, symbol: symbolKey, id: ref.id, ts, move, pl, createdAt: ts },
    ]
    try {
      await fs.setDoc(ref, {
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
      })
      error.value = ''
      // The symbol the user actually traded becomes the next form's default.
      await saveSettings({ lastSymbol: symbolKey })
      return true
    } catch (err) {
      console.error('[Aureon] Trade write failed:', err)
      pendingTrades.value = pendingTrades.value.filter((t) => t.id !== ref.id)
      error.value = 'That trade could not be saved — it has been rolled back. Try again.'
      return false
    }
  }

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
    const ref = fs.doc(fs.collection(db, 'users', uid.value, 'secured'))
    const ts = Date.now()
    pendingSecured.value = [...pendingSecured.value, { ...input, id: ref.id, createdAt: ts }]
    try {
      await fs.setDoc(ref, {
        date: input.date,
        amt: input.amt,
        note: input.note,
        createdAt: fs.serverTimestamp(),
      })
      error.value = ''
      return true
    } catch (err) {
      console.error('[Aureon] Secured write failed:', err)
      pendingSecured.value = pendingSecured.value.filter((s) => s.id !== ref.id)
      error.value = 'That withdrawal could not be saved — it has been rolled back.'
      return false
    }
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

  return {
    trades,
    secured,
    settings,
    contractSize,
    loading,
    error,
    addTrade,
    deleteTrade,
    addSecured,
    deleteSecured,
    saveSettings,
    setContractSize,
    dismissError,
  }
}
