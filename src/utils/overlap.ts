// The overlap detector's arithmetic (section 21c).
//
// Section 21c's layout rules — grid and flex only, `min-width: 0` on any child
// holding text, ellipsis on single-line labels, no absolute positioning for
// anything readable — all exist to prevent one thing: two pieces of text
// landing on top of each other, or one running off the edge of what holds it.
//
// Rules like that are kept by being checked. This is the checkable part: given
// the boxes the browser actually laid out, which pairs are sitting on top of
// each other in a way no layout intended, and which boxes have spilled out of
// their container. The DOM walking and the reporting live in the component; it
// is all here so the judgement calls can be argued with in a test rather than
// squinted at on a page.

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

// Text is antialiased and sub-pixel positioned, and adjacent boxes in a flow
// routinely share an edge. A pair has to be more than a hair into each other
// before it means anything.
export const OVERLAP_TOLERANCE = 2

export function overlapOf(a: Box, b: Box): { x: number; y: number } {
  return {
    x: Math.min(a.right, b.right) - Math.max(a.left, b.left),
    y: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
  }
}

// Both axes, not either: two boxes stacked in a column share a horizontal span
// and overlap on x for their whole width. Only when they intrude on each other
// vertically as well is one on top of the other.
export function overlaps(a: Box, b: Box, tolerance = OVERLAP_TOLERANCE): boolean {
  const { x, y } = overlapOf(a, b)
  return x > tolerance && y > tolerance
}

// One box entirely inside another is a container holding its content, which is
// what containers do. Only a partial intrusion is a collision.
export function contains(outer: Box, inner: Box, tolerance = OVERLAP_TOLERANCE): boolean {
  return (
    inner.left >= outer.left - tolerance &&
    inner.right <= outer.right + tolerance &&
    inner.top >= outer.top - tolerance &&
    inner.bottom <= outer.bottom + tolerance
  )
}

// Content wider than the box holding it: the single-line label that was
// supposed to ellipsis, or the flex child that was missing `min-width: 0`.
// Measured against the scroll width the browser reports, so a deliberately
// scrollable container is asked about separately.
export function overflowsX(clientWidth: number, scrollWidth: number, scrollable: boolean): boolean {
  return !scrollable && scrollWidth - clientWidth > OVERLAP_TOLERANCE
}

export interface Candidate {
  id: string
  box: Box
  // The DOM path, for the report.
  where: string
  // Ancestor ids, nearest first. A parent and its child are not a collision.
  ancestors: string[]
}

export interface Collision {
  a: string
  b: string
  where: string
  x: number
  y: number
}

// Which pairs are genuinely on top of each other.
//
// Excluded, in order of how often they come up:
//   an element and its own ancestor       — containment, not collision
//   a box entirely inside another         — likewise, whoever the parents are
//   anything under an opted-out subtree   — a deliberate stack says so
//
// O(n²) on purpose. This runs on one page, in development, on demand; an
// interval tree would be more code to be wrong in.
export function findCollisions(candidates: readonly Candidate[]): Collision[] {
  const out: Collision[] = []
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]
      const b = candidates[j]
      if (a.ancestors.includes(b.id) || b.ancestors.includes(a.id)) continue
      if (contains(a.box, b.box) || contains(b.box, a.box)) continue
      if (!overlaps(a.box, b.box)) continue
      const { x, y } = overlapOf(a.box, b.box)
      out.push({ a: a.where, b: b.where, where: a.where, x: Math.round(x), y: Math.round(y) })
    }
  }
  // Worst first: a 40px collision is a bug, a 3px one is usually a border.
  return out.sort((p, q) => q.x * q.y - p.x * p.y)
}
