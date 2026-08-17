// Syntax highlighting for code fences (section 17).
//
// The highlighter is the single biggest thing a note can pull in, and most
// notes contain no code at all — so it is never imported at the top level.
// `highlightFences` is called only after a render that produced a fence, and it
// loads highlight.js on that first call and caches it.
//
// Highlighting happens on the already-rendered, already-sanitised DOM rather
// than inside the markdown pipeline. That keeps the sanitiser's allow-list the
// only gate on what a note may contain, and means a note renders and is
// readable before the highlighter has finished arriving.

type HLJS = (typeof import('highlight.js'))['default']

let load: Promise<HLJS | null> | null = null

export function loadHighlighter(): Promise<HLJS | null> {
  if (!load) {
    load = import('highlight.js/lib/common').then((mod) => mod.default).catch(() => null)
  }
  return load
}

// Whether the highlighter has already been fetched. Lets a caller skip the
// await entirely on the second note with code in it.
export function highlighterReady(): boolean {
  return load !== null
}

export interface FenceInfo {
  lang: string
  code: string
}

// The fences in a rendered note, in document order.
export function fencesIn(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll('pre.md-fence')) as HTMLElement[]
}

// The label shown above a fence. highlight.js knows a lot of aliases; the label
// shows what the author wrote, tidied.
export function fenceLabel(lang: string): string {
  const value = (lang || '').trim().toLowerCase()
  if (!value) return 'code'
  const NAMES: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    rb: 'ruby',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    yml: 'yaml',
    md: 'markdown',
    'c++': 'cpp',
  }
  return NAMES[value] ?? value
}

// Apply highlighting to every fence under `root`. Safe to call repeatedly: a
// fence already highlighted is skipped, so a re-render that reuses nodes does
// not double-wrap the markup.
export async function highlightFences(root: ParentNode): Promise<void> {
  const fences = fencesIn(root).filter((pre) => !pre.dataset.highlighted)
  if (!fences.length) return
  const hljs = await loadHighlighter()
  if (!hljs) return
  for (const pre of fences) {
    const code = pre.querySelector('code')
    if (!code) continue
    const lang = pre.dataset.lang || ''
    try {
      const result =
        lang && hljs.getLanguage(lang)
          ? hljs.highlight(code.textContent || '', { language: lang })
          : hljs.highlightAuto(code.textContent || '')
      // highlight.js emits its own span markup around the text it was given.
      // The text came from the sanitised DOM and the spans carry only classes,
      // so this adds structure without widening what a note can contain.
      code.innerHTML = result.value
      code.classList.add('hljs')
    } catch {
      // A language it cannot parse leaves the plain text in place.
    }
    pre.dataset.highlighted = 'true'
  }
}
