// Acceptance 119, as arithmetic: the popover opens where there is room for it,
// and never off the edge of the window.
import { describe, expect, it } from 'vitest'
import { POPOVER_GAP, VIEWPORT_MARGIN, placeCellPopover, placePopover } from '@/utils/popoverPlace'

const VIEW = { width: 1280, height: 720 }
const field = (top: number, left = 100) => ({ top, left, width: 240, height: 40 })
const panel = { top: 0, left: 0, width: 320, height: 380 }

describe('vertical placement', () => {
  it('opens below the field, where the reader is already looking', () => {
    const placed = placePopover(field(100), panel, VIEW)
    expect(placed.placement).toBe('below')
    expect(placed.top).toBe(100 + 40 + POPOVER_GAP)
  })

  it('flips above when below cannot hold it', () => {
    const placed = placePopover(field(600), panel, VIEW)
    expect(placed.placement).toBe('above')
    expect(placed.top).toBe(600 - POPOVER_GAP - 380)
  })

  it('stays below when above is even tighter — flipping into less room helps nobody', () => {
    // 40px from the top: nothing fits either way, and below is the roomier half.
    const placed = placePopover(field(40), panel, VIEW)
    expect(placed.placement).toBe('below')
  })

  it('reports what it may grow to, so the panel scrolls rather than the window', () => {
    const placed = placePopover(field(600), panel, VIEW)
    expect(placed.maxHeight).toBe(600 - POPOVER_GAP - VIEWPORT_MARGIN)
    expect(placed.maxHeight).toBeGreaterThan(0)
  })

  it('never reports a negative height, however cramped', () => {
    expect(placePopover(field(0), panel, { width: 1280, height: 40 }).maxHeight).toBe(0)
  })
})

describe('horizontal placement', () => {
  it('lines the panel up with the field it belongs to', () => {
    expect(placePopover(field(100, 400), panel, VIEW).left).toBe(400)
  })

  it('slides back inside rather than running off the right edge', () => {
    const placed = placePopover(field(100, 1200), panel, VIEW)
    expect(placed.left).toBe(1280 - 320 - VIEWPORT_MARGIN)
    expect(placed.left + panel.width).toBeLessThanOrEqual(1280 - VIEWPORT_MARGIN)
  })

  it('keeps its margin on the left edge too', () => {
    expect(placePopover(field(100, -50), panel, VIEW).left).toBe(VIEWPORT_MARGIN)
  })

  it('pins to the margin when the panel is wider than the window itself', () => {
    const placed = placePopover(field(100, 20), panel, { width: 300, height: 720 })
    expect(placed.left).toBe(VIEWPORT_MARGIN)
  })
})

// ---------------------------------------------------------------------------
// The cell-anchored variant (section 24c, acceptance 123).
describe('a popover anchored to a calendar cell', () => {
  const VIEW = { width: 1280, height: 800 }
  const PANEL = { top: 0, left: 0, width: 300, height: 260 }
  const cell = (left: number, top: number) => ({ top, left, width: 160, height: 110 })

  it('opens to the right of a cell with room, clear of the cell itself', () => {
    const p = placeCellPopover(cell(200, 200), PANEL, VIEW)
    expect(p.side).toBe('right')
    expect(p.left).toBe(200 + 160 + POPOVER_GAP)
  })

  it('flips to the left when the cell is against the right edge', () => {
    // A month grid puts a cell here one week in four, which is the whole bug:
    // the panel used to hang off the window and be clipped by the grid.
    const p = placeCellPopover(cell(1080, 200), PANEL, VIEW)
    expect(p.side).toBe('left')
    expect(p.left).toBe(1080 - POPOVER_GAP - 300)
  })

  it('flips at the 340px threshold and not before', () => {
    // Right edge of the cell at exactly 340px of room: still opens right.
    const onThreshold = placeCellPopover(cell(1280 - 340 - 160, 100), PANEL, VIEW)
    expect(onThreshold.side).toBe('right')
    const justInside = placeCellPopover(cell(1280 - 339 - 160, 100), PANEL, VIEW)
    expect(justInside.side).toBe('left')
  })

  it('shifts up rather than flipping when the cell is near the bottom', () => {
    // Vertically it slides: a short form moved up stays where the reader is
    // looking, where flipping it above the cell would not.
    const p = placeCellPopover(cell(200, 700), PANEL, VIEW)
    expect(p.top).toBe(800 - 260 - VIEWPORT_MARGIN)
  })

  it('leaves a cell with room where it is, vertically', () => {
    expect(placeCellPopover(cell(200, 120), PANEL, VIEW).top).toBe(120)
  })

  it('stays inside the window on both axes whatever the cell', () => {
    for (const left of [0, 400, 900, 1200, 1279]) {
      for (const top of [0, 300, 799]) {
        const p = placeCellPopover(cell(left, top), PANEL, VIEW)
        expect(p.left, `${left},${top}`).toBeGreaterThanOrEqual(VIEWPORT_MARGIN)
        expect(p.left + PANEL.width, `${left},${top}`).toBeLessThanOrEqual(VIEW.width)
        expect(p.top, `${left},${top}`).toBeGreaterThanOrEqual(VIEWPORT_MARGIN)
        expect(p.top + PANEL.height, `${left},${top}`).toBeLessThanOrEqual(VIEW.height)
      }
    }
  })

  it('pins to the top margin rather than losing its header off-screen', () => {
    // A window shorter than the panel has no good answer; the least bad one is
    // to keep the top, where the title and the first field are.
    const tall = { top: 0, left: 0, width: 300, height: 900 }
    expect(placeCellPopover(cell(200, 400), tall, VIEW).top).toBe(VIEWPORT_MARGIN)
  })

  it('pins to the left margin when the window is narrower than the panel', () => {
    const narrow = { width: 280, height: 800 }
    const p = placeCellPopover(cell(10, 10), PANEL, narrow)
    expect(p.left).toBe(VIEWPORT_MARGIN)
  })
})
