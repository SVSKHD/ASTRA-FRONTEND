import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import DeleteUnpinned from './DeleteUnpinned.vue'
import ItemPinButton from './ItemPinButton.vue'
import { pinnedTreeIds } from '@/utils/pinnedItems'

for (const collection of ['tasks', 'todos'] as const) {
  describe(collection + ' pin protection', () => {
    it('protects a whole tree when its child is pinned, and deletes only unprotected work', async () => {
      localStorage.clear()
      setActivePinia(createPinia())
      const app = useAppStore()
      for (const title of ['Parent', 'Child', 'Unpinned', 'Linked']) {
        if (collection === 'tasks') app.addTask(title, '')
        else app.addTodo(title)
      }
      const list = collection === 'tasks' ? app.tasks : app.todos
      const [parent, child, unpinned, linked] = list
      child.parentId = parent.id
      parent.linked = [{ collection, id: linked.id }]
      const pin = mount(ItemPinButton, { props: { collection, id: child.id } })
      await pin.find('button').trigger('click')
      const current = () => (collection === 'tasks' ? app.tasks : app.todos)
      expect(current().find((item) => item.id === child.id)?.pinned).toBe(true)
      expect(pinnedTreeIds(current(), collection)).toEqual(
        new Set([child.id, parent.id, linked.id]),
      )
      const remove = vi.spyOn(app, 'deleteManyWithProgress').mockResolvedValue(1)
      const action = mount(DeleteUnpinned, {
        props: { collection },
        global: { stubs: { teleport: true } },
      })
      await action.find('[aria-label="Delete unpinned"]').trigger('click')
      expect(remove).not.toHaveBeenCalled()
      const confirm = action
        .findAll('button')
        .find(
          (button) => button.text() === 'Delete unpinned' && button.classes().includes('ui-btn'),
        )!
      await confirm.trigger('click')
      expect(remove).toHaveBeenCalledWith(collection, [unpinned.id])
      await pin.find('button').trigger('click')
      expect(pinnedTreeIds(current(), collection).size).toBe(0)
      action.unmount()
      pin.unmount()
      remove.mockRestore()
    })
  })
}
