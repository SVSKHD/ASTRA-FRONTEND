import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DiffViewer from './DiffViewer.vue'
import { parseDiff } from '@/control/diff'

const big = (n: number) =>
  [
    'diff --git a/f b/f',
    '@@ -1,1 +1,1 @@',
    ...Array.from({ length: n }, (_, i) => `+line ${i}`),
  ].join('\n')

describe('the diff viewer', () => {
  it('types each line', () => {
    const p = parseDiff(
      'diff --git a/x b/x\nindex 1..2\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n c\n',
    )
    expect(p.lines.map((l) => l.kind)).toEqual([
      'file',
      'meta',
      'file',
      'file',
      'hunk',
      'del',
      'add',
      'ctx',
    ])
    expect(p.capped).toBe(false)
  })

  it('caps a huge diff and says how much it left out', () => {
    const w = mount(DiffViewer, { props: { text: big(4998) } })
    expect(w.findAll('.cc-diff__line')).toHaveLength(2000)
    expect(w.text()).toContain('Showing the first 2,000 of 5,000 lines')
  })

  it('honours a smaller cap and the server truncation flag', () => {
    const w = mount(DiffViewer, { props: { text: big(50), max: 10, truncated: true } })
    expect(w.findAll('.cc-diff__line')).toHaveLength(10)
    expect(w.text()).toContain('The server cut this diff')
  })

  it('says when the diff is empty', () => {
    expect(mount(DiffViewer, { props: { text: '' } }).text()).toContain('The diff is empty.')
  })
})
