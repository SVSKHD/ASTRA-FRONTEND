// The reminder dialog shows every field when creating AND when editing (they
// used to be two dialogs with different fields), Add makes the reminder from
// them, and the tab files reminders by when they ring and ticks them off.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ReminderDialog from '@/components/ReminderDialog.vue'
import RemindersView from '@/components/views/RemindersView.vue'
import { useAppStore } from '@/stores/app'
import { localStamp } from '@/utils/reminderView'
import type { Reminder } from '@/types'

const FIELDS = ['Reminder', 'When', 'Repeat', 'Priority', 'Note']

let w: ReturnType<typeof mount> | null = null
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  w?.unmount()
  w = null
  document.body.innerHTML = ''
})

function reminder(over: Partial<Reminder>): Reminder {
  return {
    id: 1,
    title: 'Pay rent',
    note: '',
    start: localStamp(Date.now() + 3 * 3_600_000),
    repeat: { type: 'none' },
    priority: 'normal',
    calSync: 'local',
    calEventId: null,
    lastFiredOcc: null,
    acknowledgedAt: null,
    sourceRef: null,
    cancelledAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...over,
  } as Reminder
}
const text = () => document.body.textContent ?? ''

describe('the reminder dialog', () => {
  it('creates with every field labelled, a default time, and Add makes it', async () => {
    const app = useAppStore()
    w = mount(ReminderDialog, { attachTo: document.body })
    app.openCreate('reminder')
    await flushPromises()
    for (const f of FIELDS) expect(text()).toContain(f)
    expect(text()).toContain('Add to Google Calendar')
    // A new reminder is never an empty time.
    expect(String(app.dialogDraft.start)).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/)

    await w.find('.rf__title input').setValue('Water the plants')
    const weekly = [...document.querySelectorAll('[role="radio"]')].find(
      (b) => b.textContent?.trim() === 'Weekly',
    ) as HTMLElement
    weekly.click()
    ;(document.querySelector('[data-testid="reminder-add"]') as HTMLElement).click()
    await flushPromises()
    expect(app.reminders).toHaveLength(1)
    expect(app.reminders[0]).toMatchObject({
      title: 'Water the plants',
      repeat: { type: 'weeks', n: 1 },
    })
  })

  it('edits with the same fields plus the calendar, writing through', async () => {
    const app = useAppStore()
    app.reminders = [reminder({ id: 7 })]
    w = mount(ReminderDialog, { attachTo: document.body })
    app.openReminderDialog(7)
    await flushPromises()
    for (const f of FIELDS) expect(text()).toContain(f)
    expect(text()).toContain('Google Calendar')
    const high = [...document.querySelectorAll('[role="radio"]')].find(
      (b) => b.textContent?.trim() === 'High',
    ) as HTMLElement
    high.click()
    await flushPromises()
    expect(app.reminders[0]!.priority).toBe('high')
  })
})

describe('the Reminders tab', () => {
  it('groups by when they ring and ticks one off with the ring', async () => {
    const app = useAppStore()
    app.reminders = [
      reminder({ id: 1, title: 'Missed one', start: localStamp(Date.now() - 3_600_000) }),
      reminder({ id: 2, title: 'Later one', start: localStamp(Date.now() + 40 * 86_400_000) }),
    ]
    w = mount(RemindersView, {
      attachTo: document.body,
      global: { stubs: { DetailPane: true, CompletedSection: true } },
    })
    await flushPromises()
    expect(text()).toContain('Missed · 1')
    expect(text()).toContain('Later · 1')
    const missedRow = w.find('[data-reminder-id="1"]')
    await missedRow.find('.ring-check, [role="checkbox"], button').trigger('click')
    await flushPromises()
    expect(app.reminders.find((r) => r.id === 1)!.acknowledgedAt).not.toBeNull()
  })
})
