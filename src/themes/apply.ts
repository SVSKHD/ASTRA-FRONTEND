// Applies the active theme to the document: sets data-theme, updates the mobile
// browser-chrome <meta name="theme-color">, exposes a few tokens as CSS custom
// properties for the cross-cutting bits inline styles cannot reach (scrollbars,
// selection, focus rings, the canvas), and mirrors the choice to localStorage so
// the inline boot script in index.html can paint the right surface before Vue
// mounts (no flash on reload).

import { THEMES, type ThemeKey, type ThemeSetting } from './index'
import { accentGlow, accentGradient, surfaceTint } from '@/utils/gradient'

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
