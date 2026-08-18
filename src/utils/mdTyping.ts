// Markdown-aware typing and the toolbar's transforms (section 17).
//
// Every operation is a pure function from one selection state to another, so
// "Enter continues the list", "Tab indents", "Ctrl+B bolds the selection" are
// all tested as text in / text out and the component only has to move the caret
// where it is told.

export interface SourceState {
  value: string
  start: number
  end: number
}

export function at(value: string, start: number, end = start): SourceState {
  return { value, start, end }
}

// --- line geometry ----------------------------------------------------------

export function lineStartAt(value: string, index: number): number {
  const before = value.lastIndexOf('\n', Math.max(0, index - 1))
  return before === -1 ? 0 : before + 1
}

export function lineEndAt(value: string, index: number): number {
  const after = value.indexOf('\n', index)
  return after === -1 ? value.length : after
}

export function lineAt(value: string, index: number): string {
  return value.slice(lineStartAt(value, index), lineEndAt(value, index))
}

// The range of whole lines a selection touches — every block operation works on
// lines, not on the characters the user happened to highlight.
export function lineRange(state: SourceState): { from: number; to: number } {
  return { from: lineStartAt(state.value, state.start), to: lineEndAt(state.value, state.end) }
}

// --- list structure ---------------------------------------------------------

export interface ListMarker {
  // Leading whitespace before the marker.
  indent: string
  // '-', '*', '+', or '1.' style. Empty when the line is not a list item.
  bullet: string
  // The '[ ] ' / '[x] ' part, when the item is a checklist item.
  task: '' | '[ ] ' | '[x] '
  // Everything after the marker.
  content: string
  // The ordered-list number, when there is one.
  ordinal: number | null
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/

export function parseListItem(line: string): ListMarker | null {
  const match = LIST_RE.exec(line)
  if (!match) return null
  const [, indent, bullet, task, content] = match
  const ordinal = /^\d/.test(bullet) ? Number.parseInt(bullet, 10) : null
  const normalizedTask: ListMarker['task'] = task ? (/\[[xX]\]/.test(task) ? '[x] ' : '[ ] ') : ''
  return { indent, bullet, task: normalizedTask, content, ordinal }
}

// The prefix that continues this item on the next line: same indent, same kind
// of marker, incremented if it is numbered, and an unticked box if it is a task.
export function continuationPrefix(marker: ListMarker): string {
  const bullet = marker.ordinal === null ? marker.bullet : `${marker.ordinal + 1}.`
  const task = marker.task ? '[ ] ' : ''
  return `${marker.indent}${bullet} ${task}`
}

// A blockquote continues too — the same reasoning as a list.
const QUOTE_RE = /^(\s*)(>+)\s?(.*)$/

// --- Enter ------------------------------------------------------------------

// Enter inside a list item continues it; Enter on an *empty* item ends the list
// instead of adding another empty bullet, which is what every editor does and
// what people expect.
export function onEnter(state: SourceState): SourceState | null {
  if (state.start !== state.end) return null
  const from = lineStartAt(state.value, state.start)
  const line = state.value.slice(from, state.start)

  const marker = parseListItem(line)
  if (marker) {
    if (!marker.content.trim()) {
      // Empty item: outdent it one level if it is nested, otherwise clear it.
      const to = lineEndAt(state.value, state.start)
      const replacement = marker.indent.length >= 2 ? marker.indent.slice(2) : ''
      const value = state.value.slice(0, from) + replacement + state.value.slice(to)
      const caret = from + replacement.length
      return marker.indent.length >= 2
        ? { value, start: caret, end: caret }
        : insert({ value, start: caret, end: caret }, '\n')
    }
    return insert(state, '\n' + continuationPrefix(marker))
  }

  const quote = QUOTE_RE.exec(line)
  if (quote) {
    if (!quote[3].trim()) {
      const to = lineEndAt(state.value, state.start)
      const value = state.value.slice(0, from) + state.value.slice(to)
      return insert({ value, start: from, end: from }, '\n')
    }
    return insert(state, `\n${quote[1]}${quote[2]} `)
  }

  return null
}

// --- Tab / Shift+Tab --------------------------------------------------------

const INDENT = '  '

export function indent(state: SourceState): SourceState {
  return shift(state, 1)
}

export function outdent(state: SourceState): SourceState {
  return shift(state, -1)
}

function shift(state: SourceState, direction: 1 | -1): SourceState {
  const { from, to } = lineRange(state)
  const block = state.value.slice(from, to)
  let firstDelta = 0
  let total = 0
  const lines = block.split('\n').map((line, i) => {
    if (direction === 1) {
      if (i === 0) firstDelta = INDENT.length
      total += INDENT.length
      return INDENT + line
    }
    const removed = /^ {1,2}/.exec(line)?.[0].length ?? 0
    if (i === 0) firstDelta = -removed
    total -= removed
    return line.slice(removed)
  })
  const value = state.value.slice(0, from) + lines.join('\n') + state.value.slice(to)
  return {
    value,
    start: Math.max(from, state.start + firstDelta),
    end: Math.max(from, state.end + total),
  }
}

// --- inline formatting ------------------------------------------------------

// Wrap the selection, or unwrap it when it is already wrapped — so the same
// shortcut is both "make bold" and "stop being bold". With nothing selected the
// markers are inserted and the caret lands between them, ready to type.
export function toggleWrap(state: SourceState, marker: string, placeholder = ''): SourceState {
  const { value, start, end } = state
  const selected = value.slice(start, end)

  if (selected) {
    if (
      selected.startsWith(marker) &&
      selected.endsWith(marker) &&
      selected.length > marker.length * 2
    ) {
      const inner = selected.slice(marker.length, selected.length - marker.length)
      return {
        value: value.slice(0, start) + inner + value.slice(end),
        start,
        end: start + inner.length,
      }
    }
    // Already wrapped just outside the selection — unwrap that instead, so
    // selecting the word inside **word** and pressing Ctrl+B still un-bolds.
    const before = value.slice(Math.max(0, start - marker.length), start)
    const after = value.slice(end, end + marker.length)
    if (before === marker && after === marker) {
      return {
        value: value.slice(0, start - marker.length) + selected + value.slice(end + marker.length),
        start: start - marker.length,
        end: end - marker.length,
      }
    }
    const wrapped = marker + selected + marker
    return {
      value: value.slice(0, start) + wrapped + value.slice(end),
      start: start + marker.length,
      end: start + marker.length + selected.length,
    }
  }

  const body = placeholder
  const wrapped = marker + body + marker
  return {
    value: value.slice(0, start) + wrapped + value.slice(start),
    start: start + marker.length,
    end: start + marker.length + body.length,
  }
}

// A link wraps the selection as the label and leaves the caret in the URL slot,
// which is the part you always have to type.
export function insertLink(state: SourceState, url = ''): SourceState {
  const { value, start, end } = state
  const label = value.slice(start, end) || 'link'
  const snippet = `[${label}](${url})`
  const value2 = value.slice(0, start) + snippet + value.slice(end)
  const urlStart = start + label.length + 3
  return { value: value2, start: urlStart, end: urlStart + url.length }
}

// --- block formatting -------------------------------------------------------

export type BlockKind = 'h1' | 'h2' | 'h3' | 'quote' | 'bullet' | 'checklist' | 'ordered'

const BLOCK_PREFIX: Record<BlockKind, string> = {
  h1: '# ',
  h2: '## ',
  h3: '### ',
  quote: '> ',
  bullet: '- ',
  checklist: '- [ ] ',
  ordered: '1. ',
}

// Strips whichever block prefix a line already carries, so switching from a
// heading to a quote does not stack the two.
const ANY_PREFIX = /^(\s*)(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/

export function toggleBlock(state: SourceState, kind: BlockKind): SourceState {
  const { from, to } = lineRange(state)
  const block = state.value.slice(from, to)
  const prefix = BLOCK_PREFIX[kind]
  const lines = block.split('\n')
  // Applying a block twice removes it: if every non-blank line already has this
  // exact prefix, the operation is "take it off".
  const meaningful = lines.filter((line) => line.trim())
  const allHave =
    meaningful.length > 0 &&
    meaningful.every((line) => stripIndent(line).startsWith(kind === 'ordered' ? '' : prefix)) &&
    (kind !== 'ordered' || meaningful.every((line) => /^\s*\d+[.)]\s+/.test(line)))

  let ordinal = 0
  let firstDelta = 0
  const next = lines.map((line, i) => {
    if (!line.trim()) return line
    const indentMatch = /^\s*/.exec(line)?.[0] ?? ''
    const bare = line.slice(indentMatch.length).replace(ANY_PREFIX, '')
    let replacement: string
    if (allHave) {
      replacement = indentMatch + bare
    } else {
      ordinal += 1
      replacement = indentMatch + (kind === 'ordered' ? `${ordinal}. ` : prefix) + bare
    }
    if (i === 0) firstDelta = replacement.length - line.length
    return replacement
  })

  const replaced = next.join('\n')
  const delta = replaced.length - block.length
  const value = state.value.slice(0, from) + replaced + state.value.slice(to)
  // The caret keeps its position within the line it was on, so toggling a
  // heading on does not drop the caret back to the start of the text.
  return {
    value,
    start: Math.max(from, state.start + firstDelta),
    end: Math.max(from, state.end + delta),
  }
}

function stripIndent(line: string): string {
  return line.replace(/^\s*/, '')
}

// --- fences -----------------------------------------------------------------

// Typing ``` on its own line opens a fence and puts the caret inside it, so the
// closing fence is never forgotten.
export function openFence(state: SourceState, lang = ''): SourceState {
  const line = lineAt(state.value, state.start)
  const lead = line.trim() ? '\n' : ''
  const snippet = `${lead}\`\`\`${lang}\n\n\`\`\`\n`
  const value = state.value.slice(0, state.start) + snippet + state.value.slice(state.end)
  const caret = state.start + lead.length + 4 + lang.length
  return { value, start: caret, end: caret }
}

export function insertTable(state: SourceState): SourceState {
  const line = lineAt(state.value, state.start)
  const lead = line.trim() ? '\n\n' : ''
  const snippet = `${lead}| Column | Column |\n| --- | --- |\n|  |  |\n`
  return insert(state, snippet)
}

// --- generic ----------------------------------------------------------------

export function insert(state: SourceState, text: string): SourceState {
  const value = state.value.slice(0, state.start) + text + state.value.slice(state.end)
  const caret = state.start + text.length
  return { value, start: caret, end: caret }
}

// --- checkbox write-back ----------------------------------------------------

// Flip the nth task-list checkbox in the source. The index is the order the
// checkboxes appear in the rendered note, which is the order they appear in the
// source — so the rendered view can say "the third box was clicked" and this
// finds it without needing to map DOM nodes back to lines.
export function toggleTaskAt(source: string, index: number): string {
  let seen = -1
  const lines = (source || '').split('\n')
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s)/.exec(lines[i])
    if (!match) continue
    seen += 1
    if (seen !== index) continue
    const ticked = match[2].toLowerCase() === 'x'
    lines[i] = match[1] + (ticked ? ' ' : 'x') + match[3] + lines[i].slice(match[0].length)
    return lines.join('\n')
  }
  return source
}

export function countTasks(source: string): { done: number; total: number } {
  let done = 0
  let total = 0
  let inFence = false
  for (const line of (source || '').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s/.exec(line)
    if (!match) continue
    total += 1
    if (match[1].toLowerCase() === 'x') done += 1
  }
  return { done, total }
}

// The task-list items in a note, as plain text — what "Convert checklist to
// tasks" offers to import.
export function checklistItems(source: string): { text: string; done: boolean }[] {
  const out: { text: string; done: boolean }[] = []
  let inFence = false
  for (const line of (source || '').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(.*)$/.exec(line)
    if (!match) continue
    const text = match[2]
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/[*_]([^*_]+)[*_]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .trim()
    if (text) out.push({ text, done: match[1].toLowerCase() === 'x' })
  }
  return out
}
