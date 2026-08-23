// Section 25b — TextInput, NumberInput and TextArea.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TextInput from '@/components/ui/TextInput.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import TextArea from '@/components/ui/TextArea.vue'

describe('TextInput', () => {
  const make = (props: Record<string, unknown> = {}) =>
    mount(TextInput, { props: { modelValue: '', ...props } })

  it('wears the shared control shell, so its states are the library’s', () => {
    const w = make({ size: 'sm' })
    expect(w.find('.ui-control').classes()).toContain('ui-control--sm')
  })

  it('marks itself invalid from either the flag or an error string', () => {
    expect(make({ invalid: true }).find('input').attributes('aria-invalid')).toBe('true')
    expect(make({ error: 'Nope' }).find('input').attributes('aria-invalid')).toBe('true')
  })

  it('takes describedby from the shell when it is inside one', () => {
    // Inside a FormField the shell owns the message ids; the control must defer
    // rather than generate a second set nothing points at.
    const w = make({ describedBy: 'outer-msg', hint: 'ignored' })
    expect(w.find('input').attributes('aria-describedby')).toBe('outer-msg')
  })

  it('shows a prefix as part of the field, not part of the value', async () => {
    const w = make({ prefix: '₹', modelValue: '500' })
    expect(w.find('.ui-ti__affix').text()).toBe('₹')
    expect(w.find('input').element.value).toBe('500')
  })

  it('clears only when clearable and holding something', async () => {
    expect(make({ modelValue: 'x' }).find('.ui-ti__clear').exists()).toBe(false)
    expect(make({ modelValue: '', clearable: true }).find('.ui-ti__clear').exists()).toBe(false)
    const w = make({ modelValue: 'x', clearable: true })
    await w.find('.ui-ti__clear').trigger('click')
    expect(w.emitted('update:modelValue')![0]).toEqual([''])
    expect(w.emitted('clear')).toBeTruthy()
  })

  it('puts the loading spinner beside the text, never over it', () => {
    const w = make({ loading: true })
    expect(w.find('.ui-ti__spin').exists()).toBe(true)
    expect(w.find('.ui-control').element.contains(w.find('input').element)).toBe(true)
  })
})

describe('NumberInput', () => {
  const make = (props: Record<string, unknown> = {}) =>
    mount(NumberInput, { props: { modelValue: 10, ...props } })

  it('is not a native number input', () => {
    // Its spinners cannot be styled, its wheel behaviour changes the value while
    // the page scrolls past it, and it reports "" for anything it dislikes — so
    // "12e" and "" reach the model as the same thing.
    expect(make().find('input').attributes('type')).toBe('text')
    expect(make().find('input').attributes('inputmode')).toBe('decimal')
  })

  it('nudges by the step from the arrow keys', async () => {
    const w = make({ modelValue: 60, step: 15 })
    await w.find('input').trigger('keydown', { key: 'ArrowUp' })
    expect(w.emitted('update:modelValue')![0]).toEqual([75])
    await w.find('input').trigger('keydown', { key: 'ArrowDown' })
    expect(w.emitted('update:modelValue')![1]).toEqual([45])
  })

  it('nudges from the steppers too', async () => {
    const w = make({ modelValue: 1 })
    await w.findAll('.ui-num__step')[0].trigger('click')
    expect(w.emitted('update:modelValue')![0]).toEqual([2])
  })

  it('keeps the steppers out of the tab order', () => {
    // The field itself takes the arrows; two extra tab stops per number would
    // tax every keyboard user for nobody's benefit.
    for (const b of make().findAll('.ui-num__step')) {
      expect(b.attributes('tabindex')).toBe('-1')
    }
  })

  it('does not clamp while typing', async () => {
    // Clamping on input turns "10" on its way to "100" into "10" forever.
    const w = make({ modelValue: null, max: 50 })
    await w.find('input').setValue('10')
    expect(w.emitted('update:modelValue')![0]).toEqual([10])
  })

  it('clamps on blur', async () => {
    const w = make({ modelValue: 900, max: 480 })
    await w.find('input').trigger('blur')
    expect(w.emitted('update:modelValue')![0]).toEqual([480])
  })

  it('reads an empty field as null rather than zero', async () => {
    const w = make({ modelValue: 5 })
    await w.find('input').setValue('')
    expect(w.emitted('update:modelValue')![0]).toEqual([null])
  })

  it('leaves a half-typed value alone instead of clearing under the cursor', async () => {
    const w = make({ modelValue: 5 })
    await w.find('input').setValue('-')
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('does not produce 0.30000000000000004 in a field somebody reads', async () => {
    const w = make({ modelValue: 0.1, step: 0.2 })
    await w.find('input').trigger('keydown', { key: 'ArrowUp' })
    expect(w.emitted('update:modelValue')![0]).toEqual([0.3])
  })

  it('stops the steppers at the ends', () => {
    const w = make({ modelValue: 480, max: 480 })
    expect(w.findAll('.ui-num__step')[0].attributes('disabled')).toBeDefined()
    expect(w.findAll('.ui-num__step')[1].attributes('disabled')).toBeUndefined()
  })

  it('announces itself as a spinbutton with its range', () => {
    const input = make({ modelValue: 60, min: 0, max: 480 }).find('input')
    expect(input.attributes('role')).toBe('spinbutton')
    expect(input.attributes('aria-valuenow')).toBe('60')
    expect(input.attributes('aria-valuemin')).toBe('0')
    expect(input.attributes('aria-valuemax')).toBe('480')
  })

  it('uses tabular figures, so a column of estimates lines up', () => {
    expect(make().find('input').classes()).toContain('ui-tabular')
  })
})

describe('TextArea', () => {
  const make = (props: Record<string, unknown> = {}) =>
    mount(TextArea, { props: { modelValue: '', ...props }, attachTo: document.body })

  it('auto-grows by default, through the shared composable', async () => {
    const w = make({ modelValue: 'one\ntwo\nthree' })
    await nextTick()
    // jsdom reports no layout, so what is asserted is the wiring: the field
    // has a height set on it by the resizer rather than by an attribute.
    expect(w.find('textarea').attributes('style')).toContain('max-height')
    expect(w.find('textarea').classes()).not.toContain('is-fixed')
    w.unmount()
  })

  it('can be a fixed window onto something long', () => {
    // Pasted JSON growing to forty lines pushes the rest of the form off screen.
    const w = make({ autoGrow: false, rows: 6 })
    expect(w.find('textarea').attributes('rows')).toBe('6')
    expect(w.find('textarea').classes()).toContain('is-fixed')
    w.unmount()
  })

  it('reports what was typed', async () => {
    const w = make()
    await w.find('textarea').setValue('hello')
    expect(w.emitted('update:modelValue')![0]).toEqual(['hello'])
    w.unmount()
  })

  it('wears the same shell and sizes as the single-line fields', () => {
    const w = make({ size: 'lg' })
    expect(w.find('.ui-control').classes()).toContain('ui-control--lg')
    w.unmount()
  })

  it('defers to the shell for describedby', () => {
    const w = make({ describedBy: 'outer', hint: 'ignored' })
    expect(w.find('textarea').attributes('aria-describedby')).toBe('outer')
    w.unmount()
  })
})
