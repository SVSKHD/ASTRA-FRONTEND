// The picker's behaviour as a component: what opens, what commits, and the
// accessibility contract (dialog semantics, focus return, disabled days).
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'

function mountPicker(props: Record<string, unknown> = {}) {
  return mount(GlassDatePicker, {
    props: { modelValue: '2024-06-12', ...props },
    attachTo: document.body,
    // The panel is portalled to the body since acceptance 119, so it is stubbed
    // in place here — these tests are about what the panel does, and the
    // portal itself is asserted separately below.
    global: { stubs: { teleport: true } },
  })
}

describe('GlassDatePicker — trigger', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows the formatted value, not the raw ISO string', () => {
    const wrapper = mountPicker()
    const label = wrapper.get('.gdp__value').text()
    expect(label).not.toBe('2024-06-12')
    expect(label).toMatch(/Jun/)
  })

  it('shows the placeholder when empty', () => {
    const wrapper = mountPicker({ modelValue: '', placeholder: 'Pick a day' })
    expect(wrapper.get('.gdp__value').text()).toBe('Pick a day')
  })

  it('opens the panel on click and reports it through aria-expanded', async () => {
    const wrapper = mountPicker()
    expect(wrapper.find('.gdp__panel').exists()).toBe(false)
    await wrapper.get('.gdp__trigger').trigger('click')
    expect(wrapper.find('.gdp__panel').exists()).toBe(true)
    expect(wrapper.get('.gdp__trigger').attributes('aria-expanded')).toBe('true')
  })

  it('does not open while disabled', async () => {
    const wrapper = mountPicker({ disabled: true })
    await wrapper.get('.gdp__trigger').trigger('click')
    expect(wrapper.find('.gdp__panel').exists()).toBe(false)
  })

  it('clears through the trigger affordance', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.gdp__clear').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([''])
  })

  it('offers no clear affordance when clearable is off', () => {
    expect(mountPicker({ clearable: false }).find('.gdp__clear').exists()).toBe(false)
  })
})

describe('GlassDatePicker — panel', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('is a modal dialog with an accessible name', async () => {
    const wrapper = mountPicker({ label: 'Due date' })
    await wrapper.get('.gdp__trigger').trigger('click')
    const panel = wrapper.get('.gdp__panel')
    expect(panel.attributes('role')).toBe('dialog')
    expect(panel.attributes('aria-modal')).toBe('true')
    expect(panel.attributes('aria-label')).toBe('Due date')
  })

  it('renders six weeks so the grid never changes height', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.gdp__trigger').trigger('click')
    expect(wrapper.findAll('.gdp__week')).toHaveLength(6)
    expect(wrapper.findAll('.gdp__day')).toHaveLength(42)
  })

  it('commits the clicked day and closes', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.gdp__trigger').trigger('click')
    const day = wrapper
      .findAll('.gdp__day')
      .find((d) => d.attributes('id') === 'gdp-day-2024-06-20')
    await day?.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2024-06-20'])
    expect(wrapper.find('.gdp__panel').exists()).toBe(false)
  })

  it('keeps the panel open in datetime mode so the time can still be chosen', async () => {
    const wrapper = mountPicker({ mode: 'datetime', modelValue: '2024-06-12T09:00' })
    await wrapper.get('.gdp__trigger').trigger('click')
    const day = wrapper
      .findAll('.gdp__day')
      .find((d) => d.attributes('id') === 'gdp-day-2024-06-20')
    await day?.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2024-06-20T09:00'])
    expect(wrapper.find('.gdp__panel').exists()).toBe(true)
  })

  it('disables days outside min/max and never commits them', async () => {
    const wrapper = mountPicker({ min: '2024-06-10', max: '2024-06-20' })
    await wrapper.get('.gdp__trigger').trigger('click')
    const blocked = wrapper
      .findAll('.gdp__day')
      .find((d) => d.attributes('id') === 'gdp-day-2024-06-25')
    expect(blocked?.attributes('disabled')).toBeDefined()
    await blocked?.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('moves focus with the arrow keys and commits on Enter', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.gdp__trigger').trigger('click')
    const grid = wrapper.get('.gdp__grid')
    await grid.trigger('keydown', { key: 'ArrowRight' })
    await grid.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2024-06-13'])
  })

  it('pages the month with PageDown and follows focus out of the month', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.gdp__trigger').trigger('click')
    const grid = wrapper.get('.gdp__grid')
    await grid.trigger('keydown', { key: 'PageDown' })
    expect(wrapper.get('.gdp__month').text()).toMatch(/July/)
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.gdp__trigger').trigger('click')
    await wrapper.get('.gdp__panel').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.gdp__panel').exists()).toBe(false)
    await new Promise((r) => setTimeout(r, 0))
    expect(document.activeElement).toBe(wrapper.get('.gdp__trigger').element)
  })

  it('applies a preset chip', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.gdp__trigger').trigger('click')
    const chips = wrapper.findAll('.gdp__chip')
    const noDate = chips.find((c) => c.text() === 'No date')
    await noDate?.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([''])
  })

  it('accepts typed input on Enter', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.gdp__trigger').trigger('click')
    const input = wrapper.get('.gdp__input')
    await input.setValue('2026-12-25')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2026-12-25'])
  })

  it('explains itself rather than guessing when the typed input is nonsense', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.gdp__trigger').trigger('click')
    const input = wrapper.get('.gdp__input')
    await input.setValue('whenever')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('.gdp__error').text()).toContain('tomorrow')
  })
})

describe('GlassDatePicker — modes', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('time mode shows only the time column', async () => {
    const wrapper = mountPicker({ mode: 'time', modelValue: '09:00' })
    await wrapper.get('.gdp__trigger').trigger('click')
    expect(wrapper.find('.gdp__calendar').exists()).toBe(false)
    expect(wrapper.findAll('.gdp__time')).toHaveLength(96)
  })

  it('time mode commits a bare HH:mm', async () => {
    const wrapper = mountPicker({ mode: 'time', modelValue: '09:00' })
    await wrapper.get('.gdp__trigger').trigger('click')
    await wrapper.findAll('.gdp__time')[4].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['01:00'])
  })

  it('date mode has no time column', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.gdp__trigger').trigger('click')
    expect(wrapper.find('.gdp__times').exists()).toBe(false)
  })

  it('range mode paints the days between the ends', async () => {
    const wrapper = mountPicker({
      mode: 'range',
      modelValue: { start: '2024-06-10', end: '2024-06-14' },
    })
    await wrapper.get('.gdp__trigger').trigger('click')
    expect(wrapper.findAll('.gdp__day.is-inrange').length).toBe(3)
  })

  it('inline mode renders the panel with no trigger', () => {
    const wrapper = mountPicker({ inline: true })
    expect(wrapper.find('.gdp__trigger').exists()).toBe(false)
    expect(wrapper.find('.gdp__panel').exists()).toBe(true)
  })
})

// Acceptance 119: the panel is layered above every dialog rather than inside
// the field that opened it.
describe('GlassDatePicker — the portal', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the panel outside its own field, on the body', async () => {
    const wrapper = mount(GlassDatePicker, {
      props: { modelValue: '2024-06-12' },
      attachTo: document.body,
    })
    await wrapper.get('.gdp__trigger').trigger('click')
    // Not inside the component's own subtree — that subtree is what a dialog's
    // overflow and stacking context would clip it to.
    expect(wrapper.find('.gdp__panel').exists()).toBe(false)
    // Earlier tests in this file leave their stubbed-in-place panels attached,
    // so the assertion is that one exists free of any field, not that every
    // panel in the document does.
    const panels = Array.from(document.body.querySelectorAll('.gdp__panel'))
    expect(panels.some((el) => el.closest('.gdp') === null)).toBe(true)
    wrapper.unmount()
  })

  it('is positioned from the viewport rather than from its field', async () => {
    const wrapper = mount(GlassDatePicker, {
      props: { modelValue: '2024-06-12' },
      attachTo: document.body,
    })
    await wrapper.get('.gdp__trigger').trigger('click')
    await nextTick()
    const panel = document.body.querySelector('.gdp__panel') as HTMLElement
    expect(panel.classList.contains('gdp__panel--portal')).toBe(true)
    expect(panel.style.top).not.toBe('')
    expect(panel.style.left).not.toBe('')
    wrapper.unmount()
  })

  it('stays in the flow when it is asked to render inline', () => {
    const wrapper = mount(GlassDatePicker, {
      props: { modelValue: '2024-06-12', inline: true },
      attachTo: document.body,
    })
    expect(wrapper.find('.gdp__panel').exists()).toBe(true)
    expect(wrapper.find('.gdp__panel--portal').exists()).toBe(false)
    wrapper.unmount()
  })
})
