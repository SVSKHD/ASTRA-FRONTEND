import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import QuickAdd from './QuickAdd.vue'
describe('Quick Add in task details', () => {
  it('creates a parsed subtask under the task without creating a todo', async () => {
    setActivePinia(createPinia())
    const app = useAppStore()
    app.addTask('Parent', '')
    const parentId = app.tasks[0].id
    const wrapper = mount(QuickAdd, { props: { collection: 'tasks', parentId } })
    await wrapper.find('input').setValue('Ship UI #Design !high')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    const sub = app.tasks.find((item) => item.parentId === parentId)!
    expect(sub).toMatchObject({
      title: 'Ship UI',
      tag: 'Design',
      priority: 'high',
      depth: 1,
      rootId: parentId,
    })
    expect(app.todos).toHaveLength(0)
    wrapper.unmount()
  })
})
