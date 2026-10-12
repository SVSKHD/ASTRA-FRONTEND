import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import TasksView from './TasksView.vue'
import NextUpPanel from '@/components/todo/NextUpPanel.vue'
import CompletedSection from '@/components/CompletedSection.vue'
describe('Tasks uses the Todo layout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })
  it('shows task Next up and an inline Completed section that respects the hide setting', async () => {
    const app = useAppStore()
    app.addTask('Open task', '')
    app.addTask('Finished task', '')
    app.setTaskStatus(app.tasks[1].id, 'done')
    const wrapper = mount(TasksView, {
      global: { stubs: { NextUpPanel: true, TaskDetail: true, QuickAdd: true, teleport: true } },
    })
    expect(wrapper.findComponent(NextUpPanel).props('collection')).toBe('tasks')
    expect(wrapper.findComponent(CompletedSection).props('collection')).toBe('tasks')
    expect(wrapper.findComponent(CompletedSection).props('count')).toBe(1)
    app.hideCompleted = true
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(CompletedSection).exists()).toBe(false)
    wrapper.unmount()
  })
})
