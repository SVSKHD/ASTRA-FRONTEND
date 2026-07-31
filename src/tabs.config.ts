// Single source of truth for the primary navigation tabs. The left rail, the
// mobile bottom bar and the mobile "More" sheet all read this one list, so tab
// ordering — and which tabs are surfaced first on mobile — is defined in exactly
// one place. Route paths are unchanged and keyed by TabKey elsewhere; this file
// is presentation ordering only.

import type { TabKey } from '@/types'

export interface TabDef {
  key: TabKey
  label: string
  // Surfaced directly in the mobile bottom bar. The rest live behind "More".
  // Exactly five are primary, matching the five-slot bottom bar.
  primary?: boolean
}

// Order here is the order everywhere: the rail top-to-bottom, the bottom bar
// left-to-right (primary only), and the More sheet (the remainder).
export const TABS: readonly TabDef[] = [
  { key: 'overview', label: 'Overview', primary: true },
  { key: 'todo', label: 'Todo', primary: true },
  { key: 'tasks', label: 'Tasks', primary: true },
  { key: 'deadlines', label: 'Deadlines' },
  { key: 'reminders', label: 'Reminders', primary: true },
  { key: 'finances', label: 'Finances', primary: true },
  { key: 'trips', label: 'Trips' },
  { key: 'ideas', label: 'Ideas' },
  { key: 'stocks', label: 'Stocks' },
] as const

// The canonical tab order, consumed by the ui store's keyboard navigation so the
// ⌘1–9 / arrow contract follows the same ordering the rail renders.
export const TAB_ORDER: readonly TabKey[] = TABS.map((t) => t.key)

// The five bottom-bar tabs and everything else (which the More sheet shows).
export const PRIMARY_TABS: readonly TabDef[] = TABS.filter((t) => t.primary)
export const SECONDARY_TABS: readonly TabDef[] = TABS.filter((t) => !t.primary)

export function tabLabel(key: TabKey): string {
  return TABS.find((t) => t.key === key)?.label ?? key
}
