// The tip that teaches "/n" — and, more to the point, the counter that makes it
// stop. A hint that never leaves is furniture, not a hint.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { NEW_ITEM_HINT_USES } from '@/views/globalKeys'
import { tabNewItem } from '@/tabs.config'

describe('the /n hint', () => {
  let app: ReturnType<typeof useAppStore>
  beforeEach(() => {
    setActivePinia(createPinia())
    app = useAppStore()
  })

  it('starts unlearned', () => {
    expect(app.newItemUses).toBe(0)
  })

  it('counts each use and then stops counting for good', () => {
    for (let i = 0; i < NEW_ITEM_HINT_USES * 3; i++) app.countNewItemUse()
    // Clamped at the threshold rather than climbing forever: past the point the
    // hint is hidden the number means nothing, and every increment past it
    // would be another write to the user's document for no reason.
    expect(app.newItemUses).toBe(NEW_ITEM_HINT_USES)
  })

  it('names what each tab makes, and keeps quiet where nothing is made', () => {
    expect(tabNewItem('todo')).toBe('todo')
    expect(tabNewItem('tasks')).toBe('task')
    expect(tabNewItem('goals')).toBe('goal')
    // Reading surfaces. The hint must not promise a shortcut that does nothing.
    expect(tabNewItem('news')).toBeNull()
    expect(tabNewItem('code')).toBeNull()
    expect(tabNewItem('overview')).toBeNull()
  })
})
