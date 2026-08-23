// Danger, success and warning as theme tokens (section 25b).
//
// A form needs a red. It did not have one: every invalid state in the app fell
// back to `var(--theme-danger, var(--theme-text))`, which is to say to ordinary
// text — so a field in error looked exactly like a field not in error, and the
// only thing carrying the failure was the words underneath.
//
// The values are derived per theme rather than declared per theme, for the same
// reason the accent gradient is: nineteen themes each hand-picking a red is
// nineteen chances to pick one that fails on its own background, and a twentieth
// theme would have to remember to pick a twentieth.

import type { Theme } from './index'
import { contrastRatio } from './contrast'

export type StatusKind = 'danger' | 'success' | 'warning'

// Two lightnesses per hue: a light theme needs the darker one to read on a pale
// page, a dark theme the lighter. Chroma is kept moderate so the colours sit
// beside the accent rather than shouting over it.
const HUES: Record<StatusKind, number> = { danger: 27, success: 150, warning: 75 }

export function statusToken(theme: Theme, kind: StatusKind): string {
  // A zero-chroma theme carries status by glyph, weight and underline
  // (section 16c). Handing it a red would be the one thing it exists not to do.
  if (theme.mono) return theme.text

  const hue = HUES[kind]
  const light = theme.group === 'light'
  // Walk lightness towards the page until the colour clears the 4.5:1 that a
  // danger *message* needs — the same value is used for the border, where 3:1
  // would do, so meeting the stricter of the two is the simpler rule.
  const steps = light ? [0.52, 0.48, 0.44, 0.4, 0.36, 0.32] : [0.72, 0.76, 0.8, 0.84, 0.88, 0.92]
  const chroma = kind === 'warning' ? 0.14 : 0.17
  for (const l of steps) {
    const candidate = `oklch(${l} ${chroma} ${hue})`
    if (contrastRatio(candidate, theme.bgSolid) >= 4.5) return candidate
  }
  // Nothing in the ramp cleared it — fall back to the theme's own text, which
  // by definition does. Legible and wrong-coloured beats coloured and unread.
  return theme.text
}

export function statusTokens(theme: Theme): Record<string, string> {
  return {
    '--theme-danger': statusToken(theme, 'danger'),
    '--theme-success': statusToken(theme, 'success'),
    '--theme-warning': statusToken(theme, 'warning'),
  }
}
