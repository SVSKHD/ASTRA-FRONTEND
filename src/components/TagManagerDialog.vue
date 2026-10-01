<script setup lang="ts">
// Manage tags: the whole vocabulary in one dialog. Add a tag, tick any number
// of them (or all), and delete the ticked ones together — with one "are you
// sure" naming how many, rather than a × pressed once per chip.
//
// A tag that any item still wears cannot be deleted (app.removeTag's rule).
// Each row says how many items wear it; a ticked row that is in use says it
// can't go, the footer counts them, and "Unselect in use" clears them out of
// the selection so what is left is exactly what Delete will remove.
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { normalizeTag, hasTag, tagColor } from '@/utils/tags'
import { useStyles } from '@/composables/useStyles'
import Modal from '@/components/ui/Modal.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import TextInput from '@/components/ui/TextInput.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const app = useAppStore()
const { tags, todos, tasks, goals, ideas, stocks, trips } = storeToRefs(app)
const { c, dark } = useStyles()

const picked = ref<Set<string>>(new Set())
const creating = ref('')
const confirming = ref(false)
const filter = ref('')
watch(
  () => props.open,
  (open) => {
    if (!open) return
    picked.value = new Set()
    creating.value = ''
    confirming.value = false
    filter.value = ''
  },
)

// How many items wear each tag. Read through the lists so it recomputes when
// an item's tag changes.
const usage = computed(() => {
  void [todos.value, tasks.value, goals.value, ideas.value, stocks.value, trips.value]
  const counts = new Map<string, number>()
  for (const t of tags.value) counts.set(t, app.tagUsage(t))
  return counts
})
const inUse = (t: string) => (usage.value.get(t) ?? 0) > 0

const shown = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return q ? tags.value.filter((t) => t.toLowerCase().includes(q)) : tags.value
})
const allShownPicked = computed(
  () => shown.value.length > 0 && shown.value.every((t) => picked.value.has(t)),
)
const somePicked = computed(() => shown.value.some((t) => picked.value.has(t)))
function toggle(tag: string, on: boolean) {
  const next = new Set(picked.value)
  if (on) next.add(tag)
  else next.delete(tag)
  picked.value = next
  confirming.value = false
}
function toggleAll(on: boolean) {
  const next = new Set(picked.value)
  for (const t of shown.value) {
    if (on) next.add(t)
    else next.delete(t)
  }
  picked.value = next
  confirming.value = false
}

const isNew = computed(() => {
  const tag = normalizeTag(creating.value)
  return !!tag && !hasTag(tags.value, tag)
})
function create() {
  if (!isNew.value) return
  app.addTag(creating.value)
  creating.value = ''
}

// Of what is ticked: the tags that can go, and the ones that are in use.
const deletable = computed(() => [...picked.value].filter((t) => !inUse(t)))
const blocked = computed(() => [...picked.value].filter((t) => inUse(t)))
const count = computed(() => deletable.value.length)
function unselectInUse() {
  picked.value = new Set(deletable.value)
  confirming.value = false
}
function remove() {
  if (!count.value) return
  if (!confirming.value) {
    confirming.value = true
    return
  }
  const n = app.removeTags(deletable.value)
  picked.value = new Set(blocked.value)
  confirming.value = false
  app.showToastMsg(`Deleted ${n} tag${n === 1 ? '' : 's'}`)
}

function dotStyle(tag: string) {
  return { background: tagColor(tag, dark.value, c.value.mono) }
}
</script>

<template>
  <Modal :open="open" title="Manage tags" size="md" @close="emit('close')">
    <div class="tm">
      <!-- Add -->
      <form class="tm__add" @submit.prevent="create">
        <TextInput v-model="creating" placeholder="New tag…" aria-label="New tag" />
        <button type="submit" class="tm__btn tm__btn--accent" :disabled="!isNew">Add</button>
      </form>

      <!-- Find, and pick all -->
      <div class="tm__bar">
        <Checkbox
          :model-value="allShownPicked"
          :indeterminate="somePicked && !allShownPicked"
          :label="allShownPicked ? 'Clear all' : 'Select all'"
          :disabled="!shown.length"
          @update:model-value="toggleAll"
        />
        <button v-if="blocked.length" type="button" class="tm__unpick" @click="unselectInUse">
          Unselect in use · {{ blocked.length }}
        </button>
        <TextInput
          v-if="tags.length > 6"
          v-model="filter"
          size="sm"
          placeholder="Filter…"
          aria-label="Filter tags"
          class="tm__filter"
        />
      </div>

      <ul class="tm__list" role="list">
        <li
          v-for="t in shown"
          :key="t"
          class="tm__row"
          :class="{
            'is-picked': picked.has(t) && !inUse(t),
            'is-blocked': picked.has(t) && inUse(t),
          }"
        >
          <Checkbox
            :model-value="picked.has(t)"
            :aria-label="'Select ' + t"
            @update:model-value="toggle(t, $event)"
          />
          <span class="tm__dot" :style="dotStyle(t)"></span>
          <span class="tm__name">{{ t }}</span>
          <span v-if="picked.has(t) && inUse(t)" class="tm__uses is-blocked">
            In use · {{ usage.get(t) }} item{{ usage.get(t) === 1 ? '' : 's' }} — can't delete
          </span>
          <span v-else class="tm__uses">{{
            inUse(t) ? usage.get(t) + ' item' + (usage.get(t) === 1 ? '' : 's') : 'unused'
          }}</span>
        </li>
        <li v-if="!tags.length" class="tm__empty">No tags yet. Add one above.</li>
        <li v-else-if="!shown.length" class="tm__empty">No tag matches “{{ filter }}”.</li>
      </ul>
    </div>

    <template #footer>
      <span v-if="confirming" class="tm__warn">
        Delete {{ count }} unused tag{{ count === 1 ? '' : 's' }}?
      </span>
      <span v-else class="tm__count">
        <template v-if="picked.size">{{ picked.size }} selected</template>
        <template v-if="blocked.length">
          · <span class="tm__inuse">{{ blocked.length }} in use, can't be deleted</span>
        </template>
      </span>
      <button
        type="button"
        class="tm__btn"
        @click="confirming ? (confirming = false) : emit('close')"
      >
        {{ confirming ? 'Cancel' : 'Done' }}
      </button>
      <button type="button" class="tm__btn tm__btn--danger" :disabled="!count" @click="remove">
        {{ confirming ? 'Yes, delete' : count > 1 ? `Delete ${count} tags` : 'Delete' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.tm {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.tm__add {
  display: flex;
  gap: var(--sp-2);
}
.tm__add > :first-child {
  flex: 1;
  min-width: 0;
}
.tm__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: 0 4px;
}
.tm__filter {
  width: 180px;
}
.tm__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 50vh;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.tm__row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  transition: background var(--dur-fast, 120ms) ease;
}
.tm__row:hover {
  background: color-mix(in srgb, var(--theme-text) 5%, transparent);
}
.tm__row.is-blocked {
  background: color-mix(in srgb, var(--theme-warning) 8%, transparent);
  border-color: color-mix(in srgb, var(--theme-warning) 28%, transparent);
}
.tm__uses.is-blocked,
.tm__inuse {
  color: var(--theme-warning);
  font-weight: var(--weight-semibold);
}
.tm__unpick {
  height: 28px;
  padding: 0 12px;
  border-radius: var(--radius-pill);
  border: 1px solid color-mix(in srgb, var(--theme-warning) 45%, transparent);
  background: color-mix(in srgb, var(--theme-warning) 10%, transparent);
  color: var(--theme-warning);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  cursor: pointer;
}
.tm__row.is-picked {
  background: color-mix(in srgb, var(--theme-danger) 8%, transparent);
  border-color: color-mix(in srgb, var(--theme-danger) 25%, transparent);
}
.tm__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tm__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--theme-text);
}
.tm__uses {
  flex-shrink: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
  font-variant-numeric: tabular-nums;
}
.tm__empty {
  padding: 12px 10px;
  font-size: var(--text-sm);
  color: var(--theme-dim);
}
.tm__count,
.tm__warn {
  margin-right: auto;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.tm__warn {
  color: var(--theme-danger);
  font-weight: var(--weight-semibold);
}
.tm__btn {
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-border);
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  white-space: nowrap;
}
.tm__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.tm__btn--accent {
  border-color: var(--theme-accent);
  background: var(--theme-accent);
  color: var(--theme-on-accent);
}
.tm__btn--danger {
  border-color: var(--theme-danger);
  background: color-mix(in srgb, var(--theme-danger) 14%, transparent);
  color: var(--theme-danger);
}
.tm__btn--danger:not(:disabled):hover {
  background: var(--theme-danger);
  color: var(--theme-on-danger);
}
</style>
