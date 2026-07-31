// Integration check for the create-dialog draft resume (section 8): a stored
// draft for a brand-new item is restored into the open create dialog and the
// resume bar is shown, and Discard clears both. This is the mounted stand-in for
// "type into a new-item form, lose it, reopen — your work is offered back".
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ItemDialog from '@/components/ItemDialog.vue'
import { useAppStore } from '@/stores/app'

async function settle() {
  // Two ticks: one for the target-key watch to fire evaluate(), one for the
  // restore's reactive write to flush into the rendered form.
  await nextTick()
  await nextTick()
}

describe('<ItemDialog /> create draft resume', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('restores a stored new-todo draft into the open create dialog and shows the bar', async () => {
    const app = useAppStore()
    // A draft left behind by an earlier, abandoned "New todo".
    app.saveDraft('todo', null, { text: 'buy oat milk', description: '', tag: '' })

    const wrapper = mount(ItemDialog)
    app.openCreate('todo')
    await settle()

    expect(app.dialogDraft.text).toBe('buy oat milk')
    expect(wrapper.text()).toContain('Restored unsaved changes')
  })

  it('Discard removes the draft and reverts the form to a blank todo', async () => {
    const app = useAppStore()
    app.saveDraft('todo', null, { text: 'scrap this', description: '', tag: '' })

    const wrapper = mount(ItemDialog)
    app.openCreate('todo')
    await settle()
    expect(app.dialogDraft.text).toBe('scrap this')

    // Click the Discard button in the resume bar.
    const discard = wrapper.findAll('button').find((b) => b.text() === 'Discard')
    expect(discard).toBeTruthy()
    await discard!.trigger('click')
    await settle()

    expect(app.draftFor('todo', null)).toBeNull()
    expect(app.dialogDraft.text).toBe('')
    expect(wrapper.text()).not.toContain('Restored unsaved changes')
  })

  it('does not offer a draft for a type that has none', async () => {
    const app = useAppStore()
    app.saveDraft('todo', null, { text: 'only a todo draft', description: '', tag: '' })

    const wrapper = mount(ItemDialog)
    app.openCreate('task') // different type → different slot
    await settle()

    expect(wrapper.text()).not.toContain('Restored unsaved changes')
  })
})
