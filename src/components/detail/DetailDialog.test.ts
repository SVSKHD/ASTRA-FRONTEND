// The shell's own behaviour (section 18a): the dirty guard, the keyboard, the
// focus round trip and the scroll lock. Nothing here knows about tasks or goals.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import DetailDialog from '@/components/detail/DetailDialog.vue'

function mountShell(props: Record<string, unknown> = {}) {
  return mount(DetailDialog, {
    props: { open: true, title: 'Quarter plan', ...props },
    slots: { default: '<p class="body">body text</p>' },
    attachTo: document.body,
  })
}

afterEach(() => {
  document.body.style.overflow = ''
})

describe('the surface', () => {
  it('is a labelled modal dialog', () => {
    const wrapper = mountShell()
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    const labelledBy = dialog.attributes('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(wrapper.find(`#${labelledBy}`).text()).toBe('Quarter plan')
  })

  it('renders its body', () => {
    expect(mountShell().find('.body').text()).toBe('body text')
  })

  it('renders nothing at all when closed', () => {
    expect(mountShell({ open: false }).find('[role="dialog"]').exists()).toBe(false)
  })

  it('is a sheet on mobile and a centred panel otherwise', () => {
    expect(mountShell({ mobile: true }).find('.detail--sheet').exists()).toBe(true)
    expect(mountShell().find('.detail--modal').exists()).toBe(true)
  })

  it('locks the page behind it and lets go on close (acceptance 90)', async () => {
    const wrapper = mountShell({ mobile: true })
    expect(document.body.style.overflow).toBe('hidden')
    await wrapper.setProps({ open: false })
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})

describe('closing', () => {
  it('closes on a click outside', async () => {
    const wrapper = mountShell()
    await wrapper.find('[data-testid="detail-scrim"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('closes on Escape', async () => {
    const wrapper = mountShell()
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('closes on the close button', async () => {
    const wrapper = mountShell()
    await wrapper.find('button[aria-label="Close"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

describe('the dirty guard', () => {
  it('asks before dropping unsaved edits rather than closing', async () => {
    const wrapper = mountShell({ dirty: true })
    await wrapper.find('[data-testid="detail-scrim"]').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
  })

  it('discards once the reader confirms — a different event from a plain close', async () => {
    const wrapper = mountShell({ dirty: true })
    await wrapper.find('[data-testid="detail-scrim"]').trigger('click')
    await wrapper.findAll('.detail__confirm button')[1].trigger('click')
    // `close` flushes what is in flight, which is the opposite of what was just
    // asked for, so this is its own event.
    expect(wrapper.emitted('discard')).toHaveLength(1)
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('goes back to editing on the other answer', async () => {
    const wrapper = mountShell({ dirty: true })
    await wrapper.find('[data-testid="detail-scrim"]').trigger('click')
    await wrapper.findAll('.detail__confirm button')[0].trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  })

  it('guards Escape too', async () => {
    const wrapper = mountShell({ dirty: true })
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toBeUndefined()
    // A second Escape dismisses the question, not the dialog.
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  })
})

describe('stepping through the list behind', () => {
  it('offers arrows only in the directions there is something to see', () => {
    const wrapper = mountShell({ hasPrev: false, hasNext: true })
    expect(wrapper.find('button[aria-label="Previous"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button[aria-label="Next"]').attributes('disabled')).toBeUndefined()
  })

  it('steps with j and k', async () => {
    const wrapper = mountShell({ hasPrev: true, hasNext: true })
    const dialog = wrapper.find('[role="dialog"]')
    await dialog.trigger('keydown', { key: 'j' })
    await dialog.trigger('keydown', { key: 'k' })
    expect(wrapper.emitted('next')).toHaveLength(1)
    expect(wrapper.emitted('prev')).toHaveLength(1)
  })

  it('leaves j and k alone while the reader is typing', async () => {
    const wrapper = mount(DetailDialog, {
      props: { open: true, title: 'T', hasNext: true, hasPrev: true },
      slots: { default: '<input class="field" />' },
      attachTo: document.body,
    })
    await wrapper.find('.field').trigger('keydown', { key: 'j' })
    expect(wrapper.emitted('next')).toBeUndefined()
  })

  it('does not step in a direction with nothing in it', async () => {
    const wrapper = mountShell({ hasNext: false })
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'j' })
    expect(wrapper.emitted('next')).toBeUndefined()
  })
})

describe('the back path', () => {
  it('has no back arrow at the top of the stack', () => {
    expect(mountShell().find('button[aria-label="Back"]').exists()).toBe(false)
  })

  it('goes back when there is somewhere to go', async () => {
    const wrapper = mountShell({ canGoBack: true, backLabel: 'Back to Quarter plan' })
    await wrapper.find('button[aria-label="Back to Quarter plan"]').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
  })
})

describe('focus', () => {
  it('takes focus on open and hands it back on close', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const wrapper = mount(DetailDialog, {
      props: { open: false, title: 'T' },
      attachTo: document.body,
    })
    await wrapper.setProps({ open: true })
    await new Promise((r) => setTimeout(r, 0))
    expect(document.activeElement).toBe(wrapper.find('[role="dialog"]').element)
    await wrapper.setProps({ open: false })
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('keeps Tab inside the dialog', async () => {
    const wrapper = mountShell()
    const buttons = wrapper.findAll<HTMLButtonElement>('.detail__icon')
    const last = buttons[buttons.length - 1].element
    last.focus()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    last.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('the mobile sheet', () => {
  // `trigger` cannot set clientY (it is a getter on MouseEvent), so the drag is
  // dispatched directly. jsdom reports every element as zero-height, so the
  // sheet height it is measured against is stubbed for the duration.
  let heightDescriptor: PropertyDescriptor | undefined
  beforeEach(() => {
    heightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get: () => 600,
    })
  })
  afterEach(() => {
    if (heightDescriptor)
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', heightDescriptor)
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight
  })

  // The gap between the press and the move is real time, because the component
  // measures velocity from the events' own timestamps. Dispatching all three in
  // the same instant reads as an infinitely fast flick, which is not the gesture
  // any of these tests mean.
  async function drag(el: Element, to: number) {
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 0 }))
    await new Promise((resolve) => setTimeout(resolve, 60))
    el.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: to }))
    el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientY: to }))
  }

  it('dismisses when dragged far enough down', async () => {
    const wrapper = mountShell({ mobile: true })
    await drag(wrapper.find('[data-testid="detail-grip"]').element, 480)
    await nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('springs back rather than dismissing on a short drag', async () => {
    const wrapper = mountShell({ mobile: true })
    await drag(wrapper.find('[data-testid="detail-grip"]').element, 20)
    await nextTick()
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('a drag away still respects unsaved edits', async () => {
    const wrapper = mountShell({ mobile: true, dirty: true })
    await drag(wrapper.find('[data-testid="detail-grip"]').element, 480)
    await nextTick()
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
  })

  it('has no grip on desktop', () => {
    expect(mountShell().find('[data-testid="detail-grip"]').exists()).toBe(false)
  })
})

describe('the document-level escape hatch', () => {
  it('closes on Escape pressed outside the panel', async () => {
    const wrapper = mountShell()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.waitFor(() => expect(wrapper.emitted('close')).toHaveLength(1))
  })
})
