// useDraft — draft-resume for any editable surface, implemented once (section 8).
//
// Bind it to a form's reactive state and it will: autosave that state as a draft
// (debounced after typing stops, and flushed on tab-hide and unmount); on open,
// offer a newer draft back — silently restoring a same-device/create draft with
// a dismissible bar, or asking Use/Ignore for one written on another device; and
// clear the draft on a successful save or an explicit discard.
//
// It is target-reactive: the entity type and id may be refs/getters, so a single
// long-lived host (e.g. the one shared item dialog) can point the composable at
// whatever it is currently editing and the draft slot follows.
//
// Returns { hasDraft, restoredAt, discard } from the spec, plus fromOtherDevice
// and the applyDraft/ignore/clear/flush actions the resume bar and the host need.

import { onBeforeUnmount, onMounted, ref, unref, watch, type Ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { decideDraft, draftKey, type DraftRecord } from '@/utils/drafts'

type MaybeGetter<T> = T | Ref<T> | (() => T)

function read<T>(source: MaybeGetter<T>): T {
  return typeof source === 'function' ? (source as () => T)() : unref(source as Ref<T> | T)
}

export interface UseDraftOptions {
  // Saved entity's updatedAt, to compare a draft against. 0 (the default) means a
  // create form, where any draft is newer and gets offered back.
  entityUpdatedAt?: () => number
  // Form snapshot to revert to on discard. Without it, discard just clears flags.
  baseline?: () => Record<string, unknown>
  // Debounce for autosave after the last keystroke.
  debounceMs?: number
  // Return true to skip saving (e.g. an untouched/blank form); such a state
  // deletes any existing draft instead of storing an empty one.
  isEmpty?: (payload: Record<string, unknown>) => boolean
  // Set false to require an explicit "Use" even for a same-device draft.
  autoRestore?: boolean
}

export function useDraft(
  entityType: MaybeGetter<string>,
  entityId: MaybeGetter<number | null>,
  formState: Ref<Record<string, unknown>>,
  options: UseDraftOptions = {},
) {
  const app = useAppStore()
  const debounceMs = options.debounceMs ?? 800

  const hasDraft = ref(false)
  const restoredAt = ref<number | null>(null)
  const fromOtherDevice = ref(false)
  // A draft awaiting the user's choice (another device, or autoRestore:false).
  let pending: DraftRecord | null = null

  let timer: ReturnType<typeof setTimeout> | undefined
  // While applying a restore we must not treat the resulting form change as a
  // fresh edit and re-save it.
  let suspended = false
  // The type/id the pending autosave belongs to, so a target switch can flush the
  // previous slot with the previous key rather than the new one.
  let activeType = ''
  let activeId: number | null = null

  function currentKey(): string {
    const type = read(entityType)
    return type ? draftKey(type, read(entityId)) : ''
  }

  function persistFor(type: string, id: number | null) {
    if (!type) return
    const payload = formState.value
    if (options.isEmpty?.(payload)) {
      app.deleteDraft(type, id)
      return
    }
    app.saveDraft(type, id, payload)
  }
  function schedule() {
    if (suspended) return
    const type = read(entityType)
    if (!type) return
    clearTimeout(timer)
    timer = setTimeout(() => persistFor(type, read(entityId)), debounceMs)
  }
  function flush() {
    clearTimeout(timer)
    if (activeType) persistFor(activeType, activeId)
  }

  function resetFlags() {
    hasDraft.value = false
    restoredAt.value = null
    fromOtherDevice.value = false
    pending = null
  }

  function apply(record: DraftRecord) {
    suspended = true
    clearTimeout(timer)
    formState.value = { ...formState.value, ...record.payload }
    restoredAt.value = record.updatedAt
    hasDraft.value = true
    fromOtherDevice.value = false
    pending = null
    // Release after the reactive write settles so the restore is not re-saved.
    setTimeout(() => {
      suspended = false
    }, 0)
  }

  function evaluate() {
    const type = read(entityType)
    if (!type) {
      resetFlags()
      return
    }
    const record = app.draftFor(type, read(entityId))
    const decision = decideDraft(record, options.entityUpdatedAt?.() ?? 0, app.deviceLabel)
    if (decision.action === 'restore') {
      if (options.autoRestore === false) {
        pending = decision.record
        restoredAt.value = decision.record.updatedAt
        hasDraft.value = true
      } else {
        apply(decision.record)
      }
    } else if (decision.action === 'prompt') {
      pending = decision.record
      restoredAt.value = decision.record.updatedAt
      fromOtherDevice.value = true
      hasDraft.value = true
    } else {
      resetFlags()
    }
  }

  // "Use" — apply a draft that was offered with a choice.
  function applyDraft() {
    if (pending) apply(pending)
  }
  // "Ignore" — dismiss the bar and keep the current form; the draft stays stored
  // so it can still be picked up elsewhere, but this surface stops offering it.
  function ignore() {
    resetFlags()
  }
  // Discard — delete the draft and revert the form to its baseline.
  function discard() {
    clearTimeout(timer)
    suspended = true
    app.deleteDraft(read(entityType), read(entityId))
    if (options.baseline) formState.value = { ...options.baseline() }
    resetFlags()
    setTimeout(() => {
      suspended = false
    }, 0)
  }
  // Clear — the host saved successfully, so the draft is now redundant.
  function clear() {
    clearTimeout(timer)
    app.deleteDraft(read(entityType), read(entityId))
    resetFlags()
  }

  const stopForm = watch(formState, schedule, { deep: true })
  const stopKey = watch(currentKey, (next, prev) => {
    // The target changed (or closed): flush the previous slot with its own key
    // before rebinding, then evaluate the new one.
    if (prev && prev !== next) flush()
    activeType = read(entityType)
    activeId = read(entityId)
    resetFlags()
    evaluate()
  })

  function onVisibility() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flush()
  }

  onMounted(() => {
    activeType = read(entityType)
    activeId = read(entityId)
    evaluate()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }
  })
  onBeforeUnmount(() => {
    stopForm()
    stopKey()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility)
    }
    flush()
  })

  return { hasDraft, restoredAt, fromOtherDevice, discard, applyDraft, ignore, clear, flush }
}
