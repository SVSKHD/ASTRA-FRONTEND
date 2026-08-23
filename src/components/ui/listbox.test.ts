// Section 25b, acceptances 126 and 129 — the four list controls as they render.
//
// The panels are teleported, so almost everything here is queried through the
// document rather than the wrapper. That is not an inconvenience to work around:
// it is the assertion. A listbox that could be found inside its own field would
// be a listbox clipped by the first ancestor that scrolls, and inside a dialog
// it would be clipped even positioned fixed, because a transform or a
// backdrop-filter makes the dialog the containing block.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import Select from '@/components/ui/Select.vue'
import MultiSelect from '@/components/ui/MultiSelect.vue'
import Combobox from '@/components/ui/Combobox.vue'
import TagInput from '@/components/ui/TagInput.vue'
import type { ListOption } from '@/composables/useListbox'

const OPTIONS: ListOption[] = [
  { value: 'a', label: 'Apples', group: 'Fruit' },
  { value: 'b', label: 'Bananas', group: 'Fruit' },
  { value: 'c', label: 'Carrots', group: 'Veg' },
  { value: 'd', label: 'Daikon', group: 'Veg', disabled: true },
]

const panel = () => document.querySelector('.ui-lb')
const optionEls = () => Array.from(document.querySelectorAll('.ui-lb__opt'))
const optionLabels = () =>
  optionEls().map((el) => el.querySelector('.ui-lb__label')?.textContent?.trim())

beforeEach(() => {
  document.body.innerHTML = ''
})
afterEach(() => {
  document.body.innerHTML = ''
})

describe('Select', () => {
  const mountSelect = (props: Record<string, unknown> = {}) =>
    mount(Select, {
      props: { modelValue: '', options: OPTIONS, ...props },
      attachTo: document.body,
    })

  it('renders no native select anywhere (acceptance 126)', () => {
    const w = mountSelect()
    expect(w.find('select').exists()).toBe(false)
    expect(w.find('[role="combobox"]').exists()).toBe(true)
    w.unmount()
  })

  it('opens its list in a portal at body level (acceptance 129)', async () => {
    const w = mountSelect()
    await w.find('button').trigger('click')
    await flushPromises()
    expect(panel()).toBeTruthy()
    expect(panel()!.parentElement).toBe(document.body)
    w.unmount()
  })

  it('groups the options under headings, ungrouped first', async () => {
    const w = mountSelect()
    await w.find('button').trigger('click')
    await flushPromises()
    const groups = Array.from(document.querySelectorAll('.ui-lb__group')).map((g) =>
      g.textContent?.trim(),
    )
    expect(groups).toEqual(['Fruit', 'Veg'])
    expect(optionLabels()).toEqual(['Apples', 'Bananas', 'Carrots', 'Daikon'])
    w.unmount()
  })

  it('marks the chosen option with a tick, not only a tint', async () => {
    // The tint also marks the keyboard highlight. One appearance for two states
    // means a keyboard user cannot tell what is chosen from where they are.
    const w = mountSelect({ modelValue: 'b' })
    await w.find('button').trigger('click')
    await flushPromises()
    const selected = optionEls().filter((el) => el.classList.contains('is-selected'))
    expect(selected).toHaveLength(1)
    expect(selected[0].querySelector('.ui-lb__tick')).toBeTruthy()
    w.unmount()
  })

  it('reports the option that was clicked and closes', async () => {
    const w = mountSelect()
    await w.find('button').trigger('click')
    await flushPromises()
    optionEls()[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flushPromises()
    expect(w.emitted('update:modelValue')![0]).toEqual(['b'])
    expect(panel()).toBeNull()
    w.unmount()
  })

  it('does not report a disabled option', async () => {
    const w = mountSelect()
    await w.find('button').trigger('click')
    await flushPromises()
    optionEls()[3].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flushPromises()
    expect(w.emitted('update:modelValue')).toBeUndefined()
    w.unmount()
  })

  it('is announced as a combobox pointing at its own listbox', async () => {
    const w = mountSelect()
    const button = w.find('button')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(button.attributes('aria-haspopup')).toBe('listbox')
    await button.trigger('click')
    await flushPromises()
    expect(w.find('button').attributes('aria-expanded')).toBe('true')
    const controls = w.find('button').attributes('aria-controls')!
    expect(document.getElementById(controls)?.getAttribute('role')).toBe('listbox')
    w.unmount()
  })

  it('names the highlighted option for a screen reader as the arrows move', async () => {
    const w = mountSelect({ modelValue: 'a' })
    await w.find('button').trigger('click')
    await flushPromises()
    await w.find('button').trigger('keydown', { key: 'ArrowDown' })
    const active = w.find('button').attributes('aria-activedescendant')!
    expect(document.getElementById(active)?.textContent).toContain('Bananas')
    w.unmount()
  })

  it('shows a clear affordance only when clearable and holding a value', async () => {
    expect(mountSelect({ modelValue: 'a' }).find('.ui-sel__clear').exists()).toBe(false)
    expect(mountSelect({ modelValue: '', clearable: true }).find('.ui-sel__clear').exists()).toBe(
      false,
    )
    const w = mountSelect({ modelValue: 'a', clearable: true })
    await w.find('.ui-sel__clear').trigger('click')
    expect(w.emitted('update:modelValue')![0]).toEqual([''])
    w.unmount()
  })

  it('shows the placeholder rather than a blank when nothing is chosen', () => {
    const w = mountSelect({ placeholder: 'Pick one' })
    expect(w.find('.ui-sel__value').text()).toBe('Pick one')
    expect(w.find('.ui-sel__value').classes()).toContain('is-placeholder')
    w.unmount()
  })

  it('does not open when disabled', async () => {
    const w = mountSelect({ disabled: true })
    await w.find('button').trigger('click')
    await flushPromises()
    expect(panel()).toBeNull()
    w.unmount()
  })
})

describe('MultiSelect', () => {
  const mountMulti = (props: Record<string, unknown> = {}) =>
    mount(MultiSelect, {
      props: { modelValue: [], options: OPTIONS, ...props },
      attachTo: document.body,
    })

  it('toggles rather than replaces, and keeps the list open', async () => {
    // Picking several is the entire point; closing after each one would make it
    // a Select you have to reopen.
    const w = mountMulti({ modelValue: ['a'] })
    await w.find('button').trigger('click')
    await flushPromises()
    optionEls()[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flushPromises()
    expect(w.emitted('update:modelValue')![0]).toEqual([['a', 'b']])
    expect(panel()).toBeTruthy()
    w.unmount()
  })

  it('unpicks an option that was already chosen', async () => {
    const w = mountMulti({ modelValue: ['a', 'b'] })
    await w.find('button').trigger('click')
    await flushPromises()
    optionEls()[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flushPromises()
    expect(w.emitted('update:modelValue')![0]).toEqual([['b']])
    w.unmount()
  })

  it('shows the values as chips you can remove without opening the list', () => {
    const w = mountMulti({ modelValue: ['a', 'b'] })
    expect(w.findAll('.ui-ms__chip').map((c) => c.text().replace('×', '').trim())).toEqual([
      'Apples',
      'Bananas',
    ])
    w.unmount()
  })

  it('removes one from its chip', async () => {
    const w = mountMulti({ modelValue: ['a', 'b'] })
    await w.findAll('.ui-ms__x')[0].trigger('click')
    expect(w.emitted('update:modelValue')![0]).toEqual([['b']])
    w.unmount()
  })

  it('collapses the overflow to +N rather than growing to four lines', () => {
    const w = mountMulti({ modelValue: ['a', 'b', 'c', 'd'], maxChips: 2 })
    expect(w.findAll('.ui-ms__chip')).toHaveLength(2)
    expect(w.find('.ui-ms__more').text()).toBe('+2')
    w.unmount()
  })

  it('drops the last value on backspace', async () => {
    const w = mountMulti({ modelValue: ['a', 'b'] })
    await w.find('button').trigger('keydown', { key: 'Backspace' })
    expect(w.emitted('update:modelValue')![0]).toEqual([['a']])
    w.unmount()
  })
})

describe('Combobox', () => {
  const mountCombo = (props: Record<string, unknown> = {}) =>
    mount(Combobox, {
      props: { modelValue: '', options: OPTIONS, ...props },
      attachTo: document.body,
    })

  it('filters the list as you type', async () => {
    const w = mountCombo()
    await w.find('input').setValue('an')
    await flushPromises()
    expect(optionLabels()).toEqual(['Bananas'])
    w.unmount()
  })

  it('treats the typed text as the value — that is what makes it a combobox', async () => {
    const w = mountCombo()
    await w.find('input').setValue('Elderflower')
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['Elderflower'])
    w.unmount()
  })

  it('says "no results" rather than showing an empty box', async () => {
    const w = mountCombo()
    await w.find('input').setValue('zzz')
    await flushPromises()
    expect(document.querySelector('.ui-lb__empty')?.textContent?.trim()).toBe('No results')
    w.unmount()
  })

  it('distinguishes loading from empty, because they are not the same news', async () => {
    // An empty list during a request looks exactly like "nothing matched", and
    // the reader retypes a query that was already right.
    const w = mountCombo({ options: [], loading: true })
    await w.find('input').trigger('focus')
    await flushPromises()
    expect(document.querySelector('.ui-lb__empty')?.textContent?.trim()).toBe('Loading…')
    expect(w.find('.ui-combo__spin').exists()).toBe(true)
    w.unmount()
  })

  it('offers to create what was typed when nothing matches', async () => {
    const w = mountCombo({ creatable: true })
    await w.find('input').setValue('Elderflower')
    await flushPromises()
    expect(optionLabels().at(-1)).toBe('Create "Elderflower"')
    optionEls()
      .at(-1)!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flushPromises()
    expect(w.emitted('create')![0]).toEqual(['Elderflower'])
    w.unmount()
  })

  it('does not offer to create something that already exists', async () => {
    const w = mountCombo({ creatable: true })
    await w.find('input').setValue('Apples')
    await flushPromises()
    expect(optionLabels().some((l) => l?.startsWith('Create'))).toBe(false)
    w.unmount()
  })

  it('leaves the list alone when the parent is filtering it', async () => {
    const w = mountCombo({ externalFilter: true })
    await w.find('input').setValue('zzz')
    await flushPromises()
    expect(optionLabels()).toHaveLength(OPTIONS.length)
    expect(w.emitted('query')!.at(-1)).toEqual(['zzz'])
    w.unmount()
  })

  it('lets a space through, because this control has a text field in it', async () => {
    const w = mountCombo()
    await w.find('input').setValue('Green ')
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['Green '])
    w.unmount()
  })
})

describe('TagInput', () => {
  const mountTags = (props: Record<string, unknown> = {}) =>
    mount(TagInput, { props: { modelValue: [], ...props }, attachTo: document.body })

  it('adds on Enter', async () => {
    const w = mountTags()
    await w.find('input').setValue('work')
    await w.find('input').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')![0]).toEqual([['work']])
    w.unmount()
  })

  it('adds on a comma, which is what people type when thinking in lists', async () => {
    const w = mountTags()
    await w.find('input').setValue('home')
    await w.find('input').trigger('keydown', { key: ',' })
    expect(w.emitted('update:modelValue')![0]).toEqual([['home']])
    w.unmount()
  })

  it('refuses a duplicate whatever its case', async () => {
    // "Work" and "work" as two tags is never what anybody meant, and the first
    // spelling entered is the one that stays.
    const w = mountTags({ modelValue: ['Work'] })
    await w.find('input').setValue('work')
    await w.find('input').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')).toBeUndefined()
    w.unmount()
  })

  it('removes the last tag on backspace in an empty field', async () => {
    const w = mountTags({ modelValue: ['a', 'b'] })
    await w.find('input').trigger('keydown', { key: 'Backspace' })
    expect(w.emitted('update:modelValue')![0]).toEqual([['a']])
    w.unmount()
  })

  it('leaves the tags alone when backspace is deleting typed text', async () => {
    const w = mountTags({ modelValue: ['a'] })
    await w.find('input').setValue('xy')
    await w.find('input').trigger('keydown', { key: 'Backspace' })
    expect(w.emitted('update:modelValue')).toBeUndefined()
    w.unmount()
  })

  it('splits a pasted list into tags rather than one tag with commas in it', async () => {
    const w = mountTags()
    // jsdom has no DataTransfer; the component only reads getData, so a stand-in
    // is enough and keeps the test about the splitting rather than the clipboard.
    await w.find('input').trigger('paste', {
      clipboardData: { getData: () => 'one, two' },
    })
    expect(w.emitted('update:modelValue')!.map((e) => e[0])).toEqual([['one'], ['two']])
    w.unmount()
  })

  it('stops at the limit instead of silently accepting more', async () => {
    const w = mountTags({ modelValue: ['a', 'b'], max: 2 })
    expect(w.find('input').attributes('disabled')).toBeDefined()
    w.unmount()
  })

  it('offers only the suggestions not already used', () => {
    const w = mountTags({ modelValue: ['work'], suggestions: ['work', 'home'] })
    expect(w.findAll('.ui-tags__chip').map((c) => c.text())).toEqual(['home'])
    w.unmount()
  })

  it('removes a tag from its own ×', async () => {
    const w = mountTags({ modelValue: ['a', 'b'] })
    await w.findAll('.ui-tags__x')[0].trigger('click')
    expect(w.emitted('update:modelValue')![0]).toEqual([['b']])
    w.unmount()
  })
})
