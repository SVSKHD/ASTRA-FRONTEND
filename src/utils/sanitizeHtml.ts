// The HTML allow-list (section 17).
//
// Separate from the markdown renderer on purpose: several views only need to
// sanitise stored HTML — a trip's place notes, a shared note in a stranger's
// browser — and should not drag a markdown parser along to do it. Everything
// that reaches `v-html` anywhere in the app passes through this function.

import DOMPurify from 'dompurify'

// What a note is allowed to contain once rendered. Everything structural and
// nothing behavioural: no script, no iframe, no style element, no event
// handlers, no javascript: URLs.
const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'del',
  's',
  'mark',
  'sub',
  'sup',
  'code',
  'pre',
  'kbd',
  'samp',
  'blockquote',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'a',
  'img',
  'div',
  'span',
  'section',
  'input',
  'label',
]

const ALLOWED_ATTR = [
  'href',
  'src',
  'alt',
  'title',
  'class',
  'id',
  'target',
  'rel',
  'type',
  'checked',
  'disabled',
  'loading',
  'decoding',
  'colspan',
  'rowspan',
  'align',
  'start',
  'data-lang',
  'data-internal',
  'data-line',
  'data-task',
]

// Attributes whose value is a plain word, not a URL. DOMPurify tests every
// attribute it does not know to be URI-safe against ALLOWED_URI_REGEXP — so
// without this, narrowing that pattern to real schemes silently eats
// `target="_blank"`, `type="checkbox"` and `loading="lazy"` along with it.
const URI_SAFE_ATTR = [
  'target',
  'rel',
  'type',
  'checked',
  'disabled',
  'loading',
  'decoding',
  'colspan',
  'rowspan',
  'align',
  'start',
]

// DOMPurify permits `data:` URIs on <img> by design. A note's images come from
// the web or from the app's own uploads, so that exception buys nothing here
// and is closed rather than left open.
let hooked = false
function installHooks(): void {
  if (hooked) return
  hooked = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    for (const attr of ['src', 'href'] as const) {
      const value = node.getAttribute?.(attr)
      if (value && /^\s*data:/i.test(value)) node.removeAttribute(attr)
    }
  })
}

export function sanitize(html: string): string {
  installHooks()
  const clean = DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_URI_SAFE_ATTR: URI_SAFE_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
    // A rendered note is content, not a form or a document.
    FORBID_TAGS: ['script', 'iframe', 'style', 'form', 'object', 'embed', 'link', 'meta', 'base'],
    FORBID_ATTR: ['style', 'srcset', 'formaction', 'action', 'ping'],
    KEEP_CONTENT: true,
  })
  return typeof clean === 'string' ? clean : String(clean)
}
