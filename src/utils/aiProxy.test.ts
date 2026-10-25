import { describe, expect, it } from 'vitest'
import { answerPlan, thinkFilter } from '../../netlify/functions/ai'

describe('answerPlan', () => {
  const both = () => true
  it('asks the picked provider and model first, then its default, then the other provider', () => {
    expect(
      answerPlan({ provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' }, both),
    ).toEqual([
      { provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' },
      { provider: 'openrouter', model: 'google/gemini-2.5-flash' },
      { provider: 'bytez', model: 'Qwen/Qwen3-4B' },
    ])
  })
  it('does not list the same model twice', () => {
    expect(answerPlan({ provider: 'bytez', model: 'Qwen/Qwen3-4B' }, both)).toEqual([
      { provider: 'bytez', model: 'Qwen/Qwen3-4B' },
      { provider: 'openrouter', model: 'google/gemini-2.5-flash' },
    ])
  })
  it('skips a provider with no key', () => {
    expect(
      answerPlan({ provider: 'bytez', model: 'Qwen/Qwen3-8B' }, (p) => p === 'openrouter'),
    ).toEqual([{ provider: 'openrouter', model: 'google/gemini-2.5-flash' }])
  })
  it('replaces a malformed model id with the default', () => {
    expect(answerPlan({ provider: 'openrouter', model: 'rm -rf /' }, both)[0]).toEqual({
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash',
    })
  })
  it('reads an older build’s bare id as OpenRouter', () => {
    expect(answerPlan({ model: 'gemini-2.5-flash-lite' }, both)[0]).toEqual({
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash-lite',
    })
  })
})

function run(chunks: string[]): string {
  const f = thinkFilter()
  return chunks.map((c) => f.push(c)).join('') + f.flush()
}

describe('thinkFilter', () => {
  it('passes a plain answer through', () => {
    expect(run(['Call the ', 'bank tomorrow'])).toBe('Call the bank tomorrow')
  })
  it('drops a thinking block and the blank lines after it', () => {
    expect(run(['<think>hmm, typos</think>\n\nCall the bank'])).toBe('Call the bank')
  })
  it('handles tags split across chunks', () => {
    expect(run(['<thi', 'nk>reasoning', ' here</th', 'ink>\n', 'Done'])).toBe('Done')
  })
  it('keeps a "<" that is not a tag', () => {
    expect(run(['a <', 'b and c'])).toBe('a <b and c')
  })
  it('drops an unfinished thinking block', () => {
    expect(run(['<think>never closes'])).toBe('')
  })
})
