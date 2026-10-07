import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { exportTaskTransferJson, parseTaskTransferJson } from '@/utils/taskTransfer'

const SOON = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 16)

describe('ideas with the todo lifecycle', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('a new idea is open, top-level and last in order', () => {
    const app = useAppStore()
    const a = app.addIdea('First', '')!
    const b = app.addIdea('Second', '')!
    const [ia, ib] = [a, b].map((id) => app.ideas.find((i) => i.id === id)!)
    expect(ia).toMatchObject({ status: 'pending', done: false, parentId: null, reminderIds: [] })
    expect(ib.order).toBeGreaterThan(ia.order)
  })

  it('completing stamps completedAt; reopening clears it', () => {
    const app = useAppStore()
    const id = app.addIdea('Ship it', '')!
    app.toggleIdea(id)
    const done = app.ideas.find((i) => i.id === id)!
    expect(done.status).toBe('done')
    expect(done.completedAt).not.toBeNull()
    app.toggleIdea(id)
    expect(app.ideas.find((i) => i.id === id)!.completedAt).toBeNull()
  })

  it('nests a sub-idea under a parent and refuses a cycle', () => {
    const app = useAppStore()
    const parent = app.addIdea('Parent', 'Growth')!
    const child = app.addIdea('Child', '')!
    expect(app.moveIdea(child, parent, 0)).toBe(true)
    const moved = app.ideas.find((i) => i.id === child)!
    expect(moved.parentId).toBe(parent)
    expect(moved.depth).toBe(1)
    // Landing under a tagged parent hands its tag down, as for todos.
    expect(moved.tag).toBe('Growth')
    expect(app.moveIdea(parent, child, 0)).toBe(false)
  })

  it('archives only completed ideas on "Clear completed"', () => {
    const app = useAppStore()
    const open = app.addIdea('Open', '')!
    const done = app.addIdea('Done', '')!
    app.setIdeaStatus(done, 'done')
    app.archiveCompleted('ideas')
    expect(app.ideas.find((i) => i.id === open)!.archivedAt ?? null).toBeNull()
    expect(app.ideas.find((i) => i.id === done)!.archivedAt).toEqual(expect.any(Number))
  })

  it('a reminder from an idea is indexed on it and cancelled when it is done', () => {
    const app = useAppStore()
    const id = app.addIdea('Pitch the board', '')!
    const rid = app.createReminderFromItem('ideas', id, { start: SOON })!
    expect(app.ideas.find((i) => i.id === id)!.reminderIds).toEqual([rid])
    expect(app.reminders.find((r) => r.id === rid)!.sourceRef).toEqual({
      collection: 'ideas',
      id,
    })
    app.setIdeaStatus(id, 'done')
    expect(app.reminders.find((r) => r.id === rid)!.cancelledAt).not.toBeNull()
  })

  it('moves an idea tree to Tasks, keeping the nesting', () => {
    const app = useAppStore()
    const parent = app.addIdea('Parent', '', { deadline: '2026-12-01' })!
    const child = app.addIdea('Child', '')!
    app.moveIdea(child, parent, 0)
    const [taskId] = app.convertIdeasToTasks([parent])
    expect(app.ideas).toHaveLength(0)
    const task = app.tasks.find((t) => t.id === taskId)!
    expect(task).toMatchObject({ title: 'Parent', deadline: '2026-12-01' })
    const sub = app.tasks.find((t) => t.title === 'Child')!
    expect(sub.parentId).toBe(taskId)
  })

  it('bulk delete takes the whole picked tree', async () => {
    const app = useAppStore()
    const parent = app.addIdea('Parent', '')!
    const child = app.addIdea('Child', '')!
    const keep = app.addIdea('Keep', '')!
    app.moveIdea(child, parent, 0)
    await app.deleteManyWithProgress('ideas', [parent])
    expect(app.ideas.map((i) => i.id)).toEqual([keep])
  })

  it('exports and re-imports ideas with type, deadline and nesting', () => {
    const app = useAppStore()
    const parent = app.addIdea('Referral rewards', 'Growth', {
      ideaType: 'business',
      deadline: '2026-11-01',
    })!
    const child = app.addIdea('Invite link', '')!
    app.moveIdea(child, parent, 0)
    const json = exportTaskTransferJson('ideas', app.ideas)
    expect(parseTaskTransferJson(json).collection).toBe('ideas')

    setActivePinia(createPinia())
    const fresh = useAppStore()
    const result = fresh.importTaskTransferJson(json)
    expect(result).toMatchObject({ collection: 'ideas', count: 2 })
    const root = fresh.ideas.find((i) => i.title === 'Referral rewards')!
    expect(root).toMatchObject({ ideaType: 'business', deadline: '2026-11-01', tag: 'Growth' })
    expect(fresh.ideas.find((i) => i.title === 'Invite link')!.parentId).toBe(root.id)
  })
})
