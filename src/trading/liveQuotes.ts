// The stream's quotes for the rows on screen, at most once per `ms`.
//
// `live.quotes` changes on every tick of every followed instrument, and a table
// that reads it directly rebuilds every row (and re-renders the table) on each
// tick — several times a second on a busy watchlist. This hands the table a
// copy that changes when one of ITS rows ticked, and no more than once per
// `ms` (trailing, so the last tick is never lost). A change of the rows
// themselves (a new page, a new list) is applied at once.

import { onScopeDispose, shallowRef, watch, type ShallowRef } from 'vue'
import { live, type StreamQuote } from '@/trading/stream'

export function useLiveQuotes(
  ids: () => number[],
  ms = 1000,
): ShallowRef<ReadonlyMap<number, StreamQuote>> {
  const out = shallowRef<ReadonlyMap<number, StreamQuote>>(new Map())
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastIds = ''

  function take() {
    timer = undefined
    const m = new Map<number, StreamQuote>()
    for (const id of ids()) {
      const q = live.quotes[id]
      if (q) m.set(id, q)
    }
    out.value = m
  }

  watch(
    () => {
      const list = ids()
      // The quote objects are replaced, never mutated, on each tick: identity is enough.
      return { key: list.join(), quotes: list.map((id) => live.quotes[id]) }
    },
    (next, prev) => {
      const rowsChanged = next.key !== lastIds
      lastIds = next.key
      if (rowsChanged || !prev) {
        clearTimeout(timer)
        take()
        return
      }
      if (next.quotes.every((q, i) => q === prev.quotes[i])) return
      timer ??= setTimeout(take, ms)
    },
    { immediate: true },
  )
  onScopeDispose(() => clearTimeout(timer))
  return out
}
