// The Expenses tab, signed out and with no Firestore — the state a first visit
// actually hits. It has to render the header, the budget line and an empty
// month rather than throwing, and it has to do it in the trade log's clothes.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import ExpensesView from '@/components/views/ExpensesView.vue'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/expenses', component: { template: '<div />' } }],
  })
}

async function mountView(query = '') {
  const router = makeRouter()
  await router.push(`/expenses${query}`)
  const wrapper = mount(ExpensesView, {
    attachTo: document.body,
    global: { plugins: [router], directives: { 'hover-style': {} } },
  })
  await nextTick()
  return wrapper
}

describe('ExpensesView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('carries the account grammar the trade log uses', async () => {
    const wrapper = await mountView()
    const labels = wrapper.findAll('.acct__label').map((el) => el.text())
    expect(labels).toEqual(['Spent this month', 'Budget remaining', 'Average per day'])
    wrapper.unmount()
  })

  it('leaves the net line out until it has been asked for', async () => {
    // "Money spent" and "money made trading" are two answers; adding them
    // without being told to produces a third that answers neither.
    const wrapper = await mountView()
    expect(wrapper.text()).not.toContain('Net after expenses')
    wrapper.unmount()
  })

  it('says there is no budget rather than showing a bar against nothing', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('no budget set')
    // No budget, no progress bar: a bar filled against zero means nothing.
    expect(wrapper.find('.ev__budget').exists()).toBe(false)
    wrapper.unmount()
  })

  it('is single-signed: nothing on the tab is a plus or a minus', async () => {
    const wrapper = await mountView()
    const figures = wrapper.findAll('.acct__value').map((el) => el.text())
    for (const figure of figures) expect(figure).not.toMatch(/[+−]/)
    wrapper.unmount()
  })

  it('says what an empty month is rather than showing a grid of zeros', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Nothing spent this month')
    wrapper.unmount()
  })

  it('paints the month through the app’s own picker, not a second calendar', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('.gdp__panel--inline').exists()).toBe(true)
    expect(wrapper.findAll('.gdp__day').length).toBeGreaterThan(27)
    wrapper.unmount()
  })

  it('takes the month out of the URL, like every other view here', async () => {
    const wrapper = await mountView('?month=2026-01')
    expect(wrapper.text()).toContain('January 2026')
    wrapper.unmount()
  })
})
