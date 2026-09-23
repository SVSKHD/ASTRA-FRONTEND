// The Code tab's browse list: what the token can see, as opposed to the mirror
// below it, which only holds what a webhook delivered.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const ghCall = vi.fn()
vi.mock('@/utils/ghProxy', () => ({
  ghCall: (...args: unknown[]) => ghCall(...args),
  isGhConfigured: () => true,
  GhNotConfiguredError: class extends Error {},
}))

const save = vi.fn().mockResolvedValue(true)
const settings = { value: { trackedRepos: [] as string[] } }
vi.mock('@/composables/useSettings', () => ({
  useSettings: () => ({ settings, save }),
}))

import RepoBrowser from '@/components/github/RepoBrowser.vue'
import { warningEntries } from '@/services/warnings'

const REPOS = [
  { id: 1, full_name: 'SVSKHD/AO8', private: true, pushed_at: '2026-09-20T16:28:24Z' },
  {
    id: 2,
    full_name: 'SVSKHD/ASTRA-FRONTEND',
    language: 'TypeScript',
    pushed_at: '2026-09-18T02:01:27Z',
  },
]

beforeEach(() => {
  setActivePinia(createPinia())
  settings.value.trackedRepos = []
  save.mockClear()
  ghCall.mockReset().mockImplementation((op: string) => {
    if (op === 'languages') return Promise.resolve({ data: { TypeScript: 900, CSS: 100 } })
    return Promise.resolve({ data: REPOS })
  })
  warningEntries.splice(0)
})

describe('<RepoBrowser />', () => {
  it('lists the repositories as soon as the tab opens', async () => {
    const w = mount(RepoBrowser)
    await flushPromises()
    expect(ghCall).toHaveBeenCalledWith('installations')
    expect(w.findAll('.rb__item')).toHaveLength(2)
    // Newest push first, and the private one is badged.
    expect(w.findAll('.rb__name')[0].text()).toContain('SVSKHD/AO8')
    expect(w.get('.rb__badge').text()).toBe('private')
    // The count goes up so the Code tab can fold the setup panel away.
    expect(w.emitted('loaded')?.at(-1)).toEqual([2])
  })

  it('shows what each repository is built with, biggest language first', async () => {
    const w = mount(RepoBrowser)
    await flushPromises()
    expect(ghCall).toHaveBeenCalledWith('languages', { owner: 'SVSKHD', repo: 'AO8' })
    const chips = w.findAll('.rb__item')[0].findAll('.tc__chip')
    expect(chips.map((c) => c.get('.tc__sym').text())).toEqual(['TS', '{}'])
    expect(chips[0].attributes('title')).toBe('TypeScript')
  })

  it('keeps the row when the languages call fails', async () => {
    ghCall.mockReset().mockImplementation((op: string) => {
      if (op === 'languages') return Promise.reject(new Error('rate limited'))
      return Promise.resolve({ data: REPOS })
    })
    const w = mount(RepoBrowser)
    await flushPromises()
    expect(w.findAll('.rb__item')).toHaveLength(2)
    // The list's own single language is the fallback; AO8 reports none.
    const astra = w.findAll('.rb__item')[1]
    expect(astra.get('.tc__sym').text()).toBe('TS')
    expect(warningEntries).toHaveLength(0)
  })

  it('tracks a repository by its lower-cased name', async () => {
    const w = mount(RepoBrowser)
    await flushPromises()
    await w.get('.rb__item input[type="checkbox"]').setValue(true)
    expect(save).toHaveBeenCalledWith({ trackedRepos: ['svskhd/ao8'] })
  })

  it('says why the list is empty rather than showing an empty box', async () => {
    ghCall.mockReset().mockRejectedValue(new Error('Bad credentials'))
    const w = mount(RepoBrowser)
    await flushPromises()
    expect(w.findAll('.rb__item')).toHaveLength(0)
    // `Alert` renders into the warning tray rather than inline, so that is
    // where GitHub's own words end up.
    expect(warningEntries.map((e) => e.message)).toContain('Bad credentials')
  })
})
