import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import {
  BUILT_IN_PROMPTS,
  BUILT_IN_TOPICS,
  blanksOf,
  compactPrompt,
  emptyBlanks,
  estimateTokens,
  fillPrompt,
  isLongBlank,
  promptParts,
} from '@/utils/prompts'

describe('blanks', () => {
  it('finds each blank once, in order, ignoring case and inner spaces', () => {
    expect(blanksOf('Hi {{name}}, re {{ topic }}. Thanks {{Name}}.')).toEqual(['name', 'topic'])
  })

  it('finds none in a template without any', () => {
    expect(blanksOf('Just do it.')).toEqual([])
  })

  it('lists the ones still empty, treating whitespace as empty', () => {
    expect(emptyBlanks('{{a}} {{b}} {{c}}', { a: 'x', b: '  ' })).toEqual(['b', 'c'])
  })
})

describe('filling a template', () => {
  it('puts each value in every place its blank appears', () => {
    expect(fillPrompt('{{x}} and {{X}} again', { x: 'one' })).toBe('one and one again')
  })

  it('leaves an empty blank visible rather than a hole in the sentence', () => {
    expect(fillPrompt('Email {{to}} about {{subject}}', { to: 'Sam' })).toBe(
      'Email Sam about {{subject}}',
    )
  })

  it('cuts the template into text and blank runs for the preview', () => {
    expect(promptParts('A {{b}} C', { b: ' v ' })).toEqual([
      { kind: 'text', text: 'A ' },
      { kind: 'blank', name: 'b', value: 'v' },
      { kind: 'text', text: ' C' },
    ])
  })
})

describe('saving tokens', () => {
  it('squeezes runs of spaces, trims lines and keeps one blank line between paragraphs', () => {
    expect(compactPrompt('  a   b \t c  \n\n\n\n   d  ')).toBe('a b c\n\nd')
  })

  it('estimates about four characters a token, and nothing for nothing', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
  })

  it('makes a compacted prompt cost no more than the original', () => {
    const raw = 'Fix   this:\n\n\n\n    const  x =   1'
    expect(estimateTokens(compactPrompt(raw))).toBeLessThan(estimateTokens(raw))
  })
})

describe('the library', () => {
  it('gives every built-in a unique key, a topic, a title and at least one blank', () => {
    const keys = new Set(BUILT_IN_PROMPTS.map((p) => p.key))
    expect(keys.size).toBe(BUILT_IN_PROMPTS.length)
    for (const p of BUILT_IN_PROMPTS) {
      expect(p.builtIn).toBe(true)
      expect(p.topic && p.title, p.key).toBeTruthy()
      expect(blanksOf(p.body).length, p.key).toBeGreaterThan(0)
    }
  })

  it('keeps every built-in short — that is the point of the tab', () => {
    for (const p of BUILT_IN_PROMPTS) expect(estimateTokens(p.body), p.key).toBeLessThanOrEqual(60)
  })

  it('lists its topics once each', () => {
    expect(new Set(BUILT_IN_TOPICS).size).toBe(BUILT_IN_TOPICS.length)
  })

  it('gives a paste-sized blank a multi-line field', () => {
    expect(isLongBlank('code')).toBe(true)
    expect(isLongBlank('meeting notes')).toBe(true)
    expect(isLongBlank('tone')).toBe(false)
  })
})

describe('the prompts collection', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('saves, edits and deletes the user’s own templates', () => {
    const app = useAppStore()
    const id = app.addPrompt({ topic: ' Sales ', title: 'Cold email', body: ' Pitch {{product}} ' })
    expect(id).not.toBeNull()
    expect(app.prompts[0]).toMatchObject({
      topic: 'Sales',
      title: 'Cold email',
      body: 'Pitch {{product}}',
    })

    app.updatePrompt(id!, { title: 'Warm email', body: '   ' })
    // A blank body is not an edit: the template keeps the one it had.
    expect(app.prompts[0]).toMatchObject({ title: 'Warm email', body: 'Pitch {{product}}' })

    app.removePrompt(id!)
    expect(app.prompts).toHaveLength(0)
  })

  it('refuses a template with nothing in it, and names an unnamed one', () => {
    const app = useAppStore()
    expect(app.addPrompt({ topic: '', title: '', body: '  ' })).toBeNull()
    app.addPrompt({ topic: '', title: '', body: 'x' })
    expect(app.prompts[0]).toMatchObject({ topic: 'My prompts', title: 'Untitled prompt' })
  })
})
