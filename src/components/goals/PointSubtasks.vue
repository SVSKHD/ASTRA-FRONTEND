<script setup lang="ts">
// A point's subtasks: the checkboxes progress is made of (spec 3.3, 4).
//
// Each is the library Checkbox, so it is a real labelled control — Space ticks
// it, a screen reader reads its title. Double-click a title to rename it;
// Enter or blur saves, Escape keeps the old one. Drag the handle to reorder.
// A closed milestone shows them read-only until it is reopened.
import { nextTick, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import Checkbox from '@/components/ui/Checkbox.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Icon from '@/components/ui/Icon.vue'
import type { Subtask } from '@/types'

const props = defineProps<{ pointId: number; subtasks: Subtask[]; locked?: boolean }>()
const app = useAppStore()

const draft = ref('')
const addField = ref<InstanceType<typeof TextInput> | null>(null)
function add() {
  if (app.addSubtask(props.pointId, draft.value) != null) draft.value = ''
}

// --- renaming ------------------------------------------------------------------
const editing = ref<number | null>(null)
const editText = ref('')
async function startEdit(st: Subtask) {
  if (props.locked) return
  editing.value = st.id
  editText.value = st.title
  await nextTick()
  ;(
    document.querySelector(`[data-subtask-edit="${st.id}"] input`) as HTMLInputElement | null
  )?.focus()
}
function commitEdit(st: Subtask) {
  if (editing.value !== st.id) return
  editing.value = null
  if (editText.value.trim() && editText.value.trim() !== st.title)
    app.renameSubtask(props.pointId, st.id, editText.value)
}

// --- reordering ----------------------------------------------------------------
const dragId = ref<number | null>(null)
function onDrop(index: number) {
  if (dragId.value != null) app.moveSubtask(props.pointId, dragId.value, index)
  dragId.value = null
}

defineExpose({ focusAdd: () => addField.value?.focus() })
</script>

<template>
  <div class="psub" :class="{ 'is-locked': locked }">
    <ul
      class="psub__list"
      :aria-label="`Subtasks, ${subtasks.filter((s) => s.completed).length} of ${subtasks.length} done`"
    >
      <li
        v-for="(st, i) in subtasks"
        :key="st.id"
        class="psub__row"
        :class="{ 'is-dragging': dragId === st.id }"
        :draggable="!locked && editing !== st.id"
        @dragstart="dragId = st.id"
        @dragend="dragId = null"
        @dragover.prevent
        @drop="onDrop(i)"
      >
        <span v-if="!locked" class="psub__grip" aria-hidden="true">
          <Icon name="grip" size="xs" />
        </span>
        <span v-if="editing === st.id" class="psub__edit" :data-subtask-edit="st.id">
          <TextInput
            v-model="editText"
            size="sm"
            aria-label="Subtask title"
            @keydown.enter.prevent="commitEdit(st)"
            @keydown.esc="editing = null"
            @blur="commitEdit(st)"
          />
        </span>
        <span v-else class="psub__check" @dblclick="startEdit(st)">
          <Checkbox
            :model-value="st.completed"
            :label="st.title"
            :disabled="locked"
            @update:model-value="app.toggleSubtask(pointId, st.id)"
          />
        </span>
        <button
          v-if="!locked && editing !== st.id"
          type="button"
          class="psub__icon"
          :aria-label="`Delete subtask ${st.title}`"
          title="Delete subtask"
          @click="app.removeSubtask(pointId, st.id)"
        >
          <Icon name="x" size="xs" />
        </button>
      </li>
    </ul>
    <form v-if="!locked" class="psub__add" @submit.prevent="add">
      <TextInput
        ref="addField"
        v-model="draft"
        size="sm"
        icon="plus"
        placeholder="Add a subtask…"
        aria-label="New subtask"
      />
    </form>
  </div>
</template>

<style scoped>
.psub {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-1) 0 var(--sp-1) var(--sp-3);
  border-left: 2px solid color-mix(in oklch, var(--theme-dim) 20%, transparent);
}
.psub__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.psub__row {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
  /* A comfortable touch target without making the desktop list airy. */
  min-height: 32px;
  padding: 2px var(--sp-1);
  border-radius: var(--radius-sm);
}
.psub__row:hover {
  background: color-mix(in oklch, var(--theme-text) 4%, transparent);
}
.psub__row.is-dragging {
  opacity: 0.5;
}
.psub__grip {
  display: inline-grid;
  place-items: center;
  color: var(--theme-dim);
  cursor: grab;
  opacity: 0;
  transition: opacity var(--dur-fast, 0.15s) ease;
}
.psub__row:hover .psub__grip {
  opacity: 0.6;
}
@media (hover: none) {
  .psub__grip {
    opacity: 0.6;
  }
  .psub__row {
    min-height: 44px;
  }
}
.psub__check,
.psub__edit {
  flex: 1;
  min-width: 0;
}
.psub__check :deep(.ui-check) {
  width: 100%;
  font-size: var(--text-sm);
}
.psub__icon {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  opacity: 0;
}
.psub__row:hover .psub__icon,
.psub__icon:focus-visible {
  opacity: 1;
}
@media (hover: none) {
  .psub__icon {
    opacity: 1;
  }
}
.psub__icon:hover {
  background: color-mix(in oklch, var(--theme-danger) 14%, transparent);
  color: var(--theme-danger);
}
.psub__add {
  display: flex;
  max-width: 420px;
}
.psub__add > * {
  flex: 1;
}
</style>
