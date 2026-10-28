// Reading a web page the user linked in the AI chat (netlify/functions/ai.ts
// fetches it; this file is the pure part, shared with the tests): find the
// links in a message, refuse ones that point into a private network, and turn
// the page's HTML into the readable text the model is given.

/** The http(s) links in a message, in order, each once — at most `max`. */
export function linksIn(text: string, max = 3): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s<>"'`)\]]+/gi)) {
    // Sentence punctuation stuck to the end of a link is not part of it.
    const url = m[0].replace(/[.,;:!?]+$/, '')
    try {
      const u = new URL(url)
      if (!out.includes(u.href)) out.push(u.href)
    } catch {
      /* not a URL after all */
    }
    if (out.length >= max) break
  }
  return out
}

/**
 * Whether a host is private: localhost, a bare name, or an address in a
 * private, loopback, link-local or metadata range. The proxy runs inside a
 * cloud network, so without this a link could make it read internal services.
 */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true
  if (h.endsWith('.internal') || (!h.includes('.') && !h.includes(':'))) return true
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    )
  }
  if (h.includes(':')) {
    // IPv6: loopback, unspecified, unique-local, link-local, mapped v4.
    if (h === '::1' || h === '::') return true
    if (/^f[cd]/.test(h) || /^fe[89ab]/.test(h)) return true
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h)
    if (mapped) return isPrivateHost(mapped[1])
  }
  return false
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
}

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

export interface PageText {
  title: string
  text: string
}

/**
 * A page's title and readable text: scripts, styles, navigation and other
 * chrome removed, block elements as line breaks, whitespace collapsed, cut to
 * `maxChars`. Plain text and JSON pass through with only the cut.
 */
export function pageText(body: string, contentType: string, maxChars = 12_000): PageText {
  if (!/html|xml/i.test(contentType)) {
    return { title: '', text: body.replace(/\s+\n/g, '\n').trim().slice(0, maxChars) }
  }
  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const description = decode(
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(body)?.[1] ?? '',
  ).trim()
  let html = body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|footer|header|aside|form)\b[\s\S]*?<\/\1>/gi, ' ')
  // Prefer the page's main content when it marks it.
  const main = /<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(html)?.[2]
  if (main && main.length > 400) html = main
  const text = decode(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|section|h[1-6]|li|tr|table|ul|ol|blockquote|pre)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const full = description && !text.includes(description) ? `${description}\n\n${text}` : text
  return { title, text: full.slice(0, maxChars) }
}
