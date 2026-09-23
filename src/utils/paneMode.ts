// The detail pane's three modes, as one control.
//
// One button that steps forward rather than three that sit there: the modes
// are an order, not a set — the column in the tab, the same detail lifted out
// over it, then that one at half the window — and each press is "more of this,
// please". A row of three radio buttons would say they are unrelated choices,
// and would spend three slots of a pane header saying it.
//
// It wraps, so the button is never a dead end: from `large` the next press is
// back to the column it came from.
import type { PaneMode } from '@/types'

export const PANE_MODE_ORDER: readonly PaneMode[] = ['inline', 'compact', 'large'] as const

/** What the mode is, said the way the button's tooltip says it. */
export const PANE_MODE_LABEL: Record<PaneMode, string> = {
  inline: 'Split view',
  compact: 'Compact drawer',
  large: 'Full drawer',
}

export function nextPaneMode(mode: PaneMode): PaneMode {
  const i = PANE_MODE_ORDER.indexOf(mode)
  return PANE_MODE_ORDER[(i + 1) % PANE_MODE_ORDER.length]
}

/**
 * The icon for a mode, used on the button that SWITCHES to it — so it is a
 * picture of where the press leads, not of where the pane is now.
 */
export function paneModeIcon(mode: PaneMode): 'columns' | 'minimize' | 'maximize' {
  if (mode === 'inline') return 'columns'
  return mode === 'compact' ? 'minimize' : 'maximize'
}

/** "Switch to compact drawer" — the button's title and its accessible name. */
export function paneModeAction(mode: PaneMode): string {
  return `Switch to ${PANE_MODE_LABEL[mode].toLowerCase()}`
}

// The drawers that are NOT detail panes — the goal form, the help reference,
// the security panel — have no column of a tab to sit in, so they cannot offer
// `inline` at all. They used to share this setting and read `inline` as a
// width, and that was wrong in the one way that matters: pressing "wider" on
// the goal form wrote a drawer mode into it, and every detail pane in the app
// silently left the split view the reader had chosen. A control that changes
// something it is not pointing at is a bug however sensible the sharing looked.
//
// So they carry their own width (`drawerWide` on the store) and this file is
// only ever about where a DETAIL goes. Inline stays the default for every pane
// until a pane's own button says otherwise.
