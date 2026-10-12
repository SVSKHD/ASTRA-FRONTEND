<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import type { Task, Todo } from '@/types'
import { useStyles } from '@/composables/useStyles'
import Modal from '@/components/ui/Modal.vue'
import Combobox from '@/components/ui/Combobox.vue'
import FormField from '@/components/ui/FormField.vue'
import { buildIndex, selectedTreeRoots, wouldCreateCycle } from '@/utils/taskTree'
const props = defineProps<{ open: boolean; collection: 'tasks' | 'todos'; ids: number[] }>()
const emit = defineEmits<{ close: []; moved: [] }>()
const app = useAppStore()
const { s } = useStyles()
const parent = ref('')
const error = ref('')
const index = computed(() =>
  buildIndex<Task | Todo>(props.collection === 'tasks' ? app.tasks : app.todos),
)
const roots = computed(() => selectedTreeRoots(index.value, props.ids))
const options = computed(() => [
  { value: 'root', label: 'Top level' },
  ...[...index.value.byId.values()]
    .filter(
      (item) =>
        props.collection !== 'todos' || (!item.done && item.status !== 'done' && !item.archivedAt),
    )
    .filter((item) => !roots.value.some((id) => wouldCreateCycle(index.value, id, item.id)))
    .map((item) => ({
      value: String(item.id),
      label: ('text' in item ? item.text : item.title) || '(untitled)',
    })),
])
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
  <Modal :open="open" title="Move selected items" size="sm" @close="emit('close')">
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
