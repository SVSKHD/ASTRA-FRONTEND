import { describe, it, expect } from 'vitest'
import { parseTaskTransferJson } from './taskTransfer'
import { countImportHierarchy } from './importHierarchy'

describe('import hierarchy counts', () => {
  it('counts roots, direct children and all deeper descendants separately', () => {
    const { items } = parseTaskTransferJson({
      title: 'Parent',
      subtasks: [
        { title: 'Child', subtasks: [{ title: 'Grandchild', subtasks: ['Great grandchild'] }] },
        { title: 'Other child' },
      ],
    })
    expect(countImportHierarchy(items)).toEqual({ parents: 1, subtasks: 2, nested: 2 })
    expect(countImportHierarchy([...items].reverse())).toEqual({
      parents: 1,
      subtasks: 2,
      nested: 2,
    })
  })
  it('counts new roots as children when importing under an existing parent', () => {
    const { items } = parseTaskTransferJson({
      items: [{ title: 'Child', subtasks: ['Grandchild'] }, { title: 'Other child' }],
    })
    expect(countImportHierarchy(items, true)).toEqual({ parents: 0, subtasks: 2, nested: 1 })
  })
})

it('counts legacy per-item parent IDs against existing parents', () => {
  const { items } = parseTaskTransferJson({
    items: [
      { id: 'child', title: 'Child', parentId: 123 },
      { title: 'Grandchild', parentSourceId: 'child' },
    ],
  })
  expect(countImportHierarchy(items, false, new Set(['123']))).toEqual({
    parents: 0,
    subtasks: 1,
    nested: 1,
  })
})
