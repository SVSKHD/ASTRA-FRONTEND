import { describe, expect, it } from 'vitest'
import { detectShortcut, nextKind, parseRules, serializeRules } from './ruleBlocks'

const kinds = (src: string) => parseRules(src).map((b) => [b.kind, b.text])

describe('parseRules', () => {
  it('reads a checkbox even without the space after the bracket', () => {
    expect(
      kinds('- [ ] Ema 9 and 200 crossover\n- [ ]Below 9 short and above 9 has to be long.\n- '),
    ).toEqual([
      ['rule', 'Ema 9 and 200 crossover'],
      ['rule', 'Below 9 short and above 9 has to be long.'],
      ['bullet', ''],
    ])
  })

  it('reads headings, bullets, ticked boxes and plain text', () => {
    expect(kinds('# Entry\n## Gold\n* [x] Wait for close\n- Risk 1%\nJust a line')).toEqual([
      ['heading', 'Entry'],
      ['subheading', 'Gold'],
      ['rule', 'Wait for close'],
      ['bullet', 'Risk 1%'],
      ['text', 'Just a line'],
    ])
  })

  it('does not mistake a link for a ticked box', () => {
    expect(kinds('[x](https://example.com)')).toEqual([['text', '[x](https://example.com)']])
  })
})

describe('serializeRules', () => {
  it('round-trips to clean markdown, drops empty lines and never stores ticks', () => {
    const blocks = parseRules('# Entry\n- [x] A\n-  \n- [ ]B\n## Exit\n- C')
    expect(serializeRules(blocks)).toBe('# Entry\n\n- [ ] A\n- [ ] B\n\n## Exit\n\n- C')
  })
})

describe('detectShortcut', () => {
  it('maps typed markers to kinds', () => {
    expect(detectShortcut('# ')).toEqual({ kind: 'heading', strip: 2 })
    expect(detectShortcut('## x')).toEqual({ kind: 'subheading', strip: 3 })
    expect(detectShortcut('[] ')).toEqual({ kind: 'rule', strip: 3 })
    expect(detectShortcut('- [ ] ')).toEqual({ kind: 'rule', strip: 6 })
    expect(detectShortcut('- ')).toEqual({ kind: 'bullet', strip: 2 })
    expect(detectShortcut('Ema 9')).toBeNull()
  })
  it('continues lists and starts rules under headings', () => {
    expect(nextKind('heading')).toBe('rule')
    expect(nextKind('bullet')).toBe('bullet')
  })
})
