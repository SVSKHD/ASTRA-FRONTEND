import { describe, expect, it } from 'vitest'
import {
  canGoBack,
  openStack,
  parentFrame,
  popFrame,
  pushFrame,
  replaceTop,
  stepIds,
  topOf,
} from '@/utils/detailStack'

const task = (id: number) => ({ kind: 'task' as const, id })
const goal = (id: number) => ({ kind: 'goal' as const, id })

describe('opening', () => {
  it('starts a fresh path with no back arrow', () => {
    const stack = openStack(task(1))
    expect(topOf(stack)).toEqual(task(1))
    expect(canGoBack(stack)).toBe(false)
  })
})

describe('drilling in (acceptance 88)', () => {
  it('shows the new frame and remembers where it came from', () => {
    const stack = pushFrame(openStack(task(1)), task(2))
    expect(topOf(stack)).toEqual(task(2))
    expect(canGoBack(stack)).toBe(true)
    expect(parentFrame(stack)).toEqual(task(1))
  })

  it('returns to exactly the frame it came from', () => {
    const deep = pushFrame(pushFrame(openStack(task(1)), task(2)), task(3))
    expect(topOf(popFrame(deep))).toEqual(task(2))
    expect(topOf(popFrame(popFrame(deep)))).toEqual(task(1))
  })

  it('a repeated click does not deepen the stack', () => {
    const stack = pushFrame(openStack(task(1)), task(2))
    expect(pushFrame(stack, task(2))).toBe(stack)
  })

  it('walking back into a frame already open unwinds rather than looping', () => {
    // A subtask lists its parent in the breadcrumb, so this is one click away.
    const stack = pushFrame(pushFrame(openStack(task(1)), task(2)), task(1))
    expect(stack).toEqual([task(1)])
    expect(canGoBack(stack)).toBe(false)
  })

  it('crosses kinds — a goal drills into one of its tasks', () => {
    const stack = pushFrame(openStack(goal(4)), task(9))
    expect(topOf(stack)).toEqual(task(9))
    expect(parentFrame(stack)).toEqual(goal(4))
  })

  it('popping the only frame leaves nothing open', () => {
    expect(popFrame(openStack(task(1)))).toEqual([])
  })
})

describe('stepping to a sibling', () => {
  it('keeps the back path underneath', () => {
    const stack = replaceTop(pushFrame(openStack(task(1)), task(2)), task(3))
    expect(topOf(stack)).toEqual(task(3))
    expect(parentFrame(stack)).toEqual(task(1))
  })

  it('opens a stack when there was none', () => {
    expect(replaceTop([], task(5))).toEqual([task(5)])
  })

  it('stepping onto an ancestor unwinds instead of duplicating it', () => {
    const stack = replaceTop(pushFrame(openStack(task(1)), task(2)), task(1))
    expect(stack).toEqual([task(1)])
  })

  it('is a no-op onto itself', () => {
    const stack = openStack(task(1))
    expect(replaceTop(stack, task(1))).toBe(stack)
  })
})

describe('prev and next through the list behind', () => {
  const list = [10, 20, 30]

  it('offers both in the middle', () => {
    expect(stepIds(list, 20)).toEqual({ prevId: 10, nextId: 30 })
  })

  it('stops at each end', () => {
    expect(stepIds(list, 10)).toEqual({ prevId: null, nextId: 20 })
    expect(stepIds(list, 30)).toEqual({ prevId: 20, nextId: null })
  })

  it('offers nothing for an item the list no longer contains', () => {
    // Filtered out from under the reader — better no arrows than wrong ones.
    expect(stepIds(list, 99)).toEqual({ prevId: null, nextId: null })
  })

  it('offers nothing for a list of one', () => {
    expect(stepIds([10], 10)).toEqual({ prevId: null, nextId: null })
  })
})
