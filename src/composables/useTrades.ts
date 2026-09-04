// The trade log's four verbs (section 33).
//
// Everything read here is derived: `move` and `pl` are written because a query
// cannot order by a value that exists only in a computed, and recomputed on
// read so a stale stored figure is corrected on screen instead of shifting a
// month's total. The calendar, the header and the table all read the same
// `trades` array, so an edit that changes a price moves every one of them in
// the same tick — there is no second copy to refresh.
//
// The delete is HARD, with six seconds of undo. A soft-deleted row is a row
// every query afterwards has to remember to exclude, and the one that forgets
// is the one that reports a deleted loss in the monthly total.

import { computed, onUnmounted, ref } from 'vue'
import { useOwnedMonth } from '@/composables/useOwnedMonth'
import { newId, ownedDelete, ownedMerge, ownedSet } from '@/services/owned'
import { readTrade, toDraft, tradeDocument, type TradeDraft } from '@/services/tradeDoc'
import { recomputeAll, sortTrades } from '@/utils/tradeMath'
import type { Trade } from '@/types'

/** Long enough to change your mind, short enough not to be a pending state. */
export const UNDO_MS = 6_000

export function useTrades(month: () => string) {
  const live = useOwnedMonth<Trade>({
    key: 'tradesCollection',
    field: 'istDate',
    read: readTrade,
    month,
  })

  const error = ref('')
  /** The row a delete is holding, with the id it will be restored under. */
  const undoable = ref<{ trade: Trade; until: number } | null>(null)
  let undoTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * The rows the view renders, with move and P/L derived again from each row's
   * own inputs and the contract size in force.
   */
  const trades = computed<Trade[]>(() =>
    sortTrades(recomputeAll(live.rows.value, live.settings.value.contractSizes)),
  )

  async function create(draft: TradeDraft): Promise<string> {
    const ref = await live.ref()
    if (!ref) {
      error.value = 'Sign in to log trades.'
      return ''
    }
    // Minted here so the optimistic row, the document that lands and any later
    // replay are one row with one id — `addDoc` would make a replay a second
    // trade (section 30).
    const id = newId(ref)
    const doc = tradeDocument(draft, live.settings.value, ref.fs)
    error.value = ''
    // Started, not awaited: with the persistent cache a write with no network
    // does not settle until a server answers, and awaiting it hangs the form on
    // a trade Firestore has already stored durably.
    void ownedSet(ref, id, doc).catch((err) => {
      console.error('[Astra] Trade write refused:', err)
      error.value = `That trade was refused (${code(err)}). It is held locally and will retry.`
    })
    return id
  }

  /**
   * An edit. Anything that feeds the arithmetic — entry, exit, lot, side,
   * symbol — is rewritten through the same function that wrote the row, so the
   * stored `move` and `pl` cannot drift from the inputs beside them.
   */
  async function update(id: string, patch: Partial<TradeDraft>): Promise<boolean> {
    const ref = await live.ref()
    const current = trades.value.find((t) => t.id === id)
    if (!ref || !current) return false
    const doc = tradeDocument({ ...toDraft(current), ...patch }, live.settings.value, ref.fs)
    try {
      await ownedMerge(ref, id, doc)
      error.value = ''
      return true
    } catch (err) {
      console.error('[Astra] Trade update failed:', err)
      error.value = `That change could not be saved (${code(err)}).`
      return false
    }
  }

  /** Hard delete, with the row kept in hand for six seconds. */
  async function remove(id: string): Promise<boolean> {
    const ref = await live.ref()
    const row = trades.value.find((t) => t.id === id)
    if (!ref || !row) return false
    clearTimeout(undoTimer)
    undoable.value = { trade: row, until: Date.now() + UNDO_MS }
    undoTimer = setTimeout(() => (undoable.value = null), UNDO_MS)
    try {
      await ownedDelete(ref, id)
      return true
    } catch (err) {
      console.error('[Astra] Trade delete failed:', err)
      undoable.value = null
      error.value = `That trade could not be deleted (${code(err)}) — it is still in the log.`
      return false
    }
  }

  /** Back under the SAME id, so nothing that referenced it is now dangling. */
  async function undo(): Promise<boolean> {
    const held = undoable.value
    const ref = await live.ref()
    if (!held || !ref) return false
    undoable.value = null
    clearTimeout(undoTimer)
    try {
      await ownedSet(
        ref,
        held.trade.id,
        tradeDocument(toDraft(held.trade), live.settings.value, ref.fs),
      )
      return true
    } catch (err) {
      console.error('[Astra] Undo failed:', err)
      error.value = 'That trade could not be put back.'
      return false
    }
  }

  onUnmounted(() => clearTimeout(undoTimer))

  return {
    trades,
    loading: live.loading,
    listenerError: live.error,
    pendingIds: live.pendingIds,
    collection: live.collection,
    error,
    undoable,
    create,
    update,
    remove,
    undo,
  }
}

function code(err: unknown): string {
  return typeof err === 'object' && err && 'code' in err
    ? String((err as { code: unknown }).code)
    : 'unknown'
}
