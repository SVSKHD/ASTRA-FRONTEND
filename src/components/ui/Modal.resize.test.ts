import { it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Modal from './Modal.vue'

it('resizes with pointer and keyboard, clamps to the viewport and keeps other dialogs unchanged', async () => {
  const normal = mount(Modal, {
    props: { open: true, title: 'Normal' },
    global: { stubs: { teleport: true } },
  })
  expect(normal.find('[aria-label="Resize dialog"]').exists()).toBe(false)
  normal.unmount()
  const wrapper = mount(Modal, {
    props: { open: true, title: 'Resizable', resizable: true },
    global: { stubs: { teleport: true } },
  })
  const panel = wrapper.find('[role="dialog"]')
  vi.spyOn(panel.element, 'getBoundingClientRect').mockReturnValue({
    width: 520,
    height: 400,
  } as DOMRect)
  const handle = wrapper.find('[aria-label="Resize dialog"]')
  await handle.trigger('keydown', { key: 'ArrowRight' })
  expect((panel.element as HTMLElement).style.width).toBe('540px')
  const pointer = async (type: string, clientX = 0, clientY = 0) => {
    handle.element.dispatchEvent(
      new MouseEvent(type, { button: 0, clientX, clientY, bubbles: true }),
    )
    await wrapper.vm.$nextTick()
  }
  await pointer('pointerdown', 500, 400)
  await pointer('pointermove', 550, 440)
  expect((panel.element as HTMLElement).style.width).toBe('620px')
  expect((panel.element as HTMLElement).style.height).toBe('480px')
  await pointer('pointermove', 10000, 10000)
  expect(Number.parseInt((panel.element as HTMLElement).style.width)).toBe(window.innerWidth - 32)
  expect(Number.parseInt((panel.element as HTMLElement).style.height)).toBe(window.innerHeight - 32)
  await pointer('pointerup')
  await pointer('pointermove', 200, 200)
  expect(Number.parseInt((panel.element as HTMLElement).style.width)).toBe(window.innerWidth - 32)
  wrapper.unmount()
})
