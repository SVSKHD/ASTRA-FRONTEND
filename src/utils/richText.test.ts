import { describe, expect, it } from 'vitest'
import { looksLikeHtml, richHtml, richIsEmpty, richPlain } from '@/utils/richText'

describe('richText', () => {
  it('tells editor HTML from legacy plain text', () => {
    expect(looksLikeHtml('<p>hi</p>')).toBe(true)
    expect(looksLikeHtml('Cash to Mom and dad')).toBe(false)
    expect(looksLikeHtml('a < b and c > d')).toBe(false)
  })

  it('reads an entity as editor HTML, even with no tag anywhere in it', () => {
    // Type into the editor without reaching for a heading or a list and the
    // browser gives back exactly what you typed — no wrapper, no block — with
    // the spaces as `&nbsp;`. Reading that as plain text is what escaped HTML
    // that was already HTML.
    expect(looksLikeHtml('dasdcasdasddasd&nbsp;')).toBe(true)
    expect(looksLikeHtml('Tom &amp; Jerry')).toBe(true)
    // A bare ampersand is still somebody's plain text, not markup.
    expect(looksLikeHtml('R&D budget')).toBe(false)
    expect(looksLikeHtml('AT&T')).toBe(false)
  })

  it('renders legacy plain text safely, keeping line breaks', () => {
    expect(richHtml('line one\nline <two>')).toBe('line one<br>line &lt;two&gt;')
    expect(richHtml('   ')).toBe('')
  })

  it('sanitises editor HTML', () => {
    const out = richHtml('<p>ok</p><script>alert(1)</script><img src=x onerror=alert(1)>')
    expect(out).toContain('<p>ok</p>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('onerror')
  })

  it('reduces HTML to readable plain text', () => {
    expect(richPlain('<h1>Plan</h1><ul><li>EMA&nbsp;cross</li><li>Volume</li></ul>')).toBe(
      'Plan\n• EMA cross\n• Volume',
    )
    expect(richPlain('<p><strong>Buy</strong> &amp; hold</p>')).toBe('Buy & hold')
    expect(richPlain('plain stays plain')).toBe('plain stays plain')
  })

  it('treats an editor holding only empty blocks as empty', () => {
    expect(richIsEmpty('<p><br></p>')).toBe(true)
    expect(richIsEmpty('<div>&nbsp;</div>')).toBe(true)
    expect(richIsEmpty('&nbsp;')).toBe(true) // a typed space, with no block around it
    expect(richIsEmpty('<p>x</p>')).toBe(false)
  })
})

// The bug this guards against: a description typed without a heading or a list
// gained an `amp;` every time it was opened and saved —
// `&nbsp;` → `&amp;nbsp;` → `&amp;amp;nbsp;` — until the note was full of text
// nobody typed and nobody could delete.
describe('the edit round trip', () => {
  // One open-edit-save cycle. RichDescription seeds the editor with
  // richHtml(stored), and save() stores back what the editor serialised.
  const cycle = (stored: string) => richHtml(stored)

  const CASES: [string, string][] = [
    ['a trailing space and no block format', 'dasdcasdasddasd&nbsp;'],
    ['an ampersand', 'Tom &amp; Jerry'],
    ['an angle bracket', 'a &lt; b'],
    ['a heading — the path that always worked', '<h1>Title</h1>'],
    ['nothing needing an entity at all', 'hello'],
  ]

  for (const [name, typed] of CASES) {
    it(`reaches a fixed point with ${name}`, () => {
      const once = cycle(typed)
      let value = typed
      for (let i = 0; i < 6; i++) value = cycle(value)
      // Six more edits must not differ from one. This is the assertion that
      // matters: any escaping that is not idempotent fails here.
      expect(value).toBe(once)
      expect(value).not.toMatch(/&amp;(?:amp|nbsp|lt|gt|quot);/)
    })
  }

  it('repairs what the old code already wrote', () => {
    expect(richPlain('dasdcasdasddasd&amp;amp;amp;amp;nbsp;')).toBe('dasdcasdasddasd')
    expect(richHtml('x&amp;amp;nbsp;y')).toBe('x&nbsp;y')
    expect(richPlain('<p>Tom &amp;amp;amp; Jerry</p>')).toBe('Tom & Jerry')
  })

  it('leaves a single escaped ampersand alone', () => {
    // `&amp;` on its own is how an editor correctly stores one "&". Only a RUN
    // of them in front of an entity is evidence of the escalation.
    expect(richHtml('<p>Tom &amp; Jerry</p>')).toContain('Tom &amp; Jerry')
    expect(richPlain('<p>Tom &amp; Jerry</p>')).toBe('Tom & Jerry')
  })
})
