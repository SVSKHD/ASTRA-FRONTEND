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

// Section 28: the grid is also the app's month calendar. A caller paints days
// through `dayMeta` and marks them through the `day` slot, so the trade log —
// and anything after it — extends this component instead of forking it.
describe('GlassDatePicker — a painted grid', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function mountPainted(props: Record<string, unknown> = {}) {
    return mount(GlassDatePicker, {
      props: {
        // A value in the painted month, because an empty picker anchors on
        // today and these assertions are about June 2024.
        modelValue: '2024-06-12',
        inline: true,
        quickEntry: false,
        dayMeta: {
          '2024-06-03': { tone: 'pos', intensity: 0.5, title: '2 trades' },
          '2024-06-04': { tone: 'neg', intensity: 2, title: '1 trade' },
        },
        ...props,
      },
      attachTo: document.body,
    })
  }

  it('tones a day by its meta and carries the intensity as a percentage', () => {
    const wrapper = mountPainted()
    const up = wrapper.get('#gdp-day-2024-06-03')
    expect(up.classes()).toContain('is-pos')
    expect(up.attributes('style')).toContain('--gdp-day-heat: 50%')
    expect(up.attributes('title')).toBe('2 trades')
    wrapper.unmount()
  })

  it('clamps an intensity above one rather than mixing past the token', () => {
    const wrapper = mountPainted()
    const down = wrapper.get('#gdp-day-2024-06-04')
    expect(down.classes()).toContain('is-neg')
    expect(down.attributes('style')).toContain('--gdp-day-heat: 100%')
    wrapper.unmount()
  })

  it('leaves a day with no meta unpainted', () => {
    const wrapper = mountPainted()
    const plain = wrapper.get('#gdp-day-2024-06-05')
    expect(plain.classes()).not.toContain('is-pos')
    expect(plain.classes()).not.toContain('is-neg')
    expect(plain.classes()).not.toContain('has-wash')
    // It still carries its place in the month — every cell does, because that
    // is what staggers the sweep — but no wash and no heat.
    expect(plain.attributes('style')).not.toContain('--gdp-day-wash')
    expect(plain.attributes('style')).not.toContain('--gdp-day-heat')
    wrapper.unmount()
  })

  it('renders the day slot in place of the number, with the day’s meta', () => {
    const wrapper = mount(GlassDatePicker, {
      props: {
        modelValue: '2024-06-12',
        inline: true,
        dayMeta: { '2024-06-03': { tone: 'pos' } },
      },
      slots: {
        day: `<template #day="{ cell, meta }">
                <span class="mark">{{ cell.day }}{{ meta?.tone === 'pos' ? '+' : '' }}</span>
              </template>`,
      },
      attachTo: document.body,
    })
    expect(wrapper.get('#gdp-day-2024-06-03 .mark').text()).toBe('3+')
    expect(wrapper.get('#gdp-day-2024-06-05 .mark').text()).toBe('5')
    wrapper.unmount()
  })

  it('drops the typed field and the presets when quick entry is off', () => {
    const wrapper = mountPainted()
    expect(wrapper.find('.gdp__typed').exists()).toBe(false)
    expect(wrapper.find('.gdp__chips').exists()).toBe(false)
    // The grid itself is untouched — this is still the same calendar.
    expect(wrapper.findAll('.gdp__day').length).toBeGreaterThan(27)
    wrapper.unmount()
  })

  it('reports the month on screen, on mount and on every navigation', async () => {
    const wrapper = mountPainted({ modelValue: '2024-06-12' })
    expect(wrapper.emitted('month')?.[0]).toEqual(['2024-06'])
    await wrapper.get('[aria-label="Previous month"]').trigger('click')
    expect(wrapper.emitted('month')?.at(-1)).toEqual(['2024-05'])
    wrapper.unmount()
  })
})

// Section 28b: a caller with a scale of its own hands the cell an exact fill,
// and the grid stops behaving like a date field — the cells lift, and the
// selection is a ring over the fill rather than a fill of its own.
describe('GlassDatePicker — a caller’s own scale', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function mountScaled(props: Record<string, unknown> = {}) {
    return mount(GlassDatePicker, {
      props: {
        modelValue: '2024-06-03',
        inline: true,
        quickEntry: false,
        dayMeta: {
          '2024-06-03': { tone: 'pos', wash: 'var(--pl-pos-4)' },
          '2024-06-04': { tone: 'neg', intensity: 0.5 },
        },
        ...props,
      },
      attachTo: document.body,
    })
  }

  it('takes the fill it is given rather than mixing one', () => {
    const wrapper = mountScaled()
    const cell = wrapper.get('#gdp-day-2024-06-03')
    expect(cell.classes()).toContain('has-wash')
    expect(cell.attributes('style')).toContain('--gdp-day-wash: var(--pl-pos-4)')
    wrapper.unmount()
  })

  it('still mixes for a caller that only gave an intensity', () => {
    const wrapper = mountScaled()
    const cell = wrapper.get('#gdp-day-2024-06-04')
    expect(cell.classes()).not.toContain('has-wash')
    expect(cell.attributes('style')).toContain('--gdp-day-heat: 50%')
    wrapper.unmount()
  })

  it('marks the grid as painted, which is what turns the lift on', () => {
    expect(mountScaled().get('.gdp__grid').classes()).toContain('is-painted')
    // A plain date field is not painted and keeps its ordinary behaviour.
    const plain = mount(GlassDatePicker, {
      props: { modelValue: '2024-06-03', inline: true },
      attachTo: document.body,
    })
    expect(plain.get('.gdp__grid').classes()).not.toContain('is-painted')
    plain.unmount()
  })

  it('orders every cell for the sweep, in reading order', () => {
    const wrapper = mountScaled()
    const cells = wrapper.findAll('.gdp__day')
    expect(cells[0].attributes('style')).toContain('--gdp-day-order: 0')
    expect(cells[8].attributes('style')).toContain('--gdp-day-order: 8')
    wrapper.unmount()
  })

  it('keeps the wash under the selection instead of replacing it', () => {
    const wrapper = mountScaled()
    const selected = wrapper.get('#gdp-day-2024-06-03')
    expect(selected.classes()).toContain('is-selected')
    expect(selected.classes()).toContain('has-wash')
    wrapper.unmount()
  })
})
