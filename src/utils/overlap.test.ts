// Section 21c: the detector's judgement, argued with here rather than squinted
// at on a page. Most of what makes an overlap detector useful is what it does
// NOT report — a container holding its content is not a collision, and a
// detector that says so is one nobody reads.
import { describe, expect, it } from 'vitest'
import {
  OVERLAP_TOLERANCE,
  contains,
  findCollisions,
  overflowsX,
  overlapOf,
  overlaps,
  type Candidate,
} from '@/utils/overlap'

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
})

describe('two boxes', () => {
  it('sitting on top of each other overlap', () => {
    expect(overlaps(box(0, 0, 100, 40), box(50, 20, 100, 40))).toBe(true)
    expect(overlapOf(box(0, 0, 100, 40), box(50, 20, 100, 40))).toEqual({ x: 50, y: 20 })
  })

  it('stacked in a column do not, however much width they share', () => {
    // The common false positive: everything in a column shares an x span.
    expect(overlaps(box(0, 0, 300, 40), box(0, 40, 300, 40))).toBe(false)
  })

  it('side by side in a row do not either', () => {
    expect(overlaps(box(0, 0, 100, 40), box(100, 0, 100, 40))).toBe(false)
  })

  it('a hair into each other do not — that is a border, not a bug', () => {
    expect(overlaps(box(0, 0, 100, 40), box(99, 39, 100, 40))).toBe(false)
    expect(overlaps(box(0, 0, 100, 40), box(100 - OVERLAP_TOLERANCE - 1, 20, 100, 40))).toBe(true)
  })
})

describe('containment', () => {
  it('is what a container does, not a collision', () => {
    expect(contains(box(0, 0, 300, 100), box(10, 10, 100, 40))).toBe(true)
  })

  it('allows for the odd sub-pixel spill', () => {
    expect(contains(box(0, 0, 300, 100), box(-1, 0, 300, 100))).toBe(true)
  })

  it('is not containment when the inner box is out the side', () => {
    expect(contains(box(0, 0, 300, 100), box(250, 10, 100, 40))).toBe(false)
  })
})

describe('content wider than its box', () => {
  it('is a label that should have ellipsed', () => {
    expect(overflowsX(200, 340, false)).toBe(true)
  })

  it('is fine when the container is meant to scroll', () => {
    // A wide table inside its own overflow-x container is the pattern, not the
    // bug (section 21c says wide content scrolls inside itself).
    expect(overflowsX(200, 340, true)).toBe(false)
  })

  it('ignores a pixel of rounding', () => {
    expect(overflowsX(200, 201, false)).toBe(false)
  })
})

describe('scanning a page', () => {
  const candidate = (
    id: string,
    b: ReturnType<typeof box>,
    ancestors: string[] = [],
  ): Candidate => ({
    id,
    box: b,
    where: id,
    ancestors,
  })

  it('reports a real collision', () => {
    const found = findCollisions([
      candidate('title', box(0, 0, 200, 20)),
      candidate('badge', box(180, 4, 60, 20)),
    ])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ a: 'title', b: 'badge', x: 20 })
  })

  it('says nothing about a parent and its child', () => {
    const found = findCollisions([
      candidate('row', box(0, 0, 300, 40)),
      candidate('label', box(8, 8, 100, 24), ['row']),
    ])
    expect(found).toEqual([])
  })

  it('says nothing about two children of the same row', () => {
    const found = findCollisions([
      candidate('label', box(0, 0, 100, 24), ['row']),
      candidate('count', box(108, 0, 40, 24), ['row']),
    ])
    expect(found).toEqual([])
  })

  it('puts the worst one first, because a 3px overlap is usually a border', () => {
    const found = findCollisions([
      candidate('a', box(0, 0, 100, 100)),
      // 4px into a — a hairline.
      candidate('b', box(96, 0, 100, 100)),
      // 60px into a — text on text.
      candidate('c', box(40, 40, 100, 100)),
    ])
    const areas = found.map((f) => f.x * f.y)
    expect(areas).toEqual([...areas].sort((p, q) => q - p))
    expect(found[0]).toMatchObject({ a: 'a', b: 'c' })
    expect(found[found.length - 1]).toMatchObject({ a: 'a', b: 'b' })
  })

  it('has nothing to say about a page that lays out correctly', () => {
    const found = findCollisions([
      candidate('head', box(0, 0, 600, 48)),
      candidate('body', box(0, 48, 600, 400)),
      candidate('foot', box(0, 448, 600, 48)),
    ])
    expect(found).toEqual([])
  })
})
