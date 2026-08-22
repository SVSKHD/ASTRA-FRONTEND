// What the note editor's toolbar holds, and what it holds when it is inside a
// dialog (section 22d).
//
// The full toolbar is fourteen buttons and a three-way mode switch. That is the
// right size for the notes view, where the editor owns the page; inside a
// dialog it is two wrapped rows of chrome above a 220px writing area, which
// reads as the toolbar being the point and the note being an afterthought.
//
// So compact mode keeps one row — the seven actions somebody actually reaches
// for while writing a note — and files the rest behind an overflow menu. The
// split is data rather than a second toolbar, because a forked toolbar is how
// the two drift apart.

import type { EditorAction } from '@/composables/useMarkdownEditor'
import { NOTE_EDITOR_MODES, type NoteEditorMode } from '@/utils/notes'

export interface EditorTool {
  action: EditorAction
  label: string
  title: string
}

// The set, in the order it is drawn. One list — compact mode reorders nothing,
// it only draws a prefix of it and hides the tail.
export const EDITOR_TOOLS: EditorTool[] = [
  { action: 'bold', label: 'B', title: 'Bold (Ctrl+B)' },
  { action: 'italic', label: 'I', title: 'Italic (Ctrl+I)' },
  { action: 'strike', label: 'S', title: 'Strikethrough (Ctrl+Shift+X)' },
  { action: 'code', label: '‹›', title: 'Code (Ctrl+E)' },
  { action: 'link', label: '🔗', title: 'Link (Ctrl+K)' },
  { action: 'h1', label: 'H1', title: 'Heading 1 (Ctrl+1)' },
  { action: 'h2', label: 'H2', title: 'Heading 2 (Ctrl+2)' },
  { action: 'h3', label: 'H3', title: 'Heading 3 (Ctrl+3)' },
  { action: 'bullet', label: '•', title: 'List (Ctrl+Shift+8)' },
  { action: 'checklist', label: '☑', title: 'Checklist (Ctrl+Shift+9)' },
  { action: 'ordered', label: '1.', title: 'Numbered list' },
  { action: 'quote', label: '❝', title: 'Quote (Ctrl+Shift+.)' },
  { action: 'fence', label: '{ }', title: 'Code block' },
  { action: 'table', label: '▦', title: 'Table' },
]

// The seven that stay on the bar in a dialog (section 22d, named there in this
// order): bold, italic, link, H2, list, checklist, code.
export const COMPACT_ACTIONS: EditorAction[] = [
  'bold',
  'italic',
  'link',
  'h2',
  'bullet',
  'checklist',
  'code',
]

const COMPACT = new Set<EditorAction>(COMPACT_ACTIONS)

// Compact draws the seven in the order section 22d names them, so the bar reads
// left to right the way the spec does; the overflow keeps the full set's order,
// because that is the order somebody who goes looking for `table` expects.
export function splitTools(
  compact: boolean,
  tools: readonly EditorTool[] = EDITOR_TOOLS,
): { primary: EditorTool[]; overflow: EditorTool[] } {
  if (!compact) return { primary: tools.slice(), overflow: [] }
  const byAction = new Map(tools.map((tool) => [tool.action, tool]))
  return {
    primary: COMPACT_ACTIONS.map((action) => byAction.get(action)).filter(
      (tool): tool is EditorTool => !!tool,
    ),
    overflow: tools.filter((tool) => !COMPACT.has(tool.action)),
  }
}

// No Split inside a dialog (section 22d): half of half a dialog is two columns
// of about twenty characters, and it doubles the render cost of a surface that
// is already sharing the frame with a task.
export function editorModes(compact: boolean): NoteEditorMode[] {
  return compact ? ['edit', 'preview'] : NOTE_EDITOR_MODES.slice()
}

// The mode actually rendered. The reader's stored choice is never rewritten by
// a narrow surface — it is narrowed on the way out, so closing the dialog puts
// the notes view back the way they left it.
export function effectiveMode(
  chosen: NoteEditorMode,
  context: { compact?: boolean; narrow?: boolean; mobile?: boolean } = {},
): NoteEditorMode {
  if (chosen !== 'split') return chosen
  return context.compact || context.narrow || context.mobile ? 'edit' : 'split'
}

// The writing area in a dialog: tall enough to hold a paragraph without
// scrolling, capped so the note cannot push the dialog's own footer out of
// reach. Past the cap it scrolls inside itself, which is the one place in the
// app where that is right — a note is not a row (section 20b's exception).
export const COMPACT_MIN_HEIGHT = 220
export const COMPACT_MAX_HEIGHT = '45vh'
