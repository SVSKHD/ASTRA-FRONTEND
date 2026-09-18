// The tag filter (Todos, Tasks, Goals).
import { describe, expect, it } from 'vitest'
import {
  UNTAGGED,
  emptyTagMessage,
  matchesTagFilter,
  matchesTagQuery,
  tagFilterOptions,
  tagQuerySuggestions,
} from '@/utils/tagFilter'

describe('matchesTagFilter', () => {
  it('lets everything through with no filter', () => {
    expect(matchesTagFilter([], '')).toBe(true)
    expect(matchesTagFilter(['Work'], '')).toBe(true)
  })

  it('matches a tag anywhere in the row, case-insensitively', () => {
    // The row itself is untagged; a subtask two levels down carries the tag.
    expect(matchesTagFilter(['', '', 'Trading journey'], 'trading journey')).toBe(true)
    expect(matchesTagFilter(['Work'], 'Home')).toBe(false)
  })

  it('reads a subtree of blanks as untagged', () => {
    expect(matchesTagFilter(['', ''], UNTAGGED)).toBe(true)
    expect(matchesTagFilter([], UNTAGGED)).toBe(true)
    expect(matchesTagFilter(['', 'Work'], UNTAGGED)).toBe(false)
  })
})

describe('tagFilterOptions', () => {
  it('offers only tags in use, in vocabulary order, counted per row', () => {
    const options = tagFilterOptions(
      ['Home', 'Work', 'Unused'],
      [
        // One row with the tag on itself and two subtasks still counts once.
        ['Work', 'Work', 'work'],
        ['Home'],
        ['Work'],
      ],
    )
    expect(options).toEqual([
      { value: 'Home', label: 'Home · 1' },
      { value: 'Work', label: 'Work · 2' },
    ])
  })

  it('uses the vocabulary spelling for a differently-cased tag', () => {
    expect(tagFilterOptions(['Work'], [['work']])).toEqual([{ value: 'Work', label: 'Work · 1' }])
  })

  it('puts a tag the vocabulary has lost after the rest, alphabetically', () => {
    const options = tagFilterOptions(['Work'], [['Work'], ['zeta'], ['Alpha']])
    expect(options.map((o) => o.value)).toEqual(['Work', 'Alpha', 'zeta'])
  })

  it('offers Untagged only when some row has no tag', () => {
    expect(tagFilterOptions(['Work'], [['Work']]).some((o) => o.value === UNTAGGED)).toBe(false)
    const options = tagFilterOptions(['Work'], [['Work'], ['', ''], []])
    expect(options.at(-1)).toEqual({ value: UNTAGGED, label: 'Untagged · 2' })
  })

  it('keeps the current selection offered when nothing carries it any more', () => {
    // Otherwise the select would show its placeholder while the list is filtered.
    expect(tagFilterOptions(['Work'], [['Work']], 'Gone')).toContainEqual({
      value: 'Gone',
      label: 'Gone · 0',
    })
    expect(tagFilterOptions([], [['Work']], UNTAGGED).at(-1)).toEqual({
      value: UNTAGGED,
      label: 'Untagged · 0',
    })
  })
})

describe('matchesTagQuery', () => {
  it('lets everything through with a blank query', () => {
    expect(matchesTagQuery([], '  ')).toBe(true)
  })

  it('substring-matches any tag in the row, case-insensitively', () => {
    expect(matchesTagQuery(['', 'Trading journey'], 'TRAD')).toBe(true)
    expect(matchesTagQuery(['Work'], 'home')).toBe(false)
    expect(matchesTagQuery(['', ''], 'a')).toBe(false)
  })

  it('matches exactly when the query names a tag in use', () => {
    expect(matchesTagQuery(['Workout'], 'work', ['Work', 'Workout'])).toBe(false)
    expect(matchesTagQuery(['work'], 'Work', ['Work', 'Workout'])).toBe(true)
    expect(matchesTagQuery(['Workout'], 'work', ['Workout'])).toBe(true)
  })
})

describe('tagQuerySuggestions', () => {
  const groups = [['Work'], ['Workout'], ['Home'], ['']]
  it('offers every tag in use for an empty query, never Untagged', () => {
    expect(tagQuerySuggestions([], groups, '').map((o) => o.value)).toEqual([
      'Home',
      'Work',
      'Workout',
    ])
  })

  it('narrows by substring, and goes quiet on an exact tag', () => {
    expect(tagQuerySuggestions([], groups, 'ork').map((o) => o.value)).toEqual(['Work', 'Workout'])
    expect(tagQuerySuggestions([], groups, 'home')).toEqual([])
  })
})

describe('emptyTagMessage', () => {
  it('names the tag, or says untagged', () => {
    expect(emptyTagMessage('Work', 'todos')).toBe('No todos tagged “Work”.')
    expect(emptyTagMessage(UNTAGGED, 'tasks')).toBe('No untagged tasks.')
  })
})
