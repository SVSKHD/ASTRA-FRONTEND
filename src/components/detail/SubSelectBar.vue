<script setup lang="ts">
// Bulk actions on a detail pane's subtasks (TodoDetail / TaskDetail): a Select
// button that turns each subtask row into a selectable one, then a bar with
// Select all, Mark done (or Mark not done, when everything picked is done
// already) and Delete. The pane owns the rows and draws a box on each while
// `selecting` is on; this owns the selection, the actions and the confirm.
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import Button from '@/components/ui/Button.vue'
import Modal from '@/components/ui/Modal.vue'
import Checkbox from '@/components/ui/Checkbox.vue'

const props = defineProps<{ collection: 'todos' | 'tasks'; ids: number[] }>()
const selecting = defineModel<boolean>('selecting', { required: true })
const selected = defineModel<Set<number>>('selected', { required: true })

const app = useAppStore()
const noun = computed(() => (props.collection === 'todos' ? 'subtodo' : 'subtask'))
const plural = (n: number) => noun.value + (n === 1 ? '' : 's')

function statusOf(id: number) {
  const list: { id: number; status: string }[] =
    props.collection === 'todos' ? app.todos : app.tasks
  return list.find((t) => t.id === id)?.status
}

const picked = computed(() => props.ids.filter((id) => selected.value.has(id)))
const allPicked = computed(() => props.ids.length > 0 && picked.value.length === props.ids.length)
const somePicked = computed(() => picked.value.length > 0 && !allPicked.value)
const allDone = computed(
  () => picked.value.length > 0 && picked.value.every((id) => statusOf(id) === 'done'),
)

// Rows that leave the list (deleted, moved) leave the selection too, and an
// emptied list ends selecting.
watch(
  () => props.ids,
  (ids) => {
    const keep = new Set(ids)
    const next = [...selected.value].filter((id) => keep.has(id))
    if (next.length !== selected.value.size) selected.value = new Set(next)
    if (!ids.length) stop()
  },
)

function start() {
  selecting.value = true
  selected.value = new Set()
}
function stop() {
  selecting.value = false
  selected.value = new Set()
}
function toggleAll() {
  selected.value = allPicked.value ? new Set() : new Set(props.ids)
}

function markPicked() {
  const next = allDone.value ? 'pending' : 'done'
  const ids = picked.value.filter((id) => statusOf(id) !== next)
  for (const id of ids) {
    if (props.collection === 'todos') app.setTodoStatus(id, next)
    else app.setTaskStatus(id, next)
  }
  if (ids.length) {
    app.showToastMsg(
      `${next === 'done' ? 'Marked' : 'Reopened'} ${ids.length} ${plural(ids.length)}` +
        (next === 'done' ? ' done' : ''),
    )
  }
  stop()
}

const confirming = ref(false)
const deleting = ref(false)
async function deletePicked() {
  if (!picked.value.length || deleting.value) return
  deleting.value = true
  try {
    const n = await app.deleteManyWithProgress(props.collection, picked.value)
    if (n > 0) stop()
  } finally {
    deleting.value = false
    confirming.value = false
  }
}
</script>

<template>
  <div v-if="ids.length" class="ssb" :class="{ 'is-on': selecting }">
    <template v-if="!selecting">
      <span class="ssb__label">{{ ids.length }} {{ plural(ids.length) }}</span>
      <Button variant="ghost" size="sm" caps @click="start">Select</Button>
    </template>
    <template v-else>
      <div class="ssb__all">
        <Checkbox
          :model-value="allPicked"
          :indeterminate="somePicked"
          :label="allPicked ? 'All selected' : 'Select all'"
          @update:model-value="toggleAll"
        />
        <span class="ssb__count">{{ picked.length }}/{{ ids.length }}</span>
      </div>
      <div class="ssb__actions">
        <Button variant="tinted" size="sm" :disabled="!picked.length" @click="markPicked">
          {{ allDone ? 'Mark not done' : 'Mark done' }}
        </Button>
        <Button
          variant="danger"
          size="sm"
          :disabled="!picked.length || deleting"
          @click="confirming = true"
        >
          Delete
        </Button>
        <Button variant="ghost" size="sm" @click="stop">Cancel</Button>
      </div>
    </template>

    <Modal
      :open="confirming"
      :title="`Delete ${picked.length} ${plural(picked.length)}`"
      size="sm"
      @close="!deleting && (confirming = false)"
    >
      <p class="ssb__confirm">
        Delete {{ allPicked ? 'all ' : '' }}{{ picked.length }} selected
        {{ plural(picked.length) }}? Anything nested under them goes too.
      </p>
      <template #footer>
        <Button variant="secondary" size="sm" :disabled="deleting" @click="confirming = false">
          Cancel
        </Button>
        <Button variant="danger" size="sm" :loading="deleting" @click="deletePicked">
          {{ deleting ? 'Deleting…' : allPicked ? 'Delete all' : 'Delete selected' }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.ssb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2) var(--sp-3);
  min-height: 36px;
}
.ssb.is-on {
  padding: 6px 10px 6px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent);
}
.ssb__label {
  flex: 1;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.ssb__all {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.ssb__count {
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.ssb__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ssb__confirm {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-text);
}
</style>
