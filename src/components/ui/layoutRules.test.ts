// Section 26d, rule 3, as a build failure rather than a checklist line.
//
// The rule is "any container holding text sets min-width: 0 and an explicit
// overflow behaviour". Stated that broadly it is not checkable — every div
// holds text eventually. What *is* checkable is the place the rule actually
// bites: a rule that clamps, ellipsises or breaks its text is a rule whose
// author knew the text could overflow. If it did that without min-width: 0, the
// clamp works and the box still blows out, because a grid or flex child
// defaults to the width of its longest word rather than to its track.
//
// That is precisely the bug in the unscheduled panel: the row clamped, and the
// panel was still pushed off its own edge.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'

const SRC = resolve(__dirname, '../..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(vue|css)$/.test(name)) out.push(full)
  }
  return out
}

// Posix separators on every platform, so an offender is named the same way
// wherever the suite runs.
const rel = (f: string) =>
  f
    .slice(SRC.length + 1)
    .split(sep)
    .join('/')

/** Declarations that say "the author expected this text to overflow". */
const OVERFLOW_AWARE = /(-webkit-line-clamp|text-overflow:\s*ellipsis|overflow-wrap:\s*anywhere)/

/** Split a stylesheet into `selector { ...declarations }` blocks. */
function* blocks(css: string): Generator<{ selector: string; body: string }> {
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    yield { selector: m[1].trim().split('\n').pop()!.trim(), body: m[2] }
  }
}

function styleOf(file: string): string {
  const src = readFileSync(file, 'utf8')
  if (file.endsWith('.css')) return src
  const at = src.indexOf('<style')
  return at < 0 ? '' : src.slice(src.indexOf('>', at) + 1, src.lastIndexOf('</style>'))
}

describe('a rule that expects text to overflow says how wide it may be', () => {
  it('sets min-width: 0 wherever it clamps, ellipsises or breaks', () => {
    const offenders: string[] = []
    for (const f of walk(SRC)) {
      for (const { selector, body } of blocks(styleOf(f))) {
        if (!OVERFLOW_AWARE.test(body)) continue
        // `white-space: nowrap` with an ellipsis on a non-shrinking element is
        // the one shape that does not need it — the element is not competing
        // for space in the first place.
        if (/flex-shrink:\s*0/.test(body)) continue
        if (!/min-width:\s*0/.test(body)) offenders.push(`${rel(f)} — ${selector}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('the checklist exists and still says what it says', () => {
  const template = readFileSync(resolve(SRC, '../.github/pull_request_template.md'), 'utf8')

  // Named rather than counted: a checklist that loses its hardest item and
  // keeps its length looks unchanged in a diff.
  const RULES = [
    'Colour carries no information alone',
    'coloured by its own sign',
    'No native form control',
    'min-width: 0',
    'Muted text clears the contrast floor',
    'Zero and empty states get a sentence',
  ]

  for (const rule of RULES) {
    it(`still asks about: ${rule}`, () => {
      expect(template).toContain(rule)
    })
  }

  it('reminds the author to read the exit code, not the test count', () => {
    // Both of this session's CI failures were invisible to "all tests passed".
    expect(template).toContain('exit code, not the test count')
  })

  it('reminds the author that two lockfiles fail a deploy', () => {
    expect(template).toContain('one lockfile')
  })
})
