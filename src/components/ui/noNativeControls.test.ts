// Acceptance 126, as a build failure rather than a promise.
//
// The library existed before this and the app still had a hundred and twenty
// native controls in it, because "use the library" is a thing you remember
// until you are in a hurry. A native select takes the OS's own colours and
// font, so it is the one element on the page that ignores the theme; a bare
// input has no focus ring, no error state and no size scale. Neither failure
// is visible in the file you are editing — only next to the controls beside it.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'

const SRC = resolve(__dirname, '../..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.vue')) out.push(full)
  }
  return out
}

// Posix separators on every platform: the allowlists below name files as
// `ui/TextInput.vue`, and `join` hands back a backslash on Windows.
const rel = (f: string) =>
  f
    .slice(SRC.length + 1)
    .split(sep)
    .join('/')
const FILES = walk(SRC).filter((f) => !rel(f).startsWith('components/ui/'))

/**
 * The two places a native element is right, each for a stated reason rather
 * than because nobody got round to it.
 */
const ALLOWED: Record<string, string> = {
  // Inserts HTML into a contenteditable, which is saved as the note's content.
  // Document markup, not a Vue template: a component tag there would be
  // fourteen characters of literal text in somebody's note.
  'components/RichEditor.vue': 'checklist markup inserted into a contenteditable',
}

/**
 * A hidden file input behind a label. It is the one control with no custom
 * equivalent to build — the picker is the operating system's, not ours — and
 * being hidden it renders nothing that could fail to match the theme. Removed
 * from the source before the check rather than exempting whole files, so the
 * exception is exactly as wide as the reason for it.
 */
const FILE_INPUT = /<input[^>]*type="file"[^>]*>/g

describe('no native form control outside the library', () => {
  for (const tag of ['select', 'input', 'textarea'] as const) {
    it(`no <${tag}>`, () => {
      const offenders: string[] = []
      for (const f of FILES) {
        if (ALLOWED[rel(f)]) continue
        const src = readFileSync(f, 'utf8')
        // Only the template half — a type annotation naming HTMLInputElement is
        // not a control.
        const start = src.indexOf('<template>')
        const body = (start < 0 ? src : src.slice(start)).replace(FILE_INPUT, '')
        const re = new RegExp(`<${tag}[\\s/>]`)
        if (re.test(body)) offenders.push(rel(f))
      }
      expect(offenders).toEqual([])
    })
  }

  it('states why each exception is one', () => {
    // An allowance without a reason is an allowance that outlives its reason.
    for (const [file, why] of Object.entries(ALLOWED)) {
      expect(why.length, file).toBeGreaterThan(20)
    }
  })

  it('allows a file input only where it is hidden behind a label', () => {
    for (const f of FILES) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.match(FILE_INPUT) ?? []) {
        expect(m, rel(f)).toContain('hidden')
      }
    }
  })
})

describe('the controls that must never be native (section 26a)', () => {
  // The bug this is really about: a native <select> renders its popup list
  // through the operating system. background, color and every token set on an
  // <option> are ignored on most platforms, so on a dark theme the list flashes
  // white. There is no CSS fix — the element has to be replaced, which means
  // the regression to guard is not "a select appeared in a view" but "the
  // library's own Select went back to being one".
  const MUST_BE_CUSTOM = ['Select', 'MultiSelect', 'Combobox', 'SegmentedControl']

  for (const name of MUST_BE_CUSTOM) {
    it(`${name} renders no <select> of its own`, () => {
      const src = readFileSync(resolve(SRC, `components/ui/${name}.vue`), 'utf8')
      // The template half only: these files explain in a comment what they are
      // not, and a prose mention of <select> is the opposite of a violation.
      const template = src.slice(src.indexOf('<template>'))
      expect(template).not.toMatch(/<select[\s/>]/)
      expect(template).not.toMatch(/<option[\s/>]/)
    })
  }

  it('opens its list in a portal, which a native select cannot do', () => {
    // The other half of why native had to go: a native popup cannot be
    // portalled out of a dialog, so inside one it renders wherever the platform
    // decides.
    const panel = readFileSync(resolve(SRC, 'components/ui/internal/ListboxPanel.vue'), 'utf8')
    expect(panel).toContain('<Teleport to="body">')
  })
})

describe('the library owns the native elements', () => {
  it('keeps every one of them inside ui/', () => {
    const inLibrary = walk(resolve(SRC, 'components/ui')).filter((f) => {
      const src = readFileSync(f, 'utf8')
      return /<(select|input|textarea)[\s/>]/.test(src)
    })
    // Not an exact list — a new control will add to it — but it must not be
    // empty, or the rule above is passing because nothing renders a field at
    // all.
    expect(inLibrary.length).toBeGreaterThan(3)
  })
})
