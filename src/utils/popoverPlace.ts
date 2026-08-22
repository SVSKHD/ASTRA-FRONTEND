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
