// Which keystrokes the workspace's global shortcuts must keep their hands off.
//
// THE BUG THIS EXISTS FOR. The shell binds ←/→/↑/↓ on `document` to step
// through the app's tabs. A segmented control binds the same four keys to step
// through ITS options. Both were listening, so arrowing along Personal ·
// Business · All in the Finances toolbar moved the segment AND switched the
// whole workspace to another tab underneath it — one press, two answers, and
// the second one throws away what you were looking at.
//
// It was never only that control. Every listbox, menu, date grid and slider in
// the app owns the same keys, and the guard the shell had — "is the target an
// INPUT, TEXTAREA, SELECT or contenteditable" — names four ELEMENTS in a
// problem that is about ROLES. A `<button role="tab">` is none of the four.
//
// So the question is asked properly here, in one place, and answered two ways:
//
//   1. THE EVENT SAYS SO. `defaultPrevented` means something in the propagation
//      path already acted on this key. That is the general answer and it needs
//      no list — a widget that handles a key and says so is respected whether
//      or not anybody thought about it here.
//   2. THE TARGET SAYS SO. A element inside a composite widget owns the arrow
//      keys by definition of the role it carries, and the roles below are the
//      ARIA patterns that do. This catches the widget that forgot rule 1.
//
// Both, because either alone leaves a gap: a widget can consume a key without
// preventing the default, and a role can be missing from a hand-rolled control.

/**
 * The ARIA patterns whose own keyboard contract includes the arrow keys.
 *
 * Named rather than counted so a new one has to be argued for: adding a role
 * here takes four keys away from the shell inside that widget, which is right
 * for a composite control and wrong for anything else.
 */
export const WIDGET_ROLES = [
  'tablist',
  'radiogroup',
  'listbox',
  'menu',
  'menubar',
  'grid',
  'tree',
  'slider',
  'spinbutton',
  // A dialog is not an arrow-key widget, but the shell's shortcuts must not
  // reach past a modal into the page it is covering.
  'dialog',
] as const

const SELECTOR = WIDGET_ROLES.map((r) => `[role="${r}"]`).join(',')

/**
 * Rich text, by attribute rather than by the `isContentEditable` property.
 *
 * Two reasons, and the second is the one that matters. The property is not
 * implemented everywhere — jsdom leaves it false — so a check that relies on it
 * cannot be tested. And the property is only true on the editable HOST and its
 * inherited descendants; matching an ancestor with `closest` catches a keypress
 * landing on a `<code>` or a `<li>` inside the editor, which is where it
 * usually lands.
 */
const EDITABLE = '[contenteditable=""],[contenteditable="true"]'

/** Elements that swallow every key by nature, role or no role. */
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * True when this keystroke belongs to something more specific than the shell.
 *
 * Deliberately not "is the user typing": that framing is what produced the
 * tag list this replaces. The question is whether anything closer to the event
 * has a claim on the key, and a tab strip has exactly as strong a claim as a
 * text field does.
 */
export function handledByWidget(
  event: Pick<KeyboardEvent, 'defaultPrevented' | 'target'>,
): boolean {
  if (event.defaultPrevented) return true
  const el = event.target as HTMLElement | null
  if (!el || typeof el !== 'object') return false
  if (TYPING_TAGS.has(el.tagName)) return true
  if (el.isContentEditable) return true
  if (typeof el.closest !== 'function') return false
  // `closest` covers the element itself as well as its ancestors, so a control
  // that carries the role directly is caught by the same call.
  return el.closest(SELECTOR) != null || el.closest(EDITABLE) != null
}
