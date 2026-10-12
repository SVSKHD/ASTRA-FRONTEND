import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import TodoDetail from '@/components/TodoDetail.vue'
import TaskDetail from '@/components/TaskDetail.vue'
import { SUBTASK_TICK_MS } from '@/composables/useSubtaskGroups'
describe('completed subtasks below open subtasks', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })
  it.each(['todos', 'tasks'] as const)(
    'groups %s, plays the tick before moving, and supports reopening',
    async (collection) => {
      const app = useAppStore()
      const create = (title: string) =>
        collection === 'todos' ? app.addTodo(title)! : app.addTask(title, '')!
      const parent = create('Parent')
      const open = create('Still open')
      const done = create('Already closed')
      if (collection === 'todos') {
        app.moveTodo(open, parent, 0)
        app.moveTodo(done, parent, 1)
        app.setTodoStatus(done, 'done')
      } else {
        app.moveTask(open, parent, 0)
        app.moveTask(done, parent, 1)
        app.setTaskStatus(done, 'done')
      }
      const wrapper = mount(
        {
          render: () =>
            collection === 'todos'
              ? h(TodoDetail, { todoId: parent })
              : h(TaskDetail, { taskId: parent }),
        },
        { global: { stubs: { QuickAdd: true, PaneNotes: true, TaskTimeline: true } } },
      )
      expect(
        wrapper.findAll('section.dp-subgroup').map((section) => section.attributes('aria-label')),
      ).toEqual(['Open subtasks', 'Completed subtasks'])
      const row = `[data-subtask-id="${open}"]`
      await wrapper.find(`${row} .subcheck`).trigger('click')
      expect(wrapper.find(`[aria-label="Open subtasks"] ${row}`).exists()).toBe(true)
      expect(wrapper.find(`${row} .subcheck`).classes()).toContain('is-ticking')
      await vi.advanceTimersByTimeAsync(SUBTASK_TICK_MS)
      expect(wrapper.find(`[aria-label="Completed subtasks"] ${row}`).exists()).toBe(true)
      expect(wrapper.find('[aria-label="Open subtasks"]').text()).toContain('No open subtasks.')
      await wrapper.find(`${row} .subcheck`).trigger('click')
      expect(wrapper.find(`[aria-label="Open subtasks"] ${row}`).exists()).toBe(true)
      expect(app[collection].find((item) => item.id === open)?.status).toBe('pending')
      expect(app[collection].find((item) => item.id === done)?.status).toBe('done')
      wrapper.unmount()
    },
  )
})
