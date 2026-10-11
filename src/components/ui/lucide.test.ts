import { describe, expect, it } from 'vitest'
import { ICONS, ICON_SYMBOLS, isIconName, registerIcon } from './icons'
import { LUCIDE_NAMES } from './lucideNames.generated'

describe('full Lucide library', () => {
  it('recognizes every official name and rejects unknown names', () => {
    expect(LUCIDE_NAMES.length).toBe(2141)
    expect(LUCIDE_NAMES.every(isIconName)).toBe(true)
    expect(isIconName('not-an-icon')).toBe(false)
  })
  it('registers requested symbols without mounting the entire library', async () => {
    const before = Object.keys(ICON_SYMBOLS).length
    await Promise.all([registerIcon('air-vent'), registerIcon('air-vent')])
    expect(ICON_SYMBOLS['air-vent']).toContain('<path')
    expect(Object.keys(ICON_SYMBOLS).length).toBe(before + 1)
  })
  it('uses official arrow geometry', async () => {
    const { LUCIDE_ICONS } = await import('./lucide.generated')
    const compact = (svg: string) => svg.replace(/>\s+</g, '><')
    expect(compact(ICONS['arrow-up'])).toBe(compact(LUCIDE_ICONS['arrow-up']))
    expect(compact(ICONS['arrow-down'])).toBe(compact(LUCIDE_ICONS['arrow-down']))
  })
})
