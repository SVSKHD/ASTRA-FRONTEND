// The application shell's geometry (section 44).
//
// WHY THIS EXISTS. Three pieces of chrome — the reminder pill, the sync pill and
// the bottom-right action cluster — were each `position: fixed` with no space
// reserved for them anywhere. That is not a stacking problem and no z-index
// fixes it: an element taken out of flow occupies no room, so whatever is in
// flow underneath is free to grow into the same pixels. The reminder pill sat
// over "+ New todo", and the action cluster sat over the last rows of the
// trades table, because in both cases the layout had never been told they were
// there.
//
// The fix is to give every persistent element a REGION, and to make the content
// area the only thing that scrolls:
//
//     ┌──────┬─────────────────────────┐
//     │      │  strip   (status + page header actions + reminder)
//     │ rail ├─────────────────────────┤
//     │      │  content (min-height:0, overflow-y:auto)
//     │      ├─────────────────────────┤
//     │      │  bar     (sync + actions)
//     └──────┴─────────────────────────┘
//
// `min-height: 0` on the content row is the load-bearing declaration. A grid
// track's default `min-height: auto` refuses to shrink below its content, so
// without it the content row grows to the height of the whole month, the grid
// grows past the viewport, and the bar is pushed off the bottom of the screen —
// which is the same bug in a new costume.
//
// It is a module rather than inline styles for the same reason `workspaceStage`
// is: the rules that matter here are things that must NOT come back, and an
// absence is only enforceable if a test can read it.

/** The bottom utility bar's height, in px. Content reserves exactly this. */
export const BAR_HEIGHT = 52
/** Phones give the bar a little more room; a thumb is not a cursor. */
export const BAR_HEIGHT_PHONE = 56
/** The rail's width on a desktop, and on a tablet where it is narrower. */
export const RAIL_WIDTH = 76
export const RAIL_WIDTH_TABLET = 60
/** The top strip's minimum height. It grows if a page's actions wrap. */
export const STRIP_MIN_HEIGHT = 56
/**
 * How wide the reminder pill is allowed to get before it truncates.
 *
 * A fixed maximum rather than a flex share: the pill shares its row with the
 * page's own header actions, and a long reminder title with room to grow will
 * push a button off the edge rather than eat its own tail. Truncation is what
 * keeps the two from ever negotiating for the same pixels.
 */
export const REMINDER_MAX_WIDTH = 260
export const REMINDER_MAX_WIDTH_PHONE = 150

export interface ShellInput {
  isPhone: boolean
  isTablet: boolean
}

/** The bar height for this breakpoint, in px. */
export function barHeight(isPhone: boolean): number {
  return isPhone ? BAR_HEIGHT_PHONE : BAR_HEIGHT
}

export function railWidth({ isPhone, isTablet }: ShellInput): number {
  if (isPhone) return 0
  return isTablet ? RAIL_WIDTH_TABLET : RAIL_WIDTH
}

/**
 * The shell grid.
 *
 * `100dvh`, not `100vh`: on a phone `vh` is measured against the viewport with
 * the URL bar retracted, so a `100vh` shell is permanently taller than what can
 * be seen and the bottom bar lives under the browser chrome — which is the
 * overlap this whole module exists to end, reintroduced by a unit.
 *
 * On a phone the rail becomes a bottom row rather than a left column: a 76px
 * column out of 390 is a fifth of the screen given to navigation.
 */
export function shellGeometry({ isPhone, isTablet }: ShellInput) {
  if (isPhone) {
    return {
      display: 'grid',
      gridTemplateAreas: '"strip" "content" "bar" "rail"',
      gridTemplateColumns: 'minmax(0, 1fr)',
      // content is the only track allowed to take the slack, and the only one
      // allowed to shrink: `minmax(0, 1fr)` is `min-height: 0` for a track.
      gridTemplateRows: 'auto minmax(0, 1fr) auto auto',
      height: '100dvh',
      // The shell itself never scrolls. If it did, the bar would scroll away
      // with the content and we would be back to chrome that is not where it
      // says it is.
      overflow: 'hidden',
      position: 'relative',
      zIndex: 2,
    } as const
  }
  return {
    display: 'grid',
    gridTemplateAreas: '"rail strip" "rail content" "rail bar"',
    gridTemplateColumns: railWidth({ isPhone, isTablet }) + 'px minmax(0, 1fr)',
    gridTemplateRows: 'auto minmax(0, 1fr) auto',
    height: '100dvh',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 2,
  } as const
}

/**
 * The content region — the one scrollport in the shell.
 *
 * `minHeight: 0` is repeated here as well as in the track definition because a
 * grid ITEM also defaults to `min-height: auto`, and a track that can shrink
 * holding an item that cannot is a track that cannot shrink.
 *
 * `paddingBottom` reserves the bar's height a second time, inside the scroll.
 * The bar already has its own row and cannot cover anything — but a reader
 * scrolled to the final row of a table wants that row clear of the chrome, not
 * flush against it, and on a phone the safe-area inset can grow the bar after
 * layout. Belt and braces, and the braces are the cheap half.
 */
export function contentGeometry({ isPhone }: { isPhone: boolean }) {
  return {
    gridArea: 'content',
    position: 'relative',
    minHeight: 0,
    minWidth: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    // Momentum scrolling on iOS, and a scroll container that does not chain its
    // overscroll up to the document behind the starfield.
    overscrollBehaviorY: 'contain',
    paddingBottom: barHeight(isPhone) + 'px',
  } as const
}

export function stripGeometry({ isPhone }: { isPhone: boolean }) {
  return {
    gridArea: 'strip',
    // THE POSITIONING CONTEXT FOR THE PAGE TITLE, and its absence was a bug you
    // could see from across the room.
    //
    // The strip centres the current tab's name in it with `position: absolute;
    // left: 50%; top: 50%`. With the strip left `static`, the nearest positioned
    // ancestor was the SHELL — which is `position: relative` and the size of the
    // window — so "Dashboard" was being centred on the whole screen and landed
    // in the middle of whatever the tab was showing. On Trades that is the
    // middle of the trades table.
    //
    // 50% of a 56px strip, or 50% of a 1100px shell: the rule is the same and
    // only one of them is the row the title belongs to.
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    // The page's own header actions sit on the left of this row and the
    // reminder sits on the right. They wrap onto two lines rather than
    // overlapping when there is no room for both.
    flexWrap: 'wrap',
    gap: 'var(--sp-3)',
    minWidth: 0,
    minHeight: STRIP_MIN_HEIGHT + 'px',
    padding: isPhone
      ? 'calc(8px + env(safe-area-inset-top, 0px)) 12px 8px'
      : 'calc(10px + env(safe-area-inset-top, 0px)) 20px 10px',
  } as const
}

export function barGeometry({ isPhone }: { isPhone: boolean }) {
  return {
    gridArea: 'bar',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    minWidth: 0,
    height: barHeight(isPhone) + 'px',
    padding: isPhone ? '0 10px' : '0 16px',
  } as const
}

export function railGeometry({ isPhone, isTablet }: ShellInput) {
  if (isPhone) {
    return {
      gridArea: 'rail',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 0,
      height: '64px',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    } as const
  }
  return {
    gridArea: 'rail',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
    width: railWidth({ isPhone, isTablet }) + 'px',
    padding: '10px 0',
  } as const
}
