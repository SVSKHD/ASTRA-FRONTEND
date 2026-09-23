import { describe, expect, it } from 'vitest'
import { techBadge, topTech } from '@/utils/techBadge'

describe('techBadge', () => {
  it('gives a known language its monogram and GitHub’s colour', () => {
    expect(techBadge('TypeScript')).toEqual({ name: 'TypeScript', symbol: 'TS', color: '#3178c6' })
    expect(techBadge('c#').symbol).toBe('C#')
  })

  it('falls back to two letters and a neutral, never to a random hue', () => {
    // Two letters rather than an initial, because Nim and Nix are both "N".
    expect(techBadge('Nim')).toEqual({ name: 'Nim', symbol: 'NI', color: '#8b949e' })
    expect(techBadge('Befunge').color).toBe('#8b949e')
    // A language the table does know keeps its own colour.
    expect(techBadge('Nix').color).toBe('#7e7eff')
  })
})

describe('topTech', () => {
  it('orders by bytes of code and caps the row', () => {
    const langs = { CSS: 2000, TypeScript: 90000, HTML: 500, Shell: 100 }
    expect(topTech(langs).map((t) => t.name)).toEqual(['TypeScript', 'CSS', 'HTML'])
    expect(topTech(langs, 1).map((t) => t.symbol)).toEqual(['TS'])
  })

  it('reads an empty or unusable body as no technologies', () => {
    expect(topTech({})).toEqual([])
    expect(topTech({ TypeScript: 0 })).toEqual([])
    expect(topTech(null)).toEqual([])
    expect(topTech(['TypeScript'])).toEqual([])
  })
})
