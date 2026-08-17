// Acceptance 83: fences highlight, show their language and copy — and the
// highlighter is not in the initial bundle.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fenceLabel, fencesIn, highlightFences, loadHighlighter } from '@/utils/mdHighlight'
import { renderMarkdown } from '@/utils/mdRender'

function render(source: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = renderMarkdown(source)
  return host
}

describe('the language label', () => {
  it('expands the aliases people actually type', () => {
    expect(fenceLabel('ts')).toBe('typescript')
    expect(fenceLabel('js')).toBe('javascript')
    expect(fenceLabel('py')).toBe('python')
    expect(fenceLabel('sh')).toBe('shell')
    expect(fenceLabel('yml')).toBe('yaml')
  })

  it('passes an unknown language through, lowercased', () => {
    expect(fenceLabel('Rust')).toBe('rust')
    expect(fenceLabel('  Go  ')).toBe('go')
  })

  it('labels an unlabelled fence rather than showing nothing', () => {
    expect(fenceLabel('')).toBe('code')
  })
})

describe('finding fences', () => {
  it('finds every fence in document order', () => {
    const host = render('```ts\na\n```\n\ntext\n\n```py\nb\n```')
    const fences = fencesIn(host)
    expect(fences).toHaveLength(2)
    expect(fences[0].dataset.lang).toBe('ts')
    expect(fences[1].dataset.lang).toBe('py')
  })

  it('finds none in a note without code', () => {
    expect(fencesIn(render('# Title\n\njust prose'))).toHaveLength(0)
  })
})

describe('highlighting', () => {
  it('marks up the code and says so on the element', async () => {
    const host = render('```js\nconst x = 1\n```')
    await highlightFences(host)
    const code = host.querySelector('code')!
    expect(code.classList.contains('hljs')).toBe(true)
    expect(code.innerHTML).toContain('hljs-keyword')
    // The text itself is unchanged — only spans were added around it.
    expect(code.textContent).toBe('const x = 1\n')
  })

  it('falls back to auto-detection for an unlabelled fence', async () => {
    const host = render('```\nfunction hi() { return 1 }\n```')
    await highlightFences(host)
    expect(host.querySelector('code')!.classList.contains('hljs')).toBe(true)
  })

  it('leaves a fence in a language it does not know as plain text', async () => {
    const host = render('```notalanguage\nplain words here\n```')
    await highlightFences(host)
    expect(host.querySelector('code')!.textContent).toBe('plain words here\n')
  })

  it('does not highlight the same fence twice', async () => {
    const host = render('```js\nconst x = 1\n```')
    await highlightFences(host)
    const first = host.querySelector('code')!.innerHTML
    await highlightFences(host)
    expect(host.querySelector('code')!.innerHTML).toBe(first)
  })

  it('does nothing at all when there is no code to highlight', async () => {
    const host = render('# Title')
    await expect(highlightFences(host)).resolves.toBeUndefined()
  })

  it('resolves to a usable highlighter', async () => {
    const hljs = await loadHighlighter()
    expect(hljs?.getLanguage('typescript')).toBeTruthy()
  })
})

describe('the highlighter stays out of the initial bundle (acceptance 83)', () => {
  const SRC = join(process.cwd(), 'src')

  function sources(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        out.push(...sources(full))
        continue
      }
      if (/\.(ts|vue)$/.test(entry) && !entry.endsWith('.test.ts')) out.push(full)
    }
    return out
  }

  it('nothing imports highlight.js statically', () => {
    const offenders = sources(SRC).filter((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .some((line) => /^\s*import\s.*from\s+['"]highlight\.js/.test(line)),
    )
    expect(offenders).toEqual([])
  })

  it('the only reference to it is the dynamic import in the loader', () => {
    const loader = readFileSync(join(SRC, 'utils/mdHighlight.ts'), 'utf8')
    expect(loader).toContain("import('highlight.js/lib/common')")
  })
})
