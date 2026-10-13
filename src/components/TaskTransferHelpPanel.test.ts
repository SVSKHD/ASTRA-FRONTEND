import { it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TaskTransferHelpPanel from './TaskTransferHelpPanel.vue'
import Tabs from './ui/Tabs.vue'
import { useAppStore } from '@/stores/app'

it('shows and copies nested examples with correct new-parent and existing-parent counts', async () => {
  setActivePinia(createPinia())
  useAppStore().openTaskTransferHelp('tasks')
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  const wrapper = mount(TaskTransferHelpPanel, { global: { stubs: { teleport: true } } })
  const values = () =>
    wrapper.findAll('[aria-label="Import hierarchy counts"] dd').map((count) => count.text())
  expect(values()).toEqual(['1', '2', '1'])
  const format = wrapper.findAllComponents(Tabs)[1]
  format.vm.$emit('update:modelValue', 'existing-parent')
  await wrapper.vm.$nextTick()
  expect(values()).toEqual(['0', '2', '1'])
  expect(wrapper.text()).toContain('Replace parentId 123')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Copy sample')!
    .trigger('click')
  expect(JSON.parse(writeText.mock.calls[0][0])).toMatchObject({
    collection: 'tasks',
    parentId: 123,
  })
  useAppStore().setTaskTransferHelpCollection('todos')
  await wrapper.vm.$nextTick()
  expect(JSON.parse(wrapper.find('.thelper__sample code').text()).collection).toBe('todos')
  wrapper.unmount()
})
