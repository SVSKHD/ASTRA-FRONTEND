// The workspace's prompts quote only what was read from GitHub, say when it was cut,
// find TODO markers by line, and map a GitHub repository to its server clone.
import { describe, expect, it } from 'vitest'
import {
  QUOTE_BUDGET,
  architectureAsk,
  bugsAsk,
  clipText,
  codingRepoFor,
  commitsAsk,
  explainAsk,
  findTodos,
  reviewAsk,
} from './workspace'

describe('prompts', () => {
  it('explains a file with its path and ref, quoting it in full when it fits', () => {
    const a = explainAsk('svskhd/astra', 'dev01', 'src/a.ts', 'export const a = 1')
    expect(a).toMatchObject({ kind: 'explain', title: 'Explain src/a.ts', clipped: false })
    expect(a.prompt).toContain('`src/a.ts` in svskhd/astra@dev01')
    expect(a.prompt).toContain('export const a = 1')
  })

  it('cuts material past one message and says so', () => {
    const big = 'x'.repeat(QUOTE_BUDGET + 500)
    expect(clipText(big).clipped).toBe(true)
    expect(clipText(big).text).toContain('[cut: 500 more characters]')
    expect(explainAsk('r', 'm', 'big.txt', big).clipped).toBe(true)
  })

  it('lists the markers already found when asking for bugs', () => {
    const a = bugsAsk('r', 'main', 'a.py', 'x = 1  # TODO: validate', [
      { line: 1, tag: 'TODO', text: 'validate' },
    ])
    expect(a.prompt).toContain('- line 1: TODO validate')
  })

  it('maps architecture from the file list and README', () => {
    const a = architectureAsk('r', 'main', ['src/main.ts', 'README.md'], '# App')
    expect(a.prompt).toContain('Files (2)')
    expect(a.prompt).toContain('README:')
    expect(architectureAsk('r', 'main', ['a'], null).prompt).not.toContain('README:')
  })

  it('summarizes commits by short sha, day and author', () => {
    const a = commitsAsk('r', 'dev01', [
      { sha: 'abcdef1234', message: 'Fix login', author: 'koushik', date: '2026-11-04T10:00:00Z' },
    ])
    expect(a.title).toBe('Summary of 1 commits on dev01')
    expect(a.prompt).toContain('abcdef1 2026-11-04 koushik: Fix login')
  })

  it('reviews a pull request from its patches', () => {
    const a = reviewAsk(
      'r',
      { number: 9, title: 'Add x', body: null, head: 'feat/x', base: 'dev01' },
      [
        {
          filename: 'a.ts',
          status: 'modified',
          additions: 2,
          deletions: 1,
          patch: '@@ -1 +1 @@\n-a\n+b',
        },
        { filename: 'logo.png', status: 'added' },
      ],
    )
    expect(a.prompt).toContain('#9 "Add x" on r (feat/x → dev01)')
    expect(a.prompt).toContain('--- a.ts (modified, +2 -1)')
    expect(a.prompt).toContain('(no patch: binary or too large)')
    expect(a.prompt).toContain('(none)')
  })
})

describe('findTodos', () => {
  it('finds markers in any comment style, with line numbers', () => {
    const text = [
      'const a = 1 // TODO: name this',
      '# FIXME(koushik) breaks on empty input',
      '/* HACK: remove after migration */',
      '<!-- XXX layout -->',
      'const todo = "TODO in a string is not a comment"',
    ].join('\n')
    expect(findTodos(text)).toEqual([
      { line: 1, tag: 'TODO', text: 'name this' },
      { line: 2, tag: 'FIXME', text: 'koushik) breaks on empty input' },
      { line: 3, tag: 'HACK', text: 'remove after migration' },
      { line: 4, tag: 'XXX', text: 'layout' },
    ])
  })
})

describe('codingRepoFor', () => {
  it('finds the server clone for a GitHub repository, case-insensitively', () => {
    const states = [
      {
        repo: 'SVSKHD/ASTRA-FRONTEND',
        coding_repo: 'astra',
        cloned: true,
        default_branch: 'dev01',
      },
      { repo: 'svskhd/other', coding_repo: null, cloned: false, default_branch: null },
    ]
    expect(codingRepoFor('svskhd/astra-frontend', states)).toBe('astra')
    expect(codingRepoFor('svskhd/other', states)).toBeNull()
    expect(codingRepoFor('svskhd/missing', states)).toBeNull()
  })
})
