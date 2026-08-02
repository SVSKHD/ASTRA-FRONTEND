// Pure logic behind drag-to-nest. The interaction is a second way to create the
// links that already exist (see utils/links) — this file only decides drop intent
// and which of a dragged set may legally nest under a target, reusing the same
// LinkCheck the picker uses. No parallel hierarchy.

import { LINK_REJECTION_MESSAGE, sameRef, type LinkCheck, type LinkRejection } from '@/utils/links'
import type { LinkRef } from '@/types'

export type DropZone = 'above' | 'nest' | 'below'

// Resolve intent from the pointer's vertical position within a row: top 25% =
// reorder above, middle 50% = nest as child, bottom 25% = reorder below.
export function resolveZone(offsetY: number, height: number): DropZone {
  if (height <= 0) return 'nest'
  const r = Math.max(0, Math.min(1, offsetY / height))
  if (r < 0.25) return 'above'
  if (r > 0.75) return 'below'
  return 'nest'
}

export interface NestPlan {
  valid: LinkRef[]
  skipped: { ref: LinkRef; reason: LinkRejection }[]
}

// Given the dragged refs and a per-child validity check (the caller binds this to
// the store's canLinkItems(target, child)), split into those that may nest and
// those that are skipped, with the reason. The target itself is never nested
// under itself. De-dupes the input.
export function planNest(children: LinkRef[], check: (child: LinkRef) => LinkCheck): NestPlan {
  const valid: LinkRef[] = []
  const skipped: { ref: LinkRef; reason: LinkRejection }[] = []
  const seen = new Set<string>()
  for (const child of children) {
    const key = child.collection + ':' + child.id
    if (seen.has(key)) continue
    seen.add(key)
    const res = check(child)
    if (res.ok) valid.push(child)
    else skipped.push({ ref: child, reason: res.reason ?? 'exists' })
  }
  return { valid, skipped }
}

// The toast/announcement wording after a drop. Single valid + no skips reads as a
// plain "Linked"; a mixed batch reports counts and the first skip reason.
export function nestSummary(plan: NestPlan): string {
  const linked = plan.valid.length
  const skipped = plan.skipped.length
  if (skipped === 0) return linked === 1 ? 'Linked' : `${linked} linked`
  const reason = LINK_REJECTION_MESSAGE[plan.skipped[0].reason]
  if (linked === 0) return `Couldn't link — ${reason.toLowerCase()}`
  return `${linked} linked, ${skipped} skipped — ${reason.toLowerCase()}`
}

// Auto-scroll speed (px/frame) when the pointer is within `edge` px of a scroll
// container's top/bottom, accelerating with proximity. 0 outside the zones.
export function autoScrollSpeed(pointerY: number, top: number, bottom: number, edge = 80): number {
  const maxSpeed = 14
  if (pointerY < top + edge) {
    const prox = (top + edge - pointerY) / edge
    return -Math.ceil(maxSpeed * Math.min(1, prox))
  }
  if (pointerY > bottom - edge) {
    const prox = (pointerY - (bottom - edge)) / edge
    return Math.ceil(maxSpeed * Math.min(1, prox))
  }
  return 0
}

export { sameRef }
