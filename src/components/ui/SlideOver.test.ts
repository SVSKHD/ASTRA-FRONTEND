// The drawer, and the three things about it that are easy to break by accident:
// it is fixed to the WINDOW rather than to the tab that declared it, it has two
// widths the reader chooses between, and it says how wide it currently is so
// the tab behind can make room.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import SlideOver from '@/components/ui/SlideOver.vue'

// Dispatched rather than triggered: the test-utils helper cannot write
// `clientX` onto a jsdom MouseEvent, and the whole drag is about clientX.
// jsdom has no pointer capture either, so the element gets a no-op.
async function drag(el: Element, from: number, to: number): Promise<void> {
  const target = el as HTMLElement & { setPointerCapture?: (id: number) => void }
  target.setPointerCapture = () => {}
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: from }))
  el.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: to }))
  el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: to }))
  await nextTick()
}

function mountDrawer(props: Record<string, unknown> = {}) {
  return mount(SlideOver, {
    props: { open: true, title: 'Details', ...props },
    slots: { default: () => h('p', 'the body') },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

describe('the drawer', () => {
  it('teleports, so `fixed` is measured against the window', () => {
    // Left where it is declared, the glass panel's backdrop-filter becomes the
    // drawer's containing block: it ends where the tab's content ends instead
    // of at the bottom of the window. The teleport is stubbed here (so the rest
    // of the file can read the markup), and the stub is the proof it is asked
    // for at all.
    const wrapper = mountDrawer()
    expect(wrapper.find('teleport-stub').exists()).toBe(true)
    expect(wrapper.find('teleport-stub .ui-drawer').exists()).toBe(true)
  })

  it('is a dialog when modal and a companion pane when not', () => {
    expect(mountDrawer().find('.ui-drawer').attributes('role')).toBe('dialog')
    const pane = mountDrawer({ modal: false })
    expect(pane.find('.ui-drawer').attributes('role')).toBe('complementary')
    // No scrim: the list it was opened from has to stay clickable.
    expect(pane.find('.ui-drawer__scrim').exists()).toBe(false)
  })

  it('shows the mode button only when modes are offered', () => {
    expect(mountDrawer().find('.ui-drawer__mode').exists()).toBe(false)
    expect(mountDrawer({ modes: true }).find('.ui-drawer__mode').exists()).toBe(true)
  })

  it('asks for the other mode when the button is used', async () => {
    const wrapper = mountDrawer({ modes: true, size: 'compact' })
    await wrapper.find('.ui-drawer__mode').trigger('click')
    expect(wrapper.emitted('update:size')?.[0]).toEqual(['large'])

    const large = mountDrawer({ modes: true, size: 'large' })
    await large.find('.ui-drawer__mode').trigger('click')
    expect(large.emitted('update:size')?.[0]).toEqual(['compact'])
  })

  it('opens compact at a column and large at half the window', async () => {
    const compact = mountDrawer({ size: 'compact' })
    await nextTick()
    expect(compact.find('.ui-drawer').attributes('style')).toContain('width: 420px')

    const large = mountDrawer({ size: 'large' })
    await nextTick()
    expect(large.find('.ui-drawer').attributes('style')).toContain(
      `width: ${Math.round(window.innerWidth / 2)}px`,
    )
  })

  it('reports its width, so the tab behind knows how much to give up', async () => {
    const wrapper = mountDrawer({ size: 'compact' })
    await nextTick()
    const widths = (wrapper.emitted('width') ?? []).map((e) => e[0])
    expect(widths).toContain(420)
  })

  it('goes back to the mode width after a drag, once a mode is chosen again', async () => {
    const wrapper = mountDrawer({ size: 'compact' })
    const drawer = () => wrapper.find('.ui-drawer').attributes('style')
    await nextTick()
    expect(drawer()).toContain('width: 420px')

    // A drag widens it and that width sticks…
    await drag(wrapper.find('.ui-drawer__grip').element, 900, 700)
    expect(drawer()).toContain('width: 620px')

    // …until the mode is chosen again, which is a fresh answer to the same
    // question and has to win, or the button reads as broken.
    await wrapper.setProps({ size: 'large' })
    await nextTick()
    expect(drawer()).toContain(`width: ${Math.round(window.innerWidth / 2)}px`)
  })

  it('never narrows past a readable column, however far the grip is dragged', async () => {
    const wrapper = mountDrawer({ size: 'compact' })
    await drag(wrapper.find('.ui-drawer__grip').element, 900, 2000)
    expect(wrapper.find('.ui-drawer').attributes('style')).toContain('width: 280px')
  })
})
