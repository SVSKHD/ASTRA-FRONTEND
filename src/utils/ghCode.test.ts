import { describe, expect, it } from 'vitest'
import {
  ancestorsOf,
  buildCodeTree,
  decodeBase64Utf8,
  encodeBase64Utf8,
  extLabel,
  formatBytes,
  languageOf,
  looksBinary,
  parsePatch,
  pullStatus,
  searchPaths,
  type GhTreeEntry,
} from '@/utils/ghCode'

const ENTRIES: GhTreeEntry[] = [
  { path: 'README.md', type: 'blob', sha: '1', size: 120 },
  { path: 'src', type: 'tree', sha: '2' },
  { path: 'src/main.ts', type: 'blob', sha: '3', size: 40 },
  { path: 'src/utils', type: 'tree', sha: '4' },
  { path: 'src/utils/a.ts', type: 'blob', sha: '5', size: 10 },
  { path: 'vendor', type: 'commit', sha: '6' },
  { path: 'App.vue', type: 'blob', sha: '7', size: 99 },
]

describe('the code tree', () => {
  it('nests paths into folders, folders first, then files by name', () => {
    const tree = buildCodeTree(ENTRIES)
    expect(tree.map((n) => n.name)).toEqual(['src', 'App.vue', 'README.md'])
    const src = tree[0]
    expect(src.children.map((n) => n.name)).toEqual(['utils', 'main.ts'])
    expect(src.children[0].children[0]).toMatchObject({ path: 'src/utils/a.ts', size: 10 })
  })

  it('leaves submodules out, and builds folders a listing skipped', () => {
    const tree = buildCodeTree([{ path: 'deep/x/y.ts', type: 'blob', sha: 'a' }])
    expect(tree[0].path).toBe('deep')
    expect(tree[0].children[0].path).toBe('deep/x')
    expect(buildCodeTree(ENTRIES).some((n) => n.name === 'vendor')).toBe(false)
  })

  it('finds files by any part of their path', () => {
    expect(searchPaths(ENTRIES, 'UTILS')).toEqual(['src/utils/a.ts'])
    expect(searchPaths(ENTRIES, '')).toEqual([])
  })

  it('names the folders on the way to a file', () => {
    expect(ancestorsOf('a/b/c.ts')).toEqual(['a', 'a/b'])
    expect(ancestorsOf('c.ts')).toEqual([])
  })
})

describe('languages', () => {
  it('maps extensions to highlight.js names', () => {
    expect(languageOf('src/App.vue')).toBe('xml')
    expect(languageOf('a/b.TS')).toBe('typescript')
    expect(languageOf('Dockerfile')).toBe('dockerfile')
    expect(languageOf('LICENSE')).toBe('')
    expect(extLabel('x/y.json')).toBe('JSON')
    expect(extLabel('.gitignore')).toBe('FILE')
  })
})

describe('base64', () => {
  it('round-trips non-ASCII text, and reads GitHub’s wrapped base64', () => {
    const text = 'naïve — ₹100 ✓\n'
    const b64 = encodeBase64Utf8(text)
    expect(decodeBase64Utf8(b64)).toBe(text)
    const wrapped = b64.replace(/(.{8})/g, '$1\n')
    expect(decodeBase64Utf8(wrapped)).toBe(text)
  })

  it('spots binary content', () => {
    expect(looksBinary('abc\u0000def')).toBe(true)
    expect(looksBinary('plain text')).toBe(false)
  })
})

describe('patches', () => {
  it('numbers each side of a hunk and drops the no-newline note', () => {
    const lines = parsePatch('@@ -3,3 +3,3 @@\n a\n-b\n+B\n c\n\\ No newline at end of file')
    expect(lines.map((l) => [l.kind, l.oldNo, l.newNo, l.text])).toEqual([
      ['hunk', null, null, '@@ -3,3 +3,3 @@'],
      ['ctx', 3, 3, 'a'],
      ['del', 4, null, 'b'],
      ['add', null, 4, 'B'],
      ['ctx', 5, 5, 'c'],
    ])
  })
})

describe('labels', () => {
  it('formats sizes and PR states', () => {
    expect(formatBytes(812)).toBe('812 B')
    expect(formatBytes(4300)).toBe('4.2 KB')
    expect(formatBytes(1.3 * 1024 * 1024)).toBe('1.3 MB')
    expect(pullStatus({ state: 'open', draft: true })).toBe('draft')
    expect(pullStatus({ state: 'closed', merged_at: '2026-01-01' })).toBe('merged')
    expect(pullStatus({ state: 'closed', merged_at: null })).toBe('closed')
  })
})
