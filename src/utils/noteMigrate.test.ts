import { describe, expect, it } from 'vitest'
import { toMarkdown } from '@/utils/noteMigrate'

describe('converting a legacy HTML note', () => {
  it('leaves a markdown note exactly as it is', async () => {
    const source = '# Title\n\n- one\n- two\n\ntext with **bold**'
    expect(await toMarkdown(source)).toBe(source)
  })

  it('leaves an empty note empty', async () => {
    expect(await toMarkdown('')).toBe('')
  })

  it('converts headings, lists and emphasis the old editor wrote', async () => {
    const html =
      '<h1>Title</h1><p>Some <strong>bold</strong> and <em>italic</em>.</p><ul><li>one</li><li>two</li></ul>'
    const md = await toMarkdown(html)
    expect(md).toContain('# Title')
    expect(md).toContain('**bold**')
    expect(md).toContain('_italic_')
    expect(md).toContain('- one')
    expect(md).toContain('- two')
    expect(md).not.toContain('<')
  })

  it('turns the old checkbox inputs into task-list syntax', async () => {
    const html =
      '<ul><li><input type="checkbox">open</li><li><input type="checkbox" checked>closed</li></ul>'
    const md = await toMarkdown(html)
    expect(md).toContain('- [ ] open')
    expect(md).toContain('- [x] closed')
    expect(md).not.toContain('<input')
  })

  it('keeps links and code', async () => {
    const html = '<p>see <a href="https://x.test">docs</a> and <code>npm test</code></p>'
    const md = await toMarkdown(html)
    expect(md).toContain('[docs](https://x.test)')
    expect(md).toContain('`npm test`')
  })

  it('converts a quote and a rule', async () => {
    const md = await toMarkdown('<blockquote><p>said</p></blockquote><hr>')
    expect(md).toContain('> said')
    expect(md).toContain('---')
  })

  it('normalises the result the same way a paste is normalised', async () => {
    const md = await toMarkdown('<p>a&nbsp;b</p>')
    expect(md).toBe('a b')
  })
})
