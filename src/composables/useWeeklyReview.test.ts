import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useWeeklyReview } from '@/composables/useWeeklyReview'

// Three todos that have rolled over more than twice, so all three are up for
// review.
function seed() {
  const app = useAppStore()
  const ids = ['One', 'Two', 'Three'].map((t) => app.addTodo(t, '', '', { rolloverCount: 3 })!)
  return { app, ids }
}

describe('weekly review — deciding many at once', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('drops every picked todo, including one already moved to today', () => {
    const { app, ids } = seed()
    const review = useWeeklyReview()
    const [a, b] = review.items.value
    review.decide(a, 'keep')
    review.decideMany([a, b], 'drop')
    expect(review.decisions.value[ids[0]]?.kind).toBe('drop')
    expect(review.decisions.value[ids[1]]?.kind).toBe('drop')
    expect(review.decisions.value[ids[2]]).toBeUndefined()
    // The switch from keep to drop restored the original day before archiving.
    expect(app.todos.find((t) => t.id === ids[0])!.archivedAt).toEqual(expect.any(Number))
  })

  it('never toggles a todo that is already decided the same way', () => {
    const { ids } = seed()
    const review = useWeeklyReview()
    const [a, b] = review.items.value
    review.decide(a, 'drop')
    review.decideMany([a, b], 'drop')
    expect(review.decisions.value[ids[0]]?.kind).toBe('drop')
    expect(review.decisions.value[ids[1]]?.kind).toBe('drop')
  })

  it('undo takes back each decision and restores the todo', () => {
    const { app, ids } = seed()
    const review = useWeeklyReview()
    const all = review.items.value
    review.decideMany(all, 'drop')
    review.undoMany(review.items.value)
    for (const id of ids) {
      expect(review.decisions.value[id]).toBeUndefined()
      expect(app.todos.find((t) => t.id === id)!.archivedAt ?? null).toBeNull()
    }
    expect(review.undecided.value).toBe(3)
  })
})
