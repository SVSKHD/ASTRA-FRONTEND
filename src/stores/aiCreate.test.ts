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
      { kind: 'todo', title: 'Book hotel', items: ['Compare prices', 'Pay deposit'] },
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
      { kind: 'todo', title: 'Renew passport', items: ['Fill the form', 'Book appointment'] },
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
