<script setup lang="ts">
// "Attach existing" (section 22b): finding a note that already exists and
// hanging it off the thing in front of you.
//
// It expands inline, inside the dialog's one scrolling column, rather than
// opening over it. That is section 22e's rule and it is also the honest shape:
// a second floating layer above a dialog is the thing that ends up rendered
// behind a field, and there is nothing here that needs to escape the flow.
//
// Multi-select, because attaching three notes one at a time means reopening the
// picker three times and losing the query each round. That is also why it is
// composed from SearchField, Checkbox and Button rather than being the
// library's Combobox: that one owns a single string value, and every control
// here still comes from src/components/ui (section 22e).
import { computed, nextTick, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { attachLabel, searchNotes, toggleSelection } from '@/utils/notePicker'
import SearchField from '@/components/ui/SearchField.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{ attachedIds: number[] }>()
const emit = defineEmits<{ attach: [number[]]; cancel: [] }>()

const app = useAppStore()
const { notes } = storeToRefs(app)

const query = ref('')
const selected = ref<number[]>([])
const search = ref<InstanceType<typeof SearchField> | null>(null)

const candidates = computed(() =>
  searchNotes(notes.value, query.value, { attachedIds: props.attachedIds }),
)
const label = computed(() => attachLabel(selected.value.length))

function toggle(id: number) {
  selected.value = toggleSelection(selected.value, id)
}
function confirm() {
  if (!selected.value.length) return
  emit('attach', selected.value.slice())
}

// The query field takes focus: the picker is a search, and landing anywhere
// else means the first thing anybody does is click into it.
onMounted(async () => {
  await nextTick()
  search.value?.$el?.querySelector?.('input')?.focus()
})
</script>

<template>
  <div
    class="npick"
    role="group"
    aria-label="Attach an existing note"
    @keydown.esc.stop="emit('cancel')"
    @keydown.enter.stop.prevent="confirm"
  >
    <SearchField
      ref="search"
      v-model="query"
      size="sm"
      label="Search notes"
      placeholder="Search titles and text…"
    />

    <ul v-if="candidates.length" class="npick__list" role="listbox" aria-multiselectable="true">
      <li
        v-for="candidate in candidates"
        :key="candidate.id"
        class="npick__row"
        role="option"
        :aria-selected="selected.includes(candidate.id)"
      >
        <Checkbox
          :model-value="selected.includes(candidate.id)"
          @update:model-value="toggle(candidate.id)"
        />
        <button type="button" class="npick__text" @click="toggle(candidate.id)">
          <span class="npick__title">{{ candidate.title }}</span>
          <span v-if="candidate.preview" class="npick__preview">{{ candidate.preview }}</span>
        </button>
        <!-- Listed rather than filtered out: a picker that hides what is
             already attached makes "did I do this already?" unanswerable. -->
        <span v-if="candidate.attached" class="npick__badge">Attached</span>
      </li>
    </ul>
    <p v-else class="npick__empty">
      {{ query ? 'No note matches that.' : 'No notes in this workspace yet.' }}
    </p>

    <div class="npick__actions">
      <Button variant="ghost" size="sm" @click="emit('cancel')">Cancel</Button>
      <Button variant="primary" size="sm" :disabled="!selected.length" @click="confirm">
        {{ label }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.npick {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: color-mix(in oklch, var(--theme-text) 3%, transparent);
}
/* The list scrolls, the section does not: twenty rows inside a dialog would
   push the footer out of reach. */
.npick__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
  max-height: 240px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.npick__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-1) var(--sp-1);
  border-radius: var(--radius-sm);
}
.npick__row:hover {
  background: color-mix(in oklch, var(--theme-text) 5%, transparent);
}
.npick__text {
  display: grid;
  min-width: 0;
  gap: 1px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.npick__title {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--text-sm);
  color: var(--theme-text);
}
.npick__preview {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.npick__badge {
  flex-shrink: 0;
  padding: 1px var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.npick__empty {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-dim);
}
.npick__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
}
</style>
