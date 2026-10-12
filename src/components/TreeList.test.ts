// Verifies the flat tree render: a root and its descendants render as one flat,
// indented list, and every row at every depth carries a grip handle (acceptance
// 7) and the tree data attributes the drag engine reads.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TreeList from '@/components/TreeList.vue'
import { useTreeDrag } from '@/composables/useTreeDrag'
import { useAppStore } from '@/stores/app'
import { useAccordionState } from '@/composables/useAccordionState'
import type { Task } from '@/types'

function makeTask(id: number, over: Partial<Task> = {}): Task {
  return {
    id,
    title: 'task ' + id,
    tag: '',
    done: false,
    status: 'pending',
    deadline: '',
    notes: '',
    repo: '',
    rolledOverAt: null,
    rolloverCount: 0,
    completedAt: null,
    linked: [],
    parents: [],
    reminderIds: [],
    sourceRef: null,
    parentId: null,
    order: 0,
    depth: 0,
    rootId: id,
    localRev: 0,
    updatedBy: '',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

describe('<TreeList />', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('renders a root and its whole subtree flat, a grip handle on every row', async () => {
    const app = useAppStore()
    // 1 → {2, 3}; 2 → 4 (a grandchild).
    app.tasks = [
      makeTask(1),
      makeTask(2, { parentId: 1, depth: 1, rootId: 1, order: 0 }),
      makeTask(3, { parentId: 1, depth: 1, rootId: 1, order: 1 }),
      makeTask(4, { parentId: 2, depth: 2, rootId: 1, order: 0 }),
    ]
    // Expand so descendants are visible.
    const acc = useAccordionState()
    acc.set('tasktree:1', true)
    acc.set('tasktree:2', true)

    const wrapper = mount(TreeList, {
      props: { collection: 'tasks', rootIds: [1] },
      global: { directives: { 'hover-style': {} } },
    })
    await wrapper.vm.$nextTick()

    const text = wrapper.text()
    expect(text).toContain('task 1')
    expect(text).toContain('task 4') // grandchild rendered flat

    // A grip handle on every visible row (4), each labelled for keyboard users.
    const handles = wrapper.findAll('.drag-handle')
    expect(handles.length).toBe(4)
    expect(handles[0].attributes('aria-label')).toBe('Reorder task')
    expect(handles[0].attributes('tabindex')).toBe('0')

    // Rows carry the tree data attributes the drag engine reads.
    const rows = wrapper.findAll('[data-tree-id]')
    expect(rows.length).toBe(4)
    expect(rows.map((r) => r.attributes('data-tree-depth')).sort()).toEqual(['0', '1', '1', '2'])

    // The root strip is only present while dragging.
    expect(wrapper.find('[data-tree-root]').exists()).toBe(false)
  })
})

describe('selected group drag', () => {
  it('starts from a selected grip, nests the whole group, and preserves selection after release', async () => {
    setActivePinia(createPinia())
    const app = useAppStore()
    app.tasks = [makeTask(1), makeTask(2, { order: 1 }), makeTask(3, { order: 2 })]
    const wrapper = mount(TreeList, {
      props: { collection: 'tasks', rootIds: [1, 2, 3], selectionMode: true, selectedIds: [1, 2] },
      attachTo: document.body,
    })
    const target = wrapper.find('[data-tree-id="3"]').element as HTMLElement
    const oldHitTest = document.elementFromPoint
    document.elementFromPoint = () => target
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
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
        clientY: 50,
        button: 0,
      })
      Object.defineProperty(press, 'pointerType', { value: 'mouse' })
      wrapper.find('[data-tree-id="1"] .drag-handle').element.dispatchEvent(press)
      expect(useTreeDrag().drag.ids).toEqual([1, 2])
      expect(useTreeDrag().drag.title).toBe('2 items')
      window.dispatchEvent(new Event('pointerup'))
      expect(app.tasks.filter((item) => item.parentId === 3).map((item) => item.id)).toEqual([1, 2])
      await wrapper.find('[data-tree-id="1"]').trigger('click')
      expect(wrapper.emitted('toggleSelect')).toBeUndefined()
    } finally {
      useTreeDrag().cancel()
      document.elementFromPoint = oldHitTest
      wrapper.unmount()
      vi.restoreAllMocks()
    }
  })
})
