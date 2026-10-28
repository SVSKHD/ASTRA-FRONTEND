<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import type { Task, Todo } from '@/types'
import { useStyles } from '@/composables/useStyles'
import Modal from '@/components/ui/Modal.vue'
import Combobox from '@/components/ui/Combobox.vue'
import FormField from '@/components/ui/FormField.vue'
import { ancestorsOf, buildIndex, selectedTreeRoots, wouldCreateCycle } from '@/utils/taskTree'
import { pinnedTreeIds } from '@/utils/pinnedItems'
const props = defineProps<{
  open: boolean
  collection: 'tasks' | 'todos'
  ids: number[]
  title?: string
}>()
const emit = defineEmits<{ close: []; moved: [] }>()
const app = useAppStore()
const { s } = useStyles()
const parent = ref('')
const error = ref('')
const index = computed(() =>
  buildIndex<Task | Todo>(props.collection === 'tasks' ? app.tasks : app.todos),
)
const roots = computed(() => selectedTreeRoots(index.value, props.ids))
const nameOf = (item: Task | Todo) => ('text' in item ? item.text : item.title) || '(untitled)'
// Everything the list shows under "Pinned" (any item in a tree with a pinned
// member, see pinnedTreeIds) comes first, in its own group and labelled with
// its path (Parent › Child), so a subtodo inside a pinned tree is easy to find.
// With nothing pinned the list stays flat.
const pinnedIds = computed(() =>
  pinnedTreeIds(props.collection === 'tasks' ? app.tasks : app.todos, props.collection),
)
const options = computed(() => {
  const candidates = [...index.value.byId.values()]
    .filter(
      (item) =>
        props.collection !== 'todos' || (!item.done && item.status !== 'done' && !item.archivedAt),
    )
    .filter((item) => !roots.value.some((id) => wouldCreateCycle(index.value, id, item.id)))
    // Already the parent of everything being moved: picking it would be a no-op.
    .filter(
      (item) =>
        !roots.value.length ||
        !roots.value.every((id) => index.value.byId.get(id)?.parentId === item.id),
    )
  const pinned = candidates.filter((item) => pinnedIds.value.has(item.id))
  const rest = candidates.filter((item) => !pinnedIds.value.has(item.id))
  const grouped = pinned.length > 0
  return [
    { value: 'root', label: 'Top level' },
    ...pinned.map((item) => ({
      value: String(item.id),
      label: [...ancestorsOf(index.value, item.id).reverse().map(nameOf), nameOf(item)].join(' › '),
      ...(item.pinned ? { icon: 'pin' } : {}),
      group: 'Pinned',
    })),
    ...rest.map((item) => ({
      value: String(item.id),
      label: nameOf(item),
      ...(grouped ? { group: props.collection === 'tasks' ? 'Other tasks' : 'Other todos' } : {}),
    })),
  ]
})
watch(
  () => props.open,
  () => {
    parent.value = ''
    error.value = ''
  },
)
const validParent = computed(() => options.value.some((option) => option.value === parent.value))
function move() {
  if (!parent.value || !options.value.some((option) => option.value === parent.value)) return
  if (
    app.moveTreeSelection(
      props.collection,
      props.ids,
      parent.value === 'root' ? null : Number(parent.value),
    )
  ) {
    app.showToastMsg(
      `Moved ${roots.value.length} selected item${roots.value.length === 1 ? '' : 's'}`,
    )
    emit('moved')
    emit('close')
  } else error.value = 'These items cannot be moved to that parent.'
}
</script>
<template>
  <Modal :open="open" :title="title ?? 'Move selected items'" size="sm" @close="emit('close')">
    <p>Choose one parent. Selected items keep their subtasks.</p>
    <FormField v-slot="field" :label="collection === 'tasks' ? 'Parent task' : 'Parent todo'">
      <Combobox
        v-model="parent"
        v-bind="field"
        :options="options"
        :creatable="false"
        :placeholder="collection === 'tasks' ? 'Search tasks...' : 'Search active todos...'"
        empty-text="No matching parents"
        @query="parent = ''"
      />
    </FormField>
    <p v-if="error" role="alert">{{ error }}</p>
    <template #footer>
      <button :style="s.editBtn" @click="emit('close')">Cancel</button>
      <button :style="s.importBtn" :disabled="!validParent || !roots.length" @click="move">
        Move
      </button>
    </template>
  </Modal>
</template>
