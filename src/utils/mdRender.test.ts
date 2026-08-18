// Acceptances 79 and 81: a README-shaped block renders as formatting, and
// anything executable in it does not survive the trip to the DOM.
import { describe, expect, it } from 'vitest'
import {
  headingsOf,
  internalPath,
  isInternalHref,
  renderMarkdown,
  renderMarkdownInline,
  renderMarkdownResult,
  sanitize,
  slugifyHeading,
} from '@/utils/mdRender'

const README = `# Project

Some **bold** and _italic_ and ~~struck~~ text with \`code\`.

## Install

- one
- two
  - nested

1. first
2. second

- [ ] todo
- [x] done

| Col | Other |
| --- | ----- |
| a   | b     |

> a quote

\`\`\`ts
const x: number = 1
\`\`\`

[a link](https://example.com) and https://bare.example.com

![shot](https://example.com/a.png)
`

describe('GFM rendering (acceptance 79)', () => {
  const html = renderMarkdown(README)

  it('renders headings with ids', () => {
    expect(html).toContain('<h1 id="project">')
    expect(html).toContain('<h2 id="install">')
  })

  it('renders emphasis, strikethrough and inline code', () => {
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<s>struck</s>')
    expect(html).toContain('<code>code</code>')
  })

  it('renders bullet, ordered and nested lists', () => {
    expect(html).toContain('<ul>')
    expect(html).toContain('<ol>')
    expect((html.match(/<ul>/g) || []).length).toBeGreaterThan(1)
  })

  it('renders task lists as real checkboxes, ticked where the source says so', () => {
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked=""')
  })

  it('renders a table inside a horizontally scrollable wrapper', () => {
    expect(html).toContain('<div class="md-table-wrap"><table>')
    expect(html).toContain('<th>Col</th>')
    expect(html).toContain('<td>a</td>')
  })

  it('renders a blockquote', () => {
    expect(html).toContain('<blockquote>')
  })

  it('renders a fence carrying its language', () => {
    expect(html).toContain('<pre class="md-fence" data-lang="ts">')
    expect(html).toContain('class="language-ts"')
    // …and reports that the note has one, so the highlighter can stay unloaded
    // for the notes that do not.
    expect(renderMarkdownResult(README).hasCode).toBe(true)
    expect(renderMarkdownResult('plain text').hasCode).toBe(false)
  })

  it('links out in a new tab and autolinks a bare URL', () => {
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('href="https://bare.example.com"')
  })

  it('lazy-loads images', () => {
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('class="md-img"')
  })

  it('treats a single newline as a break, the way pasted text is written', () => {
    expect(renderMarkdown('one\ntwo')).toContain('<br>')
  })

  it('renders footnotes and definition lists', () => {
    const foot = renderMarkdown('text[^1]\n\n[^1]: the note')
    expect(foot).toContain('footnote')
    const def = renderMarkdown('Term\n\n:   The definition')
    expect(def).toContain('<dl>')
    expect(def).toContain('<dt>Term</dt>')
  })

  it('renders ==marked== text', () => {
    expect(renderMarkdown('==highlight==')).toContain('<mark>')
  })

  it('renders an inline fragment without wrapping it in a paragraph', () => {
    expect(renderMarkdownInline('**hi**')).toBe('<strong>hi</strong>')
  })
})

describe('sanitisation (acceptance 81)', () => {
  it('strips a script tag from the source', () => {
    const html = renderMarkdown('before\n\n<script>alert(1)</script>\n\nafter')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)</script>')
  })

  it('never turns an onerror attribute into a real element', () => {
    // `html: false` escapes the raw tag, so the text is visible but inert —
    // there is no <img> and therefore no handler to fire.
    const html = renderMarkdown('<img src=x onerror="alert(1)">')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
    // The same attribute arriving as real HTML (a paste path) is removed.
    expect(sanitize('<img src="https://x.test/a.png" onerror="alert(1)">')).not.toContain('onerror')
  })

  it('never emits a javascript: href', () => {
    const html = renderMarkdown('[click](javascript:alert(1))')
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('<a ')
    expect(sanitize('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:')
  })

  it('strips an iframe, a style block and inline styles', () => {
    const html = sanitize(
      '<iframe src="https://evil.test"></iframe><style>body{display:none}</style><p style="color:red">x</p>',
    )
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<style')
    expect(html).not.toContain('style=')
    expect(html).toContain('<p>x</p>')
  })

  it('strips a data: image URI while keeping an https one', () => {
    expect(sanitize('<img src="data:text/html;base64,PHNjcmlwdD4=">')).not.toContain('data:')
    expect(sanitize('<img src="https://example.com/a.png">')).toContain('https://example.com/a.png')
  })

  it('keeps the class and id attributes the styling and TOC depend on', () => {
    const html = sanitize('<h2 id="x" class="y">t</h2>')
    expect(html).toContain('id="x"')
    expect(html).toContain('class="y"')
  })
})

describe('internal links route in-app', () => {
  it('recognises the app host and a bare path', () => {
    expect(isInternalHref('https://spasta.online/notes/3')).toBe(true)
    expect(isInternalHref('/notes/3')).toBe(true)
    expect(isInternalHref('https://example.com/notes/3')).toBe(false)
    expect(isInternalHref('//evil.test/x')).toBe(false)
  })

  it('reduces an internal href to a router path', () => {
    expect(internalPath('https://spasta.online/trips/7?a=1#b')).toBe('/trips/7?a=1#b')
    expect(internalPath('/todo')).toBe('/todo')
    expect(internalPath('https://example.com/x')).toBe(null)
  })

  it('marks an internal link instead of opening a tab', () => {
    const html = renderMarkdown('[here](https://spasta.online/goals)')
    expect(html).toContain('data-internal="1"')
    expect(html).not.toContain('target="_blank"')
  })
})

describe('headings for the table of contents', () => {
  it('reads level, text and id in document order', () => {
    expect(headingsOf('# One\n\ntext\n\n## Two\n\n### Three')).toEqual([
      { level: 1, text: 'One', id: 'one' },
      { level: 2, text: 'Two', id: 'two' },
      { level: 3, text: 'Three', id: 'three' },
    ])
  })

  it('suffixes repeats the same way the renderer does', () => {
    const ids = headingsOf('# Notes\n\n# Notes\n\n# Notes').map((h) => h.id)
    expect(ids).toEqual(['notes', 'notes-1', 'notes-2'])
    const html = renderMarkdown('# Notes\n\n# Notes')
    expect(html).toContain('id="notes"')
    expect(html).toContain('id="notes-1"')
  })

  it('ignores a # inside a fence', () => {
    expect(headingsOf('```\n# not a heading\n```\n\n# real')).toEqual([
      { level: 1, text: 'real', id: 'real' },
    ])
  })

  it('strips inline markup from the heading text', () => {
    expect(headingsOf('## A **bold** `bit`')[0].text).toBe('A bold bit')
  })

  it('falls back to a usable slug for a heading with no word characters', () => {
    expect(slugifyHeading('★★★')).toBe('section')
  })
})
