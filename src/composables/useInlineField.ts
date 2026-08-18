// One inline-editable field (section 18a: "no separate edit mode, no Save
// button"). The title and description of both detail bodies bind to this.
//
// The contract the reader experiences:
//   typing         edits a local draft and schedules a write 600ms later
//   Escape         throws the draft away and puts the stored value back
//   blur / close   writes immediately rather than waiting out the debounce
//   remote change  is adopted only while the field is clean — a snapshot must
//                  never yank a half-typed sentence out from under someone
//
// `dirty` is what the shell's close guard reads: a pending write is an unsaved
// edit, and closing over one has to ask first.

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { debounce } from '@/utils/syncGuard'

export const INLINE_SAVE_MS = 600

export interface InlineFieldOptions {
  // The stored value, as a getter so it tracks.
  value: () => string
  // Called with the value to persist. Only ever called with a changed value.
  commit: (next: string) => void
  delay?: number
  // Told whenever this field's pending-write state changes, so the host can roll
  // its fields up into one dirty flag for the dialog.
  onDirty?: (dirty: boolean) => void
}

export function useInlineField(options: InlineFieldOptions) {
  const draft = ref(options.value())
  const pending = ref(false)
  const focused = ref(false)

  function setPending(next: boolean) {
    if (pending.value === next) return
    pending.value = next
    options.onDirty?.(next)
  }

  const writer = debounce(() => {
    const next = draft.value
    setPending(false)
    if (next !== options.value()) options.commit(next)
  }, options.delay ?? INLINE_SAVE_MS)

  // Adopt the stored value while the field is settled. A dirty or focused field
  // keeps what the reader typed — this is the same rule as the sync guard's, at
  // the granularity of a single input.
  watch(
    () => options.value(),
    (next) => {
      if (pending.value || focused.value) return
      draft.value = next
    },
  )

  function onInput(event: Event) {
    draft.value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
    setPending(true)
    writer.schedule()
  }
  // For editors that hand back a value rather than an event.
  function set(next: string) {
    draft.value = next
    setPending(true)
    writer.schedule()
  }
  function onFocus() {
    focused.value = true
  }
  function onBlur() {
    focused.value = false
    flush()
  }
  function flush() {
    writer.flush()
    // flush() is a no-op when nothing is scheduled, so the flag is cleared here
    // rather than relying on the debounced body having run.
    setPending(false)
  }
  // Escape reverts THIS field and stops there — the shell would otherwise read
  // the same key as "close the dialog".
  function revert() {
    writer.cancel()
    setPending(false)
    draft.value = options.value()
  }
  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    revert()
  }

  onBeforeUnmount(() => {
    // Leaving the field mounted with a scheduled write would drop it, so the
    // last thing a field does on the way out is save.
    writer.flush()
    writer.cancel()
  })

  return {
    draft,
    dirty: computed(() => pending.value),
    onInput,
    set,
    onFocus,
    onBlur,
    onKeydown,
    flush,
    revert,
  }
}
