// A small, deliberately narrow markdown renderer for GitHub issue bodies (13d).
//
// The rule the spec cares about is: render issue bodies as sanitised markdown,
// never execute HTML. So the very first thing this does is escape the entire
// input — every `<`, `>`, `&`, quote — and only afterwards does it introduce
// tags of its own. Raw HTML in an issue body therefore shows up as text, which
// is the safe reading of untrusted content written by anyone who can comment on
// a repo.
//
// Nothing here builds a general markdown engine: headings, emphasis, code,
// links, lists, blockquotes and rules cover issue bodies, and anything not
// recognised falls through as escaped text.

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Only these schemes become anchors. Anything else — `javascript:`, `data:`, a
// protocol-relative URL — is rendered as plain text instead.
const SAFE_URL = /^(https?:\/\/|mailto:)[^\s<>"']+$/i

export function safeUrl(url: string): string | null {
  const trimmed = url.trim()
  return SAFE_URL.test(trimmed) ? trimmed : null
}

function anchor(href: string, text: string): string {
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>`
}

// Emphasis and links, on already-escaped text outside of code spans.
function inlineText(escaped: string): string {
  let out = escaped

  // [text](url) — the URL is validated; a rejected one keeps its literal text.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, text: string, url: string) => {
    // URLs arrive HTML-escaped; unescape ampersands so query strings survive.
    const href = safeUrl(url.replace(/&amp;/g, '&'))
    return href ? anchor(href, text) : whole
  })
  // Bare autolinks.
  out = out.replace(/(^|[\s(])(https?:\/\/[^\s<>"']+)/g, (whole, pre: string, url: string) => {
    const href = safeUrl(url.replace(/&amp;/g, '&'))
    return href ? `${pre}${anchor(href, url)}` : whole
  })
  // GitHub cross-references (#12, @user) stay as text: linkifying them would
  // need repo context this renderer deliberately does not have.
  return out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
}

// Inline pass. Code spans are split out first, so emphasis inside backticks
// stays literal and no placeholder token is ever needed.
function inline(escaped: string): string {
  return escaped
    .split(/(`[^`]+`)/g)
    .map((part) =>
      part.length > 1 && part.startsWith('`') && part.endsWith('`')
        ? `<code>${part.slice(1, -1)}</code>`
        : inlineText(part),
    )
    .join('')
}

// Block pass. Input is raw markdown; every line is escaped before any tag is
// emitted.
export function renderMarkdown(source: string | null | undefined): string {
  const lines = (source || '').replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let inFence = false
  let fenceLines: string[] = []
  let paragraph: string[] = []

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`)
      listType = null
    }
  }
  const closeParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${inline(paragraph.join('<br>'))}</p>`)
      paragraph = []
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (line.trim().startsWith('```')) {
      if (inFence) {
        out.push(`<pre><code>${fenceLines.join('\n')}</code></pre>`)
        fenceLines = []
        inFence = false
      } else {
        closeParagraph()
        closeList()
        inFence = true
      }
      continue
    }
    if (inFence) {
      fenceLines.push(escapeHtml(raw))
      continue
    }

    if (!line.trim()) {
      closeParagraph()
      closeList()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      closeParagraph()
      closeList()
      // Issue headings render inside a card, so they start two levels down.
      const level = Math.min(heading[1].length + 2, 6)
      out.push(`<h${level}>${inline(escapeHtml(heading[2]))}</h${level}>`)
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      closeParagraph()
      closeList()
      out.push('<hr>')
      continue
    }

    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      closeParagraph()
      closeList()
      out.push(`<blockquote>${inline(escapeHtml(quote[1]))}</blockquote>`)
      continue
    }

    // Task list items keep their checkbox as a glyph rather than an input — the
    // rendered body is a read-only mirror, not a control surface.
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      closeParagraph()
      if (listType !== 'ul') {
        closeList()
        out.push('<ul>')
        listType = 'ul'
      }
      const box = /^\[([ xX])\]\s+(.*)$/.exec(bullet[1])
      const text = box ? `${box[1] === ' ' ? '☐' : '☑'} ${box[2]}` : bullet[1]
      out.push(`<li>${inline(escapeHtml(text))}</li>`)
      continue
    }

    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line)
    if (numbered) {
      closeParagraph()
      if (listType !== 'ol') {
        closeList()
        out.push('<ol>')
        listType = 'ol'
      }
      out.push(`<li>${inline(escapeHtml(numbered[1]))}</li>`)
      continue
    }

    closeList()
    paragraph.push(escapeHtml(line))
  }

  // An unterminated fence still renders as code rather than swallowing the rest.
  if (inFence && fenceLines.length) out.push(`<pre><code>${fenceLines.join('\n')}</code></pre>`)
  closeParagraph()
  closeList()
  return out.join('\n')
}

// A one-line plain-text summary of a body, for a row with no room to render one.
export function markdownExcerpt(source: string | null | undefined, max = 120): string {
  const text = (source || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text
}
