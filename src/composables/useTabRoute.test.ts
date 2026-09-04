// Tab resume (section 42), which was specified and not working.
//
// The reading half was fine all along; the writing half only existed for the
// four tabs with a path of their own. These tests are of the writing half —
// change the tab, and assert the address bar now says which one — because that
// is the half that was missing and the half a refresh depends on.
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { isTabKey, tabOf, useTabRoute } from '@/composables/useTabRoute'
import { LAST_ROUTE_KEY, sessionRead } from '@/composables/useTradeRoute'

const Blank = defineComponent({ render: () => h('div') })

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Blank },
      { path: '/trades', name: 'trades', component: Blank },
      { path: '/expenses', name: 'expenses', component: Blank },
      { path: '/news', name: 'news', component: Blank },
      { path: '/code', name: 'code', component: Blank },
    ],
  })
}

const Host = defineComponent({
  setup() {
    useTabRoute()
    return () => h('div')
  },
})

async function mountAt(path: string) {
  setActivePinia(createPinia())
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const ui = useUiStore()
  const wrapper = mount(Host, { global: { plugins: [router] } })
  await flushPromises()
  return { ui, router, wrapper }
}

describe('reading a tab out of a location', () => {
  it('takes the four that own a path from the path', () => {
    expect(tabOf('/trades', {})).toBe('trades')
    expect(tabOf('/expenses', {})).toBe('expenses')
    expect(tabOf('/news', {})).toBe('news')
    expect(tabOf('/code', {})).toBe('code')
  })

  it('takes every other tab from ?tab=', () => {
    expect(tabOf('/', { tab: 'finances' })).toBe('finances')
    expect(tabOf('/', { tab: 'goals' })).toBe('goals')
  })

  it('refuses a tab that is not one', () => {
    expect(tabOf('/', { tab: 'not-a-tab' })).toBe('')
    expect(tabOf('/', {})).toBe('')
    expect(isTabKey('finances')).toBe(true)
    expect(isTabKey('nope')).toBe(false)
  })
})

describe('writing the tab out', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    try {
      globalThis.sessionStorage?.clear()
    } catch {
      /* a browser that cannot remember still runs the test */
    }
  })

  it('puts a tab with no path of its own in the query', async () => {
    const { ui, router, wrapper } = await mountAt('/')
    ui.setTab('finances')
    await flushPromises()
    // This is the line that did not exist. Without it a refresh on Finances
    // could only ever land on the default tab.
    expect(router.currentRoute.value.fullPath).toBe('/?tab=finances')
    expect(tabOf(router.currentRoute.value.path, router.currentRoute.value.query)).toBe('finances')
    wrapper.unmount()
  })

  it('sends a tab that owns a path to the path, keeping that path’s query', async () => {
    const { ui, router, wrapper } = await mountAt('/?tab=finances')
    ui.setTab('trades')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/trades')
    // The marker goes; the path IS the marker.
    expect(router.currentRoute.value.query.tab).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps the month and day when the tab already owns them', async () => {
    const { router, wrapper } = await mountAt('/trades?month=2026-08&day=2026-08-12')
    await flushPromises()
    // Nothing was rewritten: the location already names the tab it is on, so
    // the writer stays out of the way rather than replacing the query with a
    // bare one and losing the month.
    expect(router.currentRoute.value.query.month).toBe('2026-08')
    expect(router.currentRoute.value.query.day).toBe('2026-08-12')
    wrapper.unmount()
  })

  it('remembers the last route from any tab, not only from Trades', async () => {
    const { ui, wrapper } = await mountAt('/')
    ui.setTab('finances')
    await flushPromises()
    // The bare-domain restore reads this. It used to be written by a composable
    // mounted only on Trades, so Finances never reached it.
    expect(sessionRead(LAST_ROUTE_KEY)).toBe('/?tab=finances')
    wrapper.unmount()
  })
})
