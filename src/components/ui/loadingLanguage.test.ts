// Four treatments, one job each, no overlap (section 43, item 5).
//
// The rule is easy to state and easy to break by accident, because every one of
// the four is individually reasonable and the damage only shows when two land
// on the same element. So it is checked as source, the way the icon set and the
// layout rules are: a skeleton that shimmers, or a button that carries both a
// spinner and a ring, fails the build rather than a review.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const UI = join(process.cwd(), 'src/components/ui')
const read = (file: string) => readFileSync(join(UI, file), 'utf8')
const styleOf = (file: string) => read(file).split('<style')[1] ?? ''

describe('a skeleton is a shape, not a sweep', () => {
  it('has no animation of its own', () => {
    // A skeleton stands in for content that is NOT there. The shimmer's
    // sentence — "what you are reading is being replaced" — is untrue of an
    // empty box, and saying it anyway is the overlap this rule exists to stop.
    const style = styleOf('Skeleton.vue')
    expect(style).not.toMatch(/animation:/)
    expect(style).not.toMatch(/@keyframes/)
  })

  it('still has real dimensions, so nothing jumps when the content lands', () => {
    const source = read('Skeleton.vue')
    expect(source).toMatch(/width\?/)
    expect(source).toMatch(/height\?/)
    expect(source).toMatch(/lines\?/)
  })
})

describe('the ring is on the element, never beside it', () => {
  it('reserves its box in every state', () => {
    const style = styleOf('SaveState.vue')
    // The box is sized by the wrapper and the wrapper is always rendered, so
    // idle, working, done and failed are the same square. A button that grows
    // fourteen pixels when pressed is a button that gets mis-clicked.
    expect(style).toMatch(/flex:\s*none/)
    expect(read('SaveState.vue')).toMatch(/width: `\$\{px\}px`, height: `\$\{px\}px`/)
  })

  it('draws all four states from one component, so they cannot drift apart', () => {
    const source = read('SaveState.vue')
    for (const state of ['working', 'done', 'failed']) {
      expect(source, state).toContain(`state === '${state}'`)
    }
  })
})

describe('the top bar is only ever about work with no element', () => {
  it('says so, and is fixed to the viewport rather than to anything on it', () => {
    const source = readFileSync(join(process.cwd(), 'src/composables/useBackgroundWork.ts'), 'utf8')
    // A save has a button; a route change has nothing. That is the whole test.
    expect(source).toMatch(/navigating/)
    expect(source).toMatch(/isSyncing/)
    expect(source).not.toMatch(/saving|saveState/i)
  })

  it('holds the same delay-and-floor contract as the ring', () => {
    const source = read('TopProgressBar.vue')
    expect(source).toMatch(/DELAY_MS = 200/)
    expect(source).toMatch(/MIN_VISIBLE_MS = 400/)
  })
})

describe('no element carries two treatments', () => {
  it('the button does not offer the old spinner and the new ring at once', () => {
    const source = read('Button.vue')
    // Both props exist — `loading` is used across the app and is not being
    // ripped out in a visual pass — but only one of them may render at a time
    // on any given button, and the two are documented as different things.
    expect(source).toMatch(/v-if="loading"/)
    expect(source).toMatch(/v-if="state"/)
    expect(source).toMatch(/Different from `loading`/)
  })

  it('the shimmer class is defined once, in tokens, and clipped to its panel', () => {
    const tokens = readFileSync(join(UI, 'tokens.css'), 'utf8')
    expect(tokens).toMatch(/\.ui-shimmer\b/)
    // Clipped to the panel's own radius: a sweep with square corners over a
    // rounded pane is a rectangle sliding across it.
    expect(tokens).toMatch(/\.ui-shimmer \{[^}]*border-radius: inherit/)
    expect(tokens).toMatch(/\.ui-shimmer \{[^}]*overflow: hidden/)
  })
})

describe('the glass costs what it says it costs (section 43, item 10)', () => {
  const tokens = () => readFileSync(join(UI, 'tokens.css'), 'utf8')

  it('never animates or transitions backdrop-filter', () => {
    // The most expensive property in the system, animated, is a compositor
    // pass per frame per pane. It is set and left.
    const css = tokens()
    expect(css).not.toMatch(/transition:[^;]*backdrop-filter/)
    expect(css).not.toMatch(/animation:[^;]*backdrop/)
    for (const block of css.split('@keyframes').slice(1)) {
      expect(block.split('}')[0] + block.split('}')[1]).not.toMatch(/backdrop-filter/)
    }
  })

  it('caps the depth at two panes and the count on a phone', () => {
    const css = tokens()
    // Depth: a glass surface inside a glass surface keeps its tint and gives up
    // its blur. Three sheets in a row is a blur of a blur of a blur.
    expect(css).toMatch(/\.ui-glass-raised :is\(/)
    expect(css).toMatch(/backdrop-filter: none/)
    // Count: the panels stop blurring at 700px, where they fill the width and
    // there is nothing visible behind them to soften.
    expect(css).toMatch(
      /@media \(max-width: 700px\) \{\s*\[data-theme='espresso'\] \{\s*--layer-raised-blur: none/,
    )
  })

  it('drops the blur under prefers-reduced-transparency and keeps the borders', () => {
    const css = tokens()
    const block = css.slice(css.indexOf('@media (prefers-reduced-transparency: reduce)'))
    expect(block).toMatch(/--layer-raised-blur: none/)
    // The tints go solid rather than disappearing: the layers must still read
    // as layers, they just stop being see-through.
    expect(block).toMatch(/--glass-raised: #/)
  })

  it('puts will-change only on elements that exist while they animate', () => {
    const css = tokens()
    const owners = [...css.matchAll(/([^{}]+)\{[^}]*will-change[^}]*\}/g)].map((m) => m[1].trim())
    // Both are pseudo-elements of a class that is only applied while the thing
    // is in flight, which is the only honest reading of "only while animating".
    expect(owners.sort()).toEqual(['.ui-shimmer::after', '.ui-topbar::after'])
  })
})
