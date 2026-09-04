// A textarea that is exactly as tall as its content (section 20b).
//
// The measurement is the old trick and there is no better one: reset the height
// to `auto` so the browser recomputes `scrollHeight` against the content rather
// than against the height we last set, then set the height to that. Skipping the
// reset makes the field grow and never shrink, which is the bug this is usually
// written to fix.
//
// It has to run on mount as well as on input: a row rendered with three lines of
// stored text starts life one line tall otherwise, which is exactly the
// truncation complained about. It also runs on window resize, because a
// narrower window rewraps the same text onto more lines.
//
// One composable so every multi-line field in the app agrees — the point rows,
// the dialog's task title, the subtask rows and the import preview.

import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export interface AutoResizeOptions {
  // Re-measure whenever this changes — the bound value, usually. A row whose
  // text is replaced from a remote snapshot has to resize without being typed in.
  watch?: () => unknown
  // Minimum rendered height in pixels. Below this the field is padded out, so a
  // list of empty rows still has a consistent rhythm.
  minHeight?: number
}

export function useAutoResizeTextarea(options: AutoResizeOptions = {}) {
  const el = ref<HTMLTextAreaElement | null>(null)

  function resize() {
    const node = el.value
    if (!node) return
    // The reset is load-bearing: scrollHeight is measured against the current
    // height, so without it the field can only ever grow.
    node.style.height = 'auto'
    const next = Math.max(node.scrollHeight, options.minHeight ?? 0)
    node.style.height = `${next}px`
  }

  // After the DOM has the new value, not before.
  function resizeSoon() {
    void nextTick(resize)
  }

  function onInput() {
    resize()
  }

  if (options.watch) {
    watch(options.watch, resizeSoon)
  }

  onMounted(() => {
    resize()
    globalThis.window?.addEventListener('resize', resize)
  })
  // Guarded on both sides, for the reason GlassDatePicker's listeners are: an
  // unmount can outlive the document — a test environment torn down while a
  // component is still unmounting — and an unguarded `window.removeEventListener`
  // there throws inside a lifecycle hook, which Vue reports as an unhandled
  // rejection rather than a test failure. That is the worst shape a bug can
  // have: every test still reports as passing while the run exits non-zero,
  // which is exactly what it was doing here.
  onBeforeUnmount(() => globalThis.window?.removeEventListener('resize', resize))

  return { el, resize, resizeSoon, onInput }
}

// The keyboard contract for a row in a list of them (section 20b).
//
// Plain Enter commits and moves on; Shift+Enter is the only way to put a
// newline inside a point. That is the inverse of a textarea's default, and it is
// the right way round here: these are checklist lines, and pressing Enter after
// typing one should start the next one, not grow the current one.
export type RowKeyAction = 'commit' | 'newline' | 'revert' | 'none'

export function rowKeyAction(event: {
  key: string
  shiftKey: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}): RowKeyAction {
  if (event.key === 'Escape') return 'revert'
  if (event.key !== 'Enter') return 'none'
  // A modifier other than Shift belongs to whatever the surrounding surface
  // binds it to (⌘↵ saves a note), so this leaves those alone.
  if (event.metaKey || event.ctrlKey || event.altKey) return 'none'
  return event.shiftKey ? 'newline' : 'commit'
}
