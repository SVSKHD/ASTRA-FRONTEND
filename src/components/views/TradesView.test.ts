// A smoke mount of the whole tab, signed out and with no Firestore: the state
// every other test skips and the one a real user hits first. It has to render
// the account block, the targets and an empty log rather than throwing on a
// missing settings document.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TradesView from '@/components/views/TradesView.vue'

// The hover directive is registered on the app in main.ts, which a mounted
// component does not go through.
const mountView = () =>
  mount(TradesView, { attachTo: document.body, global: { directives: { 'hover-style': {} } } })

describe('TradesView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the account block under the labels the spec fixes', () => {
    const wrapper = mountView()
    const labels = wrapper.findAll('.statrow__label').map((el) => el.text())
    expect(labels.slice(0, 3)).toEqual(['Balance', 'Secured', 'Total profit'])
    wrapper.unmount()
  })

  it('shows both targets with the shortfall spelled out', () => {
    const wrapper = mountView()
    const text = wrapper.text()
    expect(text).toContain('Today · move')
    expect(text).toContain('Month to date · move')
    // The defaults are a 10 day target and a 50 month target, and nothing has
    // been traded, so both are owed in full.
    expect(text).toContain('10.00 to go today')
    expect(text).toContain('50.00 still needed this month')
    wrapper.unmount()
  })

  it('says what an empty month is rather than showing a grid of zeros', () => {
    const wrapper = mountView()
    expect(wrapper.text()).toContain('No trades this month')
    wrapper.unmount()
  })

  it('renders the month grid through the app’s own picker', () => {
    const wrapper = mountView()
    // Not a second calendar: this is GlassDatePicker inline, with its typed
    // field and preset chips turned off.
    expect(wrapper.find('.gdp__panel--inline').exists()).toBe(true)
    expect(wrapper.find('.gdp__typed').exists()).toBe(false)
    expect(wrapper.findAll('.gdp__day').length).toBeGreaterThan(27)
    wrapper.unmount()
  })

  it('offers no export while there is nothing to export', () => {
    const wrapper = mountView()
    const csv = wrapper.findAll('button').find((b) => b.text().includes('CSV'))
    expect(csv?.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
