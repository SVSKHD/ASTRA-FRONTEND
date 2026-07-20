import { describe, expect, it } from 'vitest'
import {
  DARK_THEME_KEYS,
  LIGHT_THEME_KEYS,
  THEMES,
  computeAutoTheme,
  isThemeSetting,
  type ThemeKey,
} from '@/themes'

describe('THEMES', () => {
  it('groups every key as exactly one of light or dark', () => {
    const keys = Object.keys(THEMES) as ThemeKey[]
    expect([...LIGHT_THEME_KEYS, ...DARK_THEME_KEYS].sort()).toEqual(keys.sort())
    for (const key of LIGHT_THEME_KEYS) expect(THEMES[key].group).toBe('light')
    for (const key of DARK_THEME_KEYS) expect(THEMES[key].group).toBe('dark')
  })

  it('gives every theme the tokens the ui reads', () => {
    for (const [key, theme] of Object.entries(THEMES)) {
      expect(theme.label, key).toBeTruthy()
      expect(theme.pageBg, key).toBeTruthy()
      expect(theme.accent, key).toBeTruthy()
      expect(theme.celestial, key).toBeTruthy()
    }
  })
})

describe('computeAutoTheme', () => {
  it('maps each hour band to its theme', () => {
    expect(computeAutoTheme(6)).toBe('dawn')
    expect(computeAutoTheme(12)).toBe('daylight')
    expect(computeAutoTheme(18)).toBe('nebulaRose')
    expect(computeAutoTheme(23)).toBe('deepSpace')
    expect(computeAutoTheme(2)).toBe('deepSpace')
  })

  it('picks a real theme for every hour of the day', () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(THEMES[computeAutoTheme(hour)], `hour ${hour}`).toBeDefined()
    }
  })

  it('switches exactly at the band boundaries', () => {
    expect(computeAutoTheme(4)).toBe('deepSpace')
    expect(computeAutoTheme(5)).toBe('dawn')
    expect(computeAutoTheme(7)).toBe('dawn')
    expect(computeAutoTheme(8)).toBe('daylight')
    expect(computeAutoTheme(16)).toBe('daylight')
    expect(computeAutoTheme(17)).toBe('nebulaRose')
    expect(computeAutoTheme(19)).toBe('nebulaRose')
    expect(computeAutoTheme(20)).toBe('deepSpace')
  })
})

describe('isThemeSetting', () => {
  it('accepts auto and every real theme key', () => {
    expect(isThemeSetting('auto')).toBe(true)
    for (const key of Object.keys(THEMES)) expect(isThemeSetting(key), key).toBe(true)
  })

  it('rejects anything that would break a THEMES lookup', () => {
    // This guard is what stops a stale value in a user's Firestore document
    // from indexing THEMES with a key that no longer exists.
    expect(isThemeSetting('retiredTheme')).toBe(false)
    expect(isThemeSetting('')).toBe(false)
    expect(isThemeSetting(null)).toBe(false)
    expect(isThemeSetting(undefined)).toBe(false)
    expect(isThemeSetting(42)).toBe(false)
    expect(isThemeSetting({ type: 'daylight' })).toBe(false)
  })

  it('rejects inherited Object properties', () => {
    expect(isThemeSetting('toString')).toBe(false)
    expect(isThemeSetting('constructor')).toBe(false)
  })
})
