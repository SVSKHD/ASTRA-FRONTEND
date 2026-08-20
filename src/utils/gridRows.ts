// Packing a card grid into rows, so it can be virtualised (section 19d).
//
// A virtualiser measures rows, not cells. The grid's own column count comes
// from `auto-fill`, which the browser decides — so to virtualise it we have to
// compute the same answer ourselves from the container width and then hand the
// virtualiser a list of rows rather than a list of cards.
//
// Pure, because getting the column count wrong by one is a whole-grid layout
// bug and is much easier to see in a table of cases than in a browser.

// Must match the grid's CSS: `minmax(max(300px, (100% - 3*gap)/4), 1fr)` with a
// 16px gap. Kept here as the single source and read by the stylesheet's author,
// not the other way round — a mismatch shows up as a row that renders four
// cards into three columns.
export const CARD_MIN_PX = 300
export const GRID_GAP_PX = 16
export const MAX_COLUMNS = 4
// Below this many cards the grid renders in full: virtualising a short list
// costs more than it saves, and it breaks the browser's own lazy work.
export const VIRTUALISE_FROM = 30
// The card's fixed row height, shared with the skeleton so there is no shift
// between the two (acceptance 95).
export const CARD_HEIGHT_PX = 180

// How many columns fit in `width`, capped and never below one. A container that
// has not been measured yet (width 0) reports one column rather than zero,
// which would make the row count infinite.
export function columnsFor(width: number, minPx = CARD_MIN_PX, gap = GRID_GAP_PX): number {
  if (!Number.isFinite(width) || width <= 0) return 1
  // n columns need n*min + (n-1)*gap. Solve for the largest n that fits.
  const fit = Math.floor((width + gap) / (minPx + gap))
  return Math.max(1, Math.min(MAX_COLUMNS, fit))
}

export function rowCount(items: number, columns: number): number {
  if (items <= 0) return 0
  return Math.ceil(items / Math.max(1, columns))
}

// The slice of items on a given row.
export function rowSlice<T>(items: T[], row: number, columns: number): T[] {
  const perRow = Math.max(1, columns)
  const start = row * perRow
  return items.slice(start, start + perRow)
}

// Whether this list is long enough to be worth virtualising.
export function shouldVirtualise(items: number, threshold = VIRTUALISE_FROM): boolean {
  return items > threshold
}

// The pixel height of one row including the gap beneath it — what the
// virtualiser needs to estimate scroll extent.
export function rowHeight(cardHeight = CARD_HEIGHT_PX, gap = GRID_GAP_PX): number {
  return cardHeight + gap
}
