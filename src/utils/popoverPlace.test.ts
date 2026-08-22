// Acceptance 119, as arithmetic: the popover opens where there is room for it,
// and never off the edge of the window.
import { describe, expect, it } from 'vitest'
import { POPOVER_GAP, VIEWPORT_MARGIN, placePopover } from '@/utils/popoverPlace'

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
