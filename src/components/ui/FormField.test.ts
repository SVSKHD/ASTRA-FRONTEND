// Section 25a, acceptances 127 and 128.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import FormField from '@/components/ui/FormField.vue'

type Slot = { id: string; describedBy?: string; invalid: boolean; required?: boolean }

const make = (props: Record<string, unknown> = {}) =>
  mount(FormField, {
    props,
    slots: {
      default: (s: Slot) =>
        h('input', { id: s.id, 'aria-describedby': s.describedBy, 'aria-invalid': s.invalid }),
    },
  })

describe('the wiring', () => {
  it('gives the control an id and points the label at it', () => {
    const w = make({ label: 'Title' })
    const id = w.find('input').attributes('id')!
    expect(id).toBeTruthy()
    expect(w.find('label').attributes('for')).toBe(id)
  })

  it('points aria-describedby at the hint', () => {
    const w = make({ label: 'Title', hint: 'Keep it short' })
    const described = w.find('input').attributes('aria-describedby')!
    expect(w.find(`#${described}`).text()).toBe('Keep it short')
  })

  it('points it at the error instead once there is one', () => {
    // This is the failure the shell exists to prevent: error text rendered as a
    // sibling paragraph with nothing pointing at it, so a screen reader reads
    // the field as fine while the page says otherwise.
    const w = make({ label: 'Title', hint: 'Keep it short', error: 'Enter a title' })
    const described = w.find('input').attributes('aria-describedby')!
    expect(w.find(`#${described}`).text()).toBe('Enter a title')
    expect(w.find('input').attributes('aria-invalid')).toBe('true')
  })

  it('takes an id from the caller when the control already has one', () => {
    expect(make({ label: 'T', id: 'given' }).find('input').attributes('id')).toBe('given')
  })
})

describe('the message row', () => {
  it('replaces the hint with the error rather than stacking them', () => {
    // Two lines of guidance under one field, one of which is now wrong, is
    // worse than either alone.
    const w = make({ hint: 'Keep it short', error: 'Enter a title' })
    expect(w.text()).toContain('Enter a title')
    expect(w.text()).not.toContain('Keep it short')
    expect(w.findAll('.ui-ff__msg')).toHaveLength(1)
  })

  it('is present even with nothing to say, so the field cannot change height', () => {
    // Acceptance 128. A form that grows when you tab out of the first field
    // pushes the submit button under your cursor, at the exact moment you are
    // being told you got something wrong.
    const quiet = make({ label: 'Title' })
    const loud = make({ label: 'Title', error: 'Enter a title' })
    expect(quiet.find('.ui-ff__msgrow').exists()).toBe(true)
    expect(loud.find('.ui-ff__msgrow').exists()).toBe(true)
    expect(quiet.findAll('.ui-ff__msg')).toHaveLength(1)
  })

  it('announces an error, and does not announce a hint', () => {
    expect(make({ error: 'Bad' }).find('.ui-ff__msg').attributes('role')).toBe('alert')
    expect(make({ hint: 'Fine' }).find('.ui-ff__msg').attributes('role')).toBeUndefined()
  })
})

describe('the required marker', () => {
  it('is shown, and hidden from a screen reader', () => {
    // The requirement reaches assistive tech through the control's own
    // `required`; an announced "asterisk" is nobody's intent.
    const w = make({ label: 'Title', required: true })
    expect(w.find('.ui-ff__req').text()).toBe('*')
    expect(w.find('.ui-ff__req').attributes('aria-hidden')).toBe('true')
  })

  it('passes the requirement down to the control', () => {
    const w = mount(FormField, {
      props: { label: 'T', required: true },
      slots: { default: (s: Slot) => h('input', { required: s.required }) },
    })
    expect(w.find('input').attributes('required')).toBeDefined()
  })
})

describe('the counter', () => {
  it('appears only when there is a limit to count against', () => {
    expect(make({ length: 4 }).find('.ui-ff__count').exists()).toBe(false)
    expect(make({ length: 4, maxLength: 40 }).find('.ui-ff__count').text()).toBe('4/40')
  })

  it('marks itself once the limit is passed', () => {
    expect(make({ length: 41, maxLength: 40 }).find('.ui-ff__count').classes()).toContain('is-over')
  })
})

describe('the size', () => {
  it('is carried on the shell and handed to the control', () => {
    const w = mount(FormField, {
      props: { size: 'sm' },
      slots: { default: (s: { size: string }) => h('input', { 'data-size': s.size }) },
    })
    expect(w.classes()).toContain('ui-ff--sm')
    expect(w.find('input').attributes('data-size')).toBe('sm')
  })
})
