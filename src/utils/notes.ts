// A note's title and preview are derived from its source. Since section 17 that
// source is markdown; notes written before it hold HTML from the old
// contentEditable and are still readable, so both shapes are handled here
// rather than in the components, and no caller has to know which it has.
//
// The distinction is made from the text itself rather than from a flag, because
// these helpers are handed bare strings (a draft mid-edit, a share snapshot)
// as often as they are handed a stored note.

import { countTasks } from '@/utils/mdTyping'

// Block-level tags become line breaks before we strip the rest, otherwise
// "<div>a</div><div>b</div>" collapses into "ab" and the title swallows line two.
const BLOCK_BREAK = /<\/(p|div|h[1-6]|li|tr|blockquote)>|<br\s*\/?>/gi
const TAGS = /<[^>]*>/g

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

// Whether a stored value is legacy HTML rather than markdown. A markdown note
// can mention a tag in a code span, so the test is for a real block-level or
// inline element, not for any angle bracket.
const HTML_ISH =
  /<(?:p|div|h[1-6]|ul|ol|li|br|hr|blockquote|strong|em|b|i|u|span|a|img|table|pre|code|input)\b[^>]*>/i

export function isHtmlNote(text: string): boolean {
  return HTML_ISH.test(text || '')
}

// Markdown → plain text. Enough to read a title and a preview out of a note:
// block markers off the front, inline markers unwrapped, fences and their
// contents dropped since a title is never a line of code.
export function markdownLines(source: string): string[] {
  const out: string[] = []
  let inFence = false
  for (const raw of (source || '').split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const line = raw
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
      .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/==([^=]+)==/g, '$1')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
      .replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1$2')
      .replace(/\s+/g, ' ')
      .trim()
    if (line) out.push(line)
  }
  return out
}

// Source → plain text, one string per visual line, blanks dropped.
export function noteLines(text: string): string[] {
  if (!isHtmlNote(text)) return markdownLines(text)
  const plain = (text || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(BLOCK_BREAK, '\n')
    .replace(TAGS, '')
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
  return plain
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
}

export function noteText(html: string): string {
  return noteLines(html).join(' ')
}

// The heading the list and the full view show. First line, capped so a note
// pasted as one long paragraph does not blow the row out.
export function noteTitle(html: string, max = 60): string {
  const first = noteLines(html)[0]
  if (!first) return 'Untitled note'
  return first.length > max ? first.slice(0, max - 1).trimEnd() + '…' : first
}

// Everything after the title, flattened — the two-line preview under it.
export function notePreview(html: string, max = 140): string {
  const rest = noteLines(html).slice(1).join(' ')
  if (!rest) return ''
  return rest.length > max ? rest.slice(0, max - 1).trimEnd() + '…' : rest
}

// True when the editor holds nothing but markup — an empty <div>, a stray <br>.
// Saving one of those would leave an untouchable blank row in the list.
export function isBlankNote(html: string): boolean {
  return noteLines(html).length === 0
}

// How many checklist boxes the note has, and how many are ticked. A markdown
// note counts `- [ ]` / `- [x]` lines; a legacy HTML one counts the real
// <input type="checkbox"> the old editor wrote.
export function noteChecks(text: string): { done: number; total: number } {
  if (!isHtmlNote(text)) return countTasks(text)
  const boxes = (text || '').match(/<input[^>]*type=["']?checkbox["']?[^>]*>/gi) || []
  const done = boxes.filter((b) => /\schecked\b/i.test(b)).length
  return { done, total: boxes.length }
}

// How the note editor is laid out. 'split' is the default because the whole
// point of section 17 is seeing the rendering while you write it; the other two
// exist for a narrow screen and for reading.
export type NoteEditorMode = 'edit' | 'preview' | 'split'

export const NOTE_EDITOR_MODES: NoteEditorMode[] = ['edit', 'preview', 'split']

export function isNoteEditorMode(value: unknown): value is NoteEditorMode {
  return typeof value === 'string' && (NOTE_EDITOR_MODES as string[]).includes(value)
}
