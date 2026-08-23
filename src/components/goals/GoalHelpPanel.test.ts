// Section 23 as the reader meets it: a drawer with three tabs, a walkthrough
// that shows what each step produces, a schema table, the cheat sheet, and a
// sample that lands in the import box in one click.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h, nextTick } from 'vue'
import GoalHelpPanel from '@/components/goals/GoalHelpPanel.vue'
import { useAppStore } from '@/stores/app'
import { GOAL_HELP_STEPS, SAMPLE_GOAL_JSON } from '@/utils/goalHelp'

const Blank = defineComponent({ render: () => h('div') })

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Blank },
      { path: '/import/goals', name: 'import-goals', component: Blank },
    ],
  })
}

async function mountPanel() {
  setActivePinia(createPinia())
  const app = useAppStore()
  app.openGoalHelp()
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  const wrapper = mount(GoalHelpPanel, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await nextTick()
  return { app, wrapper, router }
}

const buttonNamed = (wrapper: Awaited<ReturnType<typeof mountPanel>>['wrapper'], text: string) =>
  wrapper.findAll('button').find((b) => b.text() === text)

describe('the panel', () => {
  it('is a drawer, not a modal over the tab it explains', async () => {
    const { wrapper } = await mountPanel()
    // The drawer leaves the goals tab visible beside it; that is the whole
    // reason it is not a Modal.
    expect(wrapper.find('.ui-drawer').exists()).toBe(true)
    expect(wrapper.find('.ui-drawer--lg').exists()).toBe(true)
  })

  it('opens on the three tabs section 23 names', async () => {
    const { wrapper } = await mountPanel()
    const tabs = wrapper.findAll('[role="tab"]').map((t) => t.text())
    expect(tabs).toEqual(['Create manually', 'Paste JSON', 'Import from link'])
  })

  it('shows a numbered walkthrough with a demo on every step', async () => {
    const { wrapper } = await mountPanel()
    const steps = wrapper.findAll('.ghelp__step')
    expect(steps).toHaveLength(GOAL_HELP_STEPS.manual.length)
    // The list is an <ol>, so the numbers are the document's rather than
    // decoration a screen reader cannot see.
    expect(wrapper.find('ol.ghelp__steps').exists()).toBe(true)
    expect(wrapper.findAll('.ghelp__demo')).toHaveLength(steps.length)
  })

  it('swaps the walkthrough when a tab is chosen, and remembers which', async () => {
    const { app, wrapper } = await mountPanel()
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    expect(app.goalHelpTab).toBe('json')
    expect(wrapper.text()).toContain('Open Import → Paste JSON')
    expect(wrapper.text()).not.toContain('Open New goal')
  })

  it('is opened straight onto the JSON tab from the goal dialog', async () => {
    const { app, wrapper } = await mountPanel()
    app.openGoalHelp('json')
    await nextTick()
    expect(wrapper.findAll('[role="tab"]')[1].attributes('aria-selected')).toBe('true')
  })
})

describe('the schema reference', () => {
  it('is grouped by what the field hangs off', async () => {
    const { wrapper } = await mountPanel()
    const groups = wrapper.findAll('.ghelp__scopetitle').map((h) => h.text())
    expect(groups).toEqual(['The document', 'Each goal', 'Each point'])
  })

  it('gives every row a type, a required flag, an example and a note', async () => {
    const { wrapper } = await mountPanel()
    const headers = wrapper.findAll('.ghelp__table thead th').map((h) => h.text())
    expect(headers.slice(0, 5)).toEqual(['Field', 'Type', 'Required', 'Example', 'Notes'])
    for (const row of wrapper.findAll('.ghelp__table tbody tr')) {
      expect(row.findAll('td, th').length).toBe(5)
    }
  })

  it('says on the row itself which fields a document cannot carry', async () => {
    const { wrapper } = await mountPanel()
    const flagged = wrapper
      .findAll('.ghelp__table tbody tr')
      .filter((r) => r.find('.ghelp__badge').exists())
      .map((r) => r.find('th code').text())
    expect(flagged).toEqual(['recurrence', 'metric'])
  })
})

describe('the shorthand cheat-sheet', () => {
  it('shows all three tokens whichever tab is open', async () => {
    const { wrapper } = await mountPanel()
    const tokens = wrapper.findAll('.ghelp__token').map((t) => t.text())
    expect(tokens).toEqual(['~2h', '@2026-09-01', '#tag'])
  })
})

describe('the sample', () => {
  it('is printed in full, so it can be read as well as copied', async () => {
    const { wrapper } = await mountPanel()
    expect(wrapper.find('.ghelp__sample').text()).toContain('"Ship the trading bot"')
  })

  it('copies to the clipboard and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const { wrapper } = await mountPanel()
    await buttonNamed(wrapper, 'Copy sample')!.trigger('click')
    expect(writeText).toHaveBeenCalledWith(SAMPLE_GOAL_JSON)
    await nextTick()
    expect(buttonNamed(wrapper, 'Copied')).toBeTruthy()
  })

  it('survives a blocked clipboard rather than throwing at the reader', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    const { wrapper } = await mountPanel()
    await buttonNamed(wrapper, 'Copy sample')!.trigger('click')
    await nextTick()
    // Still on screen and still selectable — the copy was a convenience.
    expect(wrapper.find('.ghelp__sample').exists()).toBe(true)
  })

  it('loads into the import box in one click, and closes the panel behind it', async () => {
    const { app, wrapper, router } = await mountPanel()
    await buttonNamed(wrapper, 'Load sample goal')!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/import/goals')
    expect(app.goalHelpOpen).toBe(false)
    // Handed over rather than imported: the reader lands in the box with it.
    expect(app.goalImportSeed).toBe(SAMPLE_GOAL_JSON)
    expect(app.goals).toEqual([])
  })

  it('hands the seed over exactly once', async () => {
    const { app, wrapper } = await mountPanel()
    await buttonNamed(wrapper, 'Load sample goal')!.trigger('click')
    expect(app.takeGoalImportSeed()).toBe(SAMPLE_GOAL_JSON)
    // A second read must not re-seed a box the reader has since typed into.
    expect(app.takeGoalImportSeed()).toBe('')
  })
})

describe('the one automatic open (section 23)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('opens for a first-timer on an empty tab and marks the user doc', () => {
    const app = useAppStore()
    app.cloudReady = true
    app.goals = []
    expect(app.maybeAutoOpenGoalHelp()).toBe(true)
    expect(app.goalHelpOpen).toBe(true)
    expect(app.goalsHelpSeen).toBe(true)
  })

  it('never opens again, even after the reader dismisses it', () => {
    const app = useAppStore()
    app.cloudReady = true
    app.goals = []
    app.maybeAutoOpenGoalHelp()
    app.closeGoalHelp()
    expect(app.maybeAutoOpenGoalHelp()).toBe(false)
    expect(app.goalHelpOpen).toBe(false)
  })

  it('stays shut until the workspace has actually arrived', () => {
    const app = useAppStore()
    app.cloudReady = false
    app.goals = []
    // The seen flag is on the user document and reads false before it lands;
    // opening on that would pop the panel at every cold load.
    expect(app.maybeAutoOpenGoalHelp()).toBe(false)
    expect(app.goalsHelpSeen).toBe(false)
  })

  it('leaves somebody who already has goals alone', () => {
    const app = useAppStore()
    app.cloudReady = true
    app.goals = [{ id: 1, title: 'g' } as never]
    expect(app.maybeAutoOpenGoalHelp()).toBe(false)
  })

  it('still opens on request once the flag is set', () => {
    const app = useAppStore()
    app.goalsHelpSeen = true
    app.openGoalHelp('link')
    expect(app.goalHelpOpen).toBe(true)
    expect(app.goalHelpTab).toBe('link')
  })
})
