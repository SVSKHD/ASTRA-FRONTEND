// Smoke + scope test for the reworked FinancesView: it mounts, renders the scope
// pills and sub-tabs, and switching Personal → Business swaps the numbers on
// screen (no cross-leak). Uses a memory router since the view syncs scope/month
// to the URL.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { nextTick } from 'vue'
import FinancesView from '@/components/views/FinancesView.vue'
import { useAppStore } from '@/stores/app'
import { toMinor } from '@/utils/money'
import { vHoverStyle } from '@/directives/hoverStyle'
import { currentMonthKey } from '@/utils/budget'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }],
})
const global = { plugins: [router], directives: { 'hover-style': vHoverStyle } }

const M = currentMonthKey()

describe('<FinancesView />', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await router.push('/')
    await router.isReady()
  })

  it('renders scope pills and sub-tabs', () => {
    const wrapper = mount(FinancesView, { global })
    const text = wrapper.text()
    for (const t of ['Personal', 'Business', 'All', 'Overview', 'Transactions', 'Debts', 'Tags'])
      expect(text).toContain(t)
  })

  it('switching scope changes the totals with no cross-leak', async () => {
    const app = useAppStore()
    app.addTxn({ kind: 'expense', amountMinor: toMinor(1000), scope: 'personal', date: M + '-05' })
    app.addTxn({ kind: 'expense', amountMinor: toMinor(7000), scope: 'business', date: M + '-05' })
    const wrapper = mount(FinancesView, { global })
    await nextTick()

    // Personal scope shows the 1,000 outflow, not the 7,000.
    expect(wrapper.text()).toContain('1,000')
    expect(wrapper.text()).not.toContain('7,000')

    const businessPill = wrapper.findAll('button').find((b) => b.text() === 'Business')
    await businessPill!.trigger('click')
    await nextTick()
    expect(app.finScope).toBe('business')
    expect(wrapper.text()).toContain('7,000')
    expect(wrapper.text()).not.toContain('1,000')
  })

  it('adding income above baseline surfaces as Extra', async () => {
    const app = useAppStore()
    app.setScopeIncome('personal', M, toMinor(50000)) // baseline
    app.addTxn({
      kind: 'income',
      amountMinor: toMinor(60000),
      scope: 'personal',
      date: M + '-01',
      source: 'Salary',
    })
    const wrapper = mount(FinancesView, { global })
    await nextTick()
    // Extra = 60000 − 50000 = 10,000.
    expect(wrapper.text()).toContain('10,000')
  })
})
