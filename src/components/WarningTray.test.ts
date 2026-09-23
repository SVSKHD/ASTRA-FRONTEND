// The tray holds every standing Alert, not only the bad ones. It used to call
// all of them "N warnings" behind one red badge, so a finished import and a
// broken connection looked identical until you opened it.
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WarningTray from '@/components/WarningTray.vue'
import { warningEntries, upsertWarning } from '@/services/warnings'

function add(id: string, tone: 'danger' | 'warning' | 'success' | 'info', message = id) {
  upsertWarning({ id, tone, message, dismissible: true, dismiss: () => {} })
}

afterEach(() => warningEntries.splice(0))

describe('the tray summary', () => {
  it('names the tone it is actually holding', async () => {
    add('a', 'success', 'Import finished')
    const w = mount(WarningTray)
    expect(w.get('.warning-tray__label').text()).toBe('1 success')
    expect(w.get('.warning-tray__signal').classes()).toContain('is-success')
    w.unmount()
  })

  it('counts each tone by name when several are open', async () => {
    add('a', 'success')
    add('b', 'warning')
    add('c', 'danger')
    add('d', 'danger')
    const w = mount(WarningTray)
    expect(w.get('.warning-tray__label').text()).toBe('2 issues · 1 warning · 1 success')
    // The badge takes the most serious tone present.
    expect(w.get('.warning-tray__signal').classes()).toContain('is-danger')
    w.unmount()
  })

  it('marks every row with its own tone, in an icon as well as a colour', async () => {
    add('a', 'success')
    add('b', 'danger')
    const w = mount(WarningTray)
    await w.get('.warning-tray__summary').trigger('click')
    const rows = w.findAll('.warning-tray__item')
    expect(rows.map((r) => r.classes().find((c) => c.startsWith('is-')))).toEqual([
      'is-success',
      'is-danger',
    ])
    expect(rows[0].find('.warning-tray__mark').exists()).toBe(true)
  })
})
