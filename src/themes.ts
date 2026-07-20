// Theme tokens, ported verbatim from the Aureon design's THEMES() map.

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
  // optional per-theme extras
  sunColor?: string
  corner?: 'tr' | 'bc'
  rays?: boolean
  ribbonColor?: string
  bgDeep?: string
}

export type ThemeKey =
  'daylight' | 'dawn' | 'auroraDay' | 'deepSpace' | 'nebulaRose' | 'solarFlare' | 'auroraNight'

const lightBase = {
  glass: 'rgba(255,255,255,0.55)',
  card: 'rgba(255,255,255,0.55)',
  border: 'rgba(255,255,255,0.85)',
  text: '#2b2c46',
  dim: 'rgba(43,44,70,0.5)',
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
  dim: 'rgba(236,239,255,0.46)',
  input: 'rgba(255,255,255,0.06)',
  onAccent: '#181022',
  shadow:
    '0 26px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(160,180,255,0.12), inset 0 1px 0 rgba(255,255,255,0.14)',
  group: 'dark' as const,
}

export const THEMES: Record<ThemeKey, Theme> = {
  daylight: {
    ...lightBase,
    label: 'Daylight Cosmos',
    pageBg: 'radial-gradient(130% 130% at 22% 6%, #d9e3ff 0%, #ece1ff 42%, #ffe7d9 100%)',
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
    accent: 'oklch(0.62 0.13 165)',
    celestial: 'auroraLight',
    ribbonColor: 'oklch(0.85 0.13 165)',
    corner: 'tr',
  },
  deepSpace: {
    ...darkBase,
    label: 'Deep Space',
    pageBg: 'radial-gradient(130% 130% at 24% 8%, #241a5e 0%, #100c2e 44%, #05050f 100%)',
    accent: 'oklch(0.83 0.13 88)',
    celestial: 'earthMoon',
    corner: 'tr',
  },
  nebulaRose: {
    ...darkBase,
    label: 'Nebula Rose',
    pageBg: 'radial-gradient(130% 130% at 26% 10%, #4a1750 0%, #2a0f3d 45%, #120818 100%)',
    accent: 'oklch(0.78 0.15 340)',
    celestial: 'crescent',
    corner: 'tr',
    bgDeep: '#2a0f3d',
  },
  solarFlare: {
    ...darkBase,
    label: 'Solar Flare',
    pageBg: 'radial-gradient(130% 130% at 70% 15%, #2a2016 0%, #1a1512 45%, #0d0b09 100%)',
    accent: 'oklch(0.78 0.15 55)',
    celestial: 'flare',
    sunColor: 'oklch(0.55 0.14 45)',
    corner: 'tr',
  },
  auroraNight: {
    ...darkBase,
    label: 'Aurora Night',
    pageBg: 'radial-gradient(130% 130% at 25% 10%, #0d1b3d 0%, #081226 45%, #030812 100%)',
    accent: 'oklch(0.75 0.13 165)',
    celestial: 'auroraDark',
    ribbonColor: 'rgba(90,220,180,0.35)',
    corner: 'tr',
    bgDeep: '#081226',
  },
}

export const LIGHT_THEME_KEYS: ThemeKey[] = ['daylight', 'dawn', 'auroraDay']
export const DARK_THEME_KEYS: ThemeKey[] = ['deepSpace', 'nebulaRose', 'solarFlare', 'auroraNight']

// The user's stored choice: a fixed theme, or 'auto' to follow the clock.
// Lives here rather than in the ui store so the app store can persist it
// without importing the ui store back.
export type ThemeSetting = 'auto' | ThemeKey

export function isThemeSetting(value: unknown): value is ThemeSetting {
  // hasOwn, not `in`: `in` walks the prototype chain, so 'toString' and
  // 'constructor' would pass and then resolve to a non-Theme at lookup time.
  return value === 'auto' || (typeof value === 'string' && Object.hasOwn(THEMES, value))
}

export function computeAutoTheme(hour: number): ThemeKey {
  if (hour >= 5 && hour < 8) return 'dawn'
  if (hour >= 8 && hour < 17) return 'daylight'
  if (hour >= 17 && hour < 20) return 'nebulaRose'
  return 'deepSpace'
}
