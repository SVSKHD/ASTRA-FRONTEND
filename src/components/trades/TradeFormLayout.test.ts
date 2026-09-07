// The row: three inputs and a button, on one line.
//
// This is asserted against the stylesheets rather than against a rendered
// layout because jsdom has no layout — it computes no heights and resolves no
// `calc()`, so "is the button level with the inputs" is not a question it can
// answer. What CAN be pinned down is the reason the button was ever crooked,
// and that reason is a number: a FormField reserves a row under its control for
// a hint or an error, so a field's box ends lower than its input does, and
// anything bottom-aligned against the box sits low by exactly that much.
//
// So the rules are: the offset has a name, FormField is the thing that defines
// it, and the submit is the thing that cancels it. Break any one of those and
// the button drifts again.
import { describe, expect, it } from 'vitest'
import { markRaw } from 'vue'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { TRADE_SESSIONS } from '@/utils/tradeMath'

const SRC = join(process.cwd(), 'src')
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

const tokens = read('components/ui/tokens.css')
const formField = read('components/ui/FormField.vue')
const tradeForm = read('components/trades/TradeForm.vue')

describe('the reserved message row is a published measurement', () => {
  it('is a token, not a number copied into two files', () => {
    expect(tokens).toContain('--field-msg-gap:')
    expect(tokens).toContain('--field-msg-h:')
    // The sum, which is what a neighbour actually needs.
    expect(tokens).toMatch(
      /--field-msg-block:\s*calc\(var\(--field-msg-gap\)\s*\+\s*var\(--field-msg-h\)\)/,
    )
  })

  it('is what FormField itself reserves, so the two cannot disagree', () => {
    const block = formField.slice(formField.indexOf('.ui-ff__msgrow'))
    expect(block).toContain('margin-top: var(--field-msg-gap)')
    expect(block).toContain('min-height: var(--field-msg-h)')
  })
})

describe('the Log trade button', () => {
  it('cancels the reserved row, so it lands on the inputs and not below them', () => {
    const block = tradeForm.slice(tradeForm.indexOf('.tform__submit {'))
    expect(block).toContain('padding-bottom: var(--field-msg-block)')
  })

  it('is bottom-aligned against the fields rather than centred on them', () => {
    // `align-items: end` is half the fix; without the padding above it aligns
    // to the wrong edge, which is precisely the bug this pair fixes.
    const row = tradeForm.slice(tradeForm.indexOf('.tform__row {'))
    expect(row.slice(0, row.indexOf('}'))).toContain('align-items: end')
  })

  it('drops the offset when it stacks, where there is nothing to line up with', () => {
    const phone = tradeForm.slice(tradeForm.lastIndexOf('@media (max-width: 560px)'))
    expect(phone).toMatch(/\.tform__submit\s*\{[^}]*padding-bottom:\s*0/)
  })

  it('is inside the row, not after it — one line, not two', () => {
    const row = tradeForm.indexOf('<div class="tform__row">')
    const submit = tradeForm.indexOf('<div class="tform__submit">')
    const context = tradeForm.indexOf('class="tform__context"')
    expect(row).toBeGreaterThan(-1)
    expect(submit).toBeGreaterThan(row)
    expect(submit).toBeLessThan(context)
  })
})

describe('Side and Session', () => {
  it('carry the glyphs the rest of the tab already draws for them', () => {
    // The table, the timeline, the desk and the preview all draw these. The two
    // controls that set the values were the only surface using bare words.
    for (const name of [
      'IconBuy',
      'IconSell',
      'IconSessionAsia',
      'IconSessionLondon',
      'IconSessionNy',
    ]) {
      expect(tradeForm, name).toContain(name)
    }
    expect(tradeForm).toMatch(/label: 'Buy', icon: markRaw\(IconBuy\)/)
    expect(tradeForm).toMatch(/icon: SESSION_ICON\[s\]/)
  })

  it('never takes the sign colours — a side is a direction, not a result', () => {
    // Green and red belong to Move and P/L. A losing buy must not be green on
    // one side of the row and red on the other.
    const segments = tradeForm.slice(
      tradeForm.indexOf('const SESSION_ICON'),
      tradeForm.indexOf('// The trader'),
    )
    expect(segments).not.toMatch(/theme-success|theme-danger|tone:/)
  })

  it('share a full-width row, so three glyphed segments are not squeezed', () => {
    const block = tradeForm.slice(tradeForm.indexOf('.tform__choices {'))
    expect(block.slice(0, block.indexOf('}'))).toContain('grid-column: 1 / -1')
  })

  it('renders one segment per session, each with its glyph', () => {
    setActivePinia(createPinia())
    // The control itself, with the shape TradeForm hands it.
    const w = mount(SegmentedControl, {
      props: {
        modelValue: 'London',
        options: TRADE_SESSIONS.map((s) => ({
          value: s,
          label: s,
          icon: markRaw({ template: '<i/>' }),
        })),
        ariaLabel: 'Session',
      },
    })
    expect(w.findAll('.ui-seg__opt')).toHaveLength(TRADE_SESSIONS.length)
    expect(w.findAll('.ui-seg__label').map((n) => n.text())).toEqual([...TRADE_SESSIONS])
    expect(w.get('.ui-seg__opt.is-active').text()).toBe('London')
  })
})

describe('a segment that runs out of room', () => {
  it('scrolls the strip rather than clipping a word out of a label', () => {
    // `flex: 1` gave every segment the same width whatever was written in it,
    // so the longest label was clipped while the shortest sat in white space —
    // "One-off | Mont…" in a strip with room for both words. A segment now
    // starts at its content width and only grows.
    const css = read('components/ui/SegmentedControl.vue')
    const opt = css.slice(css.indexOf('.ui-seg__opt {'))
    expect(opt.slice(0, opt.indexOf('}'))).toContain('flex: 1 0 auto')

    const track = css.slice(css.indexOf('.ui-seg {'))
    expect(track.slice(0, track.indexOf('}'))).toContain('overflow-x: auto')

    // And the label is not the thing that gives any more.
    expect(css).not.toContain('text-overflow: ellipsis')
  })
})
