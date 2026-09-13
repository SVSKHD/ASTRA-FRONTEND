import { nextTick, ref, type Directive } from 'vue'

// Focus (and select) the field a directive sits on as soon as it mounts. Works on
// a bare element or on a library control (TextInput, TextArea, Select), whose
// root is a wrapper: the first focusable element inside it takes the focus.
export const vFocusField: Directive<HTMLElement> = {
  mounted: (el) =>
    nextTick(() => {
      const target =
        (el.matches('input, textarea')
          ? el
          : el.querySelector<HTMLElement>('input, textarea, button, [tabindex]')) ?? el
      target.focus()
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
        target.select()
    }),
}

// Double-click-to-edit for the read-only detail panes (todos, tasks, goals).
// One field is edited at a time, keyed by an arbitrary string ('title',
// 'sub:12', …). Enter or blur commits through `onCommit`; Escape cancels.
// Committing clears `editing` first, so the blur that follows an Enter is a no-op.
export function useInlineEdit(onCommit: (key: string, value: string) => void) {
  const editing = ref<string | null>(null)
  const draft = ref('')

  function start(key: string, value: string | number | null | undefined) {
    editing.value = key
    draft.value = value == null ? '' : String(value)
  }
  function cancel() {
    editing.value = null
  }
  function commit() {
    const key = editing.value
    editing.value = null
    if (key) onCommit(key, draft.value)
  }
  function isEditing(key: string) {
    return editing.value === key
  }
  // For pickers (Select, GlassDatePicker) that hand back a finished value rather
  // than being typed into: set it and commit in one step.
  function pick(key: string, value: unknown) {
    start(key, typeof value === 'string' ? value : '')
    commit()
  }

  return { editing, draft, start, cancel, commit, isEditing, pick, vFocus: vFocusField }
}
