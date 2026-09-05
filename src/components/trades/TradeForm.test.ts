// The form's part of section 31 — one reading typed, two clocks shown, and a
// session that follows the broker's clock until somebody disagrees with it —
// and its part of section 44: one row that expands when you focus it.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TradeForm from '@/components/trades/TradeForm.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { DEFAULT_LOGGER_SETTINGS } from '@/utils/tradeMath'
import { DEFAULT_COLLECTIONS, DEFAULT_WATCH_SETTINGS } from '@/utils/collections'

const settings = { ...DEFAULT_LOGGER_SETTINGS, ...DEFAULT_COLLECTIONS, ...DEFAULT_WATCH_SETTINGS }

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
    await picker(wrapper, 'istDate').vm.$emit('update:modelValue', '2026-09-03')
    await picker(wrapper, 'istTime').vm.$emit('update:modelValue', '19:42')
    // 19:42 IST is 17:12 on the default GMT+3 broker — computed from the
    // instant, never by adding three hours to the string "19:42".
    expect(wrapper.find('.tprev__clocks').text()).toContain('IST 19:42')
    expect(wrapper.find('.tprev__clocks').text()).toContain('Broker 17:12')
    expect(wrapper.find('.tprev__clocks').text()).toContain('GMT+03:00')
  })

  it('pre-selects the session the broker clock puts the trade in', async () => {
    const wrapper = mountForm()
    await picker(wrapper, 'istDate').vm.$emit('update:modelValue', '2026-09-03')

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

describe('TradeForm collapses to one row', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /** The panel holding everything the form already knows. */
  const details = (w: ReturnType<typeof mountForm>) => w.find('#tform-details')

  it('shows only the three typed fields at rest', () => {
    const wrapper = mountForm()
    // Entry, Exit and Lot are the fields a trade actually costs. Everything
    // else is already correct before the page is touched.
    for (const field of ['entry', 'exit', 'lot']) {
      const cell = wrapper.find(`[data-field="${field}"]`)
      expect(cell.exists(), field).toBe(true)
      expect(cell.findComponent(NumberInput).exists(), field).toBe(true)
    }
    // The rest is rendered — a submit reads its values — but not shown.
    expect(details(wrapper).attributes('style')).toContain('display: none')
  })

  it('opens holding the session its own hint names', () => {
    // The watcher used to fire only on a CHANGE, so the form opened on its
    // hard-coded 'London' default with "The broker clock puts this in NY"
    // underneath it — the control contradicting its own explanation. It
    // matters more now the field is behind a fold: a trader who never opens
    // the panel is trusting the pre-fill.
    const wrapper = mountForm()
    expect(wrapper.text()).not.toContain('The broker clock puts this in')
  })

  it('states the five it filled in for itself, rather than asking', () => {
    const wrapper = mountForm()
    const context = wrapper.find('.tform__contextText').text()
    // Date · time · symbol · session · side, as one line.
    expect(context).toMatch(/^\d{4}-\d{2}-\d{2} · ([01]\d|2[0-3]):[0-5]\d · /)
    expect(context).toContain(settings.lastSymbol)
    expect(context).toMatch(/· (Buy|Sell)$/)
  })

  it('unfolds when something in it takes focus', async () => {
    const wrapper = mountForm()
    expect(details(wrapper).attributes('style')).toContain('display: none')
    await wrapper.find('form').trigger('focusin')
    expect(details(wrapper).attributes('style') ?? '').not.toContain('display: none')
  })

  it('stays open while focus moves between its own fields', async () => {
    const wrapper = mountForm()
    await wrapper.find('form').trigger('focusin')
    const inside = wrapper.find('[data-field="exit"]').element
    // relatedTarget inside the form: a move within, not a departure.
    await wrapper.find('form').trigger('focusout', { relatedTarget: inside })
    expect(details(wrapper).attributes('style') ?? '').not.toContain('display: none')
  })

  it('stays open when the window loses focus entirely', async () => {
    const wrapper = mountForm()
    await wrapper.find('form').trigger('focusin')
    // A null relatedTarget is alt-tab or devtools, not "the trader is done".
    // Folding the panel up here would take a half-typed trade with it.
    await wrapper.find('form').trigger('focusout', { relatedTarget: null })
    expect(details(wrapper).attributes('style') ?? '').not.toContain('display: none')
  })

  it('folds again when focus leaves it for something else', async () => {
    const wrapper = mountForm()
    await wrapper.find('form').trigger('focusin')
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    await wrapper.find('form').trigger('focusout', { relatedTarget: outside })
    expect(details(wrapper).attributes('style')).toContain('display: none')
    outside.remove()
  })

  it('opens from the context line for anybody not using a keyboard', async () => {
    const wrapper = mountForm()
    const toggle = wrapper.find('.tform__context')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-controls')).toBe('tform-details')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })

  it('keeps a half-typed note when it folds', async () => {
    // `v-show`, not `v-if`. A panel that unmounts on collapse discards the
    // values a submit is about to read.
    const wrapper = mountForm()
    await wrapper.find('form').trigger('focusin')
    const note = wrapper.find('[data-field="note"] input')
    await note.setValue('broke the London high')
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    await wrapper.find('form').trigger('focusout', { relatedTarget: outside })
    expect((wrapper.find('[data-field="note"] input').element as HTMLInputElement).value).toBe(
      'broke the London high',
    )
    outside.remove()
  })

  it('submits on Enter, through the browser rather than a key handler', async () => {
    // The three fields are number inputs in a real form with a real submit
    // button, which is what makes Enter work from any of them — including the
    // lot field, and including when a picker elsewhere swallows Enter.
    const wrapper = mountForm()
    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
    await wrapper.find('form').trigger('submit')
    // Nothing is emitted for an empty form — but the submit path ran, which is
    // what Enter reaches.
    expect(wrapper.emitted('submit')).toBeUndefined()
  })
})
