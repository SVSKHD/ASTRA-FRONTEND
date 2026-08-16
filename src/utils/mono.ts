// Zero-chroma rendering (section 16c). Under the mono themes, hue carries no
// information — so anything that would have been "the blue one" becomes a shape,
// a pattern, a weight or a glyph instead.
//
// This module is where that substitution is decided, so no component invents its
// own fallback and the mono themes stay genuinely achromatic.

// A neutral in place of a hue. The lightness is preserved so the substitute sits
// where the colour did in the visual hierarchy — a bright accent stays bright,
// a muted label stays muted.
export function monoNeutral(dark: boolean, level: 'strong' | 'mid' | 'soft' = 'strong'): string {
  if (dark) {
    if (level === 'strong') return '#ffffff'
    if (level === 'mid') return 'rgba(255,255,255,0.72)'
    return 'rgba(255,255,255,0.45)'
  }
  if (level === 'strong') return '#000000'
  if (level === 'mid') return 'rgba(0,0,0,0.7)'
  return 'rgba(0,0,0,0.45)'
}

// The pattern vocabulary. Six repeatable fills that stay distinguishable at chip
// size and in print, so a project or goal that used to be identified by colour is
// identified by texture instead.
export type MonoPattern = 'solid' | 'stripe' | 'stripe-reverse' | 'grid' | 'dots' | 'dense'

export const MONO_PATTERNS: MonoPattern[] = [
  'solid',
  'stripe',
  'stripe-reverse',
  'grid',
  'dots',
  'dense',
]

// Deterministic: the same key always gets the same texture, everywhere, without
// anyone assigning one.
export function monoPatternFor(key: string): MonoPattern {
  let hash = 0
  const value = (key || '').toLowerCase()
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) % 997
  return MONO_PATTERNS[hash % MONO_PATTERNS.length]
}

// The CSS background for a pattern, drawn in the current foreground colour so it
// inherits whichever neutral the surface calls for.
export function monoPatternCss(pattern: MonoPattern, color: string): string {
  switch (pattern) {
    case 'solid':
      return color
    case 'stripe':
      return `repeating-linear-gradient(45deg, ${color} 0 2px, transparent 2px 5px)`
    case 'stripe-reverse':
      return `repeating-linear-gradient(-45deg, ${color} 0 2px, transparent 2px 5px)`
    case 'grid':
      return `repeating-linear-gradient(0deg, ${color} 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, ${color} 0 1px, transparent 1px 4px)`
    case 'dots':
      return `radial-gradient(${color} 1px, transparent 1.4px) 0 0 / 4px 4px`
    case 'dense':
      return `repeating-linear-gradient(90deg, ${color} 0 1px, transparent 1px 3px)`
  }
}

// The dash pattern a chart series uses instead of a colour. Same idea, same
// determinism: a line is told apart by its stroke, not its hue.
export const MONO_DASHES: string[] = ['0', '6 3', '2 3', '9 3 2 3', '1 3', '12 4']

export function monoDashFor(key: string): string {
  let hash = 0
  const value = (key || '').toLowerCase()
  for (let i = 0; i < value.length; i++) hash = (hash * 17 + value.charCodeAt(i)) % 883
  return MONO_DASHES[hash % MONO_DASHES.length]
}

// Status without hue: a glyph plus a weight. Callers render the glyph beside the
// label, which is what keeps "failed" and "synced" distinguishable in greyscale
// — and, incidentally, for a red/green colour-blind reader on every other theme
// too.
export interface MonoStatus {
  glyph: string
  weight: number
  underline: boolean
}

export function monoStatus(
  kind: 'success' | 'warning' | 'danger' | 'info' | 'neutral',
): MonoStatus {
  switch (kind) {
    case 'success':
      return { glyph: '✓', weight: 700, underline: false }
    case 'warning':
      return { glyph: '!', weight: 700, underline: true }
    case 'danger':
      return { glyph: '×', weight: 800, underline: true }
    case 'info':
      return { glyph: 'i', weight: 600, underline: false }
    default:
      return { glyph: '•', weight: 500, underline: false }
  }
}
