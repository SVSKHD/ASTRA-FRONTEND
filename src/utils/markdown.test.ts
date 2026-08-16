import { describe, expect, it } from 'vitest'
import { escapeHtml, markdownExcerpt, renderMarkdown, safeUrl } from './markdown'

describe('escapeHtml', () => {
  it('escapes every character that could open a tag or an attribute', () => {
    expect(escapeHtml(`<img src="x" onerror='y'>&`)).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;',
    )
  })
})

describe('safeUrl', () => {
  it('accepts http, https and mailto', () => {
    expect(safeUrl('https://example.test/a?b=1')).toBe('https://example.test/a?b=1')
    expect(safeUrl('http://example.test')).toBe('http://example.test')
    expect(safeUrl('mailto:a@b.test')).toBe('mailto:a@b.test')
  })

  it('rejects script-bearing and protocol-relative URLs', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('data:text/html,<script>')).toBeNull()
    expect(safeUrl('//evil.test')).toBeNull()
    expect(safeUrl('')).toBeNull()
  })
})

describe('renderMarkdown — HTML is never executed', () => {
  it('renders raw HTML in a body as visible text', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('neutralises an img/onerror payload', () => {
    expect(renderMarkdown('<img src=x onerror=alert(1)>')).not.toContain('<img')
  })

  it('keeps a javascript: link as literal text', () => {
    const html = renderMarkdown('[click](javascript:alert(1))')
    expect(html).not.toContain('<a ')
    expect(html).toContain('[click](javascript:alert(1))')
  })

  it('renders a safe link with noopener and a new tab', () => {
    const html = renderMarkdown('[docs](https://example.test/x)')
    expect(html).toContain('href="https://example.test/x"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
  })
})

describe('renderMarkdown — block structure', () => {
  it('renders headings two levels down', () => {
    expect(renderMarkdown('# Title')).toBe('<h3>Title</h3>')
    expect(renderMarkdown('### Deeper')).toBe('<h5>Deeper</h5>')
  })

  it('renders bullet and numbered lists', () => {
    expect(renderMarkdown('- one\n- two')).toBe('<ul>\n<li>one</li>\n<li>two</li>\n</ul>')
    expect(renderMarkdown('1. one\n2. two')).toBe('<ol>\n<li>one</li>\n<li>two</li>\n</ol>')
  })

  it('renders task list items as glyphs, not inputs', () => {
    const html = renderMarkdown('- [ ] todo\n- [x] done')
    expect(html).toContain('☐ todo')
    expect(html).toContain('☑ done')
    expect(html).not.toContain('<input')
  })

  it('renders fenced code with its contents escaped', () => {
    const html = renderMarkdown('```\n<b>x</b>\n```')
    expect(html).toBe('<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>')
  })

  it('closes an unterminated fence rather than dropping the body', () => {
    expect(renderMarkdown('```\nstill code')).toContain('<pre><code>still code</code></pre>')
  })

  it('renders blockquotes and horizontal rules', () => {
    expect(renderMarkdown('> quoted')).toBe('<blockquote>quoted</blockquote>')
    expect(renderMarkdown('---')).toBe('<hr>')
  })

  it('joins consecutive lines into one paragraph with line breaks', () => {
    expect(renderMarkdown('one\ntwo\n\nthree')).toBe('<p>one<br>two</p>\n<p>three</p>')
  })
})

describe('renderMarkdown — inline', () => {
  it('renders bold, italic, strikethrough and code', () => {
    expect(renderMarkdown('**b** *i* ~~s~~ `c`')).toBe(
      '<p><strong>b</strong> <em>i</em> <del>s</del> <code>c</code></p>',
    )
  })

  it('leaves emphasis inside a code span literal', () => {
    expect(renderMarkdown('`a *b* c`')).toBe('<p><code>a *b* c</code></p>')
  })

  it('does not mangle ordinary text that happens to contain digits', () => {
    expect(renderMarkdown('ready in 5 minutes')).toBe('<p>ready in 5 minutes</p>')
  })

  it('leaves a GitHub cross-reference as text', () => {
    expect(renderMarkdown('see #12 from @octo')).toBe('<p>see #12 from @octo</p>')
  })
})

describe('markdownExcerpt', () => {
  it('flattens markdown to one line of plain text', () => {
    expect(markdownExcerpt('# Title\n\nSome **bold** text')).toBe('Title Some bold text')
  })

  it('drops code fences and our own round-trip marker', () => {
    expect(markdownExcerpt('Body\n\n```\ncode\n```\n<!-- spasta:taskId:4 -->')).toBe('Body')
  })

  it('truncates with an ellipsis', () => {
    expect(markdownExcerpt('abcdefghij', 5)).toBe('abcd…')
  })

  it('keeps link text without the target', () => {
    expect(markdownExcerpt('see [the docs](https://example.test)')).toBe('see the docs')
  })
})
