// On /settings, Settings is the current page in every bar: the desktop dock's gear
// is lit (and the tab tile steps back so no tab looks current), and on a phone no
// tab is current and More (where Settings lives) is. Off /settings, the tab is.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import FloatingDock from '@/components/FloatingDock.vue'
import MobileTabBar from '@/components/shell/MobileTabBar.vue'
import { useUiStore } from '@/stores/ui'
import { PRIMARY_TABS } from '@/tabs.config'
import { tabUrl } from '@/utils/lastTab'

async function routerAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/settings', component: { template: '<div />' } },
      { path: '/dev/:m?', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  return router
}

let w: ReturnType<typeof mount> | null = null
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  w?.unmount()
  w = null
  document.body.innerHTML = ''
})

describe('Settings as the current page', () => {
  it('lights the dock’s gear on /settings and steps the tab tile back', async () => {
    useUiStore().setTab('overview')
    const router = await routerAt('/settings')
    w = mount(FloatingDock, { global: { plugins: [router] } })
    await flushPromises()
    const gear = w.get('[data-testid="dock-settings"]')
    expect(gear.classes()).toContain('is-on')
    expect(gear.attributes('aria-current')).toBe('page')
    expect(w.get('nav.dock').classes()).toContain('is-away')
    // No tab claims to be the current page.
    expect(w.findAll('.dock-item[aria-current="page"]').length).toBe(0)
  })

  it('leaves the dock’s tab current anywhere else, and the gear goes to /settings', async () => {
    useUiStore().setTab('overview')
    const router = await routerAt('/')
    w = mount(FloatingDock, { global: { plugins: [router] } })
    await flushPromises()
    const gear = w.get('[data-testid="dock-settings"]')
    expect(gear.classes()).not.toContain('is-on')
    expect(w.get('nav.dock').classes()).not.toContain('is-away')
    expect(w.findAll('.dock-item[aria-current="page"]').length).toBe(1)
    await gear.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/settings')
  })

  it('on a phone: no tab current on /settings, and More is', async () => {
    useUiStore().setTab('overview')
    const router = await routerAt('/settings')
    w = mount(MobileTabBar, {
      attachTo: document.body,
      global: { plugins: [router], stubs: { ShellSync: true, AccountMenu: true } },
    })
    await flushPromises()
    expect(w.findAll('.mtb__item[aria-current="page"]').length).toBe(0)
    const more = w.findAll('.mtb__item').find((b) => b.attributes('aria-label') === 'More')!
    expect(more.classes()).toContain('is-on')
  })
  // Leaving Settings for the tab that was already current must still leave: it
  // used to push a bare `/`, which the router sent back to the stored /settings.
  it('on a phone: the current tab leaves /settings for its own address', async () => {
    const key = PRIMARY_TABS[0]!.key
    useUiStore().setTab(key)
    const router = await routerAt('/settings')
    w = mount(MobileTabBar, {
      attachTo: document.body,
      global: { plugins: [router], stubs: { ShellSync: true, AccountMenu: true } },
    })
    await flushPromises()
    await w.findAll('.mtb__item')[0]!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(tabUrl(key))
  })
})
