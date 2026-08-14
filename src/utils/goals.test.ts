import { describe, it, expect } from 'vitest'
import { parseImportUrl, parseItemMetadata, deSlugTitle, MAX_IMPORT_ITEMS } from './goals'

describe('deSlugTitle', () => {
  it('breaks a concatenated slug on "and" and title-cases with small words lower', () => {
    expect(deSlugTitle('learningandgoals')).toBe('Learning and Goals')
  })
  it('splits on real separators', () => {
    expect(deSlugTitle('my-project')).toBe('My Project')
    expect(deSlugTitle('q3_growth_plan')).toBe('Q3 Growth Plan')
  })
})

describe('parseItemMetadata', () => {
  it('extracts an hour estimate and strips it', () => {
    const r = parseItemMetadata('build bot ~2h')
    expect(r.text).toBe('build bot')
    expect(r.estimateMins).toBe(120)
    expect(r.dueAt).toBeNull()
  })
  it('extracts a minute estimate', () => {
    expect(parseItemMetadata('review ~45m').estimateMins).toBe(45)
  })
  it('extracts a due date and strips it', () => {
    const r = parseItemMetadata('revise @2026-09-01')
    expect(r.text).toBe('revise')
    expect(r.dueAt).toBe('2026-09-01')
  })
  it('extracts tags and strips them', () => {
    const r = parseItemMetadata('read papers #ml #ai')
    expect(r.text).toBe('read papers')
    expect(r.tags).toEqual(['ml', 'ai'])
  })
  it('handles all three at once and collapses whitespace', () => {
    const r = parseItemMetadata('  ship   v1  ~3h @2026-10-02 #release ')
    expect(r.text).toBe('ship v1')
    expect(r.estimateMins).toBe(180)
    expect(r.dueAt).toBe('2026-10-02')
    expect(r.tags).toEqual(['release'])
  })
})

describe('parseImportUrl — acceptance 30', () => {
  it('parses the legacy inline form with metadata stripped', () => {
    const r = parseImportUrl(
      'spasta.online/?project=learningandgoals=read papers|build bot ~2h|revise @2026-09-01',
    )
    expect(r.projectSlug).toBe('learningandgoals')
    expect(r.goalTitle).toBe('Learning and Goals')
    expect(r.items).toHaveLength(3)
    expect(r.items[0]).toMatchObject({ text: 'read papers', estimateMins: null, dueAt: null })
    expect(r.items[1]).toMatchObject({ text: 'build bot', estimateMins: 120 })
    expect(r.items[2]).toMatchObject({ text: 'revise', dueAt: '2026-09-01' })
  })
})

describe('parseImportUrl — item list forms', () => {
  it('parses a JSON array in the goals param', () => {
    const r = parseImportUrl('spasta.online/?project=alpha&goals=["a","b","c"]')
    expect(r.projectSlug).toBe('alpha')
    expect(r.items.map((i) => i.text)).toEqual(['a', 'b', 'c'])
  })
  it('splits on | first', () => {
    const r = parseImportUrl('?project=p&goals=a|b|c')
    expect(r.items.map((i) => i.text)).toEqual(['a', 'b', 'c'])
  })
  it('falls back to ; then newline then ,', () => {
    expect(parseImportUrl('?project=p&goals=a;b;c').items.map((i) => i.text)).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(parseImportUrl('?project=p&goals=a\\nb\\nc').items.map((i) => i.text)).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(parseImportUrl('?project=p&goals=a,b,c').items.map((i) => i.text)).toEqual([
      'a',
      'b',
      'c',
    ])
  })
  it('prefers | over , when both present', () => {
    const r = parseImportUrl('?project=p&goals=a, x|b|c')
    expect(r.items.map((i) => i.text)).toEqual(['a, x', 'b', 'c'])
  })
  it('de-duplicates case-insensitively and drops empties', () => {
    const r = parseImportUrl('?project=p&goals=Read|read|  |READ|write')
    expect(r.items.map((i) => i.text)).toEqual(['Read', 'write'])
  })
  it('url-decodes encoded payloads', () => {
    const r = parseImportUrl('?project=p&goals=read%20papers%7Cwrite')
    expect(r.items.map((i) => i.text)).toEqual(['read papers', 'write'])
  })
})

describe('parseImportUrl — edge cases', () => {
  it('does not mistake "goals" inside the project slug for the goals param', () => {
    const r = parseImportUrl('?project=learningandgoals=a|b')
    expect(r.projectSlug).toBe('learningandgoals')
    expect(r.items.map((i) => i.text)).toEqual(['a', 'b'])
  })
  it('carries the original url through for traceability', () => {
    const url = '?project=p&goals=a|b'
    expect(parseImportUrl(url).sourceUrl).toBe(url)
  })
  it('flags going over the 200-item cap', () => {
    const many = Array.from({ length: MAX_IMPORT_ITEMS + 5 }, (_, i) => `item${i}`).join('|')
    const r = parseImportUrl(`?project=p&goals=${many}`)
    expect(r.overCap).toBe(true)
    expect(r.items).toHaveLength(MAX_IMPORT_ITEMS)
  })
  it('handles a project with no items', () => {
    const r = parseImportUrl('?project=solo')
    expect(r.projectSlug).toBe('solo')
    expect(r.items).toEqual([])
  })
})
