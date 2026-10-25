import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CompletedHistory from './CompletedHistory.vue'
import { useAppStore } from '@/stores/app'

const mountHistory = (collection: 'tasks' | 'todos' = 'tasks') =>
  mount(CompletedHistory, { props: { collection }, global: { stubs: { teleport: true } } })

async function openPanel(wrapper: ReturnType<typeof mountHistory>) {
  await wrapper.find('button.panel-action').trigger('click')
  await flushPromises()
}

describe('History', () => {
  let app: ReturnType<typeof useAppStore>
  beforeEach(() => {
    setActivePinia(createPinia())
    app = useAppStore()
    const done = app.addTask('Backtest EMA', '')!
    app.setTaskStatus(done, 'done')
    const cleared = app.addTask('Write journal', '')!
    app.setTaskStatus(cleared, 'done')
    app.archiveCompleted('tasks')
    app.addTask('Still open', '')
    // One done again after the clear, so it is "in list" rather than cleared.
    const fresh = app.addTask('Fresh finish', '')!
    app.setTaskStatus(fresh, 'done')
  })

  it('shows completed and cleared tasks, not open ones', async () => {
    const wrapper = mountHistory()
    await openPanel(wrapper)
    const text = wrapper.text()
    expect(text).toContain('Backtest EMA')
    expect(text).toContain('Write journal')
    expect(text).toContain('Fresh finish')
    expect(text).not.toContain('Still open')
    expect(text).toContain('Cleared')
    wrapper.unmount()
  })

  it('logs a finished task (create)', async () => {
    const wrapper = mountHistory()
    await openPanel(wrapper)
    await wrapper.find('form.hist__log input').setValue('Reviewed gold setup')
    await wrapper.find('form.hist__log').trigger('submit')
    const made = app.tasks.find((t) => t.title === 'Reviewed gold setup')
    expect(made?.status).toBe('done')
    expect(made?.completedAt).toBeTypeOf('number')
    wrapper.unmount()
  })

  it('puts a cleared task back, reopens and deletes (update + delete)', async () => {
    const wrapper = mountHistory()
    await openPanel(wrapper)
    const row = (title: string) =>
      wrapper.findAll('.hist__row').find((r) => r.text().includes(title))!

    await row('Write journal').find('[aria-label="Put back in the list"]').trigger('click')
    expect(app.tasks.find((t) => t.title === 'Write journal')?.archivedAt).toBeNull()

    await row('Fresh finish').find('[aria-label="Reopen as not done"]').trigger('click')
    expect(app.tasks.find((t) => t.title === 'Fresh finish')?.status).toBe('pending')

    await row('Backtest EMA').find('[aria-label="Delete"]').trigger('click')
    expect(app.tasks.some((t) => t.title === 'Backtest EMA')).toBe(false)
    wrapper.unmount()
  })

  it('renames inline', async () => {
    const wrapper = mountHistory()
    await openPanel(wrapper)
    const row = wrapper.findAll('.hist__row').find((r) => r.text().includes('Backtest EMA'))!
    await row.find('[aria-label="Rename"]').trigger('click')
    const input = wrapper.find('.hist__edit input')
    await input.setValue('Backtest EMA 9/200')
    await input.trigger('keydown', { key: 'Enter' })
    expect(app.tasks.some((t) => t.title === 'Backtest EMA 9/200')).toBe(true)
    wrapper.unmount()
  })
})
