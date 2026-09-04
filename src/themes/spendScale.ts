// The expense ramp (section 35).
//
// One hue, five steps, and the hue is the theme's own INK rather than a colour
// of its own. Three reasons, in order of how much they mattered:
//
//   1. An expense has no sign. The P/L scale is two hues meeting at zero
//      because a trade can go either way; spending cannot. A second two-hue
//      scale on the next tab would say the same thing twice and mean something
//      different, and the reader has to hold both.
//   2. It must not be mistaken for the P/L scale at a glance, and the surest
//      way to achieve that is not to be a hue at all.
//   3. Green and red are spoken for, and amber means "attention" — an expense
//      is not a warning, it is a fact.
//
// So depth is density: the ink laid over the surface, 8% at the shallow end and
// 45% at the deep. Legibility comes free, because the text that sits on it is
// the same ink it is made of and the deepest step is still under half strength.

import { contrastRatio, over, parseColor } from '@/themes/contrast'
import type { Theme } from '@/themes'

export const SPEND_STEPS = 5
export const SPEND_ALPHA = { from: 0.08, to: 0.45 } as const

function rgbString({ r, g, b }: { r: number; g: number; b: number }): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
}

/** One step, as an opaque colour — the same rule the P/L wash follows. */
export function spendWash(theme: Theme, step: number): string {
  const clamped = Math.min(SPEND_STEPS, Math.max(1, Math.round(step)))
  const t = (clamped - 1) / (SPEND_STEPS - 1)
  const alpha = SPEND_ALPHA.from + (SPEND_ALPHA.to - SPEND_ALPHA.from) * t
  const ink = parseColor(theme.text)
  return rgbString(over({ ...ink, a: alpha }, parseColor(theme.bgSolid)))
}

/**
 * The ink for a step.
 *
 * The theme's own text on the shallow steps; on the deep ones — where the wash
 * has moved most of the way towards the text colour — it flips to the surface,
 * which is by construction the furthest thing from it.
 */
export function spendInk(theme: Theme, step: number): string {
  const wash = spendWash(theme, step)
  return contrastRatio(theme.text, wash) >= 4.5 ? theme.text : theme.bgSolid
}

/** Everything a cell needs, published as custom properties on `:root`. */
export function spendScaleTokens(theme: Theme): Record<string, string> {
  const out: Record<string, string> = {}
  for (let step = 1; step <= SPEND_STEPS; step += 1) {
    out[`--spend-${step}`] = spendWash(theme, step)
    out[`--on-spend-${step}`] = spendInk(theme, step)
  }
  return out
}
