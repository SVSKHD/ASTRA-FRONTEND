// Acceptance 120, held by a test rather than by discipline.
//
// The Stylelint rule (section 24f) catches a raw font-size in a stylesheet. It
// cannot see the other two places this app sizes text: the inline style objects
// in styles.ts, which are JavaScript, and the `style="..."` strings a couple of
// components hand to third-party libraries. This walks the source and asserts
// all three are on the scale.
//
// The point is not tidiness. A size chosen at a call site is a decision made
// twice — once in the token file and once in the component — and the two drift
// apart silently, which is how an app ends up with 11px, 11.5px and 12px meta
// text on three adjacent rows.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { readdirSync, statSync } from 'node:fs'
import { TYPE_SCALE } from '@/components/ui/type'

const SRC = resolve(__dirname, '../..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(vue|ts|css)$/.test(name)) out.push(full)
  }
  return out
}

const FILES = walk(SRC).filter((f) => !/\.test\.ts$/.test(f))
// Posix separators on every platform, so an offender is named the same way
// wherever the suite runs.
const rel = (f: string) =>
  f
    .slice(SRC.length + 1)
    .split(sep)
    .join('/')

/** Where a number is legitimately not CSS, and a custom property cannot go. */
const NOT_CSS = new Set([
  // JointJS draws the planning board as SVG; `font-size` there is a
  // presentation attribute, which does not resolve custom properties. It reads
  // the same table through typePx(), so it is on the scale without the tokens.
  'composables/usePlanningBoard.ts',
  // The scale, and the page that renders it.
  'components/ui/type.ts',
  'components/ui/tokens.css',
  // Reads font-weight out of pasted HTML to decide whether a run was bold. It
  // parses other people's styling; it does not set any.
  'utils/mdPaste.ts',
])

describe('no raw font-size survives anywhere in the app', () => {
  it('not in a stylesheet or a scoped block', () => {
    const offenders: string[] = []
    for (const f of FILES) {
      if (NOT_CSS.has(rel(f))) continue
      const src = readFileSync(f, 'utf8')
      for (const [i, line] of src.split('\n').entries()) {
        // A comment mentioning font-size is not a declaration.
        if (/^\s*(\/\/|\*|<!--)/.test(line)) continue
        const m = /font-size:\s*([^;)]+)[;)]/.exec(line)
        // `inherit` is not a size; it is a refusal to pick one, which is
        // exactly what a control inside a sized container should do.
        if (m && !m[1].includes('var(--') && m[1].trim() !== 'inherit') {
          offenders.push(`${rel(f)}:${i + 1} ${m[1].trim()}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('not in an inline style object', () => {
    const offenders: string[] = []
    for (const f of FILES) {
      if (NOT_CSS.has(rel(f))) continue
      const src = readFileSync(f, 'utf8')
      for (const [i, line] of src.split('\n').entries()) {
        const m = /fontSize:\s*([^,}]+)/.exec(line)
        if (m && !m[1].includes('var(--')) offenders.push(`${rel(f)}:${i + 1} ${m[1].trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('no weight outside the three', () => {
  it('holds in stylesheets and in style objects alike', () => {
    const offenders: string[] = []
    for (const f of FILES) {
      if (NOT_CSS.has(rel(f))) continue
      const src = readFileSync(f, 'utf8')
      for (const [i, line] of src.split('\n').entries()) {
        if (/^\s*(\/\/|\*|<!--)/.test(line)) continue
        for (const m of line.matchAll(/font-?[wW]eight:\s*'?([^,;'}\n)]+)/g)) {
          const v = m[1].trim()
          // What the rule is actually against is a weight *chosen here*: a
          // literal. An expression is reading the value from somewhere — the
          // /ui page draws its samples from the WEIGHTS table itself — and
          // banning that would only push the number one line further away.
          if (/^\d+$/.test(v) || v === 'bold' || v === 'bolder') {
            offenders.push(`${rel(f)}:${i + 1} ${v}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('the mono is confined to data', () => {
  it('is never named directly — every call site goes through the token', () => {
    const offenders: string[] = []
    for (const f of FILES) {
      if (rel(f) === 'components/ui/tokens.css') continue
      const src = readFileSync(f, 'utf8')
      for (const [i, line] of src.split('\n').entries()) {
        if (/^\s*(\/\/|\*|<!--)/.test(line)) continue
        // A stack written out at the call site is one that can drift from the
        // token, and one the mono-only rule cannot audit.
        if (/font-?[fF]amily[:=][^;\n]*monospace/.test(line)) {
          offenders.push(`${rel(f)}:${i + 1}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('leaves the interface in the sans', () => {
    const css = readFileSync(resolve(SRC, 'style.css'), 'utf8')
    expect(css).toMatch(/font-family: var\(--font-sans\)/)
    expect(css).not.toMatch(/body\s*\{[^}]*JetBrains/)
  })
})

describe('the scale is small enough to hold in one head', () => {
  it('is eight steps — the sweep above is only tractable because of that', () => {
    expect(TYPE_SCALE).toHaveLength(8)
  })
})

describe('the source is text', () => {
  it('carries no control characters', () => {
    // A NUL in a source file is invisible in every editor, makes grep call the
    // file binary, and survives review for exactly that reason. One shipped
    // here as a sentinel value inside a string literal — and the fix for it was
    // reverted by an unrelated `git checkout --` before it was ever committed,
    // which is the other half of why this guard exists rather than a note.
    const control = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]')
    const offenders: string[] = []
    for (const f of FILES) {
      const m = control.exec(readFileSync(f, 'utf8'))
      if (m) offenders.push(`${rel(f)} at ${m.index}`)
    }
    expect(offenders).toEqual([])
  })
})
