import { describe, expect, it } from 'vitest'
import { isBlankNote, noteChecks, noteLines, notePreview, noteText, noteTitle } from './notes'

describe('noteLines', () => {
  it('splits block tags into separate lines', () => {
    expect(noteLines('<div>one</div><div>two</div>')).toEqual(['one', 'two'])
  })

  it('treats <br> as a line break', () => {
    expect(noteLines('a<br>b')).toEqual(['a', 'b'])
  })

  it('decodes the entities the editor emits', () => {
    expect(noteLines('<p>a&nbsp;&amp;&nbsp;b</p>')).toEqual(['a & b'])
  })

  it('drops empty lines and collapses inner whitespace', () => {
    expect(noteLines('<p></p><p>  spaced   out </p><br>')).toEqual(['spaced out'])
  })

  it('strips script and style content entirely', () => {
    expect(noteLines('<p>hi</p><script>alert(1)</script>')).toEqual(['hi'])
  })
})

describe('noteText', () => {
  it('flattens every line into one string', () => {
    expect(noteText('<h1>Trip</h1><p>Pack bags</p>')).toBe('Trip Pack bags')
  })
})

describe('noteTitle', () => {
  it('uses the first line', () => {
    expect(noteTitle('<h1>Groceries</h1><ul><li>milk</li></ul>')).toBe('Groceries')
  })

  it('falls back when the note has no text', () => {
    expect(noteTitle('<div><br></div>')).toBe('Untitled note')
  })

  it('truncates a runaway first line', () => {
    const title = noteTitle('<p>' + 'x'.repeat(200) + '</p>')
    expect(title).toHaveLength(60)
    expect(title.endsWith('…')).toBe(true)
  })
})

describe('notePreview', () => {
  it('is everything after the title', () => {
    expect(notePreview('<p>Title</p><p>body one</p><p>body two</p>')).toBe('body one body two')
  })

  it('is empty for a single-line note', () => {
    expect(notePreview('<p>Only line</p>')).toBe('')
  })

  it('truncates at the cap', () => {
    expect(notePreview('<p>t</p><p>' + 'y'.repeat(300) + '</p>', 20)).toHaveLength(20)
  })
})

describe('isBlankNote', () => {
  it('is true for markup with no text', () => {
    expect(isBlankNote('<div><br></div>')).toBe(true)
    expect(isBlankNote('')).toBe(true)
  })

  it('is false once anything is typed', () => {
    expect(isBlankNote('<div>a</div>')).toBe(false)
  })
})

describe('noteChecks', () => {
  it('counts ticked and total boxes', () => {
    const html =
      '<div><input type="checkbox" checked><span>a</span></div><div><input type=checkbox>b</div>'
    expect(noteChecks(html)).toEqual({ done: 1, total: 2 })
  })

  it('is zero for a note with no checklist', () => {
    expect(noteChecks('<p>plain</p>')).toEqual({ done: 0, total: 0 })
  })
})
