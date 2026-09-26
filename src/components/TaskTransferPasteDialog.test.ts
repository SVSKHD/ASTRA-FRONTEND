import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TaskTransferPasteDialog from '@/components/TaskTransferPasteDialog.vue'
import { useAppStore } from '@/stores/app'

function mountDialog(collection: 'tasks' | 'todos' = 'tasks') {
  const wrapper = mount(TaskTransferPasteDialog, {
    props: { open: true, collection },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
  return { wrapper, app: useAppStore() }
}

function buttonNamed(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((button) => button.text().replace(/\s+/g, ' ') === text)
}

describe('TaskTransferPasteDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  it('imports pasted todo JSON without needing a file', async () => {
    const { wrapper, app } = mountDialog('todos')
    await wrapper.find('textarea').setValue(
      JSON.stringify({
        items: [{ title: 'Confirm launch owner', description: 'Pick the release owner.' }],
      }),
    )

    expect(wrapper.text()).toContain('1 todo ready to import')
    await buttonNamed(wrapper, 'Import 1 todo')!.trigger('click')

    expect(app.todos.map((todo) => todo.text)).toEqual(['Confirm launch owner'])
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('loads the task sample into the paste box', async () => {
    const { wrapper } = mountDialog('tasks')
    await buttonNamed(wrapper, 'Load sample')!.trigger('click')

    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toContain(
      'Aquakart Growth & Sales Conversion',
    )
    expect(wrapper.text()).toContain('3 tasks ready to import')
  })

  it('imports a pasted task link from the same dialog', async () => {
    const { wrapper, app } = mountDialog('tasks')
    await wrapper
      .find('textarea')
      .setValue('/?tab=tasks&title=Real%20Lead%20Backend&description=Create%20lead%20API')

    expect(wrapper.text()).toContain('1 task ready to import')
    await buttonNamed(wrapper, 'Import 1 task')!.trigger('click')

    expect(app.tasks[0]).toMatchObject({
      title: 'Real Lead Backend',
      notes: 'Create lead API',
    })
  })

  it('shows invalid JSON before import', async () => {
    const { wrapper, app } = mountDialog('tasks')
    const toast = vi.spyOn(app, 'showToastMsg')
    await wrapper.find('textarea').setValue('{')

    expect(wrapper.text()).toContain('Could not parse JSON')
    expect(buttonNamed(wrapper, 'Import')!.attributes('disabled')).toBeDefined()
    expect(app.tasks).toEqual([])
    expect(toast).not.toHaveBeenCalled()
  })
})
