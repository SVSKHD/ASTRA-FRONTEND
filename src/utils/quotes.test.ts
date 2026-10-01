import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { parseQuotes } from '@/utils/quotes'

describe('reading a paste of quotes', () => {
  it('takes a JSON list of strings', () => {
    const r = parseQuotes('["Done is better than perfect.", "Well begun is half done."]')
    expect(r.as).toBe('json')
    expect(r.quotes.map((q) => q.text)).toEqual([
      'Done is better than perfect.',
      'Well begun is half done.',
    ])
  })

  it('takes objects, reading quote/author as well as text/by, through fences and commas', () => {
    const r = parseQuotes(
      '```json\n[{ "quote": "What we do now echoes in eternity.", "author": "Marcus Aurelius" },\n { "text": "Clear the next task.", "by": "" },]\n```',
    )
    expect(r.quotes).toEqual([
      { text: 'What we do now echoes in eternity.', by: 'Marcus Aurelius' },
      { text: 'Clear the next task.', by: '' },
    ])
  })

  it('reads plain lines, with an author after a dash and bullets taken off', () => {
    const r = parseQuotes(
      '\n- "Well begun is half done." — Aristotle\n\n2. Energy flows where attention goes.\n',
    )
    expect(r.as).toBe('lines')
    expect(r.quotes).toEqual([
      { text: 'Well begun is half done.', by: 'Aristotle' },
      { text: 'Energy flows where attention goes.', by: '' },
    ])
  })
})

describe('the quotes collection', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('saves new quotes, skips repeats, and deletes', () => {
    const app = useAppStore()
    expect(app.addQuotes('One thing at a time.\nDone is better than perfect.')).toEqual({
      added: 2,
      skipped: 0,
    })
    // Same words, different case and punctuation: still a repeat.
    expect(app.addQuotes('["done is better than perfect", "New one"]')).toEqual({
      added: 1,
      skipped: 1,
    })
    expect(app.quotes.map((q) => q.text)).toEqual([
      'One thing at a time.',
      'Done is better than perfect.',
      'New one',
    ])
    app.removeQuote(app.quotes[0].id)
    expect(app.quotes).toHaveLength(2)
  })
})
