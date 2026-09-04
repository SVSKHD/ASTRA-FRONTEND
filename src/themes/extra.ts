// The extended theme palettes added on top of the original space themes. Each is
// a self-contained Theme token set (adding one here + a line in the registry is
// all a new theme takes — see index.ts). Dark/light bases mirror the originals'
// glass look; `contrast` deliberately drops the glass blur for an AMOLED,
// maximum-contrast surface. `bgSolid` is the opaque surface the contrast checker
// measures text/accent against (the glass tokens are translucent).

import type { Theme } from './index'

const darkGlass = {
  glass: 'rgba(20,22,40,0.5)',
  card: 'rgba(34,38,66,0.44)',
  input: 'rgba(255,255,255,0.06)',
  onAccent: '#0c1020',
  shadow:
    '0 26px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(160,180,255,0.12), inset 0 1px 0 rgba(255,255,255,0.14)',
  group: 'dark' as const,
}
const lightGlass = {
  glass: 'rgba(255,255,255,0.6)',
  input: 'rgba(255,255,255,0.5)',
  shadow:
    '0 26px 60px rgba(120,120,190,0.22), 0 0 0 1px rgba(255,255,255,0.5), inset 0 1px 0 rgba(255,255,255,0.9)',
  group: 'light' as const,
}

// The mono pair (section 16c): pure black/white surfaces, greys between, and
// zero chroma anywhere. Nothing here is a colour decision — every value is a
// neutral, so any hue that appears on screen under these themes is a bug the
// mono test will catch. Both clear 21:1 trivially, which is why they are the
// reference themes for accessibility work.
const monoShared = {
  // No blur: a mono theme is about edges, and 1px solid borders read better
  // against flat black or white than a translucent pane does.
  noGlass: true,
  mono: true,
  celestial: 'none',
  group: 'dark' as const,
}

// Kung Fu (section 21d). A standalone theme rather than another member of the
// mono family, and the difference is not decoration: mono is greys with pure
// black and white at the ends, this is only black and white. Every surface is
// #000000 or #ffffff, every edge is a one-pixel line of the other, and the only
// values that are not one of those two are white and black at reduced alpha —
// still achromatic, and still the same two colours.
//
// Shadows are borders here. A drop shadow is a soft grey gradient, which is a
// third value creeping in through the back door, so the shadow token is a 1px
// ring instead.
const kungfuShared = {
  noGlass: true,
  mono: true,
  celestial: 'none',
}

export const EXTRA_THEMES: Record<string, Theme> = {
  kungfu: {
    ...kungfuShared,
    group: 'dark' as const,
    label: 'Kung Fu',
    glass: '#000000',
    card: '#000000',
    input: '#000000',
    border: '#ffffff',
    text: '#ffffff',
    // White at reduced alpha rather than a stored grey: the theme still names
    // two colours, and secondary text still reads as secondary.
    dim: 'rgba(255,255,255,0.72)',
    onAccent: '#000000',
    shadow: '0 0 0 1px #ffffff',
    pageBg: '#000000',
    bgSolid: '#000000',
    accent: '#ffffff',
    // 2px of white, held off the control by 2px of black, so the ring is
    // visible against a white control and a black page alike.
    focusRing: '0 0 0 2px #000000, 0 0 0 4px #ffffff',
  },
  kungfuLight: {
    ...kungfuShared,
    group: 'light' as const,
    label: 'Kung Fu light',
    glass: '#ffffff',
    card: '#ffffff',
    input: '#ffffff',
    border: '#000000',
    text: '#000000',
    dim: 'rgba(0,0,0,0.72)',
    onAccent: '#ffffff',
    shadow: '0 0 0 1px #000000',
    pageBg: '#ffffff',
    bgSolid: '#ffffff',
    accent: '#000000',
    focusRing: '0 0 0 2px #ffffff, 0 0 0 4px #000000',
  },
  monoDark: {
    ...monoShared,
    label: 'Mono dark',
    glass: '#0a0a0a',
    card: '#141414',
    input: '#141414',
    border: 'rgba(255,255,255,0.22)',
    text: '#ffffff',
    dim: 'rgba(255,255,255,0.68)',
    onAccent: '#000000',
    shadow: '0 0 0 1px rgba(255,255,255,0.14)',
    pageBg: '#000000',
    bgSolid: '#000000',
    accent: '#ffffff',
  },
  monoLight: {
    ...monoShared,
    group: 'light' as const,
    label: 'Mono light',
    glass: '#fafafa',
    card: '#f0f0f0',
    input: '#f0f0f0',
    border: 'rgba(0,0,0,0.24)',
    text: '#000000',
    dim: 'rgba(0,0,0,0.66)',
    onAccent: '#ffffff',
    shadow: '0 0 0 1px rgba(0,0,0,0.14)',
    pageBg: '#ffffff',
    bgSolid: '#ffffff',
    accent: '#000000',
  },
  // ---- dark family --------------------------------------------------------
  midnight: {
    ...darkGlass,
    label: 'Midnight',
    text: '#e9edff',
    dim: 'rgba(233,237,255,0.5)',
    border: 'rgba(120,150,255,0.26)',
    pageBg: 'radial-gradient(130% 130% at 24% 8%, #14213f 0%, #0c1730 45%, #060b18 100%)',
    bgSolid: '#0b1530',
    accent: 'oklch(0.72 0.16 250)',
    celestial: 'earthMoon',
    corner: 'tr',
  },
  nebula: {
    ...darkGlass,
    label: 'Nebula',
    text: '#f2e9ff',
    dim: 'rgba(242,233,255,0.5)',
    border: 'rgba(190,120,255,0.28)',
    pageBg: 'radial-gradient(130% 130% at 26% 10%, #2a0f3d 0%, #1a0a2c 45%, #0b0616 100%)',
    bgSolid: '#160a26',
    accent: 'oklch(0.72 0.2 320)',
    celestial: 'crescent',
    bgDeep: '#1a0a2c',
    corner: 'tr',
  },
  carbon: {
    ...darkGlass,
    label: 'Carbon',
    text: '#ededed',
    dim: 'rgba(237,237,237,0.5)',
    border: 'rgba(200,200,200,0.2)',
    input: 'rgba(255,255,255,0.05)',
    pageBg: 'radial-gradient(130% 130% at 24% 8%, #1c1c1c 0%, #141414 45%, #0b0b0b 100%)',
    bgSolid: '#141414',
    accent: 'oklch(0.78 0.14 75)',
    onAccent: '#161006',
    celestial: 'earthMoon',
    corner: 'tr',
  },
  forest: {
    ...darkGlass,
    label: 'Forest',
    text: '#e6f0e6',
    dim: 'rgba(230,240,230,0.5)',
    border: 'rgba(140,190,150,0.24)',
    pageBg: 'radial-gradient(130% 130% at 24% 8%, #12241b 0%, #0d1a14 45%, #06100b 100%)',
    bgSolid: '#0d1a14',
    accent: 'oklch(0.74 0.1 150)',
    onAccent: '#08160e',
    celestial: 'auroraDark',
    ribbonColor: 'rgba(120,200,150,0.3)',
    corner: 'tr',
  },
  // ---- light family -------------------------------------------------------
  paper: {
    ...lightGlass,
    label: 'Paper',
    card: 'rgba(255,252,246,0.62)',
    border: 'rgba(120,100,80,0.2)',
    text: '#3a3226',
    dim: 'rgba(58,50,38,0.7)',
    onAccent: '#fffaf3',
    pageBg: 'radial-gradient(140% 120% at 30% 6%, #fbf6ec 0%, #f6ede0 45%, #fff8ee 100%)',
    bgSolid: '#f8f1e5',
    accent: 'oklch(0.55 0.13 40)',
    celestial: 'sun',
    sunColor: 'oklch(0.72 0.13 55)',
    corner: 'tr',
  },
  arctic: {
    ...lightGlass,
    label: 'Arctic',
    card: 'rgba(255,255,255,0.66)',
    border: 'rgba(70,120,140,0.28)',
    text: '#20323a',
    dim: 'rgba(32,50,58,0.7)',
    onAccent: '#ffffff',
    pageBg: 'radial-gradient(130% 130% at 20% 10%, #eef6fb 0%, #e2eef5 45%, #f5fbff 100%)',
    bgSolid: '#e8f2f8',
    accent: 'oklch(0.52 0.11 210)',
    celestial: 'auroraLight',
    ribbonColor: 'oklch(0.82 0.1 200)',
    corner: 'tr',
  },
  sand: {
    ...lightGlass,
    label: 'Sand',
    card: 'rgba(250,244,232,0.62)',
    border: 'rgba(120,100,60,0.24)',
    text: '#3d3222',
    dim: 'rgba(61,50,34,0.73)',
    onAccent: '#fbf6ea',
    pageBg: 'radial-gradient(140% 120% at 30% 8%, #f3ead6 0%, #ece0c6 45%, #f8f1df 100%)',
    bgSolid: '#efe6cf',
    accent: 'oklch(0.5 0.09 110)',
    celestial: 'sun',
    sunColor: 'oklch(0.72 0.12 90)',
    corner: 'tr',
  },
  // ---- espresso (section 29) ----------------------------------------------
  // A roast, not a tint of the dark family. Six surfaces from near-black to a
  // lifted brown, crema text, and one gold that is allowed to appear in exactly
  // three places — target progress, focus rings and the active day's ring.
  //
  // Three things are declared here rather than derived, and each has a reason
  // this ground made unavoidable:
  //
  //   textSecondary / textMuted   the derivation mixes text toward `dim`, which
  //                               on a page this dark lands at 3.9:1. These are
  //                               measured: 8.2 and 5.0 on the base surface.
  //   plRamp                      the derived ramp walks lightness away from the
  //                               page at full chroma, which on brown-black
  //                               reads as neon. These endpoints are the same
  //                               two signs, desaturated and lifted to sit in
  //                               the cup rather than glow out of it.
  //   glass / card / border       translucent, not opaque (section 43). The
  //                               earlier reasoning — "a blur over a near-black
  //                               page is a slightly different near-black" —
  //                               was true of a near-black page. The page is a
  //                               starfield, and a panel that hides it is a
  //                               hole cut in the sky. These three are the
  //                               tints; the blur and the edge highlight are in
  //                               the token layer.
  //
  // These values are written to :root as INLINE styles by applyThemeToDom, so
  // they beat the [data-theme] block — which is why the glass tints have to
  // live here as well as there rather than in the stylesheet alone.
  //
  // The surface, border and accent-soft values live in the CSS token layer
  // (components/ui/tokens.css, `[data-theme='espresso']`) so the first paint has
  // them before any JavaScript runs; `espresso.test.ts` asserts the two copies
  // agree.
  espresso: {
    label: 'Espresso',
    group: 'dark',
    colorScheme: 'dark',
    // The three tints, and the border is a clear hairline of light rather than
    // a warm line: on glass the edge is what reads as an edge of a pane, and a
    // brown border on a brown tint is a slightly different brown.
    glass: 'rgba(26, 13, 8, 0.72)',
    card: 'rgba(43, 22, 11, 0.68)',
    input: 'rgba(43, 22, 11, 0.68)',
    border: 'rgba(255, 255, 255, 0.10)',
    // White, not crema. On a ground this warm a tinted text reads as a stain on
    // the surface rather than as ink on it, and the two alpha steps below then
    // have nowhere to go: they would be tints of a tint.
    text: '#FFFFFF',
    // `dim` is the legacy name the older components read; it is the muted step.
    dim: 'rgba(255, 255, 255, 0.52)',
    textSecondary: 'rgba(255, 255, 255, 0.72)',
    // Labels only. It measures 4.67:1 on the overlay surface, which clears the
    // floor — so unlike the first cut of this theme there is no separate
    // overlay muted step to keep in step with this one.
    textMuted: 'rgba(255, 255, 255, 0.52)',
    onAccent: '#1A0D08',
    // Black shadows vanish on this ground: the elevation is a 1px white
    // highlight along the top edge plus a wide ambient. One recipe, and the
    // per-layer recipes are in the token layer.
    shadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 12px rgba(0,0,0,0.6)',
    pageBg: '#0B0100',
    bgSolid: '#1A0D08',
    accent: '#C8873F',
    accentSoft: '#7A4F26',
    // Retuned for the warmer ground (section 37). Red is the side that loses
    // separation fastest here — a muted brick on brown is brown — so the
    // negative endpoints are pushed further from the surface in lightness AND
    // held off the orange the accent occupies, while the positive pair only
    // needed the same treatment lightly.
    plRamp: { pos: ['#3F7A4B', '#8FC98A'], neg: ['#A34434', '#F0A090'] },
    // 12% of anything over a warm brown is warm brown. Measured: at the shared
    // default the shallowest loss sat at 1.03:1 against a traded-but-flat cell,
    // which is to say invisible. From 34% it separates.
    washAlpha: { from: 0.34, to: 0.85 },
    celestial: 'none',
    focusRing: '0 0 0 2px #C8873F',
  },
  // ---- special ------------------------------------------------------------
  // AMOLED black / pure white, thicker borders, no glass blur.
  contrast: {
    label: 'High Contrast',
    glass: '#000000',
    card: '#0a0a0a',
    input: '#111111',
    border: 'rgba(255,255,255,0.55)',
    text: '#ffffff',
    dim: 'rgba(255,255,255,0.75)',
    onAccent: '#000000',
    shadow: '0 0 0 1px rgba(255,255,255,0.4)',
    group: 'dark',
    pageBg: '#000000',
    bgSolid: '#000000',
    accent: 'oklch(0.85 0.16 90)',
    celestial: 'earthMoon',
    corner: 'tr',
    noGlass: true,
  },
}
