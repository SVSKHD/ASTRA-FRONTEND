// Where a popover lands when it is not allowed to live inside its own field
// (section 22e, acceptance 119).
//
// A panel positioned `absolute` inside a form field is clipped by the first
// ancestor that scrolls, and a panel positioned `fixed` inside a dialog is
// *still* clipped, because a `transform` or a `backdrop-filter` on the dialog
// makes it the containing block for fixed children. The detail dialog has both.
// So the panel is portalled to the body and told its coordinates — which means
// something has to work them out.
//
// That is this file. It is arithmetic on four rectangles and nothing else, so
// the rules — flip when there is no room below, slide back inside the viewport,
// never grow past the edge — can be argued with in a test rather than squinted
// at on a screen at 1280×720.

export interface Box {
  top: number
  left: number
  width: number
  height: number
}

export interface Viewport {
  width: number
  height: number
}

export type Placement = 'below' | 'above'

export interface Placed {
  top: number
  left: number
  placement: Placement
  // What the panel may grow to before it would run off the edge. The caller
  // caps the panel with it and lets the content scroll inside.
  maxHeight: number
}

// The gap between the field and its panel, and the margin the panel keeps from
// the edge of the window. Both small: this is a popover attached to a control,
// not a floating card.
export const POPOVER_GAP = 6
export const VIEWPORT_MARGIN = 8

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

export function placePopover(anchor: Box, panel: Box, viewport: Viewport): Placed {
  const below = viewport.height - (anchor.top + anchor.height) - POPOVER_GAP - VIEWPORT_MARGIN
  const above = anchor.top - POPOVER_GAP - VIEWPORT_MARGIN

  // Below by default, because that is where a reader looks after clicking a
  // field. It flips only when below genuinely cannot hold the panel AND above
  // can hold more of it — flipping into an even tighter space helps nobody.
  const placement: Placement = panel.height <= below || below >= above ? 'below' : 'above'
  const maxHeight = Math.max(0, placement === 'below' ? below : above)

  const top =
    placement === 'below'
      ? anchor.top + anchor.height + POPOVER_GAP
      : anchor.top - POPOVER_GAP - Math.min(panel.height, maxHeight)

  // Left-aligned with the field, then slid back inside the window. A panel
  // wider than the window itself pins to the left margin rather than being
  // centred on an overflow.
  const widest = viewport.width - panel.width - VIEWPORT_MARGIN
  const left = clamp(anchor.left, VIEWPORT_MARGIN, widest)

  return { top, left, placement, maxHeight }
}

// ---------------------------------------------------------------------------
// A popover anchored to a *cell* rather than to a field (section 24c).
//
// The difference matters. A field's panel wants to be under the field, because
// that is where the eye already is. A calendar cell's panel wants to be beside
// the cell, because the cell is the thing being talked about and covering it
// with the panel that describes it is no help — and because a month grid puts
// the anchor hard against the right edge of the window one week in four.
//
// So this one flips horizontally, not vertically, and slides rather than
// flipping when it runs out of room at the bottom: a quick-create form is short
// enough that shifting it up a hundred pixels keeps it fully on screen, where
// flipping it above the cell would put it somewhere the reader is not looking.

/**
 * How close to the right edge the anchor has to be before the panel opens to
 * its left. Section 24c fixes this at 340px: wide enough that the panel is
 * never squeezed, narrow enough that it does not flip on a cell that had room.
 */
export const CELL_FLIP_MARGIN = 340

export type Side = 'right' | 'left'

export interface PlacedCell {
  top: number
  left: number
  side: Side
}

export function placeCellPopover(anchor: Box, panel: Box, viewport: Viewport): PlacedCell {
  // Room measured from the anchor's own right edge, which is where the panel
  // would start — measuring from its left would flip a wide cell too early.
  const roomRight = viewport.width - (anchor.left + anchor.width)
  const side: Side = roomRight >= CELL_FLIP_MARGIN ? 'right' : 'left'

  const wanted =
    side === 'right'
      ? anchor.left + anchor.width + POPOVER_GAP
      : anchor.left - POPOVER_GAP - panel.width

  // Even the flipped side can run out of room on a narrow window, so the
  // result is clamped either way rather than trusted.
  const left = clamp(wanted, VIEWPORT_MARGIN, viewport.width - panel.width - VIEWPORT_MARGIN)

  // Top-aligned with the cell, then shifted up by exactly as much as it takes
  // to fit. Never below the top margin: a panel taller than the window pins to
  // the top and scrolls internally rather than losing its own header.
  const top = clamp(
    anchor.top,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, viewport.height - panel.height - VIEWPORT_MARGIN),
  )

  return { top, left, side }
}
