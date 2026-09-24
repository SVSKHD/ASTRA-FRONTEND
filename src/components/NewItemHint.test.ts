// The hint renders, names the right thing, and — the part that matters — goes
// away for good once the shortcut has been used.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import NewItemHint from '@/components/NewItemHint.vue'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { NEW_ITEM_HINT_USES } from '@/views/globalKeys'

function mountHint(tab: 'todo' | 'tasks' | 'goals' | 'news', uses = 0, cloudReady = true) {
  setActivePinia(createPinia())
  const app = useAppStore()
  const ui = useUiStore()
  app.cloudReady = cloudReady
  app.newItemUses = uses
  ui.tab = tab
  return mount(NewItemHint)
}

describe('the /n hint', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('names what this tab makes', () => {
    expect(mountHint('todo').text()).toContain('makes a new todo')
    expect(mountHint('tasks').text()).toContain('makes a new task')
    expect(mountHint('goals').text()).toContain('makes a new goal')
  })

  it('shows the keystroke it is teaching', () => {
    expect(mountHint('todo').text()).toContain('/n')
  })

  it('stays quiet on a tab that makes nothing', () => {
    // News is a reading list. A tip promising a shortcut that would do nothing
    // there is worse than no tip.
    expect(mountHint('news').text()).toBe('')
  })

  it('stops once the shortcut has been used enough', () => {
    expect(mountHint('todo', NEW_ITEM_HINT_USES - 1).text()).toContain('makes a new todo')
    expect(mountHint('todo', NEW_ITEM_HINT_USES).text()).toBe('')
  })

  it('waits for the workspace before deciding anybody is new', () => {
    // The count lives on the user's document. Before it arrives it reads 0 for
    // everybody, so showing the tip on that would show it to exactly the people
    // who have already learned the shortcut.
    expect(mountHint('todo', 0, false).text()).toBe('')
  })
})
