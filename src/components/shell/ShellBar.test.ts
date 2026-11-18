// The bottom pill's Settings button goes to the settings page.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const push = vi.hoisted(() => vi.fn())
const path = vi.hoisted(() => ({ value: '/' }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push, currentRoute: { value: { path: path.value } } }),
  useRoute: () => ({ query: {}, params: {} }),
}))

import ShellBar from '@/components/shell/ShellBar.vue'

describe('<ShellBar /> settings', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockReset()
  })

  it('has a labelled Settings button that opens /settings', async () => {
    const w = mount(ShellBar, { global: { stubs: { ShellSync: true, AccountMenu: true } } })
    const btn = w.get('[data-testid="pill-settings"]')
    expect(btn.attributes('aria-label')).toBe('Settings')
    expect(btn.text()).toContain('Settings')
    await btn.trigger('click')
    expect(push).toHaveBeenCalledWith('/settings')
  })

  it('marks its Settings button as the current page on /settings', () => {
    path.value = '/settings'
    const w = mount(ShellBar, { global: { stubs: { ShellSync: true, AccountMenu: true } } })
    const btn = w.get('[data-testid="pill-settings"]')
    expect(btn.classes()).toContain('is-on')
    expect(btn.attributes('aria-current')).toBe('page')
    path.value = '/'
  })
})
