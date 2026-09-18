import { describe, expect, it } from 'vitest'
import { inheritedTags } from '@/utils/taskTree'

const n = (id: number, parentId: number | null, tag = '') => ({ id, parentId, order: id, tag })

describe('inheritedTags', () => {
  it('fills untagged descendants from the nearest tagged ancestor', () => {
    const tags = inheritedTags([n(1, null, 'work'), n(2, 1), n(3, 2), n(4, 2, 'home'), n(5, 4)])
    expect(Object.fromEntries(tags)).toEqual({ 2: 'work', 3: 'work', 5: 'home' })
  })

  it('never overwrites an existing tag and skips untagged roots', () => {
    const tags = inheritedTags([n(1, null, 'work'), n(2, 1, 'custom'), n(3, null), n(4, 3)])
    expect(tags.size).toBe(0)
  })
})
