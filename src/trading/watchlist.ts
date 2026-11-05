// The per-device watchlist (instrument ids and symbols only, no credentials).
//
// Shared so the trading page subscribes the live stream to it once at sign-in
// (src/views/TradingView.vue), whichever tab opens first, and the Dhan
// market-data monitor sees the same subscriptions the Watchlist tab edits.

export const WATCHLIST_KEY = 'aureon.trading.watchlist'

export interface Watched {
  id: number
  symbol: string
  broker: string
}

export function readWatchlist(): Watched[] {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(WATCHLIST_KEY) || '[]') as unknown
    return Array.isArray(raw)
      ? raw.filter(
          (w): w is Watched => !!w && typeof w === 'object' && Number.isInteger((w as Watched).id),
        )
      : []
  } catch {
    return []
  }
}

export function writeWatchlist(list: Watched[]): void {
  try {
    globalThis.localStorage?.setItem(WATCHLIST_KEY, JSON.stringify(list))
  } catch {
    /* private window: the list lasts for this page only */
  }
}

/** "RELIANCE" for an id on the watchlist, else "#123". */
export function symbolFor(id: number, list: Watched[] = readWatchlist()): string {
  return list.find((w) => w.id === id)?.symbol ?? `#${id}`
}
