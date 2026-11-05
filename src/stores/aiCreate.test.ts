import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { focusInfo, useAiChat } from '@/composables/useAiChat'

function chat() {
  const app = useAppStore()
  const chatId = app.newAiChat()
  app.addAiMessage(chatId, { role: 'user', content: 'Plan my trip to Goa' })
  const msgId = app.addAiMessage(chatId, { role: 'assistant', content: '' })
  return { app, chatId, msgId }
}

describe('a reply remembers what it made, for the quick look', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAiChat().setFocus(null)
  })
  const madeOn = (chatId: number, msgId: number) =>
    useAppStore()
      .aiChatById(chatId)!
      .messages.find((m) => m.id === msgId)!.made ?? []

  it('records card items, and forgets them on Undo', () => {
    const { chatId, msgId } = chat()
    const ai = useAiChat()
    const made = ai.createItems(chatId, msgId, 0, [
      { kind: 'todo', title: 'Call bank' },
      { kind: 'goal', title: 'Save ₹50k' },
    ])
    expect(madeOn(chatId, msgId).map((r) => r.kind)).toEqual(['todo', 'goal'])
    ai.undoCreated(chatId, msgId, 0, made)
    expect(madeOn(chatId, msgId)).toEqual([])
  })

  it('records the todo a plan made, and what "Add to" made', () => {
    const { app, chatId, msgId } = chat()
    const ai = useAiChat()
    ai.applyPlan(chatId, msgId, 0, { title: 'Trip', steps: [{ text: 'Pack' }] })
    const trip = app.todos.find((t) => t.text === 'Trip')!
    expect(madeOn(chatId, msgId)).toEqual([{ kind: 'todo', id: trip.id }])

    const ref = ai.createFromDraft(
      { kind: 'note', title: 'Packing list', when: '', mins: null, notes: 'Sunscreen' },
      { chatId, msgId },
    )
    expect(ref?.kind).toBe('note')
    expect(madeOn(chatId, msgId)).toHaveLength(2)
  })
})

describe('working on a picked todo', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAiChat().setFocus(null)
  })

  /** A reply asked while `parent` was the picked item. */
  function replyAbout(parent: number) {
    const app = useAppStore()
    const chatId = app.newAiChat()
    app.addAiMessage(chatId, { role: 'user', content: 'Add packing' })
    const msgId = app.addAiMessage(chatId, {
      role: 'assistant',
      content: '',
      focus: { collection: 'todos', id: parent },
    })
    return { app, chatId, msgId }
  }

  it('shows the picked todo with the sub-todos it already has', () => {
    const app = useAppStore()
    const parent = app.addTodo('Goa trip')!
    const kid = app.addTodo('Book flights')!
    app.moveTodo(kid, parent, 0)
    app.toggleTodo(kid)
    const info = focusInfo(app, { collection: 'todos', id: parent })!
    expect(info.title).toBe('Goa trip')
    expect(info.children).toEqual([{ id: kid, title: 'Book flights', done: true, fresh: false }])
  })

  it('adds a plan’s steps under the picked todo, whatever the model named', () => {
    const app = useAppStore()
    const parent = app.addTodo('Goa trip')!
    app.addTodo('Something else')
    const { chatId, msgId } = replyAbout(parent)
    const ai = useAiChat()
    ai.applyPlan(chatId, msgId, 0, {
      target: 'Something else',
      steps: [{ text: 'Pack sunscreen' }, { text: 'Pack charger' }],
    })
    const info = focusInfo(app, { collection: 'todos', id: parent })!
    expect(info.children.map((c) => [c.title, c.fresh])).toEqual([
      ['Pack sunscreen', true],
      ['Pack charger', true],
    ])
    // The panel now shows that todo.
    expect(ai.focus.value).toEqual({ collection: 'todos', id: parent })
  })

  it('creates a card’s todos under the picked todo, with their own sub-todos', () => {
    const app = useAppStore()
    const parent = app.addTodo('Goa trip')!
    const { chatId, msgId } = replyAbout(parent)
    useAiChat().createItems(chatId, msgId, 0, [
      {
        kind: 'todo',
        title: 'Book hotel',
        items: [{ title: 'Compare prices' }, { title: 'Pay deposit' }],
      },
    ])
    const hotel = app.todos.find((t) => t.text === 'Book hotel')!
    expect(hotel.parentId).toBe(parent)
    expect(app.todos.filter((t) => t.parentId === hotel.id).map((t) => t.text)).toEqual([
      'Compare prices',
      'Pay deposit',
    ])
  })
})

describe('items made from an AI reply are divided into sub-items', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAiChat().setFocus(null)
  })

  it('puts plan steps with no target under one new todo, as its sub-todos', () => {
    const { app, chatId, msgId } = chat()
    const n = useAiChat().applyPlan(chatId, msgId, 0, {
      title: 'Goa trip',
      steps: [{ text: 'Book flights', notes: 'Under ₹9,000' }, { text: 'Pack' }],
    })
    expect(n).toBe(2)
    const parent = app.todos.find((t) => t.text === 'Goa trip')!
    const kids = app.todos.filter((t) => t.parentId === parent.id)
    expect(kids.map((k) => k.text)).toEqual(['Book flights', 'Pack'])
    expect(kids[0].description).toContain('Under ₹9,000')
    // Nothing else landed at the top level.
    expect(app.todos.filter((t) => t.parentId == null)).toHaveLength(1)
  })

  it('names the parent after the chat when the plan gives no title', () => {
    const { app, chatId, msgId } = chat()
    useAiChat().applyPlan(chatId, msgId, 0, { steps: [{ text: 'Step one' }] })
    expect(app.todos.find((t) => t.parentId == null)?.text).toBe('Plan my trip to Goa')
  })

  it('creates a todo’s items as its sub-todos, and Undo takes them all back', () => {
    const { app, chatId, msgId } = chat()
    const ai = useAiChat()
    const made = ai.createItems(chatId, msgId, 0, [
      {
        kind: 'todo',
        title: 'Renew passport',
        items: [{ title: 'Fill the form' }, { title: 'Book appointment' }],
      },
    ])
    const parent = app.todos.find((t) => t.text === 'Renew passport')!
    expect(app.todos.filter((t) => t.parentId === parent.id).map((t) => t.text)).toEqual([
      'Fill the form',
      'Book appointment',
    ])
    ai.undoCreated(chatId, msgId, 0, made)
    expect(app.todos).toHaveLength(0)
  })
})

describe('the AI can create in every scope, and under existing items', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAiChat().setFocus(null)
  })

  it('adds sub-todos under an existing todo named by its ref, nested deeply', () => {
    const { app, chatId, msgId } = chat()
    const parent = app.addTodo('Renew car insurance')!
    useAiChat().createItems(chatId, msgId, 0, [
      {
        kind: 'todo',
        title: 'Compare quotes',
        parent: { kind: 'todo', id: parent },
        items: [{ title: 'Current insurer', items: [{ title: 'Ask for the no-claim bonus' }] }],
      },
    ])
    const cmp = app.todos.find((t) => t.text === 'Compare quotes')!
    expect(cmp.parentId).toBe(parent)
    const cur = app.todos.find((t) => t.text === 'Current insurer')!
    expect(cur.parentId).toBe(cmp.id)
    expect(app.todos.find((t) => t.text === 'Ask for the no-claim bonus')!.parentId).toBe(cur.id)
  })

  it('adds subtasks under an existing task and sub-ideas under an existing idea', () => {
    const { app, chatId, msgId } = chat()
    const task = app.addTask('Launch CRM', '')!
    const idea = app.addIdea('Podcast', '')!
    useAiChat().createItems(chatId, msgId, 0, [
      { kind: 'task', title: 'Fix filters', parent: { kind: 'task', id: task } },
      { kind: 'idea', title: 'Guest list', parent: { kind: 'idea', id: idea } },
    ])
    expect(app.tasks.find((t) => t.title === 'Fix filters')!.parentId).toBe(task)
    expect(app.ideas.find((i) => i.title === 'Guest list')!.parentId).toBe(idea)
  })

  it('turns a todo under a goal into a checklist step of that goal', () => {
    const { app, chatId, msgId } = chat()
    const goal = app.addGoal({ title: 'Half marathon' })
    const ai = useAiChat()
    const made = ai.createItems(chatId, msgId, 0, [
      { kind: 'todo', title: 'Buy shoes', parent: { kind: 'goal', id: goal } },
    ])
    expect(app.goalChecklist.filter((c) => c.goalId === goal).map((c) => c.text)).toEqual([
      'Buy shoes',
    ])
    expect(app.todos).toHaveLength(0)
    expect(made[0].ref).toEqual({ kind: 'goal', id: goal })
    ai.undoCreated(chatId, msgId, 0, made)
    expect(app.goalChecklist.filter((c) => c.goalId === goal)).toHaveLength(0)
    // The goal was there before; Undo leaves it.
    expect(app.goals.some((g) => g.id === goal)).toBe(true)
  })

  it('falls back to the top level when the named parent no longer exists', () => {
    const { app, chatId, msgId } = chat()
    useAiChat().createItems(chatId, msgId, 0, [
      { kind: 'todo', title: 'Orphan', parent: { kind: 'todo', id: 999_999 } },
    ])
    expect(app.todos.find((t) => t.text === 'Orphan')!.parentId).toBeNull()
  })

  it('creates every other scope, and Undo takes all of it back', () => {
    const { app, chatId, msgId } = chat()
    const ai = useAiChat()
    const made = ai.createItems(chatId, msgId, 0, [
      { kind: 'idea', title: 'Newsletter', notes: 'Monthly', items: [{ title: 'Pick a name' }] },
      { kind: 'deadline', title: 'GST filing', due: '2026-11-20' },
      { kind: 'reminder', title: 'Call the bank', when: '2026-11-06T10:00', notes: 'Loan' },
      { kind: 'note', title: 'Hotel wifi', notes: 'Password on the card' },
      { kind: 'trip', title: 'Goa', due: '2026-12-20', notes: 'With family' },
      { kind: 'stock', title: 'RELIANCE', notes: 'Watch for 2,400' },
      { kind: 'expense', title: 'Groceries', amount: 1240.5, category: 'Food', due: '2026-11-05' },
      { kind: 'income', title: 'Salary', amount: 90000 },
    ])
    expect(made.map((m) => m.ref.kind)).toEqual([
      'idea',
      'deadline',
      'reminder',
      'note',
      'trip',
      'stock',
      'txn',
      'txn',
    ])
    expect(app.ideas.find((i) => i.title === 'Pick a name')!.parentId).toBe(made[0].id)
    expect(app.deadlines.find((d) => d.title === 'GST filing')!.due).toBe('2026-11-20')
    expect(app.reminders.find((r) => r.title === 'Call the bank')!.start).toBe('2026-11-06T10:00')
    expect(app.notes.find((n) => n.title === 'Hotel wifi')!.text).toBe('Password on the card')
    expect(app.trips.find((t) => t.title === 'Goa')!.date).toBe('2026-12-20')
    expect(app.stocks.find((s) => s.symbol === 'RELIANCE')!.why).toBe('Watch for 2,400')
    expect(app.transactions.find((t) => t.kind === 'expense')).toMatchObject({
      amountMinor: 124050,
      category: 'Food',
      date: '2026-11-05',
    })
    expect(app.transactions.find((t) => t.kind === 'income')!.amountMinor).toBe(9_000_000)

    ai.undoCreated(chatId, msgId, 0, made)
    expect(app.ideas).toHaveLength(0)
    expect(app.deadlines).toHaveLength(0)
    expect(app.reminders).toHaveLength(0)
    expect(app.notes).toHaveLength(0)
    expect(app.trips).toHaveLength(0)
    expect(app.stocks).toHaveLength(0)
    expect(app.transactions).toHaveLength(0)
  })

  it('gives each milestone point its notes as the description it opens with', () => {
    const { app, chatId, msgId } = chat()
    useAiChat().createItems(chatId, msgId, 0, [
      {
        kind: 'goal',
        title: 'Learn Rust',
        items: [{ title: 'Ownership', notes: 'Read chapter 4, then do the exercises.' }],
      },
    ])
    expect(app.goalChecklist[0]).toMatchObject({
      text: 'Ownership',
      description: 'Read chapter 4, then do the exercises.',
    })
  })
})
