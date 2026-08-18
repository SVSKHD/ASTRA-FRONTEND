import { describe, expect, it } from 'vitest'
import {
  at,
  checklistItems,
  continuationPrefix,
  countTasks,
  indent,
  insertLink,
  insertTable,
  lineAt,
  onEnter,
  openFence,
  outdent,
  parseListItem,
  toggleBlock,
  toggleTaskAt,
  toggleWrap,
} from '@/utils/mdTyping'

// A tiny helper so the tests read as "text with a caret" rather than as offsets.
// `|` marks the caret; `[` and `]` mark a selection.
// A `|` wins over `[ ]`, because markdown itself is full of square brackets —
// `- [x] done|` is a caret at the end of a checklist item, not a selection.
function state(marked: string) {
  if (marked.includes('|')) {
    const start = marked.indexOf('|')
    return at(marked.replace('|', ''), start)
  }
  const start = marked.indexOf('[')
  const end = marked.indexOf(']') - 1
  return at(marked.replace('[', '').replace(']', ''), start, end)
}
function show(result: { value: string; start: number; end: number }) {
  if (result.start === result.end) {
    return result.value.slice(0, result.start) + '|' + result.value.slice(result.start)
  }
  return (
    result.value.slice(0, result.start) +
    '[' +
    result.value.slice(result.start, result.end) +
    ']' +
    result.value.slice(result.end)
  )
}

describe('reading the line under the caret', () => {
  it('finds the whole line whatever the caret is doing', () => {
    expect(lineAt('one\ntwo\nthree', 5)).toBe('two')
    expect(lineAt('one\ntwo\nthree', 0)).toBe('one')
    expect(lineAt('one\ntwo\nthree', 13)).toBe('three')
  })
})

describe('parsing a list item', () => {
  it('reads bullets, ordinals, tasks and indentation', () => {
    expect(parseListItem('- item')).toMatchObject({ bullet: '-', task: '', content: 'item' })
    expect(parseListItem('  * item')).toMatchObject({ indent: '  ', bullet: '*' })
    expect(parseListItem('3. item')).toMatchObject({ ordinal: 3, content: 'item' })
    expect(parseListItem('- [x] done')).toMatchObject({ task: '[x] ', content: 'done' })
    expect(parseListItem('- [ ] todo')).toMatchObject({ task: '[ ] ', content: 'todo' })
    expect(parseListItem('plain text')).toBe(null)
  })

  it('continues an item with the right marker', () => {
    expect(continuationPrefix(parseListItem('- a')!)).toBe('- ')
    expect(continuationPrefix(parseListItem('  * a')!)).toBe('  * ')
    expect(continuationPrefix(parseListItem('3. a')!)).toBe('4. ')
    // A continued checklist item starts unticked, never inheriting the tick.
    expect(continuationPrefix(parseListItem('- [x] a')!)).toBe('- [ ] ')
  })
})

describe('Enter', () => {
  it('continues a bullet list', () => {
    expect(show(onEnter(state('- one|'))!)).toBe('- one\n- |')
  })

  it('continues a checklist with an empty box', () => {
    expect(show(onEnter(state('- [x] done|'))!)).toBe('- [x] done\n- [ ] |')
  })

  it('increments an ordered list', () => {
    expect(show(onEnter(state('1. one|'))!)).toBe('1. one\n2. |')
  })

  it('continues a blockquote', () => {
    expect(show(onEnter(state('> quoted|'))!)).toBe('> quoted\n> |')
  })

  it('exits the list on an empty item rather than adding another bullet', () => {
    expect(show(onEnter(state('- one\n- |'))!)).toBe('- one\n\n|')
  })

  it('outdents an empty nested item before exiting', () => {
    expect(show(onEnter(state('- one\n  - |'))!)).toBe('- one\n|')
  })

  it('exits an empty blockquote', () => {
    expect(show(onEnter(state('> quoted\n> |'))!)).toBe('> quoted\n\n|')
  })

  it('does nothing special in ordinary prose', () => {
    expect(onEnter(state('just words|'))).toBe(null)
  })

  it('declines to act on a selection', () => {
    expect(onEnter(state('- [one] two'))).toBe(null)
  })
})

describe('Tab and Shift+Tab', () => {
  it('indents the line under the caret by two spaces', () => {
    expect(show(indent(state('- item|')))).toBe('  - item|')
  })

  it('outdents by up to two spaces and stops at the margin', () => {
    expect(show(outdent(state('  - item|')))).toBe('- item|')
    expect(show(outdent(state('- item|')))).toBe('- item|')
  })

  it('indents every line a selection touches', () => {
    const result = indent(state('[- one\n- two]\n- three'))
    expect(result.value).toBe('  - one\n  - two\n- three')
  })
})

describe('inline formatting', () => {
  it('wraps a selection and keeps the words themselves selected', () => {
    // The markers go outside the selection, so typing again replaces the word
    // rather than the formatting.
    expect(show(toggleWrap(state('make [this] bold'), '**'))).toBe('make **[this]** bold')
  })

  it('unwraps when the selection is already wrapped', () => {
    expect(toggleWrap(state('make [**this**] bold'), '**').value).toBe('make this bold')
  })

  it('unwraps when the markers sit just outside the selection', () => {
    expect(toggleWrap(state('make **[this]** bold'), '**').value).toBe('make this bold')
  })

  it('inserts empty markers with the caret between them', () => {
    expect(show(toggleWrap(state('type |here'), '`'))).toBe('type `|`here')
  })

  it('handles italic and inline code with their own markers', () => {
    expect(toggleWrap(state('[word]'), '_').value).toBe('_word_')
    expect(toggleWrap(state('[word]'), '`').value).toBe('`word`')
  })
})

describe('links', () => {
  it('wraps the selection as the label and leaves the caret in the URL', () => {
    const result = insertLink(state('see [the docs] now'))
    expect(result.value).toBe('see [the docs]() now')
    expect(result.start).toBe(result.value.indexOf('()') + 1)
  })

  it('uses a placeholder label when nothing is selected', () => {
    expect(insertLink(state('see |now')).value).toBe('see [link]()now')
  })

  it('fills in a URL when one is supplied', () => {
    expect(insertLink(state('[here]'), 'https://x.test').value).toBe('[here](https://x.test)')
  })
})

describe('block formatting', () => {
  it('applies a heading and keeps the caret in the text', () => {
    expect(show(toggleBlock(state('Title|'), 'h2'))).toBe('## Title|')
  })

  it('swaps one block prefix for another rather than stacking them', () => {
    expect(toggleBlock(state('## Title|'), 'h1').value).toBe('# Title')
    expect(toggleBlock(state('- item|'), 'quote').value).toBe('> item')
  })

  it('toggles a block off when every line already has it', () => {
    expect(toggleBlock(state('# Title|'), 'h1').value).toBe('Title')
    expect(toggleBlock(state('- [ ] a|'), 'checklist').value).toBe('a')
  })

  it('applies to every line a selection touches', () => {
    expect(toggleBlock(state('[one\ntwo\nthree]'), 'bullet').value).toBe('- one\n- two\n- three')
  })

  it('numbers an ordered list as it goes', () => {
    expect(toggleBlock(state('[one\ntwo\nthree]'), 'ordered').value).toBe(
      '1. one\n2. two\n3. three',
    )
  })

  it('leaves blank lines alone', () => {
    expect(toggleBlock(state('[one\n\ntwo]'), 'bullet').value).toBe('- one\n\n- two')
  })

  it('preserves indentation when applying a prefix', () => {
    expect(toggleBlock(state('  nested|'), 'bullet').value).toBe('  - nested')
  })
})

describe('fences and tables', () => {
  it('opens a fence with the caret inside it', () => {
    const result = openFence(state('|'))
    expect(result.value).toBe('```\n\n```\n')
    expect(result.value.slice(result.start, result.start + 1)).toBe('\n')
  })

  it('starts a fence on its own line when the current one has text', () => {
    expect(openFence(state('text|')).value).toBe('text\n```\n\n```\n')
  })

  it('carries a language when one is given', () => {
    expect(openFence(state('|'), 'ts').value).toBe('```ts\n\n```\n')
  })

  it('inserts a table skeleton', () => {
    expect(insertTable(state('|')).value).toBe('| Column | Column |\n| --- | --- |\n|  |  |\n')
  })
})

describe('task write-back (acceptance 82)', () => {
  const source = '- [ ] first\n- [x] second\n- [ ] third'

  it('ticks the box the reader clicked', () => {
    expect(toggleTaskAt(source, 0)).toBe('- [x] first\n- [x] second\n- [ ] third')
    expect(toggleTaskAt(source, 2)).toBe('- [ ] first\n- [x] second\n- [x] third')
  })

  it('unticks a ticked box', () => {
    expect(toggleTaskAt(source, 1)).toBe('- [ ] first\n- [ ] second\n- [ ] third')
  })

  it('leaves the source alone for an index that does not exist', () => {
    expect(toggleTaskAt(source, 9)).toBe(source)
  })

  it('keeps the rest of the line, markers and all', () => {
    expect(toggleTaskAt('- [ ] **bold** item [link](https://x.test)', 0)).toBe(
      '- [x] **bold** item [link](https://x.test)',
    )
  })

  it('ignores boxes inside a fence, which are code and not checkboxes', () => {
    const fenced = '```\n- [ ] not a box\n```\n- [ ] real'
    expect(toggleTaskAt(fenced, 0)).toBe('```\n- [ ] not a box\n```\n- [x] real')
  })

  it('counts done and total the same way', () => {
    expect(countTasks(source)).toEqual({ done: 1, total: 3 })
    expect(countTasks('no boxes here')).toEqual({ done: 0, total: 0 })
    expect(countTasks('```\n- [x] fenced\n```')).toEqual({ done: 0, total: 0 })
  })
})

describe('checklist to tasks', () => {
  it('reads the items as plain text with their state', () => {
    expect(checklistItems('- [ ] Ship it\n- [x] Write the **spec**')).toEqual([
      { text: 'Ship it', done: false },
      { text: 'Write the spec', done: true },
    ])
  })

  it('unwraps links and code so an imported task reads as a task', () => {
    expect(checklistItems('- [ ] read [the docs](https://x.test) and `npm test`')[0].text).toBe(
      'read the docs and npm test',
    )
  })

  it('skips empty items and anything that is not a checklist', () => {
    expect(checklistItems('- [ ] \n- plain bullet\ntext')).toEqual([])
  })
})
