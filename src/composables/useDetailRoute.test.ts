// The dialog and the URL, kept in step (section 18a, acceptance 86). Driven
// through a real memory-history router, because the interesting failures are
// the ones between the two watchers.
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useDetailRoute } from '@/composables/useDetailRoute'

const Blank = defineComponent({ render: () => h('div') })

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: Blank }],
  })
}

const Host = defineComponent({
  setup() {
    useDetailRoute()
    return () => h('div')
  },
})

async function mountAt(path: string) {
  setActivePinia(createPinia())
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const app = useAppStore()
  const wrapper = mount(Host, { global: { plugins: [router] } })
  await flushPromises()
  return { app, router, wrapper }
}

describe('the URL opening the dialog', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('opens the task a cold load addresses (acceptance 86)', async () => {
    const { app } = await mountAt('/?task=4')
    expect(app.detailFrame).toEqual({ kind: 'task', id: 4 })
  })

  it('opens the goal a cold load addresses', async () => {
    const { app } = await mountAt('/?goal=9')
    expect(app.detailFrame).toEqual({ kind: 'goal', id: 9 })
  })

  it('opens nothing on a plain load', async () => {
    const { app } = await mountAt('/')
    expect(app.detailOpen).toBe(false)
  })

  it('closes when the address loses the key — what back does', async () => {
    const { app, router } = await mountAt('/?task=4')
    await router.push('/')
    await flushPromises()
    expect(app.detailOpen).toBe(false)
  })

  it('swaps content when the address changes to another task', async () => {
    const { app, router } = await mountAt('/?task=4')
    await router.push('/?task=5')
    await flushPromises()
    expect(app.detailFrame).toEqual({ kind: 'task', id: 5 })
  })
})

describe('the dialog writing the URL', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('addresses what it opened', async () => {
    const { app, router } = await mountAt('/')
    app.openDetail('task', 7)
    await flushPromises()
    expect(router.currentRoute.value.query.task).toBe('7')
  })

  it('leaves an entry behind, so back closes it (acceptance 86)', async () => {
    const { app, router } = await mountAt('/')
    app.openDetail('task', 7)
    await flushPromises()
    router.back()
    await flushPromises()
    expect(router.currentRoute.value.query.task).toBeUndefined()
    expect(app.detailOpen).toBe(false)
  })

  it('drops the key on close', async () => {
    const { app, router } = await mountAt('/?task=7')
    app.closeDetail()
    await flushPromises()
    expect(router.currentRoute.value.query.task).toBeUndefined()
  })

  it('keeps the rest of the query intact', async () => {
    const { app, router } = await mountAt('/?tab=tasks')
    app.openDetail('goal', 2)
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ tab: 'tasks', goal: '2' })
  })

  it('stepping to a sibling edits the address rather than stacking history', async () => {
    const { app, router } = await mountAt('/')
    app.openDetail('task', 1, [1, 2])
    await flushPromises()
    app.stepDetail(2)
    await flushPromises()
    expect(router.currentRoute.value.query.task).toBe('2')
    // One entry for the dialog: back leaves it entirely, rather than stepping
    // back through every sibling the reader looked at.
    router.back()
    await flushPromises()
    expect(app.detailOpen).toBe(false)
  })
})
