// The theme registry. Each theme is a semantic token set; adding one is a single
// entry here (or a line in extra.ts) plus nothing else — the picker, the quick
// toggle, the contrast check and data-theme application all read this registry.
//
// The app renders theme tokens as inline styles via buildStyles (not CSS
// variables), so the tokens live as plain values here; a thin CSS-variable layer
// (see style.css / applyThemeToDom) carries the few cross-cutting bits inline
// styles cannot reach (scrollbars, selection, the canvas).

import { EXTRA_THEMES } from './extra'

export type ThemeGroup = 'light' | 'dark'

export interface Theme {
  label: string
  glass: string
  card: string
  border: string
  text: string
  dim: string
  input: string
  onAccent: string
  shadow: string
  group: ThemeGroup
  pageBg: string
  accent: string
  celestial: string
  // The opaque surface the contrast checker measures text/accent against, since
  // the glass tokens are translucent. Added for every theme.
  bgSolid: string
  // optional per-theme extras
  sunColor?: string
  corner?: 'tr' | 'bc'
  rays?: boolean
  ribbonColor?: string
  bgDeep?: string
  // Special themes (contrast, mono) drop the liquid-glass blur.
  noGlass?: boolean
  // Zero-chroma themes (section 16c). Every colour helper checks this and
  // returns an achromatic value, so status is carried by weight, border,
  // underline and icon rather than by hue — and the two mono themes are the
  // reference surfaces for accessibility checks.
  mono?: boolean
  // A theme that wants its own focus ring rather than the accent glow every
  // other theme derives (section 21d). One box-shadow value, applied as-is.
  focusRing?: string

  // ---- section 29: a theme that names its own tokens ------------------------
  // Everything below is optional and DERIVED when a theme does not set it, so
  // the nineteen themes above are untouched. A theme sets one of these only
  // when the derivation would be wrong for it — which, for a very dark ground,
  // it is: a secondary text colour mixed 72% toward the page lands under the
  // contrast floor there, and a red/green ramp built for a blue-black page
  // glows against a brown-black one.

  /** Exact secondary text, when mixing text toward dim would not clear 4.5:1. */
  textSecondary?: string
  /** Exact muted text — labels only. Measured against `bgSolid`. */
  textMuted?: string
  /** The inactive half of a progress track, when a mix of the accent is wrong. */
  accentSoft?: string
  /**
   * The profit/loss ramp's own endpoints, as [step 1, step 5] per side. A theme
   * that sets this gets a wash built from ITS colours at a fixed opacity ramp,
   * rather than the derived one that walks lightness away from the page.
   */
  plRamp?: { pos: [string, string]; neg: [string, string] }
  /**
   * How hard the declared ramp is laid on, from step 1 to step 5 (section 37).
   *
   * Defaults to 12%–70%, which is right on a page whose surface is close to
   * neutral. A deeply tinted ground needs more: at 12% over a warm brown, a
   * muted red IS brown, and the shallowest loss stops reading as a loss.
   */
  washAlpha?: { from: number; to: number }
  /**
   * What the browser should assume when it draws something we do not — a native
   * date popup, a scrollbar, a select's list. Defaults to the theme's group.
   */
  colorScheme?: 'dark' | 'light'
}

export type ThemeKey =
  | 'daylight'
  | 'dawn'
  | 'auroraDay'
  | 'deepSpace'
  | 'nebulaRose'
  | 'solarFlare'
  | 'auroraNight'
  | 'midnight'
  | 'nebula'
  | 'carbon'
  | 'forest'
  | 'paper'
  | 'arctic'
  | 'sand'
  | 'contrast'
  | 'monoDark'
  | 'monoLight'
  | 'kungfu'
  | 'kungfuLight'
  | 'espresso'

const lightBase = {
  glass: 'rgba(255,255,255,0.55)',
  card: 'rgba(255,255,255,0.55)',
  border: 'rgba(255,255,255,0.85)',
  text: '#2b2c46',
  // Muted/secondary text. Kept opaque enough to clear the WCAG 3:1 large-text
  // floor against the light surfaces (see contrast.test).
  dim: 'rgba(43,44,70,0.7)',
  input: 'rgba(255,255,255,0.5)',
  onAccent: '#2b2c46',
  shadow:
    '0 26px 60px rgba(120,120,190,0.26), 0 0 0 1px rgba(255,255,255,0.5), inset 0 1px 0 rgba(255,255,255,0.9)',
  group: 'light' as const,
}

const darkBase = {
  glass: 'rgba(24,26,52,0.5)',
  card: 'rgba(40,44,78,0.42)',
  border: 'rgba(150,170,255,0.28)',
  text: '#ecefff',
  dim: 'rgba(236,239,255,0.5)',
  input: 'rgba(255,255,255,0.06)',
  onAccent: '#181022',
  shadow:
    '0 26px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(160,180,255,0.12), inset 0 1px 0 rgba(255,255,255,0.14)',
  group: 'dark' as const,
}

const baseThemes: Record<string, Theme> = {
  daylight: {
    ...lightBase,
    label: 'Daylight Cosmos',
    pageBg: 'radial-gradient(130% 130% at 22% 6%, #d9e3ff 0%, #ece1ff 42%, #ffe7d9 100%)',
    bgSolid: '#e4e6ff',
    accent: 'oklch(0.68 0.13 70)',
    celestial: 'sun',
    sunColor: 'oklch(0.85 0.15 85)',
    corner: 'tr',
    rays: true,
  },
  dawn: {
    ...lightBase,
    label: 'Golden Dawn',
    pageBg: 'radial-gradient(140% 120% at 50% 100%, #ffe9d6 0%, #ffd9c2 40%, #fff3e6 100%)',
    bgSolid: '#ffe4cf',
    accent: 'oklch(0.66 0.15 45)',
    celestial: 'sun',
    sunColor: 'oklch(0.8 0.16 55)',
    corner: 'bc',
    rays: false,
  },
  auroraDay: {
    ...lightBase,
    label: 'Aurora Day',
    pageBg: 'radial-gradient(130% 130% at 20% 10%, #dff7f0 0%, #e3f3ff 45%, #f2fff9 100%)',
    bgSolid: '#e4f4ee',
    accent: 'oklch(0.62 0.13 165)',
    celestial: 'auroraLight',
    ribbonColor: 'oklch(0.85 0.13 165)',
    corner: 'tr',
  },
  deepSpace: {
    ...darkBase,
    label: 'Deep Space',
    pageBg: 'radial-gradient(130% 130% at 24% 8%, #241a5e 0%, #100c2e 44%, #05050f 100%)',
    bgSolid: '#130f34',
    accent: 'oklch(0.83 0.13 88)',
    celestial: 'earthMoon',
    corner: 'tr',
  },
  nebulaRose: {
    ...darkBase,
    label: 'Nebula Rose',
    pageBg: 'radial-gradient(130% 130% at 26% 10%, #4a1750 0%, #2a0f3d 45%, #120818 100%)',
    bgSolid: '#2a0f3d',
    accent: 'oklch(0.78 0.15 340)',
    celestial: 'crescent',
    corner: 'tr',
    bgDeep: '#2a0f3d',
  },
  solarFlare: {
    ...darkBase,
    label: 'Solar Flare',
    pageBg: 'radial-gradient(130% 130% at 70% 15%, #2a2016 0%, #1a1512 45%, #0d0b09 100%)',
    bgSolid: '#1a1512',
    accent: 'oklch(0.78 0.15 55)',
    celestial: 'flare',
    sunColor: 'oklch(0.55 0.14 45)',
    corner: 'tr',
  },
  auroraNight: {
    ...darkBase,
    label: 'Aurora Night',
    pageBg: 'radial-gradient(130% 130% at 25% 10%, #0d1b3d 0%, #081226 45%, #030812 100%)',
    bgSolid: '#081226',
    accent: 'oklch(0.75 0.13 165)',
    celestial: 'auroraDark',
    ribbonColor: 'rgba(90,220,180,0.35)',
    corner: 'tr',
    bgDeep: '#081226',
  },
}

export const THEMES = { ...baseThemes, ...EXTRA_THEMES } as Record<ThemeKey, Theme>

// Special themes are grouped apart from the plain dark/light families in the
// picker (and are excluded from the clock-based auto rotation).
export const SPECIAL_THEME_KEYS: ThemeKey[] = ['contrast', 'monoDark', 'monoLight']

// Standalone themes (section 21d) are neither a member of the dark/light
// families nor a variant of one: they are a whole look, listed on their own so
// picking one reads as a choice rather than as a tweak to the current theme.
export const STANDALONE_THEME_KEYS: ThemeKey[] = ['kungfu', 'kungfuLight']

const GROUPED_APART = [...SPECIAL_THEME_KEYS, ...STANDALONE_THEME_KEYS]

export const LIGHT_THEME_KEYS: ThemeKey[] = (Object.keys(THEMES) as ThemeKey[]).filter(
  (k) => THEMES[k].group === 'light' && !GROUPED_APART.includes(k),
)
export const DARK_THEME_KEYS: ThemeKey[] = (Object.keys(THEMES) as ThemeKey[]).filter(
  (k) => THEMES[k].group === 'dark' && !GROUPED_APART.includes(k),
)

export type ThemeMode = 'dark' | 'light'
export interface ThemeDescriptor {
  id: ThemeKey
  name: string
  mode: ThemeMode
  special: boolean
  standalone: boolean
  // Three swatches for the picker card, straight from the tokens.
  preview: [string, string, string]
}

export function describeTheme(id: ThemeKey): ThemeDescriptor {
  const t = THEMES[id]
  return {
    id,
    name: t.label,
    mode: t.group,
    special: SPECIAL_THEME_KEYS.includes(id),
    standalone: STANDALONE_THEME_KEYS.includes(id),
    preview: [t.bgSolid, t.accent, t.card],
  }
}
// The registry the picker renders, in a stable order (dark, light, special,
// standalone).
export const THEME_DESCRIPTORS: ThemeDescriptor[] = [
  ...DARK_THEME_KEYS,
  ...LIGHT_THEME_KEYS,
  ...SPECIAL_THEME_KEYS,
  ...STANDALONE_THEME_KEYS,
].map(describeTheme)

// The user's stored choice: a fixed theme, or 'auto' to follow the clock.
export type ThemeSetting = 'auto' | ThemeKey

export function isThemeSetting(value: unknown): value is ThemeSetting {
  // hasOwn, not `in`: `in` walks the prototype chain, so 'toString' and
  // 'constructor' would pass and then resolve to a non-Theme at lookup time.
  return value === 'auto' || (typeof value === 'string' && Object.hasOwn(THEMES, value))
}
export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === 'string' && Object.hasOwn(THEMES, value)
}

export function computeAutoTheme(hour: number): ThemeKey {
  if (hour >= 5 && hour < 8) return 'dawn'
  if (hour >= 8 && hour < 17) return 'daylight'
  if (hour >= 17 && hour < 20) return 'nebulaRose'
  return 'deepSpace'
}
