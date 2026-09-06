// The top strip holds two things that are laid out against each other: the page
// title, and whatever header actions the page teleports in. They used to be
// unable to, and this is the test that says why they now can.
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

describe('the page title', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('is in the row, not floating over it', () => {
    const wrapper = mountStrip()
    const title = wrapper.get('.shell-strip > div[title]')
    const style = title.attributes('style') ?? ''
    // Out of flow is the whole failure mode: an element that takes no layout
    // space cannot be kept apart from a neighbour whose width it does not know.
    expect(style).not.toContain('position: absolute')
    expect(style).not.toContain('position: fixed')
    expect(style).not.toContain('left: 50%')
    wrapper.unmount()
  })

  it('comes before the actions, so the row orders itself', () => {
    const wrapper = mountStrip()
    const html = wrapper.html()
    expect(html.indexOf('title=')).toBeLessThan(html.indexOf(STRIP_ACTIONS_ID))
    wrapper.unmount()
  })

  it('still truncates rather than pushing the actions off the edge', () => {
    const wrapper = mountStrip()
    const style = wrapper.get('.shell-strip > div[title]').attributes('style') ?? ''
    expect(style).toContain('max-width')
    expect(style).toContain('ellipsis')
    // And it does not shrink to nothing when the actions are greedy: it holds
    // its width and they take the slack.
    expect(style).toContain('flex-shrink: 0')
    wrapper.unmount()
  })

  it('names the tab it is on', () => {
    // 'overview' is the default tab, and it is called the Dashboard everywhere
    // a reader sees it.
    expect(mountStrip().get('.shell-strip > div[title]').text()).toBe('Dashboard')
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
