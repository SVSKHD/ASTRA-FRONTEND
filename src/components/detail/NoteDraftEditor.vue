<script setup lang="ts">
// The note being written inside a create dialog, before there is anything to
// attach it to (section 22b).
//
// It expands where it stands, in the dialog's one scrolling column. Not a
// second modal — a modal over a modal is two escape keys and one focus trap too
// many — and not the two-column extension either, because a create dialog has
// no saved item to put in the left column. The dialog keeps its width; only
// this section grows.
//
// Nothing here writes. The draft lives in the dialog's draft object and becomes
// a real note on ADD, in the same pass as the item (acceptance 113).
import { defineAsyncComponent, nextTick, onMounted, ref } from 'vue'
import AutoTextarea from '@/components/ui/AutoTextarea.vue'
import type { NoteDraft } from '@/utils/notesSection'

// Section 22d's lazy-mount rule: the editor and the highlighter it pulls in
// load when a note is actually created, never on dialog mount.
const NoteEditor = defineAsyncComponent(() => import('@/components/notes/NoteEditor.vue'))

const props = defineProps<{ modelValue: NoteDraft }>()
const emit = defineEmits<{ 'update:modelValue': [NoteDraft]; discard: [] }>()

const titleField = ref<InstanceType<typeof AutoTextarea> | null>(null)

function patch(next: Partial<NoteDraft>) {
  emit('update:modelValue', { ...props.modelValue, ...next })
}

// Focus lands in the title, for the same reason "+ New note" does in the note
// column: a note with a name is findable, and the first line of a body is not
// always one.
onMounted(async () => {
  await nextTick()
  titleField.value?.focus()
})
</script>

<template>
  <div class="ndraft">
    <div class="ndraft__head">
      <AutoTextarea
        ref="titleField"
        class="ndraft__title"
        variant="title"
        label="Note title"
        placeholder="Untitled note"
        :model-value="modelValue.title"
        @update:model-value="patch({ title: $event })"
      />
      <button type="button" class="ndraft__discard" @click="emit('discard')">Discard</button>
    </div>

    <NoteEditor
      compact
      :model-value="modelValue.text"
      placeholder="Write in markdown"
      @update:model-value="patch({ text: $event })"
    />

    <p class="ndraft__hint">Saved with the item — cancel here and nothing is written.</p>
  </div>
</template>

<style scoped>
.ndraft {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  /* Nothing floats and nothing is absolutely positioned: the section grows
     inside the column it already sits in (section 22e). */
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: color-mix(in oklch, var(--theme-text) 3%, transparent);
}
.ndraft__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--sp-2);
  min-width: 0;
}
.ndraft__title {
  width: 100%;
  min-width: 0;
}
.ndraft__discard {
  flex-shrink: 0;
  padding: 2px var(--sp-2);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  cursor: pointer;
}
.ndraft__discard:hover {
  color: var(--theme-text);
  border-color: var(--theme-accent);
}
.ndraft__hint {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
</style>
