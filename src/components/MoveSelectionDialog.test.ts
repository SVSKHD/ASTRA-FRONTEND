import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MoveSelectionDialog from './MoveSelectionDialog.vue'
import { useAppStore } from '@/stores/app'
import Combobox from '@/components/ui/Combobox.vue'
const options = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findComponent(Combobox).props('options') as { value: string; label: string }[]
describe('move parent picker', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('lists only active todos and excludes the selected subtree', () => {
    const app = useAppStore()
    app.addTodo('Selected')
    app.addTodo('Active parent')
    app.addTodo('Completed parent')
    app.addTodo('Archived parent')
    app.addTask('Task parent', '')
    const selected = app.todos[0].id
    app.todos[2].done = true
    app.todos[2].status = 'done'
    app.todos[3].archivedAt = 1
    const wrapper = mount(MoveSelectionDialog, {
      props: { open: true, collection: 'todos', ids: [selected] },
      global: { stubs: { teleport: true } },
    })
    expect(options(wrapper).map((option) => option.label)).toEqual(['Top level', 'Active parent'])
    wrapper.unmount()
  })
  it('lists tasks only and filters them while typing before choosing a destination', async () => {
    const app = useAppStore()
    app.addTask('Selected', '')
    app.addTask('Work project', '')
    app.addTask('Personal project', '')
    app.addTodo('Work todo')
    const selected = app.tasks[0].id
    const target = app.tasks[1].id
    const wrapper = mount(MoveSelectionDialog, {
      props: { open: true, collection: 'tasks', ids: [selected] },
      attachTo: document.body,
      global: { stubs: { teleport: true } },
    })
    expect(options(wrapper).map((option) => option.label)).toEqual([
      'Top level',
      'Work project',
      'Personal project',
    ])
    const input = wrapper.find('input[role="combobox"]')
    await input.trigger('focus')
    await input.setValue('Work')
    await flushPromises()
    expect(
      [...document.querySelectorAll('[role="option"]')].map((el) => el.textContent?.trim()),
    ).toEqual(['Work project'])
    const moveButton = wrapper.findAll('button').find((button) => button.text() === 'Move')!
    expect(moveButton.attributes('disabled')).toBeDefined()
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(moveButton.attributes('disabled')).toBeUndefined()
    await moveButton.trigger('click')
    expect(app.tasks.find((item) => item.id === selected)?.parentId).toBe(target)
    wrapper.unmount()
  })
})
