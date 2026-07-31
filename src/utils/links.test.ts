import { describe, expect, it } from 'vitest'
import {
  MAX_DIRECT_LINKS,
  ancestorHeight,
  checkLink,
  hasRef,
  nestedChildIds,
  sameRef,
  subtreeDepth,
  wouldCycle,
  type Graph,
} from '@/utils/links'
import type { LinkRef } from '@/types'

// A tiny in-memory link graph keyed by "collection:id". Each node stores its
// linked (children) and parents refs.
type Node = { linked: LinkRef[]; parents: LinkRef[] }
function makeGraph(nodes: Record<string, Node>): Graph {
  const get = (r: LinkRef) => nodes[r.collection + ':' + r.id]
  return {
    children: (r) => get(r)?.linked ?? [],
    parents: (r) => get(r)?.parents ?? [],
  }
}
const todo = (id: number): LinkRef => ({ id, collection: 'todos' })
const task = (id: number): LinkRef => ({ id, collection: 'tasks' })

describe('ref identity', () => {
  it('sameRef compares id + collection', () => {
    expect(sameRef(todo(1), todo(1))).toBe(true)
    expect(sameRef(todo(1), task(1))).toBe(false)
  })
  it('hasRef finds a ref in a list', () => {
    expect(hasRef([todo(1), task(2)], task(2))).toBe(true)
    expect(hasRef([todo(1)], task(1))).toBe(false)
  })
})

describe('wouldCycle', () => {
  it('is true for self-link', () => {
    expect(wouldCycle(makeGraph({}).children, todo(1), todo(1))).toBe(true)
  })
  it('detects a loop back to the parent through the child subtree', () => {
    // parent todo:1 -> child todo:2 -> todo:1 already, so linking 1 under 2 loops
    const g = makeGraph({
      'todos:2': { linked: [todo(1)], parents: [] },
      'todos:1': { linked: [], parents: [todo(2)] },
    })
    expect(wouldCycle(g.children, todo(1), todo(2))).toBe(true)
  })
  it('is false for an unrelated link', () => {
    const g = makeGraph({ 'todos:1': { linked: [], parents: [] } })
    expect(wouldCycle(g.children, todo(1), task(9))).toBe(false)
  })
})

describe('depth helpers', () => {
  it('subtreeDepth counts levels below (leaf = 1)', () => {
    const g = makeGraph({
      'todos:1': { linked: [todo(2)], parents: [] },
      'todos:2': { linked: [task(3)], parents: [todo(1)] },
      'tasks:3': { linked: [], parents: [todo(2)] },
    })
    expect(subtreeDepth(g.children, todo(1))).toBe(3)
    expect(subtreeDepth(g.children, task(3))).toBe(1)
  })
  it('ancestorHeight counts levels above (root = 1)', () => {
    const g = makeGraph({
      'todos:1': { linked: [todo(2)], parents: [] },
      'todos:2': { linked: [], parents: [todo(1)] },
    })
    expect(ancestorHeight(g.parents, todo(2))).toBe(2)
    expect(ancestorHeight(g.parents, todo(1))).toBe(1)
  })
})

describe('checkLink', () => {
  it('rejects self / existing / over-limit', () => {
    expect(checkLink(makeGraph({}), todo(1), [], todo(1)).reason).toBe('self')
    expect(checkLink(makeGraph({}), todo(1), [task(2)], task(2)).reason).toBe('exists')
    const many = Array.from({ length: MAX_DIRECT_LINKS }, (_, i) => todo(100 + i))
    expect(checkLink(makeGraph({}), todo(1), many, todo(2)).reason).toBe('max-direct')
  })

  it('rejects a link that would loop', () => {
    const g = makeGraph({
      'todos:2': { linked: [todo(1)], parents: [] },
      'todos:1': { linked: [], parents: [todo(2)] },
    })
    expect(checkLink(g, todo(1), [], todo(2)).reason).toBe('cycle')
  })

  it('rejects when the resulting chain exceeds the depth limit', () => {
    // child todo:2 already has a 3-deep subtree; linking under any parent -> >3
    const g = makeGraph({
      'todos:2': { linked: [todo(3)], parents: [] },
      'todos:3': { linked: [todo(4)], parents: [todo(2)] },
      'todos:4': { linked: [], parents: [todo(3)] },
      'todos:1': { linked: [], parents: [] },
    })
    expect(checkLink(g, todo(1), [], todo(2)).reason).toBe('max-depth')
  })

  it('allows a valid link within limits', () => {
    const g = makeGraph({
      'todos:1': { linked: [], parents: [] },
      'tasks:2': { linked: [], parents: [] },
    })
    expect(checkLink(g, todo(1), [], task(2))).toEqual({ ok: true })
  })
})

describe('nestedChildIds', () => {
  it('nests a child whose same-collection parent is present', () => {
    const items = [
      { id: 1, parents: [] },
      { id: 2, parents: [todo(1)] },
    ]
    expect([...nestedChildIds('todos', items)]).toEqual([2])
  })

  it('does NOT nest when the parent is a different collection (breadcrumb case)', () => {
    const items = [{ id: 2, parents: [task(9)] }]
    expect(nestedChildIds('todos', items).size).toBe(0)
  })

  it('does NOT nest when the parent is filtered out of the present set', () => {
    // parent todo:1 is not in this view; child todo:2 stays top-level.
    const items = [{ id: 2, parents: [todo(1)] }]
    expect(nestedChildIds('todos', items).size).toBe(0)
  })

  it('nests under the first visible parent when there are several', () => {
    const items = [
      { id: 1, parents: [] },
      { id: 3, parents: [todo(1), todo(99)] }, // 99 absent, 1 present
    ]
    expect([...nestedChildIds('todos', items)]).toEqual([3])
  })
})
