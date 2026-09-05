// The workspace stage's geometry (section 42), in a file a test can read.
//
// It lives outside the component because the fix it carries is a set of things
// that must NOT be there, and "must not be there" is exactly the kind of rule
// that comes back six months later in a refactor nobody connects to a bug
// report about a table being cut off. The three that broke it:
//
//   position: fixed  — the shell was out of flow, so the document had no
//                      height and nothing to scroll;
//   height: 86vh     — the stage was exactly one screen tall, forever;
//   overflow: hidden — anything past that was clipped rather than reachable,
//                      and it made the stage the scrollport that every sticky
//                      table header inside was sticking to.
//
// A transform belongs on the same list: an idle drift animation on the element
// containing every row on the page makes it the containing block for fixed
// descendants, and repaints the lot at 60fps for a three-pixel bob.

export interface StageInput {
  /** Viewport width, for the breakpoint ladder. */
  vw: number
  isPhone: boolean
}

/**
 * The centring wrapper. As tall as the region holding it, in flow, click-through.
 *
 * `100%`, not `100dvh` (section 44). The stage no longer sits in the document —
 * it sits inside the shell's content region, which is already the viewport
 * minus the strip and the bar. A `100dvh` floor inside a shorter box guarantees
 * a scrollbar on every tab including the empty ones, and puts the bottom of the
 * stage under the bar by exactly the height of the chrome. The shell is where
 * `dvh` is measured now, once, in `appShell.ts`.
 */
export function stageWrapGeometry() {
  return {
    position: 'relative',
    zIndex: 2,
    display: 'grid',
    justifyItems: 'center',
    minHeight: '100%',
    // The gutters belong to the dock and the starfield, so this must not eat
    // their clicks.
    pointerEvents: 'none',
  } as const
}

/**
 * The card itself.
 *
 * `minHeight` rather than `height` is the whole fix in one word: a floor keeps
 * the stage a screenful tall when a tab is nearly empty — starfield above and
 * below, no card floating in a void — while letting a long month be as tall as
 * it is.
 */
export function stageGeometry({ vw, isPhone }: StageInput) {
  // Percentages of the CONTENT REGION, not of the viewport: the rail has its
  // own column now, so a `vw` width would be measured against a viewport the
  // stage no longer spans and would run under the dock at every breakpoint.
  const width = isPhone ? '96%' : vw < 1024 ? '94%' : vw < 1440 ? '90%' : '82%'
  return {
    position: 'relative',
    pointerEvents: 'auto',
    width,
    maxWidth: 1500,
    minWidth: 0,
    // A floor of the region rather than of the screen, for the same reason the
    // wrapper's is: a tab with three rows should still fill the space it was
    // given, and a tab with three hundred should be as tall as it is.
    minHeight: '100%',
    margin: isPhone ? '10px 0 16px' : '14px 0 22px',
    display: 'flex',
    flexDirection: 'column',
  } as const
}
