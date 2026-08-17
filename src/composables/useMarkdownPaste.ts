// Binds the paste decision (utils/mdPaste) to a textarea.
//
// The composable owns only the DOM part — reading the clipboard, splicing the
// result into the value, restoring the caret, and offering the one-click
// reversal. Every judgement about *what* to insert lives in the pure module, so
// the interesting behaviour is tested without a browser.

import type { Ref } from 'vue'
import {
  decidePaste,
  normalizeMarkdown,
  pasteToastLabel,
  readClipboard,
  spliceText,
} from '@/utils/mdPaste'

export interface MarkdownPasteOptions {
  // The textarea being pasted into.
  el: Ref<HTMLTextAreaElement | null>
  // Current source, and how to write a new one back.
  getValue: () => string
  setValue: (value: string, caret: number) => void
  // Shown after a paste that did something non-obvious, with a one-click undo.
  // Left undefined in contexts with no toast (a test, a preview).
  notify?: (message: string, undo: () => void, actionLabel: string) => void
}

export function useMarkdownPaste(options: MarkdownPasteOptions) {
  async function onPaste(event: ClipboardEvent): Promise<void> {
    const el = options.el.value
    if (!el) return
    const flavours = readClipboard(event)
    if (!flavours.text && !flavours.html) return
    // The browser's own paste is always prevented: even the "plain" branch
    // normalises line endings and spacing before the text lands.
    event.preventDefault()

    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? start
    const value = options.getValue()
    const selection = value.slice(start, end)

    const decision = await decidePaste(flavours, selection)
    const spliced = spliceText(value, start, end, decision.text)
    options.setValue(spliced.value, spliced.start)
    place(el, spliced.start)

    const label = pasteToastLabel(decision.source)
    if (!label || !options.notify) return
    // The reversal re-runs the same splice with the plain-text flavour, over
    // the range the paste just filled — so it is a true undo of this paste and
    // not a blanket undo of whatever came before it.
    const plain = normalizeMarkdown(decision.plain)
    options.notify(
      label,
      () => {
        const current = options.getValue()
        // Only reverse if the pasted text is still where it was left; an edit
        // in between means the offsets no longer describe this paste.
        if (current.slice(start, start + decision.text.length) !== decision.text) return
        const back = spliceText(current, start, start + decision.text.length, plain)
        options.setValue(back.value, back.start)
        place(options.el.value, back.start)
      },
      'Paste as plain text',
    )
  }

  return { onPaste }
}

// Put the caret back where the paste left it. The value round-trips through
// Vue, so this waits a frame for the textarea to hold the new text.
function place(el: HTMLTextAreaElement | null, caret: number): void {
  if (!el) return
  requestAnimationFrame(() => {
    el.focus()
    el.setSelectionRange(caret, caret)
  })
}
