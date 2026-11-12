// Alerts register themselves in the warnings list from their own reactive effect.
// Two at once used to re-run each other forever ("Maximum recursive updates
// exceeded in component <Alert>"): the lookup subscribed each effect to the list.
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Alert from '@/components/ui/Alert.vue'
import { upsertWarning, removeWarning, warningEntries } from './warnings'

afterEach(() => {
  warningEntries.splice(0, warningEntries.length)
})

describe('warnings', () => {
  it('keeps two Alerts on one page, each once, without looping', async () => {
    const errors: unknown[] = []
    const w = mount(
      {
        components: { Alert },
        template:
          '<div><Alert tone="warning" title="First">one</Alert><Alert tone="info" title="Second">two</Alert></div>',
      },
      { global: { config: { errorHandler: (e) => void errors.push(e) } } },
    )
    await nextTick()
    await nextTick()
    expect(errors).toEqual([])
    expect(warningEntries.map((e) => [e.title, e.message])).toEqual([
      ['First', 'one'],
      ['Second', 'two'],
    ])
    w.unmount()
    expect(warningEntries).toEqual([])
  })

  it('replaces an entry with the same id and removes it', () => {
    const base = { tone: 'info' as const, dismissible: false, dismiss: () => {} }
    upsertWarning({ ...base, id: 'a', message: 'x' })
    upsertWarning({ ...base, id: 'a', message: 'y' })
    expect(warningEntries.map((e) => e.message)).toEqual(['y'])
    removeWarning('a')
    expect(warningEntries).toEqual([])
  })
})
