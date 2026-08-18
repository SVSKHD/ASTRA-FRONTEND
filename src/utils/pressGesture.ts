// Telling a tap from a long press (section 18b).
//
// A row and a card are both "click to open" and "press and hold to drag". On a
// mouse those are different gestures the browser separates for us; on a touch
// screen they start identically, and the difference only becomes clear from how
// long the finger stayed down and how far it moved. Without this, every drag
// ends by opening the dialog for whatever was dragged.
//
// Pure, because the decision is the interesting part and a touchscreen is not
// available to the test runner.

// Long enough that a deliberate tap never crosses it, short enough that a
// press-and-hold feels acknowledged. Matches the usual platform threshold.
export const LONG_PRESS_MS = 400
// A finger is never perfectly still; anything inside this is the same point.
export const MOVE_SLOP_PX = 10

export interface PressStart {
  at: number
  x: number
  y: number
}

export function beginPress(at: number, x: number, y: number): PressStart {
  return { at, x, y }
}

export function movedBeyondSlop(start: PressStart, x: number, y: number): boolean {
  return Math.hypot(x - start.x, y - start.y) > MOVE_SLOP_PX
}

// Whether the press that started at `start` and ended at (at, x, y) should count
// as a tap — i.e. should open something.
//
// A press with no recorded start counts as a tap: that is a keyboard activation
// or a synthetic click, and refusing to open on those would break the keyboard
// path to save a touch one.
export function isTap(start: PressStart | null, at: number, x: number, y: number): boolean {
  if (!start) return true
  if (at - start.at >= LONG_PRESS_MS) return false
  return !movedBeyondSlop(start, x, y)
}
