// The top strip. It used to hold the page title beside whatever header actions
// the page teleported in; the title now lives in each tab's own header row. The
// history below is why the strip is still a positioning context of its own.
//
// The title was `position: absolute; left: 50%`. That fails twice over:
//
//   1. The strip had no positioning context, so the 50% was 50% of the SHELL —
//      the title was centred on the window and rendered in the middle of the
//      tab's content. On Trades it sat on top of the table. (Fixed in
//      `appShell.ts`; asserted there.)
//   2. Even in the right box it does not work, because an absolutely positioned
//      element is not laid out with respect to its siblings. The actions are as
//      wide as the page needs — on Trades a three-tab strip, a CSV button and an
//      Account button — and under about 1400px they reach the middle of the row,
//      where a centred overlay is waiting. "Dashboard" was printed over the word
//      "Account".
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ShellStrip from '@/components/shell/ShellStrip.vue'
import { STRIP_ACTIONS_ID } from '@/components/shell/shellKeys'
import { stripGeometry } from '@/views/appShell'

function mountStrip() {
  return mount(ShellStrip, { global: { directives: { 'hover-style': {} } } })
}

describe('the page name', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('is not in the strip: every tab names itself in its own header row', () => {
    // The strip used to carry a name pill beside the brand. Each tab's header
    // (ListToolbar / PanelHeader) now centres the name above its list, and the
    // strip saying it too was the same word twice on one screen.
    const wrapper = mountStrip()
    expect(wrapper.find('.shell-strip > div[title]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Dashboard')
    wrapper.unmount()
  })
})

describe('the brand', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('names the app on every tab, beside its mark', () => {
    const wrapper = mountStrip()
    expect(wrapper.get('.shell-strip__brand').text()).toBe('Aureon')
    wrapper.unmount()
  })
})

describe('the strip itself', () => {
  it('is the positioning context for anything absolute inside it', () => {
    // Belt to `appShell.test.ts`'s braces: that file asserts the geometry, this
    // one is where a reader looking at the title would think to check.
    for (const isPhone of [true, false]) {
      expect(stripGeometry({ isPhone }).position).toBe('relative')
    }
  })

  it('carries the teleport target every page toolbar looks for', () => {
    setActivePinia(createPinia())
    const wrapper = mountStrip()
    expect(wrapper.find(`#${STRIP_ACTIONS_ID}`).exists()).toBe(true)
    wrapper.unmount()
  })
})
