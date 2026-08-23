// Section 25b. The behaviour that makes this a control rather than a row of
// buttons is the keyboard: one tab stop, arrows to move, wrapping at the ends.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'

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
