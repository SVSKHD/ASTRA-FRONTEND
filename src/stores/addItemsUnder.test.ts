// "Add more": whatever is pasted lands as subtasks of one item.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { exportTaskTransferJson, parseItemsForParent } from '@/utils/taskTransfer'
import { buildIndex, descendantsOf } from '@/utils/taskTree'

describe('reading a messy paste', () => {
  it('tidies fences, smart quotes, trailing commas and whitespace before JSON', () => {
    const r = parseItemsForParent(
      '  ```json\n[ { “title”: “Guest checkout” },\n  { "title": "Quick COD checkout" }, ]\n```  ',
      'tasks',
    )
    expect(r.as).toBe('json')
    expect(r.items.map((i) => i.title)).toEqual(['Guest checkout', 'Quick COD checkout'])
  })

  it('flattens nested subtasks, keeping who sits under whom', () => {
    const r = parseItemsForParent(
      JSON.stringify([{ title: 'Checkout', subtasks: [{ title: 'Guest' }, 'COD'] }]),
      'tasks',
    )
    const byTitle = Object.fromEntries(r.items.map((i) => [i.title, i]))
    expect(Object.keys(byTitle)).toEqual(['Checkout', 'Guest', 'COD'])
    expect(byTitle.Guest.parentSourceId).toBe(byTitle.Checkout.sourceId)
    expect(byTitle.COD.parentSourceId).toBe(byTitle.Checkout.sourceId)
  })

  it('takes an export document as it is', () => {
    const doc = {
      version: 1,
      collection: 'tasks',
      items: [
        { sourceId: 'a', parentSourceId: null, title: 'Parent', status: 'pending' },
        { sourceId: 'b', parentSourceId: 'a', title: 'Child', status: 'done' },
      ],
    }
    const r = parseItemsForParent(JSON.stringify(doc), 'tasks')
    expect(r.items.map((i) => [i.title, i.parentSourceId, i.status])).toEqual([
      ['Parent', null, 'pending'],
      ['Child', 'a', 'done'],
    ])
  })

  it('reads anything else as one item per line, bullets and boxes off', () => {
    const r = parseItemsForParent('\n- Guest checkout\n\n  2. COD\n[x] Shipping rules\n', 'todos')
    expect(r.as).toBe('lines')
    expect(r.items.map((i) => [i.title, i.status])).toEqual([
      ['Guest checkout', 'pending'],
      ['COD', 'pending'],
      ['Shipping rules', 'done'],
    ])
  })

  it('says so when there is nothing to add', () => {
    expect(parseItemsForParent('   \n  ', 'tasks').error).toBeTruthy()
  })
})

describe('adding them under a parent', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('puts every top-level paste item after the existing subtasks, nesting kept', () => {
    const app = useAppStore()
    const parent = app.addTask('Aquakart Frontend', '') as number
    const first = app.addTask('Existing', '') as number
    app.moveTask(first, parent, 0)

    const res = app.addItemsUnder(
      'tasks',
      parent,
      JSON.stringify([{ title: 'Checkout', subtasks: ['Guest'] }, { title: 'SEO' }]),
    )
    expect(res.count).toBe(3)

    const kids = app.tasks.filter((t) => t.parentId === parent).sort((a, b) => a.order - b.order)
    expect(kids.map((k) => k.title)).toEqual(['Existing', 'Checkout', 'SEO'])
    const checkout = kids[1]
    expect(app.tasks.find((t) => t.title === 'Guest')!.parentId).toBe(checkout.id)
    // Nothing was left at the top level.
    expect(app.tasks.filter((t) => t.parentId == null).map((t) => t.title)).toEqual([
      'Aquakart Frontend',
    ])
  })

  it('round-trips: a task exported with its subtree pastes back whole', () => {
    const app = useAppStore()
    const src = app.addTask('Checkout', '') as number
    const guest = app.addTask('Guest', '') as number
    app.moveTask(guest, src, 0)
    const otp = app.addTask('OTP', '') as number
    app.moveTask(otp, guest, 0)

    // What the Export button writes: the task and every subtask under it.
    const ids = new Set([src, ...descendantsOf(buildIndex(app.tasks), src).map((d) => d.id)])
    const json = exportTaskTransferJson(
      'tasks',
      app.tasks.filter((t) => ids.has(t.id)),
    )

    const target = app.addTask('Release 2', '') as number
    expect(app.addItemsUnder('tasks', target, json).count).toBe(3)
    const copy = app.tasks.find((t) => t.title === 'Checkout' && t.parentId === target)!
    const copyGuest = app.tasks.find((t) => t.title === 'Guest' && t.parentId === copy.id)!
    expect(app.tasks.some((t) => t.title === 'OTP' && t.parentId === copyGuest.id)).toBe(true)
  })

  it('works for todos from plain lines', () => {
    const app = useAppStore()
    const parent = app.addTodo('Release') as number
    app.addItemsUnder('todos', parent, 'Write notes\nTag build')
    expect(app.todos.filter((t) => t.parentId === parent).map((t) => t.text)).toEqual([
      'Write notes',
      'Tag build',
    ])
  })
})
