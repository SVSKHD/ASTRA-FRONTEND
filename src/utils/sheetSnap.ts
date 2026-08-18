// Drag-to-dismiss maths for the mobile bottom sheet (section 18a). Pure, because
// the interesting part is the decision — where a release lands — and that is
// worth testing without a touchscreen.
//
// Everything is expressed as a downward translate in pixels from fully open:
// offset 0 is the full sheet, a larger offset has pushed more of it below the
// fold. Two snap points, `full` and `half`; releasing below the dismiss line, or
// flicking downwards fast enough, closes instead of snapping.

export type SheetSnap = 'full' | 'half'

// At the half snap, 40% of the sheet is below the fold — so a sheet sized to
// 85vh shows a little over half the viewport, which is the "60%" the spec asks
// for once the scrim above it is counted.
const HALF_HIDDEN = 0.4
// Released past this much of the sheet dragged away, it closes rather than
// snapping back up.
const DISMISS_AT = 0.55
// A downward flick closes regardless of distance. px/ms — roughly a fast thumb
// swipe, slow enough to be reachable and fast enough not to fire on a scroll.
const FLICK_VELOCITY = 0.6
// Dragging upwards past full is resisted rather than blocked, so the sheet feels
// attached to the thumb instead of stuck.
const OVERDRAG_DAMPING = 0.25

export function offsetFor(snap: SheetSnap, height: number): number {
  return snap === 'full' ? 0 : Math.max(0, height) * HALF_HIDDEN
}

// The offset to actually render for a raw drag. Downward travel is 1:1; upward
// travel past the full position is damped.
export function clampOffset(offset: number, height: number): number {
  if (offset >= 0) return Math.min(offset, Math.max(0, height))
  void height
  return offset * OVERDRAG_DAMPING
}

// Where a release lands. `velocity` is positive downwards, in px/ms.
export function snapFor(offset: number, height: number, velocity = 0): SheetSnap | 'dismiss' {
  const span = Math.max(1, height)
  // A deliberate flick beats position: a short fast swipe down should close even
  // from the full position, and a fast swipe up should open from the half one.
  if (velocity >= FLICK_VELOCITY) return offset > 0 ? 'dismiss' : 'half'
  if (velocity <= -FLICK_VELOCITY) return 'full'
  const travelled = offset / span
  if (travelled >= DISMISS_AT) return 'dismiss'
  // Between the two snap points, the nearer one wins.
  return travelled >= HALF_HIDDEN / 2 ? 'half' : 'full'
}

// Velocity from the last pointer sample. Guards a zero (or negative) time delta,
// which a coalesced pointer event can produce and which would otherwise make the
// velocity infinite and dismiss on any touch.
export function velocityOf(deltaPx: number, deltaMs: number): number {
  if (!(deltaMs > 0)) return 0
  return deltaPx / deltaMs
}
