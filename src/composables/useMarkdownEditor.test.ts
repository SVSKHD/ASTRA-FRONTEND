import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useMarkdownEditor, type EditorAction } from '@/composables/useMarkdownEditor'

function harness(initial: string, start = initial.length, end = start) {
  const node = document.createElement('textarea')
  node.value = initial
  document.body.appendChild(node)
  node.setSelectionRange(start, end)
  const el = ref<HTMLTextAreaElement | null>(node)
  const state = { value: initial, start, end }
  const editor = useMarkdownEditor({
    el,
    getValue: () => state.value,
    setValue: (value, s, e) => {
      state.value = value
      state.start = s
      state.end = e
      node.value = value
      node.setSelectionRange(s, e)
    },
  })
  return { ...editor, state, node }
}

function key(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', { ...init, cancelable: true })
}

describe('toolbar actions', () => {
  const cases: [EditorAction, string, string][] = [
    ['bold', 'word', '**word**'],
    ['italic', 'word', '_word_'],
    ['code', 'word', '`word`'],
    ['strike', 'word', '~~word~~'],
    ['h1', 'Title', '# Title'],
    ['h2', 'Title', '## Title'],
    ['h3', 'Title', '### Title'],
    ['quote', 'said', '> said'],
    ['bullet', 'item', '- item'],
    ['checklist', 'item', '- [ ] item'],
    ['ordered', 'item', '1. item'],
  ]
  for (const [action, input, expected] of cases) {
    it(`${action} turns "${input}" into "${expected}"`, () => {
      const h = harness(input, 0, input.length)
      h.apply(action)
      expect(h.state.value).toBe(expected)
    })
  }

  it('link wraps the selection and leaves the caret in the URL slot', () => {
    const h = harness('the docs', 0, 8)
    h.apply('link')
    expect(h.state.value).toBe('[the docs]()')
    expect(h.state.start).toBe(11)
  })

  it('fence opens a block with the caret inside', () => {
    const h = harness('')
    h.apply('fence')
    expect(h.state.value).toBe('```\n\n```\n')
  })

  it('table inserts a skeleton', () => {
    const h = harness('')
    h.apply('table')
    expect(h.state.value).toContain('| --- | --- |')
  })
})

describe('keyboard shortcuts', () => {
  const mods: [string, string, string][] = [
    ['b', 'word', '**word**'],
    ['i', 'word', '_word_'],
    ['e', 'word', '`word`'],
    ['1', 'Title', '# Title'],
    ['2', 'Title', '## Title'],
    ['3', 'Title', '### Title'],
  ]
  for (const [k, input, expected] of mods) {
    it(`Ctrl+${k} produces ${expected}`, () => {
      const h = harness(input, 0, input.length)
      h.onKeydown(key({ key: k, ctrlKey: true }))
      expect(h.state.value).toBe(expected)
    })
  }

  it('Cmd works as well as Ctrl', () => {
    const h = harness('word', 0, 4)
    h.onKeydown(key({ key: 'b', metaKey: true }))
    expect(h.state.value).toBe('**word**')
  })

  it('Ctrl+K inserts a link', () => {
    const h = harness('docs', 0, 4)
    h.onKeydown(key({ key: 'k', ctrlKey: true }))
    expect(h.state.value).toBe('[docs]()')
  })

  it('Ctrl+Shift+8 makes a list, however the layout reports the digit', () => {
    for (const k of ['8', '*']) {
      const h = harness('item', 0, 4)
      h.onKeydown(key({ key: k, ctrlKey: true, shiftKey: true }))
      expect(h.state.value).toBe('- item')
    }
  })

  it('Ctrl+Shift+9 makes a checklist', () => {
    const h = harness('item', 0, 4)
    h.onKeydown(key({ key: '9', ctrlKey: true, shiftKey: true }))
    expect(h.state.value).toBe('- [ ] item')
  })

  it('Ctrl+Shift+. quotes', () => {
    const h = harness('said', 0, 4)
    h.onKeydown(key({ key: '.', ctrlKey: true, shiftKey: true }))
    expect(h.state.value).toBe('> said')
  })

  it('takes the keystroke rather than letting the browser act on it', () => {
    const h = harness('word', 0, 4)
    const event = key({ key: 'b', ctrlKey: true })
    const spy = vi.spyOn(event, 'preventDefault')
    h.onKeydown(event)
    expect(spy).toHaveBeenCalled()
  })

  it('leaves unclaimed shortcuts to the browser', () => {
    const h = harness('word', 0, 4)
    const event = key({ key: 'a', ctrlKey: true })
    const spy = vi.spyOn(event, 'preventDefault')
    h.onKeydown(event)
    expect(spy).not.toHaveBeenCalled()
    expect(h.state.value).toBe('word')
  })
})

describe('markdown-aware typing', () => {
  it('Enter continues a list', () => {
    const h = harness('- one')
    h.onKeydown(key({ key: 'Enter' }))
    expect(h.state.value).toBe('- one\n- ')
  })

  it('Enter on an empty item leaves the list', () => {
    const h = harness('- one\n- ')
    h.onKeydown(key({ key: 'Enter' }))
    expect(h.state.value).toBe('- one\n\n')
  })

  it('Enter in prose is left to the browser', () => {
    const h = harness('just words')
    const event = key({ key: 'Enter' })
    const spy = vi.spyOn(event, 'preventDefault')
    h.onKeydown(event)
    expect(spy).not.toHaveBeenCalled()
  })

  it('Tab indents and Shift+Tab outdents', () => {
    const h = harness('- item')
    h.onKeydown(key({ key: 'Tab' }))
    expect(h.state.value).toBe('  - item')
    h.onKeydown(key({ key: 'Tab', shiftKey: true }))
    expect(h.state.value).toBe('- item')
  })

  it('a third backtick opens a fence instead of typing a third backtick', () => {
    const h = harness('``')
    const event = key({ key: '`' })
    const spy = vi.spyOn(event, 'preventDefault')
    h.onKeydown(event)
    expect(spy).toHaveBeenCalled()
    expect(h.state.value).toBe('```\n\n```\n')
  })

  it('leaves a backtick alone anywhere else', () => {
    const h = harness('some `code')
    const event = key({ key: '`' })
    const spy = vi.spyOn(event, 'preventDefault')
    h.onKeydown(event)
    expect(spy).not.toHaveBeenCalled()
  })

  it('normalises a * or + bullet to the one the app writes', () => {
    for (const marker of ['* ', '+ ']) {
      const h = harness(marker)
      h.onInput(new InputEvent('input', { data: ' ' }))
      expect(h.state.value).toBe('- ')
    }
  })

  it('leaves a * alone once there is text after it', () => {
    const h = harness('* item ')
    h.onInput(new InputEvent('input', { data: ' ' }))
    expect(h.state.value).toBe('* item ')
  })
})
