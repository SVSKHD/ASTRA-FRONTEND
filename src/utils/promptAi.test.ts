import { describe, expect, it } from 'vitest'
import { parseFill, parseGenerated, parseImproved, withReplyStyle } from '@/utils/promptAi'

describe('parseGenerated', () => {
  it('reads several templates from fenced JSON and drops unusable ones', () => {
    const answer =
      '```json\n' +
      JSON.stringify({
        templates: [
          { title: 'Weekly update', topic: 'Writing', useCase: 'Friday status note.', body: 'Write a weekly update for {{team}}.' },
          { title: 'No body' },
          { title: 'Follow-up', body: 'Draft a follow-up email to {{person}} about {{topic}}.' },
        ],
      }) +
      '\n```'
    const out = parseGenerated(answer)
    expect(out.map((t) => t.title)).toEqual(['Weekly update', 'Follow-up'])
    expect(out[1]).toMatchObject({ topic: 'My prompts', useCase: '' })
  })

  it('keeps no more than asked for, and returns nothing for prose', () => {
    const many = JSON.stringify({ templates: Array.from({ length: 6 }, (_, i) => ({ body: `B${i}` })) })
    expect(parseGenerated(many, 3)).toHaveLength(3)
    expect(parseGenerated('Sorry, I cannot help with that.')).toEqual([])
  })
})

describe('parseImproved', () => {
  it('accepts a rewrite that keeps every blank', () => {
    const out = parseImproved(
      '{"body":"Summarise {{text}} for {{Audience}} in 3 bullets.","useCase":"Skim long docs."}',
      'please summarise {{text}} for {{audience}}',
    )
    expect(out).toEqual({ body: 'Summarise {{text}} for {{Audience}} in 3 bullets.', useCase: 'Skim long docs.' })
  })
  it('refuses a rewrite that lost a blank', () => {
    expect(parseImproved('{"body":"Summarise the text."}', 'Summarise {{text}}')).toBeNull()
  })
})

describe('parseFill', () => {
  it('fills only the template’s blanks, matching names regardless of case', () => {
    expect(
      parseFill('{"AUDIENCE":"new hires","tone":"","extra":"x"}', ['audience', 'tone']),
    ).toEqual({ audience: 'new hires' })
  })
})

describe('withReplyStyle', () => {
  it('appends the style line, or leaves the prompt alone', () => {
    expect(withReplyStyle('Explain DNS.', 'any')).toBe('Explain DNS.')
    expect(withReplyStyle('Explain DNS.\n', 'steps')).toMatch(/^Explain DNS\.\n\nReply as numbered steps/)
    expect(withReplyStyle('   ', 'concise')).toBe('   ')
  })
})
