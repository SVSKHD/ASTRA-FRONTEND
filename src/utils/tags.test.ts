import { describe, expect, it } from 'vitest'
import { hasTag, normalizeTag, sanitizeTags, tagColor, withTag, withoutTag } from './tags'

describe('normalizeTag', () => {
  it('trims and collapses inner whitespace', () => {
    expect(normalizeTag('  side   project ')).toBe('side project')
  })

  it('caps runaway input', () => {
    expect(normalizeTag('x'.repeat(80))).toHaveLength(32)
  })
})

describe('withTag', () => {
  it('appends a new tag', () => {
    expect(withTag(['Office'], 'Home')).toEqual(['Office', 'Home'])
  })

  it('treats case as the same tag and keeps the stored spelling', () => {
    const list = ['Office']
    expect(withTag(list, 'office')).toBe(list)
  })

  it('ignores an empty tag', () => {
    const list = ['Office']
    expect(withTag(list, '   ')).toBe(list)
  })
})

describe('withoutTag', () => {
  it('removes case-insensitively', () => {
    expect(withoutTag(['Office', 'Home'], 'OFFICE')).toEqual(['Home'])
  })
})

describe('hasTag', () => {
  it('matches ignoring case', () => {
    expect(hasTag(['Office'], 'office')).toBe(true)
    expect(hasTag(['Office'], 'offsite')).toBe(false)
  })
})

describe('sanitizeTags', () => {
  it('drops non-strings, blanks and duplicates', () => {
    expect(sanitizeTags(['Office', '', 'office', 3, null, ' Home '])).toEqual(['Office', 'Home'])
  })

  it('returns an empty list for anything that is not an array', () => {
    expect(sanitizeTags(undefined)).toEqual([])
  })
})

describe('tagColor', () => {
  it('is stable for a tag regardless of case', () => {
    expect(tagColor('Office', true)).toBe(tagColor('office', true))
  })

  it('differs between tags', () => {
    expect(tagColor('Office', true)).not.toBe(tagColor('Home', true))
  })
})
