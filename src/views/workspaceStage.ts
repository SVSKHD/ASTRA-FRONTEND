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

/** The centring wrapper. A full screen tall, in flow, and click-through. */
export function stageWrapGeometry() {
  return {
    position: 'relative',
    zIndex: 2,
    display: 'grid',
    justifyItems: 'center',
    // dvh, not vh: on a phone `vh` is measured against the viewport with the
    // URL bar retracted, so a `100vh` shell is permanently taller than what can
    // be seen and the last row of any list sits under the browser chrome.
    minHeight: '100dvh',
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
  const width = isPhone ? '94vw' : vw < 1024 ? '92vw' : vw < 1440 ? '82vw' : '70vw'
  return {
    position: 'relative',
    pointerEvents: 'auto',
    width,
    maxWidth: 1500,
    minWidth: isPhone ? 0 : 720,
    minHeight: isPhone ? '88dvh' : '86dvh',
    margin: isPhone ? '16px 0' : '3.5dvh 0',
    display: 'flex',
    flexDirection: 'column',
  } as const
}
