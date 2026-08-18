// Binds the markdown transforms (utils/mdTyping) to a textarea: the shortcuts,
// the toolbar actions and the typing rules that make a list behave like a list.
//
// As with the paste composable, everything that decides *what* the text becomes
// lives in the pure module; this only reads the selection, applies a transform
// and puts the caret back.

import type { Ref } from 'vue'
import {
  insertLink,
  insertTable,
  lineAt,
  lineStartAt,
  onEnter,
  openFence,
  outdent,
  indent as indentLines,
  toggleBlock,
  toggleWrap,
  type BlockKind,
  type SourceState,
} from '@/utils/mdTyping'

export type EditorAction =
  | 'bold'
  | 'italic'
  | 'code'
  | 'strike'
  | 'link'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'quote'
  | 'bullet'
  | 'checklist'
  | 'ordered'
  | 'fence'
  | 'table'

export interface MarkdownEditorOptions {
  el: Ref<HTMLTextAreaElement | null>
  getValue: () => string
  setValue: (value: string, start: number, end: number) => void
}

const BLOCK_ACTIONS: Partial<Record<EditorAction, BlockKind>> = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  quote: 'quote',
  bullet: 'bullet',
  checklist: 'checklist',
  ordered: 'ordered',
}

const WRAP_ACTIONS: Partial<Record<EditorAction, string>> = {
  bold: '**',
  italic: '_',
  code: '`',
  strike: '~~',
}

export function useMarkdownEditor(options: MarkdownEditorOptions) {
  function read(): SourceState | null {
    const el = options.el.value
    if (!el) return null
    return { value: options.getValue(), start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 }
  }

  function write(next: SourceState): void {
    options.setValue(next.value, next.start, next.end)
    const el = options.el.value
    if (!el) return
    // The value round-trips through Vue before the textarea holds it, so the
    // selection is restored on the next frame rather than immediately.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(next.start, next.end)
    })
  }

  function apply(action: EditorAction): void {
    const state = read()
    if (!state) return
    const wrap = WRAP_ACTIONS[action]
    if (wrap) return write(toggleWrap(state, wrap))
    const block = BLOCK_ACTIONS[action]
    if (block) return write(toggleBlock(state, block))
    if (action === 'link') return write(insertLink(state))
    if (action === 'fence') return write(openFence(state))
    if (action === 'table') return write(insertTable(state))
  }

  // The shortcut table from the spec. Ctrl and Cmd are both accepted so the
  // same keystrokes work on either platform.
  function onKeydown(event: KeyboardEvent): void {
    const state = read()
    if (!state) return
    const mod = event.metaKey || event.ctrlKey

    if (mod && event.shiftKey) {
      const action = shiftAction(event.key)
      if (action) {
        event.preventDefault()
        apply(action)
      }
      return
    }

    if (mod) {
      const action = modAction(event.key)
      if (action) {
        event.preventDefault()
        apply(action)
      }
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      return write(event.shiftKey ? outdent(state) : indentLines(state))
    }

    if (event.key === 'Enter') {
      const next = onEnter(state)
      if (next) {
        event.preventDefault()
        write(next)
      }
      return
    }

    // ``` on an otherwise empty line opens a fence, closing brace and all.
    if (event.key === '`') {
      const before = state.value.slice(lineStartAt(state.value, state.start), state.start)
      if (before === '``' && state.start === state.end) {
        event.preventDefault()
        const from = lineStartAt(state.value, state.start)
        const stripped = {
          value: state.value.slice(0, from) + state.value.slice(state.start),
          start: from,
          end: from,
        }
        write(openFence(stripped))
      }
    }
  }

  // `- ` at the start of a line is already valid markdown, so nothing needs to
  // happen on space — but `* ` and `+ ` are normalised to the one bullet the
  // rest of the app writes, so a note does not end up with three styles.
  function onInput(event: Event): void {
    const el = options.el.value
    if (!el) return
    const data = (event as InputEvent).data
    if (data !== ' ') return
    const state = read()
    if (!state || state.start !== state.end) return
    const line = lineAt(state.value, state.start)
    const match = /^(\s*)([*+])\s$/.exec(line)
    if (!match) return
    const from = lineStartAt(state.value, state.start)
    const value =
      state.value.slice(0, from) + match[1] + '- ' + state.value.slice(from + line.length)
    const caret = from + match[1].length + 2
    write({ value, start: caret, end: caret })
  }

  return { apply, onKeydown, onInput }
}

function modAction(key: string): EditorAction | null {
  switch (key.toLowerCase()) {
    case 'b':
      return 'bold'
    case 'i':
      return 'italic'
    case 'e':
      return 'code'
    case 'k':
      return 'link'
    case '1':
      return 'h1'
    case '2':
      return 'h2'
    case '3':
      return 'h3'
    default:
      return null
  }
}

function shiftAction(key: string): EditorAction | null {
  // The digits are read by both `key` and the shifted glyph the layout produces,
  // so Ctrl+Shift+8 works whether the browser reports '8' or '*'.
  switch (key) {
    case '8':
    case '*':
      return 'bullet'
    case '9':
    case '(':
      return 'checklist'
    case '.':
    case '>':
      return 'quote'
    case 'x':
    case 'X':
      return 'strike'
    default:
      return null
  }
}
