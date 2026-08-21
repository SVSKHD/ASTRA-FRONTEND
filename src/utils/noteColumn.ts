// The note extension column (section 21b).
//
// Attaching a note to a task is only half of it. The other half is reading the
// note beside the task rather than instead of it — so the dialog grows a second
// column rather than navigating away, and the width it grows to is the reader's
// to set and keep.
//
// Everything here is arithmetic: what shape the extension takes at a given
// viewport, where a divider drag lands, and what one line of a note reads as in
// the list. The component does the rest.

// How the extension is shown. Three modes, not two, because a phone is not a
// narrow desktop:
//   'split'  two columns side by side — the desktop case
//   'over'   a full-width slide-over inside the same panel, with a back arrow
//   'sheet'  its own sheet above the dialog's
// Two half-width columns on a phone is 160px of note beside 160px of task,
// which is nobody's idea of reading it beside the task.
export type NoteColumnMode = 'split' | 'over' | 'sheet'

// Below this the panel is not wide enough for two readable columns: 1180px of
// panel split in half is ~560px each, and it degrades from there.
export const NOTE_COLUMN_BREAKPOINT = 1100

export function noteColumnMode(viewportWidth: number, mobile: boolean): NoteColumnMode {
  if (mobile) return 'sheet'
  return viewportWidth >= NOTE_COLUMN_BREAKPOINT ? 'split' : 'over'
}

// --- the divider ------------------------------------------------------------
// The split is stored as the left column's percentage. Clamped hard rather than
// softly: a column narrower than a third of the panel is a column nobody can
// read, and a reader who drags past the stop should find a stop, not a
// vanishing column they then have to fish back out.
export const SPLIT_MIN = 30
export const SPLIT_MAX = 70
export const SPLIT_DEFAULT = 50

export function clampSplit(pct: number): number {
  if (!Number.isFinite(pct)) return SPLIT_DEFAULT
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(pct)))
}

// Where a drag of `dx` pixels from `startPct` lands, given the panel's width.
// A zero-width panel cannot be divided, so the drag is ignored rather than
// dividing by it.
export function splitFromDrag(startPct: number, dx: number, panelWidth: number): number {
  if (!panelWidth) return clampSplit(startPct)
  return clampSplit(startPct + (dx / panelWidth) * 100)
}

// --- the panel --------------------------------------------------------------
// One column is the dialog as section 18 built it. Two is wider, but not
// unboundedly — a 2000px-wide note is a worse read than a 590px one.
export const PANEL_WIDTH_ONE = 720
export const PANEL_WIDTH_TWO = 1180

export function panelWidth(open: boolean, mode: NoteColumnMode): number {
  return open && mode === 'split' ? PANEL_WIDTH_TWO : PANEL_WIDTH_ONE
}

// `minmax(0, …)` on both tracks, always: a grid child defaults to a minimum of
// its content, so a long unbroken line in either column would push the other
// one off the panel rather than wrapping (section 21c).
// The middle track is the divider itself. Making it a track rather than
// something laid over the seam is what keeps the whole dialog free of absolute
// positioning (section 21c) — the divider is a column, sized by its own width.
export function columnTemplate(open: boolean, mode: NoteColumnMode, split: number): string {
  if (!open || mode !== 'split') return 'minmax(0, 1fr)'
  const left = clampSplit(split)
  return `minmax(0, ${left}fr) auto minmax(0, ${100 - left}fr)`
}

// --- the row ----------------------------------------------------------------
// What one attached note reads as in the list. A note's title is its own field
// since section 21a, but most notes do not have one, so the first line of the
// body stands in — which is exactly what the notes drawer has always shown.
export function noteRowLabel(note: { title?: string; text?: string }): string {
  const title = (note.title ?? '').trim()
  if (title) return title
  const firstLine = (note.text ?? '')
    .split('\n')
    .map((line) => line.replace(/^\s*#{1,6}\s+/, '').trim())
    .find((line) => line.length > 0)
  return firstLine || 'Untitled note'
}
