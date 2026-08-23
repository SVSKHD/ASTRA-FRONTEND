// Section 25b. The keyboard rules, argued with here rather than clicked at.
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { TYPEAHEAD_MS, useListbox, type ListOption } from '@/composables/useListbox'

const MONTHS: ListOption[] = [
  { value: 'jan', label: 'January' },
  { value: 'feb', label: 'February' },
  { value: 'mar', label: 'March' },
  { value: 'may', label: 'May' },
  { value: 'jun', label: 'June' },
]

function setup(options = MONTHS, initial?: string, clock = { t: 0 }) {
  const chosen: ListOption[] = []
  const lb = useListbox({
    options: ref(options),
    initialValue: ref(initial),
    onChoose: (o) => chosen.push(o),
    now: () => clock.t,
  })
  return { lb, chosen, clock }
}

const key = (k: string, extra: Partial<KeyboardEvent> = {}) =>
  ({ key: k, metaKey: false, ctrlKey: false, altKey: false, ...extra }) as KeyboardEvent

describe('opening', () => {
  it('lands on the current value, so the list opens where you left it', () => {
    const { lb } = setup(MONTHS, 'mar')
    lb.openList()
    expect(lb.activeIndex.value).toBe(2)
  })

  it('lands on the first option when there is no value yet', () => {
    const { lb } = setup(MONTHS)
    lb.openList()
    expect(lb.activeIndex.value).toBe(0)
  })

  it('opens on ArrowDown, ArrowUp, Enter or Space from a closed list', () => {
    for (const k of ['ArrowDown', 'ArrowUp', 'Enter', ' ']) {
      const { lb } = setup()
      expect(lb.onKeydown(key(k)), k).toBe(true)
      expect(lb.open.value, k).toBe(true)
    }
  })

  it('lets an unrelated key through when closed', () => {
    const { lb } = setup()
    expect(lb.onKeydown(key('a'))).toBe(false)
    expect(lb.open.value).toBe(false)
  })
})

describe('moving', () => {
  it('wraps at both ends', () => {
    const { lb } = setup()
    lb.openList()
    lb.onKeydown(key('ArrowUp'))
    expect(lb.activeIndex.value).toBe(MONTHS.length - 1)
    lb.onKeydown(key('ArrowDown'))
    expect(lb.activeIndex.value).toBe(0)
  })

  it('takes Home and End to the ends', () => {
    const { lb } = setup(MONTHS, 'mar')
    lb.openList()
    lb.onKeydown(key('End'))
    expect(lb.activeIndex.value).toBe(4)
    lb.onKeydown(key('Home'))
    expect(lb.activeIndex.value).toBe(0)
  })

  it('steps over a disabled option instead of landing on it', () => {
    const list: ListOption[] = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B', disabled: true },
      { value: 'c', label: 'C' },
    ]
    const { lb } = setup(list)
    lb.openList()
    lb.onKeydown(key('ArrowDown'))
    expect(lb.activeIndex.value).toBe(2)
  })

  it('does nothing sensible-looking on an all-disabled list rather than looping', () => {
    const list: ListOption[] = [{ value: 'a', label: 'A', disabled: true }]
    const { lb } = setup(list)
    lb.openList()
    lb.onKeydown(key('ArrowDown'))
    expect(lb.activeIndex.value).toBe(-1)
  })
})

describe('type-ahead', () => {
  it('accumulates, so "ma" finds March and does not stop at May', () => {
    const { lb } = setup()
    lb.openList()
    lb.onKeydown(key('m'))
    lb.onKeydown(key('a'))
    expect(MONTHS[lb.activeIndex.value].label).toBe('March')
  })

  it('cycles through the matches when one letter is pressed again', () => {
    // What a native select does, and what anyone who has used one expects.
    const { lb } = setup()
    lb.openList()
    lb.onKeydown(key('m'))
    expect(MONTHS[lb.activeIndex.value].label).toBe('March')
    lb.onKeydown(key('m'))
    expect(MONTHS[lb.activeIndex.value].label).toBe('May')
    lb.onKeydown(key('m'))
    expect(MONTHS[lb.activeIndex.value].label).toBe('March')
  })

  it('starts a new word after a pause', () => {
    const clock = { t: 0 }
    const { lb } = setup(MONTHS, undefined, clock)
    lb.openList()
    lb.onKeydown(key('j'))
    clock.t += TYPEAHEAD_MS + 1
    lb.onKeydown(key('m'))
    // "jm" would match nothing; the pause means this is a fresh "m".
    expect(MONTHS[lb.activeIndex.value].label).toBe('March')
  })

  it('searches forward from where you are, as a native select does', () => {
    // Pressing "j" while already on January goes to June, not back to January.
    // The alternative — always starting at index 0 — makes a repeated letter
    // sit still, which reads as the key not registering.
    const { lb } = setup(MONTHS, 'jan')
    lb.openList()
    lb.onKeydown(key('j'))
    expect(MONTHS[lb.activeIndex.value].label).toBe('June')
  })

  it('leaves the highlight alone when nothing matches', () => {
    const { lb } = setup()
    lb.openList()
    lb.onKeydown(key('End'))
    const before = lb.activeIndex.value
    expect(lb.onKeydown(key('z'))).toBe(false)
    expect(lb.activeIndex.value).toBe(before)
  })

  it('ignores a shortcut — cmd-r is a reload, not a search for "r"', () => {
    const { lb } = setup()
    lb.openList()
    expect(lb.onKeydown(key('r', { metaKey: true }))).toBe(false)
  })
})

describe('committing and closing', () => {
  it('chooses the highlighted option on Enter', () => {
    const { lb, chosen } = setup(MONTHS, 'feb')
    lb.openList()
    lb.onKeydown(key('Enter'))
    expect(chosen.map((c) => c.value)).toEqual(['feb'])
  })

  it('refuses to choose a disabled option', () => {
    const list: ListOption[] = [{ value: 'a', label: 'A', disabled: true }]
    const { lb, chosen } = setup(list)
    lb.open.value = true
    lb.activeIndex.value = 0
    lb.chooseActive()
    expect(chosen).toEqual([])
  })

  it('closes on Escape and reports the key as consumed', () => {
    // Consumed, so Escape inside an open list does not also close the dialog
    // behind it — which is what happens when each control decides for itself.
    const { lb } = setup()
    lb.openList()
    expect(lb.onKeydown(key('Escape'))).toBe(true)
    expect(lb.open.value).toBe(false)
  })

  it('closes on Tab but lets the key through, so focus still moves on', () => {
    const { lb } = setup()
    lb.openList()
    expect(lb.onKeydown(key('Tab'))).toBe(false)
    expect(lb.open.value).toBe(false)
  })

  it('forgets the type-ahead buffer when it closes', () => {
    // A buffer that survived a close would make the next search "mf", which
    // matches nothing, and the reader would conclude type-ahead is broken.
    const { lb } = setup()
    lb.openList()
    lb.onKeydown(key('m'))
    lb.closeList()
    lb.openList()
    expect(lb.onKeydown(key('f'))).toBe(true)
    expect(MONTHS[lb.activeIndex.value].label).toBe('February')
  })
})

describe('a list that changes underneath', () => {
  it('does not leave the highlight pointing past the end', async () => {
    const options = ref<ListOption[]>(MONTHS)
    const lb = useListbox({ options, onChoose: vi.fn() })
    lb.openList()
    lb.toEnd('last')
    options.value = [MONTHS[0]]
    await Promise.resolve()
    expect(lb.activeIndex.value).toBeLessThan(options.value.length)
  })
})
