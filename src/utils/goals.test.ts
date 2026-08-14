import { describe, it, expect } from 'vitest'
import {
  parseImportUrl,
  parseItemMetadata,
  deSlugTitle,
  MAX_IMPORT_ITEMS,
  parseGoalsJson,
  exportGoalsJson,
  normalizePoint,
} from './goals'

const SAMPLE = {
  project: 'learningandgoals',
  goals: [
    {
      title: 'Ship the trading bot',
      description: 'optional',
      timeline: { start: '2026-08-15', target: '2026-11-30' },
      points: [
        {
          text: 'Finish backtest harness',
          estimateMins: 120,
          dueAt: '2026-08-22',
          done: false,
          tags: ['dev'],
        },
        { text: 'Paper trade 2 weeks', timeline: { start: '2026-09-01', target: '2026-09-15' } },
        'Go live with 0.01 lot',
      ],
      color: '#4ade80',
      status: 'active',
    },
  ],
}

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

describe('parseGoalsJson', () => {
  it('parses the canonical document: one goal, three points, per-point timeline', () => {
    const doc = parseGoalsJson(SAMPLE)
    expect(doc.project).toBe('learningandgoals')
    expect(doc.goals).toHaveLength(1)
    const g = doc.goals[0]
    expect(g.title).toBe('Ship the trading bot')
    expect(g.startAt).toBe('2026-08-15')
    expect(g.targetAt).toBe('2026-11-30')
    expect(g.color).toBe('#4ade80')
    expect(g.points).toHaveLength(3)
    // Point 2 carries its own timeline; a bare string became { text }.
    expect(g.points[1].startAt).toBe('2026-09-01')
    expect(g.points[1].dueAt).toBe('2026-09-15')
    expect(g.points[2].text).toBe('Go live with 0.01 lot')
    expect(g.error).toBeUndefined()
  })
  it('accepts a JSON string as well as an object', () => {
    const doc = parseGoalsJson(JSON.stringify(SAMPLE))
    expect(doc.goals[0].points).toHaveLength(3)
  })
  it('normalises a bare-string point and a bare-string date timeline', () => {
    expect(normalizePoint('just text').text).toBe('just text')
    expect(normalizePoint({ text: 'x', timeline: '2026-01-02' }).dueAt).toBe('2026-01-02')
  })
  it('parses inline shorthand out of a point text and strips it', () => {
    const p = normalizePoint('revise @2026-09-01 ~2h #paper')
    expect(p.text).toBe('revise')
    expect(p.dueAt).toBe('2026-09-01')
    expect(p.estimateMins).toBe(120)
    expect(p.tags).toEqual(['paper'])
  })
  it('flags a missing title as an error without failing other goals', () => {
    const doc = parseGoalsJson({ goals: [{ points: ['a'] }, { title: 'Ok', points: ['b'] }] })
    expect(doc.goals[0].error).toBe('Missing title')
    expect(doc.goals[1].error).toBeUndefined()
  })
  it('ignores unknown keys and never throws on malformed JSON', () => {
    expect(parseGoalsJson({ goals: [{ title: 't', mystery: 1, points: [] }] }).goals[0].title).toBe(
      't',
    )
    expect(parseGoalsJson('{ not json').parseError).toBeTruthy()
  })
})

describe('exportGoalsJson round-trip', () => {
  it('re-parses to an identical document', () => {
    const first = parseGoalsJson(SAMPLE)
    const json = exportGoalsJson(first.project, first.goals, '2026-08-14T00:00:00Z')
    const second = parseGoalsJson(json)
    expect(second.goals).toEqual(first.goals)
    expect(second.project).toBe(first.project)
  })
  it('includes version, exportedAt and sourceProject', () => {
    const json = JSON.parse(exportGoalsJson('proj', [], '2026-08-14T00:00:00Z'))
    expect(json.version).toBe(1)
    expect(json.exportedAt).toBe('2026-08-14T00:00:00Z')
    expect(json.sourceProject).toBe('proj')
  })
})
