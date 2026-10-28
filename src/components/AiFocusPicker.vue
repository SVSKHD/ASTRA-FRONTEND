<script setup lang="ts">
// Pick the todo or task the AI chat works on. Open items only, searchable,
// each shown with its place in the tree and how many sub-items it already has.
import { computed, ref, watch } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import SearchField from '@/components/ui/SearchField.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Icon from '@/components/ui/Icon.vue'
import { useAppStore } from '@/stores/app'
import { buildIndex, childrenOf } from '@/utils/taskTree'
import type { AiFocus } from '@/composables/useAiChat'
import type { Task, Todo } from '@/types'

const props = defineProps<{ open: boolean; current: AiFocus | null }>()
const emit = defineEmits<{ close: []; pick: [AiFocus] }>()
const app = useAppStore()

const collection = ref<AiFocus['collection']>('todos')
const query = ref('')
watch(
  () => props.open,
  (open) => {
    if (!open) return
    query.value = ''
    if (props.current) collection.value = props.current.collection
  },
)

const tabs = [
  { value: 'todos', label: 'Todos' },
  { value: 'tasks', label: 'Tasks' },
]

const rows = computed(() => {
  const list = (collection.value === 'todos' ? app.todos : app.tasks) as (Todo | Task)[]
  const index = buildIndex(list)
  const byId = new Map(list.map((x) => [x.id, x]))
  const titleOf = (x: Todo | Task) => ('text' in x ? x.text : x.title)
  const q = query.value.trim().toLowerCase()
  return list
    .filter((x) => !x.done && !x.archivedAt)
    .map((x) => {
      const parent = x.parentId != null ? byId.get(x.parentId) : undefined
      return {
        id: x.id,
        title: titleOf(x),
        parent: parent ? titleOf(parent) : '',
        depth: x.depth ?? 0,
        kids: childrenOf(index, x.id).length,
      }
    })
    .filter((r) => !q || (r.title + ' ' + r.parent).toLowerCase().includes(q))
    .slice(0, 200)
})

function pick(id: number) {
  emit('pick', { collection: collection.value, id })
}
</script>

<template>
  <Modal :open="open" title="Work on a todo or task" size="md" @close="emit('close')">
    <div class="afp">
      <p class="afp__lead">
        Pick an item: the AI sees its sub-items, and what you discuss next is added under it.
      </p>
      <div class="afp__bar">
        <SegmentedControl
          :model-value="collection"
          :options="tabs"
          size="sm"
          aria-label="Todos or tasks"
          @update:model-value="collection = $event as AiFocus['collection']"
        />
        <SearchField
          v-model="query"
          size="sm"
          placeholder="Search…"
          label="Search"
          class="afp__search"
        />
      </div>
      <ul v-if="rows.length" class="afp__list">
        <li v-for="r in rows" :key="r.id">
          <button
            type="button"
            class="afp__row"
            :class="{ 'is-on': current?.collection === collection && current.id === r.id }"
            @click="pick(r.id)"
          >
            <Icon
              :name="r.depth ? 'corner-down-right' : 'check-square'"
              size="xs"
              class="afp__icon"
            />
            <span class="afp__text">
              <span class="afp__title">{{ r.title }}</span>
              <span v-if="r.parent" class="afp__parent">in {{ r.parent }}</span>
            </span>
            <span class="afp__kids">{{ r.kids }} sub</span>
          </button>
        </li>
      </ul>
      <p v-else class="afp__none">No open {{ collection }} match.</p>
    </div>
  </Modal>
</template>

<style scoped>
.afp {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.afp__lead {
  margin: 0;
  color: var(--theme-dim);
  font-size: var(--text-sm);
}
.afp__bar {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  flex-wrap: wrap;
}
.afp__search {
  flex: 1 1 180px;
  min-width: 0;
}
.afp__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 50vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.afp__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--theme-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.afp__row:hover {
  background: color-mix(in oklch, var(--theme-text) 6%, transparent);
}
.afp__row.is-on {
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
}
.afp__icon {
  flex-shrink: 0;
  color: var(--theme-dim);
}
.afp__text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.afp__title {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}
.afp__parent {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.afp__kids {
  flex-shrink: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
  font-variant-numeric: tabular-nums;
}
.afp__none {
  margin: 0;
  color: var(--theme-dim);
  font-size: var(--text-sm);
}
</style>
