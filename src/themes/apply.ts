// Applies the active theme to the document: sets data-theme, updates the mobile
// browser-chrome <meta name="theme-color">, exposes a few tokens as CSS custom
// properties for the cross-cutting bits inline styles cannot reach (scrollbars,
// selection, focus rings, the canvas), and mirrors the choice to localStorage so
// the inline boot script in index.html can paint the right surface before Vue
// mounts (no flash on reload).

import { THEMES, type ThemeKey, type ThemeSetting } from './index'

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

// The theme setting persisted to localStorage (mirrors the Firestore value), read
// synchronously so the app can honour it before the Firestore doc arrives.
export function readStoredSetting(): ThemeSetting | null {
  try {
    const v = localStorage.getItem(LS_THEME_SETTING)
    return v === 'auto' || (v && Object.hasOwn(THEMES, v)) ? (v as ThemeSetting) : null
  } catch {
    return null
  }
}
