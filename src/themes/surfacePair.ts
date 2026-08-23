// Tinted surfaces, and the text on them (section 24b).
//
// The bug this exists to make impossible: an element takes a colour from its
// project or its type, tints its background with it, and then leaves its text
// to whatever the page set. On a light theme the page's text is dark and the
// tint is light, so it reads. On a dark theme with a dark tint, the same markup
// renders dark on dark and the chip is a coloured smudge. Nothing in the code
// changed — only the backdrop — which is why it survives review.
//
// The rule here is that a tinted surface names both halves of the pair at once.
// A caller asks for "a surface from this colour" and gets back a background and
// a foreground that have been measured against each other, or, when the measure
// fails, a plain surface that is legible instead of a tinted one that is not.
//
// Colour-of-the-thing does not go in the text. A 12% tint of a hue with the
// same hue on top of it is two values a few steps apart on one axis; the eye
// reads that as a smudge whatever the ratio says. The hue goes in the bar down
// the left edge, at full strength, where it is a signal and not a legibility
// problem.

import { contrastRatio, over, parseColor, type RGB } from './contrast'
import type { Theme } from './index'

/** WCAG AA for body text. Below this a pair is not used, it is replaced. */
export const AA_TEXT = 4.5

/** The tint strength section 24b fixes for an event chip. */
export const CHIP_TINT = 0.12

export interface SurfacePair {
  /** The tinted fill, as a CSS colour. */
  background: string
  /** Text on that fill. Measured against it, never assumed from the page. */
  foreground: string
  /** The source colour at full strength, for a bar or a dot. */
  accent: string
  /**
   * True when the tint could not carry legible text and a plain elevated
   * surface was substituted. Exposed so a test can assert *which* themes fall
   * back rather than only that nothing is unreadable.
   */
  fellBack: boolean
  /** The measured ratio of `foreground` on `background`, over the page. */
  ratio: number
}

function rgba({ r, g, b }: RGB, a: number): string {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`
}

/**
 * A tinted surface and the text that goes on it.
 *
 * `source` is the project/goal/type colour. `alpha` is how much of it shows.
 * The returned background is already composited over the theme's page colour,
 * so it is opaque and a caller does not have to know what is behind it — which
 * matters, because "behind it" is a glass panel over a gradient over an image.
 */
export function surfacePair(source: string, theme: Theme, alpha = CHIP_TINT): SurfacePair {
  const page = parseColor(theme.bgSolid)
  const tint = over({ ...parseColor(source), a: alpha }, page)
  const onTint = contrastRatio(theme.text, rgba(tint, 1))

  if (onTint >= AA_TEXT) {
    return {
      background: rgba(tint, 1),
      foreground: theme.text,
      accent: source,
      fellBack: false,
      ratio: onTint,
    }
  }

  // The tint cannot carry the theme's text. Rather than darkening the text —
  // which would make the chip legible on this theme and illegible on the next
  // one — drop the tint. A chip that is a plain surface with a coloured bar
  // still says which project it belongs to.
  const solid = over(parseColor(theme.card), page)
  return {
    background: rgba(solid, 1),
    foreground: theme.text,
    accent: source,
    fellBack: true,
    ratio: contrastRatio(theme.text, rgba(solid, 1)),
  }
}

/**
 * The same decision, expressed as CSS custom properties for a component to
 * spread onto an element. `--on-surface` is the foreground; naming it that way
 * is what stops the next component from reaching for `--text-primary` and
 * getting it right only on the themes it was written against.
 */
export function surfacePairVars(
  source: string,
  theme: Theme,
  alpha = CHIP_TINT,
): Record<string, string> {
  const pair = surfacePair(source, theme, alpha)
  return {
    '--surface': pair.background,
    '--on-surface': pair.foreground,
    '--surface-accent': pair.accent,
  }
}
