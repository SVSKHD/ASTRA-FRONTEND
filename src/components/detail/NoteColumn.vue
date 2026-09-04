<script setup lang="ts">
// The note being read beside the thing it is attached to (section 21b).
//
// This is a note, edited the way notes are edited everywhere else in the app —
// the same markdown editor, the same autosave. What is new is only where it is:
// in the column beside the task rather than instead of it, so the note and the
// thing it is about can be read together.
//
// The title is its own field (section 21a). "+ New note" lands focus here,
// because a note with a name is findable and the first line of a body is not
// always one.
import { computed, nextTick, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useInlineField } from '@/composables/useInlineField'
import AutoTextarea from '@/components/ui/AutoTextarea.vue'
import NoteEditor from '@/components/notes/NoteEditor.vue'
import { noteRowLabel } from '@/utils/noteColumn'

const props = defineProps<{ noteId: number; autofocus?: boolean }>()

const app = useAppStore()
const { notes } = storeToRefs(app)

const note = computed(() => notes.value.find((n) => n.id === props.noteId))

// Two fields, one dirty flag, exactly as the task body does it: the shell's
// close guard reads one boolean and both columns feed it.
const pendingFields = ref(new Set<string>())
function fieldDirty(name: string) {
  return (dirty: boolean) => {
    if (dirty) pendingFields.value.add(name)
    else pendingFields.value.delete(name)
    // The names, not the count: the sheet that asks about them says which.
    app.setDetailDirty([...pendingFields.value])
  }
}

const title = useInlineField({
  value: () => note.value?.title ?? '',
  commit: (next) => app.setNoteTitle(props.noteId, next),
  onDirty: fieldDirty('title'),
})
const bodyText = useInlineField({
  value: () => note.value?.text ?? '',
  commit: (next) => app.setNoteText(props.noteId, next),
  onDirty: fieldDirty('text'),
})

const titleField = ref<InstanceType<typeof AutoTextarea> | null>(null)
onMounted(async () => {
  if (!props.autofocus) return
  await nextTick()
  titleField.value?.focus()
})

// Where else this note lives, so detaching it from here does not read as
// deleting it.
const owners = computed(() => app.noteOwners(props.noteId))
const pinned = computed(() => note.value?.pinned === true)

function onTitleCommit() {
  title.flush()
  ;(document.activeElement as HTMLElement | null)?.blur?.()
}

// Both fields go out together, and before the frame beside them — the note is
// the inner write (section 21b's ordering).
defineExpose({
  flush() {
    title.flush()
    bodyText.flush()
  },
  revert() {
    title.revert()
    bodyText.revert()
  },
  label: computed(() => (note.value ? noteRowLabel(note.value) : 'Note')),
})
</script>

<template>
  <div v-if="note" class="ncol">
    <AutoTextarea
      class="ncol__title"
      variant="title"
      label="Note title"
      placeholder="Untitled note"
      :model-value="title.draft.value"
      ref="titleField"
      @update:model-value="title.set"
      @commit="onTitleCommit"
      @revert="title.revert"
      @focus="title.onFocus"
      @blur="title.onBlur"
    />

    <div class="ncol__meta">
      <button
        type="button"
        class="ncol__chip"
        :class="pinned && 'ncol__chip--on'"
        :aria-pressed="pinned"
        @click="app.setNotePinned(noteId, !pinned)"
      >
        {{ pinned ? '★ Pinned' : '☆ Pin' }}
      </button>
      <span v-if="owners.length > 1" class="ncol__attached">
        Also attached to {{ owners.length - 1 }} other
        {{ owners.length === 2 ? 'item' : 'items' }}
      </span>
    </div>

    <!-- `narrow` because a half-width column split again is two useless
         columns; the editor falls back to source-only there. -->
    <NoteEditor
      narrow
      :model-value="bodyText.draft.value"
      placeholder="Write in markdown"
      @update:model-value="bodyText.set"
      @save="bodyText.flush()"
    />
  </div>
  <p v-else class="ncol__missing">This note is no longer in your workspace.</p>
</template>

<style scoped>
.ncol {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  min-height: 0;
  flex: 1;
}
.ncol__title {
  width: 100%;
}
.ncol__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.ncol__chip {
  padding: 2px var(--sp-2);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  cursor: pointer;
}
.ncol__chip--on {
  color: var(--theme-accent);
  border-color: var(--theme-accent);
}
.ncol__attached {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.ncol__missing {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
</style>
