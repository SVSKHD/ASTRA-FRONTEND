import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useAccordionState } from '@/composables/useAccordionState'
import { useTreeDrag } from '@/composables/useTreeDrag'
import TodoView from './views/TodoView.vue'
import TreeList from './TreeList.vue'

describe('drag a subtodo from details to another parent', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })
  afterEach(() => {
    useTreeDrag().cancel()
    vi.restoreAllMocks()
  })
  it.each(['active', 'carried'] as const)(
    'moves to an %s parent without losing the subtree or metadata',
    async (region) => {
      const app = useAppStore()
      app.paneMode = 'inline'
      const source = app.addTodo('Source parent')!
      const target = app.addTodo('Target parent')!
      if (region === 'carried')
        app.todos.find((item) => item.id === target)!.createdAt = Date.now() - 3 * 86400000
      const child = app.addTodo('Child', '', 'Keep this description')!
      const grandchild = app.addTodo('Grandchild')!
      app.moveTodo(child, source, 0)
      app.moveTodo(grandchild, child, 0)
      useAccordionState().set('carried:todos', true)
      const wrapper = mount(TodoView, {
        attachTo: document.body,
        global: { stubs: { QuickAdd: true, PaneNotes: true, TaskTimeline: true, teleport: true } },
      })
      wrapper.findComponent(TreeList).vm.$emit('select', source)
      await wrapper.vm.$nextTick()
      const destination = wrapper.find(
        region === 'active' ? `[data-tree-id="${target}"]` : `[data-nest-id="${target}"]`,
      ).element as HTMLElement
      if (region === 'carried') expect(destination.dataset.treeId).toBeUndefined()
      const oldHitTest = document.elementFromPoint
      document.elementFromPoint = () => destination
      vi.spyOn(destination, 'getBoundingClientRect').mockReturnValue({
        top: 0,
        bottom: 100,
        height: 100,
        left: 0,
        right: 300,
        width: 300,
        x: 0,
        y: 0,
        toJSON() {},
      })
      try {
        const press = new MouseEvent('pointerdown', {
          bubbles: true,
          clientX: 30,
          clientY: 5,
          button: 0,
        })
        Object.defineProperty(press, 'pointerType', { value: 'mouse' })
        wrapper.find(`[data-subtask-id="${child}"] .drag-handle`).element.dispatchEvent(press)
        expect(useTreeDrag().drag.mode).toBe('nest')
        expect(useTreeDrag().drag.valid).toBe(true)
        window.dispatchEvent(new Event('pointerup'))
        await wrapper.vm.$nextTick()
        expect(app.todos.find((item) => item.id === child)).toMatchObject({
          parentId: target,
          description: 'Keep this description',
          rootId: target,
          depth: 1,
        })
        expect(app.todos.find((item) => item.id === grandchild)).toMatchObject({
          parentId: child,
          rootId: target,
          depth: 2,
        })
        expect(wrapper.find(`[data-subtask-id="${child}"]`).exists()).toBe(false)
      } finally {
        document.elementFromPoint = oldHitTest
        wrapper.unmount()
      }
    },
  )
})
