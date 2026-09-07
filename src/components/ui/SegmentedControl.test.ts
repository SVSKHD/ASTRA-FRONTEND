// Section 25b. The behaviour that makes this a control rather than a row of
// buttons is the keyboard: one tab stop, arrows to move, wrapping at the ends.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, markRaw } from 'vue'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'

const SOURCE = join(process.cwd(), 'src/components/ui/SegmentedControl.vue')

/** Stands in for one of the trade family: takes `size`, renders an svg. */
const Marker = markRaw(
  defineComponent({
    props: { size: { type: Number, default: 16 } },
    setup: (props) => () => h('svg', { 'data-test-icon': '', 'data-size': String(props.size) }),
  }),
)

const OPTIONS = [
  { value: 'task', label: 'Task' },
  { value: 'todo', label: 'Todo' },
  { value: 'reminder', label: 'Reminder' },
]

const make = (modelValue = 'task') =>
  mount(SegmentedControl, { props: { modelValue, options: OPTIONS, ariaLabel: 'Type' } })

describe('the choice', () => {
  it('shows every option at once — that is the point of the shape', () => {
    expect(
      make()
        .findAll('.ui-seg__opt')
        .map((b) => b.text()),
    ).toEqual(['Task', 'Todo', 'Reminder'])
  })

  it('reports the option that was clicked', async () => {
    const w = make()
    await w.findAll('.ui-seg__opt')[2].trigger('click')
    expect(w.emitted('update:modelValue')![0]).toEqual(['reminder'])
  })

  it('says nothing when it is disabled', async () => {
    const w = mount(SegmentedControl, {
      props: { modelValue: 'task', options: OPTIONS, disabled: true },
    })
    await w.findAll('.ui-seg__opt')[1].trigger('click')
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
})

describe('the glyph', () => {
  // Optional, because most segmented controls choose between words. It exists
  // for the ones where the app already draws a picture for the same concept
  // elsewhere — the trade log draws a session icon in every table row, and the
  // control that SETS the session was rendering a bare word.
  it('draws one before the label when a segment carries it', () => {
    const w = mount(SegmentedControl, {
      props: {
        modelValue: 'buy',
        options: [
          { value: 'buy', label: 'Buy', icon: Marker },
          { value: 'sell', label: 'Sell', icon: Marker },
        ],
      },
    })
    expect(w.findAll('[data-test-icon]')).toHaveLength(2)
    // The label is still the accessible name; the glyph is decoration beside it.
    expect(w.findAll('.ui-seg__label').map((n) => n.text())).toEqual(['Buy', 'Sell'])
  })

  it('draws nothing extra for the segments that have none', () => {
    expect(make().findAll('[data-test-icon]')).toHaveLength(0)
    expect(
      make()
        .findAll('.ui-seg__label')
        .map((n) => n.text()),
    ).toEqual(['Task', 'Todo', 'Reminder'])
  })

  it('sizes the glyph from the control, never from the call site', () => {
    const at = (size: 'sm' | 'md' | 'lg') =>
      mount(SegmentedControl, {
        props: { modelValue: 'a', options: [{ value: 'a', label: 'A', icon: Marker }], size },
      })
        .get('[data-test-icon]')
        .attributes('data-size')
    // Three steps, three sizes, and no way for a caller to pick a fourth.
    expect([at('sm'), at('md'), at('lg')]).toEqual(['12', '14', '16'])
  })
})

describe('the keys it handles stop here', () => {
  // The shell binds the same four arrow keys on `document` to step through the
  // app's tabs. With the key still bubbling, arrowing along Personal ·
  // Business · All moved the segment AND switched the whole workspace to
  // another tab underneath it. One press, two answers.
  it('does not let an arrow it acted on reach a listener above it', async () => {
    const seen: string[] = []
    const w = mount(
      {
        components: { SegmentedControl },
        template: `<div @keydown="onKey"><SegmentedControl v-model="v" :options="opts" /></div>`,
        data: () => ({ v: 'task', opts: OPTIONS }),
        methods: {
          onKey(e: KeyboardEvent) {
            seen.push(e.key)
          },
        },
      },
      { attachTo: document.body },
    )
    await w.get('.ui-seg').trigger('keydown', { key: 'ArrowRight' })
    expect(w.findComponent(SegmentedControl).emitted('update:modelValue')![0]).toEqual(['todo'])
    // Moved the segment, and told nobody else about it.
    expect(seen).toEqual([])
    w.unmount()
  })

  it('lets a key it does NOT handle carry on past it', async () => {
    // `.stop` belongs on the keys the control consumes and on no others — a
    // control that swallows everything is a control that breaks Escape.
    const seen: string[] = []
    const w = mount(
      {
        components: { SegmentedControl },
        template: `<div @keydown="onKey"><SegmentedControl v-model="v" :options="opts" /></div>`,
        data: () => ({ v: 'task', opts: OPTIONS }),
        methods: {
          onKey(e: KeyboardEvent) {
            seen.push(e.key)
          },
        },
      },
      { attachTo: document.body },
    )
    await w.get('.ui-seg').trigger('keydown', { key: 'Escape' })
    expect(seen).toEqual(['Escape'])
    w.unmount()
  })
})

describe('the selection travels', () => {
  // jsdom computes no layout, so `offsetWidth` is 0 and the thumb never becomes
  // ready here. That is not a gap in the test — it is the case the fallback
  // exists for, and asserting it is how we know a real browser losing its
  // measurements degrades to something that still shows a selection rather than
  // to a control with nothing lit up.
  it('falls back to painting the active segment when it cannot measure', () => {
    const w = make()
    expect(w.find('.ui-seg__thumb').exists()).toBe(false)
    expect(w.get('.ui-seg').classes()).not.toContain('has-thumb')
    // The class the fallback rule keys off is still there to be styled.
    expect(w.get('.ui-seg__opt.is-active').text()).toBe('Task')
  })

  it('keeps the moving part out of the accessibility tree entirely', () => {
    // The thumb is decoration: the selected state is on the button, where a
    // screen reader looks for it. A second element announcing anything here
    // would be the same fact said twice.
    const css = readFileSync(SOURCE, 'utf8')
    const thumb = css.slice(css.indexOf('class="ui-seg__thumb"'))
    expect(thumb.slice(0, thumb.indexOf('>'))).toContain('aria-hidden="true"')
  })

  it('does not animate on the first paint', () => {
    // Every strip in the app mounts at once. Without this each one slides in
    // from the left, which is a page announcing itself rather than a control
    // answering a click.
    expect(make().get('.ui-seg').classes()).not.toContain('is-animated')
  })

  it('moves the thumb rather than cross-fading two backgrounds', () => {
    const css = readFileSync(SOURCE, 'utf8')
    // The fill lives on the thumb...
    const thumbRule = css.slice(css.indexOf('.ui-seg__thumb {'))
    expect(thumbRule.slice(0, thumbRule.indexOf('}'))).toContain('position: absolute')
    // ...and the thing that transitions is its position, not a colour.
    const anim = css.slice(css.indexOf('.ui-seg.is-animated .ui-seg__thumb {'))
    expect(anim.slice(0, anim.indexOf('}'))).toContain('transform var(--dur-med)')
  })

  it('is round, and says so once for every strip in the app', () => {
    const css = readFileSync(SOURCE, 'utf8')
    for (const rule of ['.ui-seg {', '.ui-seg__opt {', '.ui-seg__thumb {']) {
      const block = css.slice(css.indexOf(rule))
      expect(block.slice(0, block.indexOf('}')), rule).toContain(
        'border-radius: var(--radius-pill)',
      )
    }
  })
})

describe('what the strip says it is', () => {
  // One control, two promises. A radio group picks a value something else will
  // act on; a tab strip switches what is on screen. Nobody SEES the difference
  // — everybody using a screen reader HEARS it, every time.
  it('is a radio group by default, because most strips pick a value', () => {
    const w = make()
    expect(w.get('.ui-seg').attributes('role')).toBe('radiogroup')
    const opts = w.findAll('.ui-seg__opt')
    expect(opts[0].attributes('role')).toBe('radio')
    expect(opts[0].attributes('aria-checked')).toBe('true')
    // Never both: `aria-selected` on a radio is a contradiction.
    expect(opts[0].attributes('aria-selected')).toBeUndefined()
  })

  it('becomes a tablist on request, and swaps the state attribute with it', () => {
    const w = mount(SegmentedControl, {
      props: { modelValue: 'todo', options: OPTIONS, as: 'tablist', ariaLabel: 'Type' },
    })
    expect(w.get('.ui-seg').attributes('role')).toBe('tablist')
    const opts = w.findAll('.ui-seg__opt')
    expect(opts[1].attributes('role')).toBe('tab')
    expect(opts[1].attributes('aria-selected')).toBe('true')
    expect(opts[1].attributes('aria-checked')).toBeUndefined()
  })

  it('keeps one tab stop whichever it is', () => {
    for (const as of ['radiogroup', 'tablist'] as const) {
      const w = mount(SegmentedControl, { props: { modelValue: 'todo', options: OPTIONS, as } })
      const stops = w.findAll('.ui-seg__opt').filter((b) => b.attributes('tabindex') === '0')
      expect(stops, as).toHaveLength(1)
      expect(stops[0].text(), as).toBe('Todo')
    }
  })
})

describe('the keyboard', () => {
  it('is one tab stop, not three', () => {
    // A row of tab stops that all do the same kind of thing is the commonest
    // way a keyboard user loses their place in a form.
    const tabindexes = make()
      .findAll('.ui-seg__opt')
      .map((b) => b.attributes('tabindex'))
    expect(tabindexes).toEqual(['0', '-1', '-1'])
  })

  it('moves the selection with the arrows', async () => {
    const w = make('todo')
    await w.find('.ui-seg').trigger('keydown.right')
    expect(w.emitted('update:modelValue')![0]).toEqual(['reminder'])
  })

  it('wraps, so one to the left of the first means something', async () => {
    const w = make('task')
    await w.find('.ui-seg').trigger('keydown.left')
    expect(w.emitted('update:modelValue')![0]).toEqual(['reminder'])
  })

  it('takes Home and End to the ends', async () => {
    const w = make('todo')
    await w.find('.ui-seg').trigger('keydown.home')
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['task'])
    await w.find('.ui-seg').trigger('keydown.end')
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['reminder'])
  })
})

describe('what a screen reader is told', () => {
  it('is a radio group with a name and a checked member', () => {
    const w = make('todo')
    expect(w.find('[role="radiogroup"]').attributes('aria-label')).toBe('Type')
    const checked = w.findAll('[role="radio"]').map((b) => b.attributes('aria-checked'))
    expect(checked).toEqual(['false', 'true', 'false'])
  })
})

describe('the look', () => {
  it('gives the accent to the selected segment only (section 24d)', () => {
    // One accent per surface: a track that tints every option leaves the eye
    // with nothing to land on.
    const active = make('todo')
      .findAll('.ui-seg__opt')
      .filter((b) => b.classes('is-active'))
    expect(active).toHaveLength(1)
    expect(active[0].text()).toBe('Todo')
  })
})
