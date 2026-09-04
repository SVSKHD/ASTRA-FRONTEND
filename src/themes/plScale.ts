// The profit/loss scale (section 28b).
//
// What this replaces: one green and one red, mixed into the page at whatever
// alpha the day's move worked out to. Two problems with that. The first is that
// alpha over a translucent glass panel is not a colour anybody chose — it is
// whatever landed. The second is worse: alpha is linear and vision is not, so
// "twice the move" did not look like twice the anything, and the four middle
// days of a month all looked the same.
//
// So the scale is built rather than mixed: five steps each side, walked in
// OKLCH, where equal steps in L and C are close to equal steps in perceived
// depth. Step 1 is a day that barely moved, step 5 a day at or past the target.
// A day with no trades gets no step at all — absence is the signal, and a grid
// of pale washes over every empty square would drown the days that mean
// something.
//
// Every step is composited over the theme's own page colour and then measured:
// the theme's text has to clear 4.5:1 on the wash, or the step is walked back
// towards the page until it does. That check is not decoration — a wash is a
// text background, and the day number sits on it.

import { contrastRatio, over, parseColor } from './contrast'
import type { Theme } from './index'

/** Steps per side. Five is the most a reader can rank without a legend. */
export const PL_STEPS = 5

/** WCAG AA for body text — the day number on its wash. */
export const AA_TEXT = 4.5

// The status family's own hues, so a wash and the `--theme-success` figure
// beside it are the same colour idea at two strengths rather than two greens.
const HUE = { pos: 150, neg: 27 } as const

export type PlSide = keyof typeof HUE

/**
 * Which of the five steps a day falls in.
 *
 * Keyed to the day's move as a fraction of the daily target: a fifth of the
 * target is step 1, the whole target (or more) is step 5. Returns 0 for a day
 * that did not move at all, which is the same thing the caller draws for a day
 * that was not traded.
 */
export function plStep(move: number, dayTarget: number): number {
  const target = dayTarget > 0 ? dayTarget : 1
  const ratio = Math.abs(move) / target
  if (ratio <= 0) return 0
  return Math.min(PL_STEPS, Math.max(1, Math.ceil(ratio * PL_STEPS)))
}

// Comma-separated on purpose: this string is read back by the app's own
// `parseColor` (the contrast test does exactly that), and its rgb() branch
// splits on commas. The modern space-separated form parses as NaN there, which
// fails as an unreadable pair rather than as a syntax error.
function rgbString(color: { r: number; g: number; b: number }): string {
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`
}

/**
 * One step of the ramp, as an opaque colour.
 *
 * Opaque on purpose. The wash sits on a glass panel over a starfield; a
 * translucent tint there is a different colour on every scroll position, and no
 * contrast measurement of it means anything.
 */
export function plWash(theme: Theme, side: PlSide, step: number): string {
  const page = parseColor(theme.bgSolid)
  const light = theme.group === 'light'
  const clamped = Math.min(PL_STEPS, Math.max(1, Math.round(step)))
  const t = clamped / PL_STEPS

  // A zero-chroma theme carries the sign by the cell's edge, its mark and its
  // micro bar (section 16c). Its ramp is lightness only — still five legible
  // steps, still no hue.
  const chroma = theme.mono ? 0 : 0.02 + 0.075 * t

  // Lightness walks away from the page, not towards a fixed value: on a dark
  // theme the wash gets lighter, on a light theme darker, so step 5 is the
  // furthest from the surface on both and the ramp reads the same way.
  const base = light ? 0.94 : 0.24
  const span = light ? -0.16 : 0.18

  for (let give = 0; give <= 6; give += 1) {
    // Each retry pulls the step back towards the page by a sixth of the span,
    // which is what keeps a failing pair legible instead of dropping the wash.
    const l = base + span * t * (1 - give / 6)
    const candidate = `oklch(${l.toFixed(3)} ${chroma.toFixed(3)} ${HUE[side]})`
    const opaque = rgbString(over({ ...parseColor(candidate), a: 1 }, page))
    if (contrastRatio(theme.text, opaque) >= AA_TEXT) return opaque
  }
  // Nothing in the ramp cleared it: the page itself, which by definition does.
  return rgbString(page)
}

/** The neutral cell: traded, but flat. Not the same as "no trades". */
export function plFlat(theme: Theme): string {
  const page = parseColor(theme.bgSolid)
  const light = theme.group === 'light'
  const l = light ? 0.93 : 0.26
  return rgbString(over({ ...parseColor(`oklch(${l} 0 0)`), a: 1 }, page))
}

/**
 * The whole ramp as custom properties, applied to :root beside the status
 * tokens. Derived per theme rather than declared per theme, for the reason the
 * status tokens are: nineteen themes hand-picking ten reds and greens each is
 * a hundred and ninety chances to pick one that fails on its own background.
 */
export function plScaleTokens(theme: Theme): Record<string, string> {
  const out: Record<string, string> = { '--pl-flat': plFlat(theme) }
  for (let step = 1; step <= PL_STEPS; step += 1) {
    out[`--pl-pos-${step}`] = plWash(theme, 'pos', step)
    out[`--pl-neg-${step}`] = plWash(theme, 'neg', step)
  }
  return out
}

/** The token a day cell asks for, given its sign and its move. */
export function plWashVar(sign: 'pos' | 'neg' | 'flat', move: number, dayTarget: number): string {
  if (sign === 'flat') return 'var(--pl-flat)'
  const step = plStep(move, dayTarget)
  return step === 0 ? 'var(--pl-flat)' : `var(--pl-${sign}-${step})`
}
