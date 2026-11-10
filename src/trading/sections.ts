// The trading panel's sections, grouped, in one list the navigation reads.
//
// The market terminal (docs/market-terminal.md) added Market Explorer, Charts &
// Indicators, the Screener, Futures & Options and Watchlists to a panel that
// already had eleven sections in one flat tab strip. Fifteen tabs in a row is a
// strip nobody reads past the sixth, so they are grouped: the groups are what
// the sidebar (tablet, desktop) and the section sheet (phone) show.
//
// URL compatibility: `/trading/market` was "Watchlist & charts"; it is now the
// Market Explorer (the spec's route). The chart moved to `/trading/charts` and
// the list to `/trading/watchlists`. Every other path is unchanged, so a link
// to MT5, My vs bot, Orders or Paper still lands where it did.

import type { IconName } from '@/components/ui/icons'

export type SectionKey =
  | 'overview'
  | 'market'
  | 'charts'
  | 'screener'
  | 'options'
  | 'watchlists'
  | 'strategies'
  | 'signals'
  | 'dhan'
  | 'mt5'
  | 'origins'
  | 'orders'
  | 'paper'
  | 'risk'
  | 'agents'

export interface Section {
  key: SectionKey
  label: string
  /** A shorter label for tight places (the phone's section button). */
  short: string
  icon: IconName
  group: GroupKey
}

export type GroupKey = 'markets' | 'research' | 'accounts' | 'control'

export const GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'markets', label: 'Markets' },
  { key: 'research', label: 'Research' },
  { key: 'accounts', label: 'Accounts & execution' },
  { key: 'control', label: 'Risk & Agents' },
]

export const SECTIONS: Section[] = [
  {
    key: 'overview',
    label: 'Overview',
    short: 'Overview',
    icon: 'layout-dashboard',
    group: 'markets',
  },
  { key: 'market', label: 'Market Explorer', short: 'Explorer', icon: 'search', group: 'markets' },
  {
    key: 'charts',
    label: 'Charts & Indicators',
    short: 'Charts',
    icon: 'candlestick-chart',
    group: 'markets',
  },
  { key: 'screener', label: 'Stock Screener', short: 'Screener', icon: 'filter', group: 'markets' },
  { key: 'options', label: 'Futures & Options', short: 'F&O', icon: 'layers', group: 'markets' },
  { key: 'watchlists', label: 'Watchlists', short: 'Watchlists', icon: 'star', group: 'markets' },
  {
    key: 'strategies',
    label: 'Strategies & Backtests',
    short: 'Strategies',
    icon: 'flask-conical',
    group: 'research',
  },
  { key: 'signals', label: 'Signals', short: 'Signals', icon: 'zap', group: 'research' },
  { key: 'dhan', label: 'Dhan Account', short: 'Dhan', icon: 'landmark', group: 'accounts' },
  { key: 'mt5', label: 'MT5', short: 'MT5', icon: 'monitor', group: 'accounts' },
  {
    key: 'origins',
    label: 'My vs bot',
    short: 'My vs bot',
    icon: 'git-compare',
    group: 'accounts',
  },
  { key: 'orders', label: 'Orders & positions', short: 'Orders', icon: 'list', group: 'accounts' },
  { key: 'paper', label: 'Paper', short: 'Paper', icon: 'file-text', group: 'accounts' },
  { key: 'risk', label: 'Risk', short: 'Risk', icon: 'shield', group: 'control' },
  { key: 'agents', label: 'Agents', short: 'Agents', icon: 'bot', group: 'control' },
]

export function sectionFor(param: unknown): SectionKey {
  const s = String(param ?? '')
  return (SECTIONS.some((x) => x.key === s) ? s : 'overview') as SectionKey
}

export function pathFor(key: SectionKey, query?: Record<string, string>): string {
  const base = key === 'overview' ? '/trading' : `/trading/${key}`
  const q = query ? new URLSearchParams(query).toString() : ''
  return q ? `${base}?${q}` : base
}

export function grouped(): { key: GroupKey; label: string; sections: Section[] }[] {
  return GROUPS.map((g) => ({ ...g, sections: SECTIONS.filter((s) => s.group === g.key) }))
}

/** The section a chart / explorer action opens, with the instrument in the URL. */
export function chartPath(instrumentId: number, timeframe?: string): string {
  return pathFor('charts', {
    instrument: String(instrumentId),
    ...(timeframe ? { tf: timeframe } : {}),
  })
}
