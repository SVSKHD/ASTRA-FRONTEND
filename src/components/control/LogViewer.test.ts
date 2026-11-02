import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LogViewer from './LogViewer.vue'

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n')

describe('the log viewer', () => {
  it('renders text/plain as monospace lines in its own box', () => {
    const w = mount(LogViewer, { props: { text: 'Run npm test\n✓ 12 passed\nError: boom' } })
    const box = w.find('[role="log"]')
    expect(box.classes()).toContain('cc-mono')
    expect(box.classes()).toContain('cc-box')
    expect(w.findAll('.cc-line').map((l) => l.text())).toEqual([
      'Run npm test',
      '✓ 12 passed',
      'Error: boom',
    ])
  })

  it('shows the tail of a long log and says what it left out', () => {
    const w = mount(LogViewer, { props: { text: lines(5000), max: 100 } })
    const rows = w.findAll('.cc-line')
    expect(rows).toHaveLength(100)
    expect(rows.at(-1)!.text()).toBe('line 5000')
    expect(w.text()).toContain('Showing the last 100 lines; 4,900 earlier lines are left out.')
  })

  it('shows the head of a file', () => {
    const w = mount(LogViewer, { props: { text: lines(50), max: 10, mode: 'head' } })
    expect(w.findAll('.cc-line').at(0)!.text()).toBe('line 1')
    expect(w.text()).toContain('Showing the first 10 lines')
  })

  it('says when the log is empty', () => {
    expect(mount(LogViewer, { props: { text: '' } }).text()).toContain('The log is empty.')
  })
})
