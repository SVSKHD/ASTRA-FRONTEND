// Getting a note out of the app (section 17): to the clipboard as markdown, to
// the clipboard as rich text, or to disk as a .md file.
//
// "Copy as rich text" is the one worth explaining. Pasting markdown source into
// an email or a document gives someone a wall of asterisks; what they want is
// the formatting. So the clipboard is written with both flavours — the rendered
// HTML *and* the markdown source — and the receiving app picks. Paste into Word
// and you get headings; paste into a code editor and you get the source back.

import { renderMarkdown } from '@/utils/mdRender'
import { noteTitle } from '@/utils/notes'

export async function copyAsMarkdown(source: string): Promise<boolean> {
  return writeText(source || '')
}

export async function copyAsRichText(source: string): Promise<boolean> {
  const html = renderMarkdown(source)
  const clipboard = navigator.clipboard as Clipboard | undefined
  // ClipboardItem is the only way to put two flavours on the clipboard, and it
  // is not everywhere. Where it is missing, the source is better than nothing.
  if (clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([source || ''], { type: 'text/plain' }),
        }),
      ])
      return true
    } catch {
      // Fall through to the plain-text path.
    }
  }
  return writeText(source || '')
}

async function writeText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard?.writeText(text)
    return true
  } catch {
    return false
  }
}

// A filename derived from the note's own first line, so a folder of exports is
// readable. Restricted to characters every filesystem accepts.
export function exportFilename(source: string): string {
  const title = noteTitle(source, 48)
  const slug =
    title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '') || 'note'
  return `${slug}.md`
}

// The download itself. Returns the object URL it created so a caller (a test,
// or a caller that wants to revoke early) can see what happened.
export function downloadMarkdown(source: string, filename = exportFilename(source)): string {
  return downloadText(source, filename, 'text/markdown;charset=utf-8')
}

// The same download for anything else a view wants to hand over as a file — the
// goal dialog's "Export JSON" (section 18d). One implementation, because the
// fiddly part is the anchor and the deferred revoke, not the mime type.
export function downloadText(text: string, filename: string, mime: string): string {
  const blob = new Blob([text || ''], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoked on the next tick: revoking synchronously can beat the download in
  // some browsers. Guarded, because by the time this fires the page may be
  // navigating away and the URL API is not always still there.
  setTimeout(() => {
    try {
      URL.revokeObjectURL?.(url)
    } catch {
      /* nothing to release */
    }
  }, 0)
  return url
}
