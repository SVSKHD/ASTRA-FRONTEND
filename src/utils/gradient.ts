// The accent gradient pair (section 16d). Every theme gets one derived from its
// own accent rather than hand-authored, so vibrancy arrives across the whole
// registry at once and a new theme cannot forget to define it.
//
// The derivation is deliberately narrow: a small hue rotation and a small
// lightness split. Enough to read as depth on a button or a progress fill,
// never enough to move the accent far from the colour the theme chose — and
// never applied to text, so contrast is unaffected by how vibrant a surface gets.

import { contrastRatio } from '@/themes/contrast'
import type { Theme } from '@/themes'

export interface AccentGradient {
  from: string
  to: string
}

const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i

// How far the two ends diverge. Small on purpose.
const HUE_SHIFT = 14
const LIGHT_SHIFT = 0.06
const CHROMA_LIFT = 0.02

export function accentGradient(
  theme: Pick<Theme, 'accent' | 'mono' | 'group'> & { onAccent?: string },
): AccentGradient {
  // A zero-chroma theme has no gradient to give: both stops are the accent, so
  // every component that reads the pair still renders, flat.
  if (theme.mono) return { from: theme.accent, to: theme.accent }

  const match = OKLCH.exec(theme.accent.trim())
  if (!match) {
    // A hex or rgb accent gets no synthesised gradient rather than a guessed
    // one — a flat accent is correct, a wrong colour is not.
    return { from: theme.accent, to: theme.accent }
  }
  const lightness = Number(match[1])
  const chroma = Number(match[2])
  const hue = Number(match[3])

  const build = (scale: number): AccentGradient => ({
    from: `oklch(${round(lightness + LIGHT_SHIFT * scale)} ${round(chroma + CHROMA_LIFT * scale)} ${wrapHue(hue - HUE_SHIFT * scale)})`,
    to: `oklch(${round(lightness - LIGHT_SHIFT * scale)} ${round(chroma)} ${wrapHue(hue + HUE_SHIFT * scale)})`,
  })

  // Contrast wins over vibrancy: the split contracts until text on the button
  // still clears AA against BOTH stops, and collapses to a flat accent rather
  // than shipping a stop that fails. A theme whose flat accent already fails is
  // not made worse here — it is left exactly as it was.
  const onAccent = theme.onAccent
  if (!onAccent) return build(1)
  const flat: AccentGradient = { from: theme.accent, to: theme.accent }
  const floor = Math.min(4.5, contrastRatio(onAccent, theme.accent))
  for (const scale of [1, 0.75, 0.5, 0.25]) {
    const candidate = build(scale)
    if (
      contrastRatio(onAccent, candidate.from) >= floor &&
      contrastRatio(onAccent, candidate.to) >= floor
    ) {
      return candidate
    }
  }
  return flat
}

function round(value: number): number {
  return Math.max(0, Math.min(1.2, Math.round(value * 1000) / 1000))
}
function wrapHue(hue: number): number {
  return Math.round(((hue % 360) + 360) % 360)
}

// The surface tint: a trace of the accent mixed into a neutral surface, so
// panels belong to the theme rather than being grey next to it. Returned as a
// color-mix so the browser does the blending against whatever the surface is.
export function surfaceTint(theme: Pick<Theme, 'accent' | 'mono'>, strength = 6): string {
  if (theme.mono) return 'transparent'
  return `color-mix(in oklch, ${theme.accent} ${strength}%, transparent)`
}

// The focus/active glow. Never on text — only on borders and shadows, which is
// what keeps vibrancy away from anything contrast-critical.
export function accentGlow(theme: Pick<Theme, 'accent' | 'mono'>, strength = 45): string {
  if (theme.mono) return 'none'
  return `0 0 18px color-mix(in oklch, ${theme.accent} ${strength}%, transparent)`
}

// The guard behind "vibrancy never costs contrast": whatever the gradient does,
// the text placed on it must still clear AA against BOTH stops.
export function gradientPassesAA(gradient: AccentGradient, onAccent: string): boolean {
  return (
    contrastRatio(onAccent, gradient.from) >= 4.5 && contrastRatio(onAccent, gradient.to) >= 4.5
  )
}
