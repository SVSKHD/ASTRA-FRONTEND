// Sections 22a–22c and 22f, as the reader meets them: no free-text box, two
// ways in, a list that stays a list, and the same component for a task, a todo
// and a goal.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import NotesSection from '@/components/detail/NotesSection.vue'
import { useAppStore } from '@/stores/app'
import type { Goal, Note, NoteOwnerType, Task, Todo } from '@/types'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

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
    order: id,
    depth: 0,
    rootId: id,
    localRev: 0,
    updatedBy: '',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}
function makeNote(id: number, over: Partial<Note> = {}): Note {
  return {
    id,
    text: 'note ' + id,
    format: 'md',
    ts: id,
    title: '',
    tags: [],
    pinned: false,
    attachedTo: [],
    createdAt: id,
    updatedAt: id,
    ...over,
  }
}

function mountSection(props: { type: NoteOwnerType; id: number | null } & Record<string, unknown>) {
  return mount(NotesSection, {
    props,
    attachTo: document.body,
    global: { directives: { 'hover-style': {} } },
  })
}

const buttonNamed = (wrapper: ReturnType<typeof mountSection>, text: string) =>
  wrapper.findAll('button').find((b) => b.text() === text)

describe('the empty state (acceptance 112)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('offers two ways in and no box to type into', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    const wrapper = mountSection({ type: 'task', id: 1 })
    expect(buttonNamed(wrapper, '+ New note')).toBeTruthy()
    expect(buttonNamed(wrapper, 'Attach existing')).toBeTruthy()
    expect(wrapper.find('textarea').exists()).toBe(false)
  })
})

describe('the attached list', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function withNotes(count: number) {
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    app.notes = Array.from({ length: count }, (_, i) =>
      makeNote(i + 10, { title: `note ${i + 1}` }),
    )
    for (const note of app.notes) app.attachNote('task', 1, note.id)
    return app
  }

  it('is one line per note, newest label and all', () => {
    withNotes(2)
    const wrapper = mountSection({ type: 'task', id: 1 })
    expect(wrapper.findAll('.nsec__row')).toHaveLength(2)
    expect(wrapper.text()).toContain('note 1')
  })

  it('stops at three and offers the rest behind a count', async () => {
    withNotes(5)
    const wrapper = mountSection({ type: 'task', id: 1 })
    expect(wrapper.findAll('.nsec__row')).toHaveLength(3)
    const more = buttonNamed(wrapper, '+2 more')
    expect(more).toBeTruthy()
    await more!.trigger('click')
    expect(wrapper.findAll('.nsec__row')).toHaveLength(5)
  })

  it('opens a row in the column beside the item, not in place', async () => {
    const app = withNotes(1)
    const wrapper = mountSection({ type: 'task', id: 1 })
    await wrapper.get('.nsec__open').trigger('click')
    expect(app.noteColumnId).toBe(10)
  })
})

describe('detaching (acceptance 116)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('removes the reference and keeps the note', async () => {
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    app.notes = [makeNote(10)]
    app.attachNote('task', 1, 10)
    const wrapper = mountSection({ type: 'task', id: 1 })
    wrapper.findComponent({ name: 'Dropdown' }).vm.$emit('select', 'detach')
    await wrapper.vm.$nextTick()
    expect(app.tasks[0].noteIds).toEqual([])
    expect(app.notes.map((n) => n.id)).toEqual([10])
    expect(app.notes[0].attachedTo).toEqual([])
  })
})

describe('+ New note in an existing item (acceptance 114)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('creates the note, attaches it and opens the column', async () => {
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    const wrapper = mountSection({ type: 'task', id: 1 })
    await buttonNamed(wrapper, '+ New note')!.trigger('click')
    expect(app.notes).toHaveLength(1)
    expect(app.tasks[0].noteIds).toEqual([app.notes[0].id])
    expect(app.noteColumnId).toBe(app.notes[0].id)
    expect(app.noteColumnFocusTitle).toBe(true)
  })
})

describe('attach existing (acceptance 115)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('searches title and body, and writes both sides of every pick', async () => {
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    app.notes = [makeNote(10, { title: 'Q3 budget' }), makeNote(11, { text: 'milk' })]
    const wrapper = mountSection({ type: 'task', id: 1 })
    await buttonNamed(wrapper, 'Attach existing')!.trigger('click')
    const picker = wrapper.findComponent({ name: 'NotePicker' })
    expect(picker.exists()).toBe(true)
    picker.vm.$emit('attach', [10, 11])
    await wrapper.vm.$nextTick()
    expect(app.tasks[0].noteIds).toEqual([10, 11])
    expect(app.notes[0].attachedTo).toEqual([{ type: 'task', id: 1 }])
    expect(app.notes[1].attachedTo).toEqual([{ type: 'task', id: 1 }])
  })

  it('marks what is already attached rather than hiding it', async () => {
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    app.notes = [makeNote(10), makeNote(11)]
    app.attachNote('task', 1, 10)
    const wrapper = mountSection({ type: 'task', id: 1 })
    await buttonNamed(wrapper, 'Attach existing')!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.npick__row')).toHaveLength(2)
    expect(wrapper.text()).toContain('Attached')
  })
})

// Section 22f: one component, three owners, no fork.
describe('the same section on a todo and a goal', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const todo = (id: number): Todo =>
    ({
      id,
      text: 'todo',
      done: false,
      status: 'pending',
      tag: '',
      description: '',
      linked: [],
      parents: [],
      reminderIds: [],
      parentId: null,
      order: 0,
      depth: 0,
      rootId: id,
      createdAt: 0,
      updatedAt: 0,
    }) as unknown as Todo
  const goal = (id: number): Goal =>
    ({
      id,
      title: 'goal',
      description: '',
      status: 'active',
      points: [],
      createdAt: 0,
      updatedAt: 0,
    }) as unknown as Goal

  it('renders the same rows and writes to the right owner', async () => {
    const app = useAppStore()
    app.todos = [todo(1)]
    app.goals = [goal(2)]
    app.notes = [makeNote(10, { title: 'shared' })]

    const onTodo = mountSection({ type: 'todo', id: 1 })
    onTodo.findComponent({ name: 'NotePicker' })
    await buttonNamed(onTodo, 'Attach existing')!.trigger('click')
    onTodo.findComponent({ name: 'NotePicker' }).vm.$emit('attach', [10])
    await onTodo.vm.$nextTick()

    const onGoal = mountSection({ type: 'goal', id: 2 })
    await buttonNamed(onGoal, 'Attach existing')!.trigger('click')
    onGoal.findComponent({ name: 'NotePicker' }).vm.$emit('attach', [10])
    await onGoal.vm.$nextTick()

    // One note, two homes, and the markup is identical either side
    // (acceptance 118).
    expect(app.todos[0].noteIds).toEqual([10])
    expect(app.goals[0].noteIds).toEqual([10])
    expect(onTodo.findAll('.nsec__row')).toHaveLength(1)
    expect(onGoal.findAll('.nsec__row')).toHaveLength(1)
    expect(onTodo.get('.nsec__row').html()).toBe(onGoal.get('.nsec__row').html())
  })
})
