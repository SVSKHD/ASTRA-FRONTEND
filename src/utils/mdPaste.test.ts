// Acceptance 80: a Google Docs paste produces clean markdown, not styled HTML
// soup — and the reverse, that a markdown paste is not routed through the HTML
// flavour and mangled on the way.
import { describe, expect, it } from 'vitest'
import {
  decidePaste,
  isBareUrl,
  isRichHtml,
  looksLikeMarkdown,
  normalizeMarkdown,
  pasteToastLabel,
  spliceText,
} from '@/utils/mdPaste'

describe('recognising markdown in the plain-text flavour', () => {
  const yes = [
    '# Heading',
    '## Deeper\n\ntext',
    '- one\n- two',
    '1. first',
    '- [ ] todo',
    '> quoted',
    '```js\ncode\n```',
    '| a | b |\n| - | - |',
    '---',
    'see [the docs](https://example.com)',
    '![img](https://example.com/a.png)',
    'this is **bold**',
    'this is _italic_ here',
    'this is ~~gone~~',
    'run `npm test`',
  ]
  for (const sample of yes) {
    it(`treats ${JSON.stringify(sample.slice(0, 24))} as markdown`, () => {
      expect(looksLikeMarkdown(sample)).toBe(true)
    })
  }

  const no = [
    '',
    '   ',
    'Just a sentence about things.',
    'Two lines\nof ordinary prose.',
    'A price of 3 * 4 and 5 * 6',
    'snake_case_identifier stays prose',
  ]
  for (const sample of no) {
    it(`treats ${JSON.stringify(sample.slice(0, 24))} as prose`, () => {
      expect(looksLikeMarkdown(sample)).toBe(false)
    })
  }
})

describe('recognising a rich HTML flavour', () => {
  it('accepts document structure', () => {
    expect(isRichHtml('<h1>Title</h1><p>text</p>')).toBe(true)
    expect(isRichHtml('<ul><li>a</li></ul>')).toBe(true)
    expect(isRichHtml('<table><tr><td>a</td></tr></table>')).toBe(true)
  })

  it('accepts a Google Docs fragment by its marker', () => {
    expect(isRichHtml('<b id="docs-internal-guid-123"><span>text</span></b>')).toBe(true)
  })

  it('rejects the browser wrapper around plain text', () => {
    expect(isRichHtml('<div>line one</div><div>line two</div>')).toBe(false)
    expect(isRichHtml('')).toBe(false)
  })
})

describe('normalising on insert', () => {
  it('converts CRLF to LF', () => {
    expect(normalizeMarkdown('a\r\nb\rc')).toBe('a\nb\nc')
  })

  it('converts non-breaking spaces to ordinary ones', () => {
    expect(normalizeMarkdown('a b c')).toBe('a b c')
  })

  it('straightens smart quotes, dashes and ellipses', () => {
    expect(normalizeMarkdown('“quoted” and ‘single’')).toBe('"quoted" and \'single\'')
    expect(normalizeMarkdown('a — b')).toBe('a - b')
    expect(normalizeMarkdown('wait…')).toBe('wait...')
  })

  it('turns tabs into two spaces', () => {
    expect(normalizeMarkdown('\t- nested')).toBe('  - nested')
  })

  it('strips trailing whitespace, hard break included', () => {
    // `breaks: true` already turns a single newline into a line break, so the
    // two-space hard break carries no meaning and only shows up in diffs.
    expect(normalizeMarkdown('text   \nnext')).toBe('text\nnext')
    expect(normalizeMarkdown('text  \nnext')).toBe('text\nnext')
  })

  it('collapses three or more blank lines to one', () => {
    expect(normalizeMarkdown('a\n\n\n\n\nb')).toBe('a\n\nb')
    expect(normalizeMarkdown('a\n\nb')).toBe('a\n\nb')
  })

  it('drops leading blank lines so a paste does not start with a gap', () => {
    expect(normalizeMarkdown('\n\nstart')).toBe('start')
  })
})

describe('the paste decision', () => {
  it('prefers markdown plain text over the HTML flavour (acceptance 79)', async () => {
    const decision = await decidePaste({
      text: '# Title\n\n- one\n- two',
      html: '<h1 style="font-size:20pt">Title</h1><ul><li>one</li></ul>',
    })
    expect(decision.source).toBe('markdown')
    expect(decision.text).toBe('# Title\n\n- one\n- two')
  })

  it('converts a Google Docs paste to markdown (acceptance 80)', async () => {
    const docs = `<meta charset="utf-8"><b id="docs-internal-guid-abc" style="font-weight:normal">
      <h1 style="font-size:20pt;font-family:Arial"><span style="color:#000">Quarter plan</span></h1>
      <p style="line-height:1.38"><span style="font-weight:700">Ship</span> the <span style="font-style:italic">notes</span> work</p>
      <ul style="margin:0"><li style="font-size:11pt"><span>first item</span></li><li><span>second item</span></li></ul>
      <p><a href="https://example.com" style="text-decoration:underline">a link</a></p></b>`
    const decision = await decidePaste({ text: '', html: docs })
    expect(decision.source).toBe('converted')
    expect(decision.text).toContain('# Quarter plan')
    expect(decision.text).toContain('**Ship**')
    expect(decision.text).toContain('_notes_')
    expect(decision.text).toContain('- first item')
    expect(decision.text).toContain('- second item')
    expect(decision.text).toContain('[a link](https://example.com)')
    // No styling survives the trip.
    expect(decision.text).not.toContain('style=')
    expect(decision.text).not.toContain('<span')
    expect(decision.text).not.toContain('font-size')
  })

  it('converts a web-page table and a code block', async () => {
    const decision = await decidePaste({
      text: '',
      html: '<h2>API</h2><pre><code>const x = 1</code></pre><blockquote>note</blockquote>',
    })
    expect(decision.source).toBe('converted')
    expect(decision.text).toContain('## API')
    expect(decision.text).toContain('```')
    expect(decision.text).toContain('> note')
  })

  it('turns a Docs checklist back into task-list syntax', async () => {
    const decision = await decidePaste({
      text: '',
      html: '<ul><li>☐ open item</li><li>☑ closed item</li></ul>',
    })
    expect(decision.text).toContain('- [ ] open item')
    expect(decision.text).toContain('- [x] closed item')
  })

  it('falls back to plain text when neither flavour is interesting', async () => {
    const decision = await decidePaste({ text: 'just words', html: '<div>just words</div>' })
    expect(decision.source).toBe('plain')
    expect(decision.text).toBe('just words')
  })

  it('links the selection when a bare URL is pasted over it', async () => {
    const decision = await decidePaste({ text: 'https://example.com/x', html: '' }, 'the docs')
    expect(decision.source).toBe('link')
    expect(decision.text).toBe('[the docs](https://example.com/x)')
  })

  it('pastes a URL normally when nothing is selected', async () => {
    const decision = await decidePaste({ text: 'https://example.com/x', html: '' }, '')
    expect(decision.source).not.toBe('link')
    expect(decision.text).toBe('https://example.com/x')
  })

  it('always carries the plain flavour, so the toast can undo the conversion', async () => {
    const decision = await decidePaste({
      text: 'Quarter plan',
      html: '<h1>Quarter plan</h1><ul><li>a</li></ul>',
    })
    expect(decision.source).toBe('converted')
    expect(decision.plain).toBe('Quarter plan')
  })

  it('normalises whatever it decides on', async () => {
    const decision = await decidePaste({ text: '# Title\r\n\r\n\r\n\r\nbody\t', html: '' })
    expect(decision.text).toBe('# Title\n\nbody')
  })
})

describe('bare URL detection', () => {
  it('accepts http, https and mailto', () => {
    expect(isBareUrl('https://example.com')).toBe(true)
    expect(isBareUrl('  http://example.com/a?b=1  ')).toBe(true)
    expect(isBareUrl('mailto:a@b.test')).toBe(true)
  })

  it('rejects anything with spaces or another scheme', () => {
    expect(isBareUrl('https://example.com and more')).toBe(false)
    expect(isBareUrl('javascript:alert(1)')).toBe(false)
    expect(isBareUrl('example.com')).toBe(false)
  })
})

describe('toast wording and splicing', () => {
  it('names what happened, and says nothing for an ordinary paste', () => {
    expect(pasteToastLabel('converted')).toBe('Converted to markdown')
    expect(pasteToastLabel('markdown')).toBe('Pasted as markdown')
    expect(pasteToastLabel('link')).toBe('Linked the selection')
    expect(pasteToastLabel('plain')).toBe('')
  })

  it('splices text and reports where the caret lands', () => {
    expect(spliceText('hello world', 6, 11, 'there')).toEqual({
      value: 'hello there',
      start: 11,
      end: 11,
    })
  })
})
