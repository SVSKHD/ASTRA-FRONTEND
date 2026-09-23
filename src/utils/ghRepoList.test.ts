import { describe, expect, it } from 'vitest'
import { filterRepoRows, isTracked, parseRepoRows, withTracked } from '@/utils/ghRepoList'

const RAW = [
  {
    id: 2,
    full_name: 'SVSKHD/ASTRA-FRONTEND',
    private: false,
    language: 'TypeScript',
    description: 'the app',
    pushed_at: '2026-09-18T02:01:27Z',
    html_url: 'https://github.com/SVSKHD/ASTRA-FRONTEND',
  },
  {
    id: 1,
    full_name: 'SVSKHD/AO8',
    private: true,
    language: null,
    pushed_at: '2026-09-20T16:28:24Z',
  },
]

describe('parseRepoRows', () => {
  it('shapes GitHub’s array, newest push first', () => {
    const rows = parseRepoRows(RAW)
    expect(rows.map((r) => r.fullName)).toEqual(['SVSKHD/AO8', 'SVSKHD/ASTRA-FRONTEND'])
    expect(rows[0].private).toBe(true)
    // A repo with no language is still a row; the field is simply empty.
    expect(rows[0].language).toBe('')
    // No html_url in the payload: one is derived rather than left blank.
    expect(rows[0].url).toBe('https://github.com/SVSKHD/AO8')
    expect(rows[1].pushedAt).toBe(Date.parse('2026-09-18T02:01:27Z'))
  })

  it('drops anything that is not a repository', () => {
    expect(parseRepoRows([null, 'x', {}, { full_name: '' }])).toEqual([])
    expect(parseRepoRows({ message: 'Bad credentials' })).toEqual([])
    expect(parseRepoRows(null)).toEqual([])
  })
})

describe('filterRepoRows', () => {
  const rows = parseRepoRows(RAW)
  it('matches the name case-insensitively', () => {
    expect(filterRepoRows(rows, 'astra').map((r) => r.fullName)).toEqual(['SVSKHD/ASTRA-FRONTEND'])
    expect(filterRepoRows(rows, '  ')).toHaveLength(2)
    expect(filterRepoRows(rows, 'nope')).toEqual([])
  })
})

describe('tracking', () => {
  it('compares lower-cased, which is what the webhook matches on', () => {
    expect(isTracked(['svskhd/ao8'], 'SVSKHD/AO8')).toBe(true)
    expect(isTracked([], 'SVSKHD/AO8')).toBe(false)
  })

  it('adds and removes without duplicating', () => {
    expect(withTracked([], 'SVSKHD/AO8', true)).toEqual(['svskhd/ao8'])
    expect(withTracked(['svskhd/ao8'], 'SVSKHD/AO8', true)).toEqual(['svskhd/ao8'])
    expect(withTracked(['svskhd/ao8', 'a/b'], 'SVSKHD/AO8', false)).toEqual(['a/b'])
  })
})
