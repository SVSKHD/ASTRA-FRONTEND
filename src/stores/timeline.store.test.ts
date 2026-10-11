// The Timeline, from the store's side: writing entries, linking them to tasks
// and notes, deleting with an Undo — and the wiring that saves them at all.
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import type { Note, Task, Todo } from '@/types'

const task = (id: number) => ({ id, title: 'task ' + id }) as Task
const note = (id: number) => ({ id, text: 'note ' + id, ts: 0 }) as Note

beforeEach(() => setActivePinia(createPinia()))

describe('writing an entry', () => {
  it('needs a title or a body, and defaults the day and the status', () => {
    const app = useAppStore()
    expect(app.addTimelineEntry({ title: '  ', body: '' })).toBeNull()
    const id = app.addTimelineEntry({ title: ' Board ' })
    const e = app.timeline.find((x) => x.id === id)!
    expect(e.title).toBe('Board')
    expect(e.status).toBe('planned')
    expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('only links tasks and notes that exist', () => {
    const app = useAppStore()
    app.tasks = [task(1)]
    app.notes = [note(5)]
    const id = app.addTimelineEntry({ title: 'x', taskIds: [1, 1, 2], noteIds: [5, 6] })
    const e = app.timeline.find((x) => x.id === id)!
    expect(e.taskIds).toEqual([1])
    expect(e.noteIds).toEqual([5])
  })

  it('updates in place and ages the entry', () => {
    const app = useAppStore()
    const id = app.addTimelineEntry({ title: 'x' })!
    app.timeline = app.timeline.map((e) => ({ ...e, updatedAt: 0 }))
    app.updateTimelineEntry(id, { status: 'shipped', body: '## Done ' })
    const e = app.timeline[0]
    expect(e.status).toBe('shipped')
    expect(e.body).toBe('## Done')
    expect(e.updatedAt).toBeGreaterThan(0)
  })
})

describe('linking tasks', () => {
  it('links and unlinks, and a task finds its entries by asking', () => {
    const app = useAppStore()
    app.tasks = [task(1), task(2)]
    const a = app.addTimelineEntry({ title: 'a', date: '2026-10-01' })!
    const b = app.addTimelineEntry({ title: 'b', date: '2026-10-09', taskIds: [1] })!
    app.linkTimelineTask(a, 1, true)
    expect(app.timelineFor(1).map((e) => e.id)).toEqual([b, a])
    app.linkTimelineTask(b, 1, false)
    expect(app.timelineFor(1).map((e) => e.id)).toEqual([a])
    expect(app.timelineFor(2)).toEqual([])
  })
})

describe('deleting', () => {
  it('removes the entry and Undo puts it back where it was', () => {
    const app = useAppStore()
    const a = app.addTimelineEntry({ title: 'a' })!
    const b = app.addTimelineEntry({ title: 'b' })!
    const before = app.timeline.map((e) => e.id)
    app.removeTimelineEntry(a)
    expect(app.timeline.map((e) => e.id)).toEqual([b])
    expect(app.toast?.undo).toBe(true)
    app.performUndo()
    expect(app.timeline.map((e) => e.id)).toEqual(before)
  })

  it('closes the editor when the entry it holds is deleted', () => {
    const app = useAppStore()
    const a = app.addTimelineEntry({ title: 'a' })!
    app.openTimelineEntry(a)
    app.removeTimelineEntry(a)
    expect(app.timelineEditor).toBeNull()
  })
})

describe('the editor slot', () => {
  it('opens new with what it should start linked to, or an entry with its own links', () => {
    const app = useAppStore()
    app.tasks = [task(1)]
    app.newTimelineEntry({ taskIds: [1] })
    expect(app.timelineEditor).toEqual({ id: null, taskIds: [1], todoIds: [], noteIds: [] })
    const id = app.addTimelineEntry({ title: 'x', taskIds: [1] })!
    app.openTimelineEntry(id)
    expect(app.timelineEditor?.id).toBe(id)
    app.closeTimelineEditor()
    expect(app.timelineEditor).toBeNull()
  })
})

describe('the sidebar', () => {
  it('is one panel at a time with the notes drawer', () => {
    const ui = useUiStore()
    const account = { value: false }
    ui.openShellPanel('notes', account)
    ui.openShellPanel('timeline', account)
    expect(ui.timelineOpen).toBe(true)
    expect(ui.drawerOpen).toBe(false)
    ui.toggleDrawer()
    expect(ui.timelineOpen).toBe(false)
  })
})

describe('saving', () => {
  // Nothing at runtime checks these against each other, and a list missing
  // from the save watch is edited, shown, and silently never written.
  const src = readFileSync(resolve(__dirname, 'app.ts'), 'utf8')
  it('is in the saved document, the reset, the load, and the save watch', () => {
    expect(src).toContain('timeline: timeline.value,')
    expect(src).toMatch(/timeline\.value = \[\]/)
    expect(src).toContain('timeline.value = sanitizeTimeline(data.timeline)')
    // Once in the save watch (deep, eight spaces in) and once in the store's
    // returned API — the watch is the one that matters.
    expect(src).toMatch(/\n {8}prompts,\r?\n {8}timeline,\r?\n {8}security,/)
    expect(src).toMatch(/\n {4}removePrompt,\r?\n {4}timeline,/)
    expect(src).toContain('...timeline.value.map((e) => e.id)')
  })
})

describe('todo links and generated write-ups', () => {
  it('filters stale links, writes parent paths, and removes unlinked checklists', () => {
    const app = useAppStore()
    app.todos = [
      { id: 1, text: 'Launch', parentId: null, status: 'pending' } as Todo,
      { id: 2, text: 'Review', parentId: 1, status: 'done' } as Todo,
    ]
    const id = app.addTimelineEntry({ title: 'Release', body: 'My overview', todoIds: [2, 2, 99] })!
    expect(app.timeline[0].todoIds).toEqual([2])
    expect(app.timeline[0].body).toContain('### Launch\n\n- [x] Review')
    expect(app.timelineForTodoId(2).map((e) => e.id)).toEqual([id])
    app.openTimelineEntry(id)
    expect(app.timelineEditor?.todoIds).toEqual([2])
    app.linkTimelineTodo(id, 2, false)
    expect(app.timeline[0].body).toBe('My overview')
    expect(app.timelineForTodoId(2)).toEqual([])
  })
})
