import { describe, expect, it } from 'vitest'
import { looksLikeHtml, richHtml, richIsEmpty, richPlain } from '@/utils/richText'

describe('richText', () => {
  it('tells editor HTML from legacy plain text', () => {
    expect(looksLikeHtml('<p>hi</p>')).toBe(true)
    expect(looksLikeHtml('Cash to Mom and dad')).toBe(false)
    expect(looksLikeHtml('a < b and c > d')).toBe(false)
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
    expect(richIsEmpty('<p>x</p>')).toBe(false)
  })
})
