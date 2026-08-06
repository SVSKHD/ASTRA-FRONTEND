// Verifies the nested rendering: a parent's children render inside it (with the
// right count), and a child rendered at the top level shows a "part of ‹parent›"
// breadcrumb so it never silently disappears.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import LinkedAccordion from '@/components/LinkedAccordion.vue'
import { useAppStore } from '@/stores/app'
import type { LinkRef, Todo } from '@/types'

function makeTodo(id: number, over: Partial<Todo> = {}): Todo {
  return {
    id,
    text: 'todo ' + id,
    done: false,
    status: 'pending',
    tag: '',
    description: '',
    isPublic: false,
    shareId: null,
    sharedAt: null,
    rolledOverAt: null,
    rolloverCount: 0,
    completedAt: null,
    linked: [],
    parents: [],
    reminderIds: [],
    sourceRef: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}
const ref = (id: number): LinkRef => ({ id, collection: 'todos' })

function seedParentWithChildren() {
  const app = useAppStore()
  app.todos = [
    makeTodo(1, { linked: [ref(2), ref(3), ref(4)] }),
    makeTodo(2, { parents: [ref(1)] }),
    makeTodo(3, { parents: [ref(1)], status: 'done', done: true }),
    makeTodo(4, { parents: [ref(1)] }),
  ]
  return app
}

describe('<LinkedAccordion />', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('renders the parent with its three children nested and the right count', async () => {
    seedParentWithChildren()
    const wrapper = mount(LinkedAccordion, {
      props: { itemRef: ref(1), depth: 0, isRoot: false, defaultExpanded: true },
    })
    await wrapper.vm.$nextTick()
    const text = wrapper.text()
    // parent + all three children rendered
    expect(text).toContain('todo 1')
    expect(text).toContain('todo 2')
    expect(text).toContain('todo 3')
    expect(text).toContain('todo 4')
    // 1 of 3 done
    expect(text).toContain('1/3')
  })

  it('shows a "part of" breadcrumb for a child rendered at the top level', async () => {
    seedParentWithChildren()
    const wrapper = mount(LinkedAccordion, {
      props: { itemRef: ref(2), depth: 0, isRoot: true },
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('part of')
    expect(wrapper.text()).toContain('todo 1')
  })

  it('no breadcrumb when it is not a root node', async () => {
    seedParentWithChildren()
    const wrapper = mount(LinkedAccordion, {
      props: { itemRef: ref(2), depth: 1, isRoot: false, parentRef: ref(1) },
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('part of')
  })
})
