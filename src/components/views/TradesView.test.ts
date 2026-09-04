// A smoke mount of the whole tab, signed out and with no Firestore: the state
// every other test skips and the one a real user hits first. It has to render
// the account block, the targets and an empty log rather than throwing on a
// missing settings document.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import TradesView from '@/components/views/TradesView.vue'
import { useAuthStore } from '@/stores/auth'

// The view reads its state out of the URL (section 33), so a mount without a
// router is a mount of something else. Memory history rather than the real
// router: this is about the tab, not about navigation.
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trades', component: { template: '<div />' } }],
  })
}

// The hover directive is registered on the app in main.ts, which a mounted
// component does not go through.
function mountView() {
  const router = makeRouter()
  router.push('/trades')
  return mount(TradesView, {
    attachTo: document.body,
    global: { plugins: [router], directives: { 'hover-style': {} } },
  })
}

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

  it('shows the desk before anything else has loaded', async () => {
    // The countdown is the one element that is about the next few minutes
    // rather than about the month, so it is present in every state — including
    // the one where no data has arrived at all.
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
    expect(wrapper.find('[data-desk]').exists()).toBe(true)
    expect(wrapper.text()).toMatch(/(Asia|London|NY) opens/)
    wrapper.unmount()
  })

  it('reads the mode, the month and the day out of the URL', async () => {
    // The URL is the source of truth, so a link that names a mode opens on it
    // without anything else being clicked (section 33).
    const router = makeRouter()
    await router.push('/trades?mode=signals&month=2026-09')
    const wrapper = mount(TradesView, {
      attachTo: document.body,
      global: { plugins: [router], directives: { 'hover-style': {} } },
    })
    await nextTick()
    expect(wrapper.text()).toContain('No signals this month')
    // And the switch reflects it rather than showing the default.
    expect(wrapper.find('[aria-label="What this month is shown as"]').text()).toContain('Signals')
    wrapper.unmount()
  })

  it('falls back silently when the URL says something impossible', async () => {
    const router = makeRouter()
    await router.push('/trades?mode=sideways&month=banana&day=nope')
    const wrapper = mount(TradesView, {
      attachTo: document.body,
      global: { plugins: [router], directives: { 'hover-style': {} } },
    })
    await nextTick()
    // The journal, this month, no day filter — and no error anywhere.
    expect(wrapper.text()).toContain('No trades this month')
    expect(wrapper.find('.ui-alert--danger').exists()).toBe(false)
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
