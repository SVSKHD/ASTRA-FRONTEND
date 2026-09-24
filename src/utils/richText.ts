// Todo descriptions and task notes are rich text (HTML written by RichEditor).
// Items saved before that are plain text, so every reader goes through here:
//
//   richHtml(value)  — safe HTML to render with v-html (plain text is escaped and
//                      its line breaks kept; HTML is sanitised).
//   richPlain(value) — the words alone, for places that show a one-line
//                      preview or hand the text to something that is not HTML
//                      (list rows, calendar subtitles, share text, GitHub).
//   richIsEmpty(value) — true for '', whitespace, or an editor left holding only
//                      empty paragraphs / <br>s.
import { sanitize } from '@/utils/sanitizeHtml'

// Only the tags RichEditor (and the sanitiser's allow-list) actually produce
// count as HTML. A looser "any <word>" test misread plain text such as
// "compare <price> to target" as markup, and sanitising it ate the words.
const TAG =
  /<\/?(p|br|hr|div|span|h[1-6]|ul|ol|li|strong|b|em|i|u|s|del|mark|code|pre|blockquote|a|img|input|label|table|thead|tbody|tr|th|td)(\s[^>]*)?\/?>/i

// The other thing only HTML contains, and the one this file used to miss.
//
// A tag is not the only evidence. Type into the editor without reaching for a
// heading or a list and the browser serialises exactly what you typed — no
// wrapper, no block, just text — except for the spaces, which come back as
// `&nbsp;`. That value has no tag in it, so the tag test called it plain text,
// `richHtml` escaped HTML that was already HTML, and the `&` became `&amp;`.
// The editor is then seeded with the escaped copy, saves it back, and the next
// read escapes it again: `&amp;nbsp;`, `&amp;amp;nbsp;`, and so on, one level
// per edit. Reaching for a heading hid the bug, because a heading is a tag.
const ENTITY = /&(?:nbsp|amp|lt|gt|quot|apos|#\d+);/i

/** Whether a stored value is HTML (written by the editor) rather than plain text. */
export function looksLikeHtml(value: string | null | undefined): boolean {
  const v = value ?? ''
  return TAG.test(v) || ENTITY.test(v)
}

// Undo the escalation described above, for the values it already reached.
//
// `&amp;amp;amp;nbsp;` can only have got that way by being escaped once per
// edit, so the run collapses back to the single entity that started it. The
// cost is honest: somebody who deliberately typed the literal text `&amp;`
// loses one level of it. That is a trade against text nobody typed and cannot
// remove by hand, and it is made here — on read — rather than as a migration,
// so nothing is rewritten in place and a value is repaired wherever it is shown.
const OVER_ESCAPED = /&(?:amp;)+(nbsp|amp|lt|gt|quot|apos|#\d+);/gi

export function repairEntities(value: string | null | undefined): string {
  return (value ?? '').replace(OVER_ESCAPED, '&$1;')
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function richHtml(value: string | null | undefined): string {
  const v = repairEntities(value)
  if (!v.trim()) return ''
  if (looksLikeHtml(v)) return sanitize(v)
  return escapeHtml(v).replace(/\r?\n/g, '<br>')
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
}

export function richPlain(value: string | null | undefined): string {
  const v = repairEntities(value)
  if (!looksLikeHtml(v)) return v.trim()
  return (
    v
      // Block boundaries become line breaks so "first line" readers still work.
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|blockquote|pre)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m.toLowerCase()] ?? m)
      .replace(/​/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

export function richIsEmpty(value: string | null | undefined): boolean {
  return richPlain(value) === ''
}
