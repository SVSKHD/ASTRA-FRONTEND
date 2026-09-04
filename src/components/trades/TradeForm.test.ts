// The form's part of section 31: one reading typed, two clocks shown, and a
// session that follows the broker's clock until somebody disagrees with it.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TradeForm from '@/components/trades/TradeForm.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { DEFAULT_LOGGER_SETTINGS } from '@/utils/tradeMath'

const settings = { ...DEFAULT_LOGGER_SETTINGS }

function mountForm() {
  return mount(TradeForm, { props: { settings } })
}

/** The picker behind a labelled field, by the field's own data attribute. */
function picker(wrapper: ReturnType<typeof mountForm>, field: string) {
  return wrapper.find(`[data-field="${field}"]`).findComponent(GlassDatePicker)
}

function sessionControl(wrapper: ReturnType<typeof mountForm>) {
  return wrapper.find('[data-field="session"]').findComponent(SegmentedControl)
}

describe('TradeForm times', () => {
  // The picker reads the ui store for the shared clock and the theme.
  beforeEach(() => setActivePinia(createPinia()))

  it('asks for the entry time and offers the exit as optional', () => {
    const wrapper = mountForm()
    expect(wrapper.text()).toContain('Entry time (IST)')
    expect(wrapper.text()).toContain('Exit time (IST)')
    expect(wrapper.text()).toContain('Optional')
    // 24-hour, minute precision, and defaulted rather than blank.
    expect(picker(wrapper, 'istTime').props('modelValue')).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/)
    expect(picker(wrapper, 'exitTime').props('modelValue')).toBe('')
  })

  it('shows both readings of the one instant', async () => {
    const wrapper = mountForm()
    await picker(wrapper, 'date').vm.$emit('update:modelValue', '2026-09-03')
    await picker(wrapper, 'istTime').vm.$emit('update:modelValue', '19:42')
    // 19:42 IST is 17:12 on the default GMT+3 broker — computed from the
    // instant, never by adding three hours to the string "19:42".
    expect(wrapper.find('.tform__clocks').text()).toContain('IST 19:42')
    expect(wrapper.find('.tform__clocks').text()).toContain('Broker 17:12')
    expect(wrapper.find('.tform__clocks').text()).toContain('GMT+03:00')
  })

  it('pre-selects the session the broker clock puts the trade in', async () => {
    const wrapper = mountForm()
    await picker(wrapper, 'date').vm.$emit('update:modelValue', '2026-09-03')

    // 12:00 IST is 09:30 for the broker — London, by half an hour.
    await picker(wrapper, 'istTime').vm.$emit('update:modelValue', '12:00')
    expect(sessionControl(wrapper).props('modelValue')).toBe('London')

    // 06:00 IST is 03:30 — Asia.
    await picker(wrapper, 'istTime').vm.$emit('update:modelValue', '06:00')
    expect(sessionControl(wrapper).props('modelValue')).toBe('Asia')

    // 19:42 IST is 17:12 — New York.
    await picker(wrapper, 'istTime').vm.$emit('update:modelValue', '19:42')
    expect(sessionControl(wrapper).props('modelValue')).toBe('NY')
  })

  it('says so when the trader overrides it, and then leaves them alone', async () => {
    const wrapper = mountForm()
    await picker(wrapper, 'istTime').vm.$emit('update:modelValue', '12:00')
    expect(sessionControl(wrapper).props('modelValue')).toBe('London')

    await sessionControl(wrapper).vm.$emit('update:modelValue', 'Asia')
    // Flagged rather than silently accepted: the two disagree, and which one is
    // right is not the form's call.
    expect(wrapper.text()).toContain('The broker clock puts this in London.')

    // And it is theirs now. A control that keeps correcting its owner is a
    // control that gets ignored.
    await picker(wrapper, 'istTime').vm.$emit('update:modelValue', '19:42')
    expect(sessionControl(wrapper).props('modelValue')).toBe('Asia')
  })
})
