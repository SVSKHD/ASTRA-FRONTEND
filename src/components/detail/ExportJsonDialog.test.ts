import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ExportJsonDialog from '@/components/detail/ExportJsonDialog.vue'

describe('Export JSON dialog', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows the JSON and copies exactly that', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const json = '{\n  "items": [{ "title": "Checkout" }]\n}'
    const w = mount(ExportJsonDialog, {
      props: { open: true, title: 'Checkout', json, filename: 'checkout.json', count: 1 },
      attachTo: document.body,
      global: { stubs: { teleport: true } },
    })
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe(json)
    await w
      .findAll('button')
      .find((b) => b.text().includes('Copy JSON'))!
      .trigger('click')
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith(json)
    expect(w.text()).toContain('Copied')
    w.unmount()
  })
})
