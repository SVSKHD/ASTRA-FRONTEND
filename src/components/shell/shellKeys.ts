// The two things the shell publishes about itself (section 44).
//
// A MODULE, NOT `provide`/`inject`, and the reason is worth stating because the
// first attempt used provide and silently did nothing.
//
// `inject` walks the COMPONENT INSTANCE parent chain, and neither consumer is
// below the shell on that chain:
//
//   • `useScrollMemory` is called in `WorkspaceView`'s setup, which is the
//     shell's PARENT. Nothing a child provides is ever visible to its parent.
//   • `<ListToolbar>` lives inside a tab, and the tab is passed to the shell as
//     SLOT CONTENT. Slot content's instance parent is the component that
//     declared it — the workspace, again — not the component that renders it.
//
// So both lookups resolved to their defaults, the toolbar never teleported and
// the scroll offset was measured on a window that does not scroll. A module
// scope has no such geometry: there is exactly one shell mounted at a time, and
// this is it.
//
// Registration is refcounted rather than a bare assignment so an unmount cannot
// clear a shell that a remount has already replaced — which is the order Vue
// uses during a route change.

import { ref, type Ref } from 'vue'

/**
 * The shell's scrolling element, or `null` when there is no shell.
 *
 * `null` means "the document is the scroller", which is what the share page,
 * the 404 and the screenshot stage want.
 */
export const shellScroller: Ref<HTMLElement | null> = ref(null)

/**
 * True once the strip's teleport target is in the DOM.
 *
 * `<ListToolbar>` reads it to decide whether to teleport its row into the top
 * status strip or render where it stands. False outside a shell, so a toolbar
 * mounted bare behaves exactly as it always did.
 */
export const shellStripReady: Ref<boolean> = ref(false)

/** The id of the strip's action slot. One name, used by the shell and the toolbar. */
export const STRIP_ACTIONS_ID = 'shell-strip-actions'

let mounted = 0

export function registerShell(scroller: HTMLElement | null): void {
  mounted += 1
  shellScroller.value = scroller
  shellStripReady.value = true
}

export function unregisterShell(): void {
  mounted = Math.max(0, mounted - 1)
  if (mounted > 0) return
  shellScroller.value = null
  shellStripReady.value = false
}

/** Test seam: put the module back the way a fresh import would have it. */
export function resetShellRegistration(): void {
  mounted = 0
  shellScroller.value = null
  shellStripReady.value = false
}
