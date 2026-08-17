// The markdown pipeline for notes (section 17).
//
// Two jobs, in this order, always: markdown-it turns source into HTML, then
// DOMPurify decides what of that HTML is allowed to exist. The order matters
// and so does the fact that both run — `html: false` already keeps raw tags in
// the *source* from becoming markup, but a link href, an image src or an
// attribute set by markdown-it-attrs can still carry a payload, and sanitising
// is what closes that. Nothing in the app may hand markdown-it output to
// `v-html` without passing through `renderMarkdown` here.
//
// This module replaces nothing: `utils/markdown.ts` still renders GitHub issue
// bodies with its own deliberately tiny renderer. That one is for untrusted
// text from anyone who can comment on a repo; this one is for the user's own
// notes, where tables, footnotes and task lists are the point.

import MarkdownIt from 'markdown-it'
import { sanitize } from '@/utils/sanitizeHtml'
import taskLists from 'markdown-it-task-lists'
import anchor from 'markdown-it-anchor'
import attrs from 'markdown-it-attrs'
import mark from 'markdown-it-mark'
import footnote from 'markdown-it-footnote'
import deflist from 'markdown-it-deflist'

// Internal links route in-app rather than reloading the SPA. Anything on this
// host is ours; everything else opens in a new tab.
export const INTERNAL_HOSTS = ['spasta.online', 'www.spasta.online']

export function isInternalHref(href: string): boolean {
  const trimmed = (href || '').trim()
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true
  try {
    return INTERNAL_HOSTS.includes(new URL(trimmed).hostname.toLowerCase())
  } catch {
    return false
  }
}

// The path a router link should take for an internal href, or null when the
// href is not ours.
export function internalPath(href: string): string | null {
  const trimmed = (href || '').trim()
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed
  try {
    const url = new URL(trimmed)
    if (!INTERNAL_HOSTS.includes(url.hostname.toLowerCase())) return null
    return url.pathname + url.search + url.hash
  } catch {
    return null
  }
}

type Renderer = InstanceType<typeof MarkdownIt>

function createRenderer(): Renderer {
  const md = new MarkdownIt({
    // Raw HTML in a note is shown as text. A note is the user's own writing, but
    // it is also whatever they pasted from a web page, and there is no reason
    // for a <script> to survive that trip even before DOMPurify sees it.
    html: false,
    // Bare URLs become links — people paste them constantly and expect that.
    linkify: true,
    // A single newline is a line break. Strict markdown would swallow it, which
    // is wrong for the way notes are actually written and pasted.
    breaks: true,
    typographer: false,
  })

  md.use(taskLists, { enabled: true, label: true, labelAfter: false })
  md.use(anchor, { slugify: slugifyHeading })
  md.use(attrs, { allowedAttributes: ['id', 'class'] })
  md.use(mark)
  md.use(footnote)
  md.use(deflist)

  // Links: external ones open in a new tab and never leak a referrer; internal
  // ones are marked so the view can hand them to the router instead.
  const defaultLink =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = String(tokens[idx].attrGet('href') ?? '')
    if (isInternalHref(href)) {
      tokens[idx].attrSet('data-internal', '1')
    } else {
      tokens[idx].attrSet('target', '_blank')
      tokens[idx].attrSet('rel', 'noopener noreferrer')
    }
    return defaultLink(tokens, idx, options, env, self)
  }

  // Images are lazy and click-to-zoom. The class is what the view binds its
  // lightbox to; `loading` and `decoding` keep a note full of screenshots from
  // blocking the first paint of the note itself.
  const defaultImage =
    md.renderer.rules.image ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    tokens[idx].attrSet('loading', 'lazy')
    tokens[idx].attrSet('decoding', 'async')
    tokens[idx].attrJoin('class', 'md-img')
    return defaultImage(tokens, idx, options, env, self)
  }

  // Fences carry their language on the element so the lazy highlighter can find
  // them later and the view can label them, without re-parsing the source.
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]
    const lang = (token.info || '').trim().split(/\s+/)[0] || ''
    const code = escapeHtml(token.content)
    const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : ''
    const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : ''
    return `<pre class="md-fence"${langAttr}><code${langClass}>${code}</code></pre>\n`
  }

  // Tables scroll sideways on a narrow screen rather than widening the note.
  md.renderer.rules.table_open = () => '<div class="md-table-wrap"><table>\n'
  md.renderer.rules.table_close = () => '</table></div>\n'

  return md
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Heading ids: stable, readable, and unique per document. markdown-it-anchor
// handles the uniqueness suffix; this only decides the readable part.
export function slugifyHeading(text: string): string {
  return (
    (text || '')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '') || 'section'
  )
}

let renderer: Renderer | null = null
function instance(): Renderer {
  if (!renderer) renderer = createRenderer()
  return renderer
}

export { sanitize }

export interface RenderResult {
  html: string
  // Whether the note contains a fence — the view uses this to decide whether to
  // fetch the highlighter at all.
  hasCode: boolean
}

// The one entry point. Everything that reaches the DOM goes through here.
export function renderMarkdown(source: string): string {
  const raw = instance().render(source || '')
  return sanitize(raw)
}

export function renderMarkdownResult(source: string): RenderResult {
  const html = renderMarkdown(source)
  return { html, hasCode: /<pre class="md-fence"/.test(html) }
}

// Render an inline fragment (no wrapping paragraph) — used for previews and
// list rows where a block element would break the layout.
export function renderMarkdownInline(source: string): string {
  return sanitize(instance().renderInline(source || ''))
}

// Headings, in document order, for the table of contents. Derived from the
// source rather than the DOM so the TOC exists before anything is rendered.
export interface Heading {
  level: number
  text: string
  id: string
}

export function headingsOf(source: string): Heading[] {
  const out: Heading[] = []
  const seen = new Map<string, number>()
  let inFence = false
  for (const line of (source || '').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!match) continue
    // Strip the inline markup a heading may carry, so the TOC reads as text.
    const text = match[2]
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\{[^}]*\}\s*$/, '')
      .trim()
    const base = slugifyHeading(text)
    // markdown-it-anchor appends -1, -2, … to repeats; mirror that exactly so
    // the TOC's links match the ids actually rendered.
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    out.push({ level: match[1].length, text, id: count ? `${base}-${count}` : base })
  }
  return out
}
