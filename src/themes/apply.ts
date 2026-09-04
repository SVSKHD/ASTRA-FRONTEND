// Applies the active theme to the document: sets data-theme, updates the mobile
// browser-chrome <meta name="theme-color">, exposes a few tokens as CSS custom
// properties for the cross-cutting bits inline styles cannot reach (scrollbars,
// selection, focus rings, the canvas), and mirrors the choice to localStorage so
// the inline boot script in index.html can paint the right surface before Vue
// mounts (no flash on reload).

import { THEMES, type ThemeKey, type ThemeSetting } from './index'
import { accentGlow, accentGradient, surfaceTint } from '@/utils/gradient'
import { statusTokens } from './status'
import { plScaleTokens } from './plScale'

export const LS_THEME_ID = 'aureon:themeId'
export const LS_THEME_SETTING = 'aureon:themeSetting'
export const LS_THEME_BG = 'aureon:themeBg'

export function applyThemeToDom(key: ThemeKey, setting: ThemeSetting): void {
  if (typeof document === 'undefined') return
  const t = THEMES[key]
  const root = document.documentElement
  root.dataset.theme = key
  root.style.setProperty('--theme-accent', t.accent)
  root.style.setProperty('--theme-surface', t.bgSolid)
  root.style.setProperty('--theme-text', t.text)
  root.style.setProperty('--theme-dim', t.dim)
  root.style.setProperty('--theme-border', t.border)
  root.style.setProperty('--theme-on-accent', t.onAccent)
  // The semantic names section 24b works in. Aliases rather than a second set
  // of values: --theme-* was named after where the colour came from, and these
  // are named after what the colour is for, which is what a component needs to
  // know when it is deciding whether text on a tint will read.
  root.style.setProperty('--text-primary', t.text)
  root.style.setProperty('--text-muted', t.dim)
  // Between primary and muted (section 26c). A label in a stat pair is not
  // decoration — it is the half that says what the number means — so muting it
  // to the level used for timestamps is what made those strips read as one grey
  // line. Derived by mixing the theme's own text toward its muted value, so it
  // sits above the muted floor on every theme without a nineteenth hand-pick.
  root.style.setProperty('--text-secondary', `color-mix(in oklch, ${t.text} 72%, ${t.dim})`)
  root.style.setProperty('--bg-base', t.bgSolid)
  root.style.setProperty('--bg-elevated', t.card)
  root.style.setProperty('--border-subtle', t.border)
  // The border two interactive surfaces meet along, and the hover state of a
  // control. Derived from the theme's own border so no theme has to define it.
  root.style.setProperty('--border-strong', `color-mix(in oklch, ${t.border} 55%, ${t.text})`)
  // Glass tokens (section 16a). Every ui/ component reads these rather than
  // writing an rgba of its own, so a theme change is a token change and the
  // "no hardcoded rgba" rule has somewhere to point.
  root.style.setProperty('--glass-bg', t.glass)
  root.style.setProperty('--glass-card', t.card)
  root.style.setProperty('--glass-border', t.border)
  // A theme that drops the blur (contrast, mono) sets it to 0 rather than being
  // special-cased at every call site.
  root.style.setProperty('--glass-blur', t.noGlass ? '0px' : '30px')
  root.style.setProperty('--glass-shadow', t.shadow)
  // The opaque stand-in used where backdrop-filter is unsupported, and by the
  // @supports fallback in style.css.
  root.style.setProperty('--glass-solid', t.bgSolid)
  root.style.setProperty('--theme-input', t.input)
  // The vibrant pass (section 16d): an accent gradient pair, a surface tint and
  // a focus glow, all derived from the theme's own accent so every theme gets
  // them and none has to define them. Mono returns flat values, so the same
  // components render correctly with no chroma at all.
  const gradient = accentGradient(t)
  root.style.setProperty('--accent-grad-from', gradient.from)
  root.style.setProperty('--accent-grad-to', gradient.to)
  root.style.setProperty('--surface-tint', surfaceTint(t))
  root.style.setProperty('--accent-glow', accentGlow(t))
  // Danger, success and warning (section 25b). Derived rather than declared,
  // so a twentieth theme gets them without remembering to.
  for (const [name, value] of Object.entries(statusTokens(t))) {
    root.style.setProperty(name, value)
  }
  // The profit/loss ramp (section 28b): five opaque steps each side, each one
  // measured to carry the theme's text at 4.5:1, plus the flat step. Set here
  // rather than in the trade calendar because it is a property of the theme —
  // and because a token set from one place is a token a second surface can use
  // without rebuilding the maths.
  for (const [name, value] of Object.entries(plScaleTokens(t))) {
    root.style.setProperty(name, value)
  }
  // A theme may define its own focus ring instead of the accent glow
  // (section 21d). Removed rather than blanked when it does not, so the
  // stylesheet's own default is what applies.
  if (t.focusRing) root.style.setProperty('--focus-ring', t.focusRing)
  else root.style.removeProperty('--focus-ring')

  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', t.bgSolid)

  try {
    localStorage.setItem(LS_THEME_ID, key)
    localStorage.setItem(LS_THEME_SETTING, setting)
    localStorage.setItem(LS_THEME_BG, t.bgSolid)
  } catch {
    /* private mode / quota — the Firestore copy still syncs */
  }
}
