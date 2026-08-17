// Paste handling for the notes editor (section 17).
//
// The browser's default paste is wrong for a markdown editor in two opposite
// directions. Paste a README and the plain-text flavour arrives as-is but the
// editor may prefer the HTML flavour, so you get styled soup instead of source.
// Paste from Google Docs and there *is* no useful plain text — the HTML flavour
// carries the structure — so taking the text flavour throws the formatting away.
//
// So the choice is made explicitly here: markdown-looking text wins over the
// HTML flavour, rich HTML from a real document is converted to markdown first,
// and everything is normalised on the way in.

// Turndown is only needed when someone pastes rich HTML, which is a fraction of
// pastes, so it is fetched on first use rather than shipped with the editor.
import type TurndownService from 'turndown'

let turndownLoad: Promise<TurndownService | null> | null = null

async function loadTurndown(): Promise<TurndownService | null> {
  if (!turndownLoad) {
    turndownLoad = import('turndown')
      .then((mod) => {
        const Service = mod.default
        const service = new Service({
          headingStyle: 'atx',
          hr: '---',
          bulletListMarker: '-',
          codeBlockStyle: 'fenced',
          fence: '```',
          emDelimiter: '_',
          strongDelimiter: '**',
          linkStyle: 'inlined',
        })
        // Word and Docs wrap everything in spans and fonts carrying inline
        // styles. The styling itself does not survive — but the *meaning* some
        // of it carries does: Docs writes bold and italic as `font-weight` and
        // `font-style` on a span rather than as <strong>/<em>, so unwrapping
        // spans blindly would quietly drop every emphasis in the document.
        service.remove(['style', 'script', 'meta', 'link', 'title'])
        service.addRule('styledSpan', {
          filter: (node: HTMLElement) => node.nodeName === 'SPAN' || node.nodeName === 'FONT',
          replacement: (content: string, node: Node) => {
            if (!content.trim()) return content
            const style = (node as HTMLElement).getAttribute?.('style') || ''
            const weight = /font-weight:\s*(\d+|bold)/i.exec(style)?.[1] ?? ''
            const bold = weight === 'bold' || Number(weight) >= 600
            const italic = /font-style:\s*italic/i.test(style)
            let out = content
            if (italic) out = `_${out}_`
            if (bold) out = `**${out}**`
            return out
          },
        })
        // The wrapper Docs puts around a whole copied fragment is a <b> that
        // explicitly declares itself not bold. Taking it at face value would
        // open the paste with a stray `**`.
        service.addRule('docsWrapper', {
          filter: (node: HTMLElement) =>
            (node.nodeName === 'B' || node.nodeName === 'STRONG') &&
            /font-weight:\s*normal/i.test(node.getAttribute?.('style') || ''),
          replacement: (content: string) => content,
        })
        // Docs exports checklists as list items with a checkbox glyph; turn
        // them back into real task-list syntax.
        service.addRule('taskItems', {
          filter: (node: HTMLElement) =>
            node.nodeName === 'LI' && /^\s*[☐☑✓✔]\s*/.test(node.textContent || ''),
          replacement: (content: string) => {
            const done = /^\s*[☑✓✔]/.test(content)
            return `- [${done ? 'x' : ' '}] ${content.replace(/^\s*[☐☑✓✔]\s*/, '')}\n`
          },
        })
        service.addRule('strikethrough', {
          filter: ['del', 's'],
          replacement: (content: string) => `~~${content}~~`,
        })
        return service
      })
      .catch(() => null)
  }
  return turndownLoad
}

// Signals that a block of plain text is markdown rather than prose. Any one of
// these is enough — a pasted README rarely has all of them, and a pasted
// paragraph has none.
const MARKDOWN_SIGNALS: RegExp[] = [
  /^#{1,6}\s+\S/m, // heading
  /^\s*[-*+]\s+\S/m, // bullet list
  /^\s*\d+\.\s+\S/m, // ordered list
  /^\s*[-*+]\s+\[[ xX]\]/m, // task list
  /^\s*>\s+\S/m, // blockquote
  /^\s*(```|~~~)/m, // fence
  /^\s*\|.*\|\s*$/m, // table row
  /^\s*(-{3,}|\*{3,}|_{3,})\s*$/m, // thematic break
  /\[[^\]]+\]\([^)\s]+\)/, // link
  /!\[[^\]]*\]\([^)\s]+\)/, // image
  /\*\*[^*\n]+\*\*/, // bold
  /(?:^|\s)_[^_\n]+_(?:\s|$)/, // italic
  /~~[^~\n]+~~/, // strikethrough
  /`[^`\n]+`/, // code span
]

export function looksLikeMarkdown(text: string): boolean {
  const value = (text || '').trim()
  if (!value) return false
  return MARKDOWN_SIGNALS.some((re) => re.test(value))
}

// True when the HTML flavour carries structure worth converting, rather than
// being the browser's wrapper around what is really just plain text. A copy
// from a plain textarea produces `<div>line</div>` or a bare `<span>`; a copy
// from Docs or a web page produces headings, lists, tables, links.
const RICH_HTML = /<(h[1-6]|ul|ol|li|table|blockquote|pre|code|a\s|strong|b>|em|i>|img)/i

export function isRichHtml(html: string): boolean {
  const value = (html || '').trim()
  if (!value) return false
  // A Google Docs paste is wrapped in a marker comment; treat it as rich even
  // when the fragment itself is a single styled paragraph.
  if (/id=["']docs-internal-guid/i.test(value)) return true
  return RICH_HTML.test(value)
}

// Everything typed or pasted gets the same treatment on the way in, so a note's
// source stays diffable text rather than a mix of encodings and line endings.
export function normalizeMarkdown(text: string): string {
  return (
    (text || '')
      // Line endings first — everything below is line-oriented.
      .replace(/\r\n?/g, '\n')
      // Non-breaking and other exotic spaces become ordinary ones. A word
      // processor is full of them and they break list and heading detection.
      // Written as escapes: a literal U+2028 inside a regex would end the line.
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g, ' ')
      .replace(/[\u2028\u2029]/g, '\n')
      // Smart punctuation to straight, so search matches what people type.
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2026/g, '...')
      // Tabs to two spaces — markdown nesting is space-counted.
      .replace(/\t/g, '  ')
      // Trailing whitespace goes, including the two-space hard break — with
      // `breaks: true` a single newline already breaks the line, so the hard
      // break is redundant here and only shows up as invisible noise in a diff.
      .split('\n')
      .map((line) => line.replace(/\s+$/, ''))
      .join('\n')
      // One space after a list marker. Turndown pads to a four-character
      // marker, which is valid markdown but reads as ragged indentation next to
      // hand-written lists in the same note.
      .replace(/^(\s*)([-*+])[ \t]{2,}/gm, '$1$2 ')
      .replace(/^(\s*)(\d+[.)])[ \t]{2,}/gm, '$1$2 ')
      // Three or more blank lines collapse to one blank line between blocks.
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+/, '')
  )
}

export interface PasteDecision {
  // The markdown to insert.
  text: string
  // How it got there — drives the toast wording and the plain-text fallback.
  source: 'markdown' | 'converted' | 'plain' | 'link'
  // The unconverted plain-text flavour, for "Paste as plain text".
  plain: string
}

export interface ClipboardFlavours {
  text: string
  html: string
}

export function readClipboard(event: ClipboardEvent): ClipboardFlavours {
  const data = event.clipboardData
  return {
    text: data?.getData('text/plain') ?? '',
    html: data?.getData('text/html') ?? '',
  }
}

const BARE_URL = /^(?:https?:\/\/|mailto:)\S+$/i

export function isBareUrl(text: string): boolean {
  return BARE_URL.test((text || '').trim())
}

// The decision itself, kept pure so every branch is testable without a DOM or a
// clipboard. `selection` is the text the paste would replace — a URL pasted
// over selected text links that text rather than replacing it.
export async function decidePaste(
  flavours: ClipboardFlavours,
  selection = '',
): Promise<PasteDecision> {
  const plain = normalizeMarkdown(flavours.text)

  // A URL over a selection becomes a link around the selection.
  if (selection.trim() && isBareUrl(flavours.text)) {
    return { text: `[${selection.trim()}](${flavours.text.trim()})`, source: 'link', plain }
  }

  // Markdown-looking plain text wins outright: it is already the format we
  // store, and round-tripping it through the HTML flavour can only lose.
  if (plain && looksLikeMarkdown(plain)) {
    return { text: plain, source: 'markdown', plain }
  }

  // Rich HTML from a real document: convert, then normalise the result.
  if (isRichHtml(flavours.html)) {
    const service = await loadTurndown()
    if (service) {
      try {
        const converted = normalizeMarkdown(service.turndown(flavours.html))
        if (converted.trim()) return { text: converted, source: 'converted', plain }
      } catch {
        // A conversion failure falls through to the plain-text flavour rather
        // than losing the paste.
      }
    }
  }

  return { text: plain, source: 'plain', plain }
}

export function pasteToastLabel(source: PasteDecision['source']): string {
  if (source === 'converted') return 'Converted to markdown'
  if (source === 'markdown') return 'Pasted as markdown'
  if (source === 'link') return 'Linked the selection'
  return ''
}

// Splice replacement text into a value at a selection, returning the new value
// and where the caret should land. Shared by paste, the toolbar and the
// markdown-aware typing rules.
export interface Splice {
  value: string
  start: number
  end: number
}

export function spliceText(value: string, start: number, end: number, insert: string): Splice {
  const next = value.slice(0, start) + insert + value.slice(end)
  const caret = start + insert.length
  return { value: next, start: caret, end: caret }
}
