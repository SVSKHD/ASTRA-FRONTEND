// The tab, in the URL, for all of them (section 42).
//
// WHAT WAS WRONG. Four tabs had a path — /trades, /expenses, /news, /code — and
// the router restored those correctly, before first paint, exactly as designed.
// The other seventeen had nothing: `ui.setTab()` moved a ref and never touched
// the router, so selecting Finances changed the screen and left the address bar
// on whatever it said before. Refreshing there could only land on the default.
// The reading half worked; the writing half was never built.
//
// So the fault was not "restore is broken". It was that for most of the app
// there was nothing to restore FROM — which is why the fix is here, on the way
// out, and the router's `beforeEach` needed only the one line that reads it.
//
// TWO SHAPES, ONE MEANING. A tab that owns a path keeps it: /trades?month=… is
// a link somebody sends, and demoting it to /?tab=trades would break every one
// already sent. Everything else takes `?tab=<key>` on the root. Both are read
// back by the same guard.
//
// Every write is a `replace`. Changing tabs is not navigation in the sense the
// Back button means, and twenty tab changes must not become twenty presses of
// Back to leave the app.

import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { TAB_ORDER } from '@/tabs.config'
import { LAST_ROUTE_KEY, sessionWrite } from '@/composables/useTradeRoute'
import type { TabKey } from '@/types'

/** The four tabs whose own path is the canonical address for them. */
export const TAB_PATHS: Partial<Record<TabKey, string>> = {
  trades: '/trades',
  expenses: '/expenses',
  news: '/news',
  code: '/code',
}

export function isTabKey(value: unknown): value is TabKey {
  return typeof value === 'string' && (TAB_ORDER as readonly string[]).includes(value)
}

/**
 * The tab named by a location, or '' — the reading half, shared with the router
 * guard so the two halves cannot drift apart.
 */
export function tabOf(path: string, query: Record<string, unknown>): TabKey | '' {
  for (const [key, p] of Object.entries(TAB_PATHS)) if (p === path) return key as TabKey
  const raw = query.tab
  const value = typeof raw === 'string' ? raw : Array.isArray(raw) ? String(raw[0] ?? '') : ''
  return isTabKey(value) ? value : ''
}

/**
 * Mounted once, by the workspace. Writes the tab out and remembers the route.
 *
 * The `sessionStorage` line used to live in `useTradeRoute`, which is only ever
 * mounted on Trades — so a bare-domain visit could only ever be sent back to a
 * trades URL, whatever the reader was actually last looking at. Here it covers
 * every tab, which is what it was always meant to mean.
 */
export function useTabRoute() {
  const route = useRoute()
  const router = useRouter()
  const ui = useUiStore()
  const { tab } = storeToRefs(ui)
  let first = true

  watch(
    tab,
    (key) => {
      const named = tabOf(route.path, route.query)
      // THE URL WINS THE FIRST ROUND. A cold load on /trades?month=2026-08 has
      // a store still on its default tab, and writing that default out would
      // replace the location — month, day and all — with a bare one. The guard
      // usually gets there first; this is what makes the writer correct even
      // when it does not, which is the difference between a rule and a race.
      if (first) {
        first = false
        if (named && named !== key) {
          ui.setTab(named)
          return
        }
      }
      // Already where it should be: writing again would be a no-op replace on
      // every tab restore, and vue-router warns about redundant navigation.
      if (named === key) return
      const path = TAB_PATHS[key]
      if (path) {
        // A tab with its own path keeps whatever query belongs to it —
        // month, day, mode — and drops the `tab` marker, which that path is.
        const { tab: _drop, ...rest } = route.query
        void router.replace({ path, query: rest })
        return
      }
      // Everything else lives on the root with a marker. The query from the tab
      // being left does not follow it: a month belongs to the month view.
      void router.replace({ path: '/', query: { tab: key } })
    },
    { immediate: true },
  )

  // Written on every change rather than on unload: `beforeunload` does not fire
  // reliably on a phone, which is the device most likely to be reopened cold.
  watch(
    () => route.fullPath,
    (path) => sessionWrite(LAST_ROUTE_KEY, path),
    { immediate: true },
  )
}
