import { describe, expect, it } from 'vitest'
import { blockCount, progressive, splitBlocks, PROGRESSIVE_THRESHOLD } from '@/utils/mdChunks'

describe('splitting into blocks', () => {
  it('splits on blank lines', () => {
    expect(splitBlocks('one\n\ntwo\n\nthree')).toEqual(['one', 'two', 'three'])
  })

  it('keeps a multi-line block together', () => {
    expect(splitBlocks('- a\n- b\n\ntext')).toEqual(['- a\n- b', 'text'])
  })

  it('never splits inside a fence, where a blank line is code', () => {
    expect(splitBlocks('```js\nconst a = 1\n\nconst b = 2\n```\n\nafter')).toEqual([
      '```js\nconst a = 1\n\nconst b = 2\n```',
      'after',
    ])
  })

  it('collapses runs of blank lines rather than emitting empty blocks', () => {
    expect(splitBlocks('a\n\n\n\nb')).toEqual(['a', 'b'])
  })

  it('handles an empty source', () => {
    expect(splitBlocks('')).toEqual([])
    expect(blockCount('')).toBe(0)
  })
})

describe('progressive rendering', () => {
  it('renders a short note whole', () => {
    const result = progressive('# Title\n\ntext')
    expect(result.truncated).toBe(false)
    expect(result.head).toBe('# Title\n\ntext')
    expect(result.rest).toBe('')
  })

  it('cuts a long note at a block boundary', () => {
    const block = 'a'.repeat(200)
    const source = Array.from({ length: 40 }, (_, i) => `${block}${i}`).join('\n\n')
    const result = progressive(source, 1000)
    expect(result.truncated).toBe(true)
    expect(result.head.length).toBeLessThanOrEqual(1300)
    // The two halves together are the whole note, block boundaries intact.
    expect(`${result.head}\n\n${result.rest}`).toBe(source)
  })

  it('never cuts a fence in half, however large it is', () => {
    const fence = '```\n' + 'x\n'.repeat(2000) + '```'
    const result = progressive(`intro\n\n${fence}\n\nafter`, 100)
    // The first block alone exceeds the limit, so it is taken whole and the
    // fence starts the remainder rather than being split.
    expect(result.head).toBe('intro')
    expect(result.rest.startsWith('```')).toBe(true)
    expect(result.rest.endsWith('after')).toBe(true)
  })

  it('leaves a note that happens to fit exactly alone', () => {
    const source = 'a'.repeat(PROGRESSIVE_THRESHOLD)
    expect(progressive(source).truncated).toBe(false)
  })

  it('counts the blocks held back for the control label', () => {
    expect(blockCount('a\n\nb\n\nc')).toBe(3)
  })
})
