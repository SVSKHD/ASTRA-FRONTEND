// The tab you were working on, remembered past the browser tab it was in.
//
// The URL already carries the tab (`?tab=todo`, or `/trades`), and a plain
// reload reads it back. What that misses is every way of coming back that does
// not keep the URL: the installed app relaunching on its `start_url` of `/`, a
// new browser window, a bookmark of the bare domain. The per-tab
// `sessionStorage` route is gone in all three, so they all landed on Overview.
// This is the durable fallback — localStorage, one key, validated on the way out.
//
// Kept free of the router and the stores so the app store can use it without
// an import cycle.

import { TAB_ORDER } from '@/tabs.config'
import type { TabKey } from '@/types'

export const LAST_TAB_KEY = 'astra:last-tab'

/** The four tabs whose own path is the canonical address for them. */
export const TAB_PATHS: Partial<Record<TabKey, string>> = {
  trades: '/trades',
  expenses: '/expenses',
  news: '/news',
  code: '/code',
}

function isTab(value: unknown): value is TabKey {
  return typeof value === 'string' && (TAB_ORDER as readonly string[]).includes(value)
}

export function rememberTab(key: TabKey): void {
  try {
    globalThis.localStorage?.setItem(LAST_TAB_KEY, key)
  } catch {
    /* private mode: the URL still carries the tab for a plain reload */
  }
}

export function rememberedTab(): TabKey | '' {
  try {
    const raw = globalThis.localStorage?.getItem(LAST_TAB_KEY)
    return isTab(raw) ? raw : ''
  } catch {
    return ''
  }
}

/** The address a tab lives at. */
export function tabUrl(key: TabKey): string {
  return TAB_PATHS[key] ?? '/?tab=' + key
}
