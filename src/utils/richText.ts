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

/** Whether a stored value is HTML (written by the editor) rather than plain text. */
export function looksLikeHtml(value: string | null | undefined): boolean {
  return TAG.test(value ?? '')
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function richHtml(value: string | null | undefined): string {
  const v = value ?? ''
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
  '&#39;': "'",
}

export function richPlain(value: string | null | undefined): string {
  const v = value ?? ''
  if (!looksLikeHtml(v)) return v.trim()
  return (
    v
      // Block boundaries become line breaks so "first line" readers still work.
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|blockquote|pre)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)
      .replace(/​/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

export function richIsEmpty(value: string | null | undefined): boolean {
  return richPlain(value) === ''
}
