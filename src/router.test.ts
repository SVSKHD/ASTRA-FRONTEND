import { describe, expect, it } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { PLURAL } from '@/utils/share'
import type { ItemType } from '@/types'

// Rebuild the route table against a memory history so resolution can be
// asserted without a DOM navigation.
async function makeRouter() {
  const { router } = await import('@/router')
  const test = createRouter({
    history: createMemoryHistory(),
    routes: router.getRoutes().map((r) => ({
      path: r.path,
      name: r.name,
      component: { template: '<div />' },
      props: r.props?.default,
    })) as never,
  })
  return test
}

const ALL_TYPES: ItemType[] = [
  'todo',
  'task',
  'deadline',
  'reminder',
  'finance',
  'note',
  'trip',
  'idea',
  'stock',
]

describe('routes', () => {
  it('resolves the workspace at /', async () => {
    const r = await makeRouter()
    expect(r.resolve('/').name).toBe('workspace')
  })

  it('resolves a share page for every item type', async () => {
    const r = await makeRouter()
    for (const type of ALL_TYPES) {
      const resolved = r.resolve(`/${PLURAL[type]}/abc123`)
      expect(resolved.name, type).toBe(`share-${PLURAL[type]}`)
      expect(resolved.params.shareId).toBe('abc123')
    }
  })

  it('keeps /tasks/:id/view distinct from the two-segment task share', async () => {
    const r = await makeRouter()
    // Three segments vs two: the deep link must not be swallowed by the share
    // route, and the share route must not swallow the deep link.
    expect(r.resolve('/tasks/42/view').name).toBe('task-view')
    expect(r.resolve('/tasks/42/view').params.id).toBe('42')
    expect(r.resolve('/tasks/xyz789').name).toBe('share-tasks')
  })

  it('routes a numeric /trips/:id to the owner trip page, letters to the share', async () => {
    const r = await makeRouter()
    // A numeric id is the owner's full trip page…
    expect(r.resolve('/trips/123').name).toBe('trip-page')
    expect(r.resolve('/trips/123').params.id).toBe('123')
    // …while a Firestore share id (has letters) still resolves to the share.
    expect(r.resolve('/trips/abc123').name).toBe('share-trips')
  })

  it('resolves the public /share/<type>/<id> route for every item type', async () => {
    const r = await makeRouter()
    for (const type of ALL_TYPES) {
      const resolved = r.resolve(`/share/${type}/Ab12_-cd34EF`)
      expect(resolved.name, type).toBe(`share-public-${type}`)
      expect(resolved.params.shareId).toBe('Ab12_-cd34EF')
    }
  })

  it('404s an unknown /share/<type> rather than rendering an empty share', async () => {
    const r = await makeRouter()
    expect(r.resolve('/share/widget/abc123').name).toBe('not-found')
  })

  it('404s an unknown plural rather than rendering an empty share', async () => {
    const r = await makeRouter()
    expect(r.resolve('/widgets/abc123').name).toBe('not-found')
  })

  it('404s an unknown top-level path', async () => {
    const r = await makeRouter()
    expect(r.resolve('/nope').name).toBe('not-found')
  })
})
