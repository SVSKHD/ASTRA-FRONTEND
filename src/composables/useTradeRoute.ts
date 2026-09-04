// Where the view state lives (section 33).
//
// THE URL IS THE TRUTH. `/trades?mode=signals&month=2026-09&day=2026-09-04` is
// the whole of what is on screen, so a link reproduces it, a reload keeps it,
// and the back button steps through real navigation — which is why every change
// made here is a `replace` and not a `push`: picking a day is not a page, and
// forty picked days must not become forty presses of Back to leave the tab.
//
// THREE PLACES, THREE JOBS, and the split is the point:
//
//   • the URL holds what is being looked at — mode, month, day, symbol;
//   • `sessionStorage` holds what this tab was doing — the last route, so a
//     bare-domain visit lands where it left off, and any half-typed trade, so a
//     reload mid-entry does not lose it. Per-tab, discarded when it closes,
//     which is exactly the lifetime of "what I was in the middle of";
//   • Firestore holds only durable choices — theme, default symbol, collection
//     names. Which day was selected is not a preference and does not belong in
//     a database on another machine.
//
// Anything restored that does not validate falls back silently. A malformed
// month in a pasted link is a link that opens on this month, not an error
// screen: nothing here is worth interrupting somebody over.

import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { currentMonthKey } from '@/utils/budget'

export const TRADE_MODES = ['journal', 'signals', 'combined'] as const
export type TradeMode = (typeof TRADE_MODES)[number]

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const SYMBOL_RE = /^[A-Z0-9]{1,20}$/

export const LAST_ROUTE_KEY = 'astra:last-route'
export const DRAFT_KEY = 'astra:trade-draft'

function readQuery(value: unknown): string {
  return typeof value === 'string' ? value : Array.isArray(value) ? String(value[0] ?? '') : ''
}

/** Session storage that cannot throw: private mode and locked-down browsers. */
export function sessionRead(key: string): string {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? ''
  } catch {
    return ''
  }
}

export function sessionWrite(key: string, value: string): void {
  try {
    if (value) globalThis.sessionStorage?.setItem(key, value)
    else globalThis.sessionStorage?.removeItem(key)
  } catch {
    /* A tab that cannot remember still works; it just does not remember. */
  }
}

export function useTradeRoute() {
  const route = useRoute()
  const router = useRouter()

  const mode = computed<TradeMode>(() => {
    const raw = readQuery(route.query.mode)
    return (TRADE_MODES as readonly string[]).includes(raw) ? (raw as TradeMode) : 'journal'
  })

  const month = computed(() => {
    const raw = readQuery(route.query.month)
    return MONTH_RE.test(raw) ? raw : currentMonthKey()
  })

  const day = computed(() => {
    const raw = readQuery(route.query.day)
    // A day outside the month on screen is not an error, it is a stale link —
    // dropped, so the month it names is what gets shown.
    return DAY_RE.test(raw) && raw.startsWith(month.value) ? raw : ''
  })

  const symbol = computed(() => {
    const raw = readQuery(route.query.symbol).toUpperCase()
    return SYMBOL_RE.test(raw) ? raw : ''
  })

  /** One writer for the query, so two changes in a tick are one replace. */
  function set(patch: Partial<{ mode: TradeMode; month: string; day: string; symbol: string }>) {
    const next: Record<string, string> = {
      mode: patch.mode ?? mode.value,
      month: patch.month ?? month.value,
      day: patch.day ?? day.value,
      symbol: patch.symbol ?? symbol.value,
    }
    // A month change drops a day that belonged to the month being left.
    if (patch.month && patch.day === undefined && !next.day.startsWith(next.month)) next.day = ''
    for (const key of Object.keys(next)) if (!next[key]) delete next[key]
    // The default mode is not written: a bare /trades is the journal, and a URL
    // that states its own default is a URL with nothing to say.
    if (next.mode === 'journal') delete next.mode
    void router.replace({ path: route.path, query: next })
  }

  // The last route is written by `useTabRoute`, which is mounted for every tab.
  // It used to be written here — and this composable is only mounted on Trades,
  // so a bare-domain visit could only ever be sent back to a trades URL
  // whatever the reader was actually last looking at (section 42).

  return { mode, month, day, symbol, set }
}
