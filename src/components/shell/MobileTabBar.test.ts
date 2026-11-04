// The phone's tab bar behaves like Instagram's: icons only (each still named for
// screen readers), and a second tap on the current tab scrolls it to the top.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MobileTabBar from '@/components/shell/MobileTabBar.vue'
import { shellScroller } from '@/components/shell/shellKeys'
import { useUiStore } from '@/stores/ui'
import { PRIMARY_TABS } from '@/tabs.config'

const stubs = { BottomSheet: true, ShellSync: true, AppearancePanel: true, AccountMenu: true }

function mountBar() {
  return mount(MobileTabBar, { global: { stubs } })
}

describe('<MobileTabBar />', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    shellScroller.value = null
  })

  it('shows icons only, and names every button for screen readers', () => {
    const w = mountBar()
    const buttons = w.findAll('nav.mtb > button')
    expect(buttons).toHaveLength(PRIMARY_TABS.length + 1)
    expect(w.find('.mtb__label').exists()).toBe(false)
    for (const b of buttons) expect(b.text()).toBe('')
    expect(buttons.map((b) => b.attributes('aria-label'))).toEqual([
      ...PRIMARY_TABS.map((t) => t.label),
      'More',
    ])
  })

  it('switches tab on the first tap and scrolls to the top on the second', async () => {
    const ui = useUiStore()
    const other = PRIMARY_TABS.find((t) => t.key !== ui.tab)!
    const el = document.createElement('main')
    el.scrollTop = 400
    el.scrollTo = vi.fn() as unknown as typeof el.scrollTo
    shellScroller.value = el

    const w = mountBar()
    const button = w.get(`button[aria-label="${other.label}"]`)
    await button.trigger('click')
    expect(ui.tab).toBe(other.key)
    expect(el.scrollTo).not.toHaveBeenCalled()

    await button.trigger('click')
    expect(el.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
  })

  it('does nothing on a second tap when already at the top', async () => {
    const ui = useUiStore()
    const el = document.createElement('main')
    el.scrollTo = vi.fn() as unknown as typeof el.scrollTo
    shellScroller.value = el
    const w = mountBar()
    const current = PRIMARY_TABS.find((t) => t.key === ui.tab) ?? PRIMARY_TABS[0]
    ui.setTab(current.key)
    await w.get(`button[aria-label="${current.label}"]`).trigger('click')
    expect(el.scrollTo).not.toHaveBeenCalled()
  })
})
