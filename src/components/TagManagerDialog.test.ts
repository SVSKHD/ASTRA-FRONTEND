// Manage tags: pick several, confirm once, and they are all gone.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import TagManagerDialog from '@/components/TagManagerDialog.vue'

function mountDialog() {
  return mount(TagManagerDialog, {
    props: { open: true },
    attachTo: document.body,
    global: { stubs: { teleport: true }, directives: { 'hover-style': {} } },
  })
}

describe('Manage tags', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('deletes every picked tag at once, after one confirmation', async () => {
    const app = useAppStore()
    app.tags = ['Office', 'Home', 'Errands']
    const w = mountDialog()
    await w.find('input[aria-label="Select Office"]').setValue(true)
    await w.find('input[aria-label="Select Home"]').setValue(true)

    const del = () => w.findAll('button').find((b) => /Delete|Yes, delete/.test(b.text()))!
    expect(del().text()).toBe('Delete 2 tags')
    await del().trigger('click')
    // The first press only asks.
    expect(app.tags).toEqual(['Office', 'Home', 'Errands'])
    expect(w.text()).toContain('Delete 2 unused tags?')
    await del().trigger('click')
    expect(app.tags).toEqual(['Errands'])
    w.unmount()
  })

  it('keeps a tag in use: says so, and can unselect it', async () => {
    const app = useAppStore()
    app.tags = ['Office', 'Home']
    app.addTodo('Call vendor', 'Office')
    const w = mountDialog()
    await w.find('input[aria-label="Select Office"]').setValue(true)
    await w.find('input[aria-label="Select Home"]').setValue(true)
    expect(w.text()).toContain("can't delete")
    expect(w.text()).toContain("1 in use, can't be deleted")

    // Delete counts only what can go.
    const del = () => w.findAll('button').find((b) => /Delete|Yes, delete/.test(b.text()))!
    expect(del().text()).toBe('Delete')
    await del().trigger('click')
    await del().trigger('click')
    expect(app.tags).toEqual(['Office'])

    // Office is still ticked, and one press takes it out of the selection.
    const unpick = w.findAll('button').find((b) => b.text().startsWith('Unselect in use'))!
    await unpick.trigger('click')
    expect(w.text()).not.toContain("can't be deleted")
    w.unmount()
  })

  it('adds a new tag', async () => {
    const app = useAppStore()
    app.tags = ['Office']
    const w = mountDialog()
    await w.find('input[aria-label="New tag"]').setValue('Travel')
    await w.find('form').trigger('submit')
    expect(app.tags).toContain('Travel')
    w.unmount()
  })
})
