// A smoke mount of the whole tab, signed out and with no Firestore: the state
// every other test skips and the one a real user hits first. It has to render
// the account block, the targets and an empty log rather than throwing on a
// missing settings document.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import TradesView from '@/components/views/TradesView.vue'
import { useAuthStore } from '@/stores/auth'

// The hover directive is registered on the app in main.ts, which a mounted
// component does not go through.
const mountView = () =>
  mount(TradesView, { attachTo: document.body, global: { directives: { 'hover-style': {} } } })

describe('TradesView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the account block under the labels the spec fixes', () => {
    const wrapper = mountView()
    const labels = wrapper.findAll('.acct__label').map((el) => el.text())
    expect(labels).toEqual(['Balance', 'Secured', 'Total profit'])
    wrapper.unmount()
  })

  it('gives each account figure its own glyph, and only the profit a sign colour', () => {
    const wrapper = mountView()
    // Three labels, three different icons — the audit that started this pass
    // found one glyph doing several jobs, so this is the shape of the fix.
    const glyphs = wrapper.findAll('.acct__label svg')
    expect(glyphs).toHaveLength(3)
    expect(new Set(glyphs.map((g) => g.html())).size).toBe(3)
    const values = wrapper.findAll('.acct__value')
    expect(values[0].classes()).not.toContain('is-pos')
    expect(values[1].classes()).not.toContain('is-pos')
    wrapper.unmount()
  })

  it('says so, and keeps saying so, when Firestore cannot be reached', async () => {
    // A signed-in user with no Firestore behind them is the real unreachable
    // path — under the test runner the SDK never loads — and the failure has to
    // be a standing message on the screen rather than a toast that has gone by
    // the time the reader looks up.
    useAuthStore().user = {
      uid: 'u1',
      name: 'T',
      email: 't@example.com',
      provider: 'google',
      initial: 'T',
      color: '',
    }
    const wrapper = mountView()
    await nextTick()
    await Promise.resolve()
    await nextTick()
    const alert = wrapper.find('.ui-alert--danger')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Firestore')
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
