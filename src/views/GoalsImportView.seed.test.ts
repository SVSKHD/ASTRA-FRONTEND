// Section 23's last mile: "Load sample goal" is only one click if the sample is
// actually in the box when the import screen opens.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h } from 'vue'
import GoalsImportView from '@/views/GoalsImportView.vue'
import { useAppStore } from '@/stores/app'
import { SAMPLE_GOAL_JSON } from '@/utils/goalHelp'

const Blank = defineComponent({ render: () => h('div') })

async function mountImport() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Blank },
      { path: '/import/goals', component: GoalsImportView },
    ],
  })
  await router.push('/import/goals')
  await router.isReady()
  const wrapper = mount(GoalsImportView, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('a sample handed over by the help panel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // The screen otherwise offers to prefill from a link on the clipboard; a
    // seed must win over that, so the read is stubbed to a link that would.
    Object.assign(navigator, {
      clipboard: { readText: vi.fn().mockResolvedValue('https://spasta.online/?project=other') },
    })
  })

  it('is in the box, parsed, before the reader touches anything', async () => {
    const app = useAppStore()
    app.seedGoalImport(SAMPLE_GOAL_JSON)
    const wrapper = await mountImport()
    expect(wrapper.find('textarea').element.value).toBe(SAMPLE_GOAL_JSON)
    // Parsed, not merely pasted: the preview is what makes it one more click.
    expect(wrapper.text()).toContain('Ship the trading bot')
  })

  it('beats the clipboard offer rather than being overwritten by it', async () => {
    const app = useAppStore()
    app.seedGoalImport(SAMPLE_GOAL_JSON)
    const wrapper = await mountImport()
    expect(wrapper.find('textarea').element.value).not.toContain('spasta.online')
  })

  it('is consumed, so re-opening the screen does not overwrite a fresh paste', async () => {
    const app = useAppStore()
    app.seedGoalImport(SAMPLE_GOAL_JSON)
    await mountImport()
    expect(app.goalImportSeed).toBe('')
  })

  it('leaves the screen as it was when no sample was handed over', async () => {
    const wrapper = await mountImport()
    // Falls through to the clipboard offer, which is the behaviour that
    // predates this and must be untouched by it.
    expect(wrapper.find('textarea').element.value).toContain('spasta.online')
  })
})
