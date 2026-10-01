import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useTagSelection } from '@/composables/useTagSelection'

const TAGS: Record<number, string> = { 1: 'Office', 2: 'Home', 3: 'office', 4: '', 5: 'Home' }

function setup(initial: number[] = []) {
  const selected = ref(new Set<number>(initial))
  const selectionMode = ref(false)
  const sel = useTagSelection({
    selectable: ref([1, 2, 3, 4, 5]),
    tagOf: (id) => TAGS[id],
    selected,
    selectionMode,
  })
  return { selected, selectionMode, ...sel }
}

describe('select by tag', () => {
  it('lists each tag once, case-insensitively, with its count', () => {
    const { tagMenu } = setup()
    expect(tagMenu.value.map((m) => m.label)).toEqual(['Home · 2', 'Office · 2'])
  })

  it('selects every row with the tag and leaves the others alone', () => {
    const { selected, selectionMode, pickTag } = setup([2])
    pickTag('Office')
    expect([...selected.value].sort()).toEqual([1, 2, 3])
    expect(selectionMode.value).toBe(true)
  })

  it('unselects them when they are all selected already, and says so', () => {
    const { selected, tagMenu, pickTag } = setup([1, 3, 5])
    expect(tagMenu.value.find((m) => m.value === 'Office')!.label).toBe('Unselect Office · 2')
    pickTag('Office')
    expect([...selected.value]).toEqual([5])
  })
})
