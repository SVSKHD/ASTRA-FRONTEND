// The drill-in stack behind the detail dialog (section 18c/18d). Clicking a
// subtask inside a task swaps the dialog's content and leaves a back path;
// clicking an attached task inside a goal does the same. The stack is what makes
// the back arrow correct rather than approximate.
//
// Two rules earn their keep here:
//
//   - Re-entering a frame already on the stack UNWINDS to it rather than pushing
//     a second copy. A ⇄ B ⇄ A is a very easy loop to walk into (a subtask lists
//     its parent in the breadcrumb), and a naive push would grow the stack
//     forever and make "back" mean "forward" from the reader's point of view.
//   - Replacing the top (the prev/next arrows) never touches the frames beneath,
//     so stepping through siblings keeps whatever back path you arrived with.

import type { DetailKind, DetailTarget } from '@/utils/detailUrl'

export interface DetailFrame {
  kind: DetailKind
  id: number
}

export function frameKey(frame: DetailFrame): string {
  return `${frame.kind}:${frame.id}`
}

export function sameFrame(a: DetailFrame | null, b: DetailFrame | null): boolean {
  if (!a || !b) return a === b
  return a.kind === b.kind && a.id === b.id
}

export function topOf(stack: DetailFrame[]): DetailFrame | null {
  return stack.length ? stack[stack.length - 1] : null
}

// Opening from a list always starts a fresh path — an old back arrow pointing at
// something the reader has since navigated away from would be a lie.
export function openStack(frame: DetailTarget): DetailFrame[] {
  return [{ kind: frame.kind, id: frame.id }]
}

// Drill in. Returns the same array reference when the frame is already on top,
// so a double click cannot deepen the stack.
export function pushFrame(stack: DetailFrame[], frame: DetailFrame): DetailFrame[] {
  if (sameFrame(topOf(stack), frame)) return stack
  const existing = stack.findIndex((f) => sameFrame(f, frame))
  // Already somewhere below: unwind to it rather than stacking a duplicate.
  if (existing >= 0) return stack.slice(0, existing + 1)
  return [...stack, { kind: frame.kind, id: frame.id }]
}

// The back arrow. Popping the last frame is not a close — the caller decides
// what an empty stack means — so this simply never returns fewer than zero.
export function popFrame(stack: DetailFrame[]): DetailFrame[] {
  return stack.length > 1 ? stack.slice(0, -1) : []
}

// The prev/next arrows: the reader is still at the same depth, looking at a
// sibling.
export function replaceTop(stack: DetailFrame[], frame: DetailFrame): DetailFrame[] {
  if (!stack.length) return openStack(frame)
  if (sameFrame(topOf(stack), frame)) return stack
  // Stepping onto something already below us is the same unwind as pushFrame's:
  // keep one copy, and let it be the one the back path already knows about.
  const existing = stack.findIndex((f) => sameFrame(f, frame))
  if (existing >= 0 && existing < stack.length - 1) return stack.slice(0, existing + 1)
  return [...stack.slice(0, -1), { kind: frame.kind, id: frame.id }]
}

export function canGoBack(stack: DetailFrame[]): boolean {
  return stack.length > 1
}

// The frame the back arrow would land on, for its tooltip.
export function parentFrame(stack: DetailFrame[]): DetailFrame | null {
  return stack.length > 1 ? stack[stack.length - 2] : null
}

// --- sibling stepping (the header's prev/next, and j/k) ----------------------
// `siblings` is the id list of the list the dialog was opened from, in the order
// the reader sees it — already filtered and sorted by the view. Stepping is only
// offered at the root of the stack: two levels deep, "next" has no meaning the
// reader could predict.

export interface StepResult {
  prevId: number | null
  nextId: number | null
}

export function stepIds(siblings: number[], currentId: number): StepResult {
  const at = siblings.indexOf(currentId)
  if (at === -1) return { prevId: null, nextId: null }
  return {
    prevId: at > 0 ? siblings[at - 1] : null,
    nextId: at < siblings.length - 1 ? siblings[at + 1] : null,
  }
}
