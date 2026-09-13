<script setup lang="ts">
// Right-hand detail pane of the Todos view. Everything about the selected todo
// reads as a rich, read-only sheet; double-clicking a value (title, tag,
// description, a subtask's title) swaps it for an inline editor — Enter or blur
// saves, Escape cancels. Subtasks are the todo's parentId children.
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useInlineEdit } from '@/composables/useInlineEdit'
import { fmtDate, useDetailStyles } from '@/composables/useDetailStyles'
import { buildIndex, childrenOf, ancestorsOf, descendantsOf } from '@/utils/taskTree'
import StatusPill from '@/components/StatusPill.vue'
import RemindBell from '@/components/RemindBell.vue'
import ShareGlobeButton from '@/components/ShareGlobeButton.vue'
import MoveToDeadlineButton from '@/components/MoveToDeadlineButton.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import PaneSection from '@/components/detail/PaneSection.vue'
import TextInput from '@/components/ui/TextInput.vue'
import RichDescription from '@/components/detail/RichDescription.vue'
import Icon from '@/components/ui/Icon.vue'
import { STATUS_LABEL } from '@/types'

const props = defineProps<{ todoId: number | null }>()
const emit = defineEmits<{ select: [id: number | null] }>()

const app = useAppStore()
const { todos } = storeToRefs(app)
const {
  c,
  s,
  pane,
  card,
  row,
  headerRow,
  metaGroup,
  actionBar,
  grow,
  crumbBtn,
  dimSmall,
  titleStyle,
  placeholder,
  statGrid,
  statTile,
  statValue,
  infoGrid,
  infoKey,
  infoVal,
  pill,
  accentPill,
  subRow,
  boxStyle,
  subText,
  iconBtn,
  addBtn,
  chipStyle,
} = useDetailStyles()

const index = computed(() => buildIndex(todos.value))
const todo = computed(() => (props.todoId == null ? undefined : index.value.byId.get(props.todoId)))
const subtasks = computed(() => (todo.value ? childrenOf(index.value, todo.value.id) : []))
const subDone = computed(() => subtasks.value.filter((t) => t.status === 'done').length)
const allDescendants = computed(() =>
  todo.value ? descendantsOf(index.value, todo.value.id).length : 0,
)
const ancestors = computed(() => (todo.value ? ancestorsOf(index.value, todo.value.id) : []))
function kidCount(id: number) {
  return childrenOf(index.value, id).length
}

const scheduled = computed(() => {
  const t = todo.value
  if (!t?.startAt) return ''
  if (t.allDay) return fmtDate(t.startAt, false) + ' · all day'
  const end = t.endAt
    ? ' – ' +
      new Date(t.endAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : ''
  return fmtDate(t.startAt) + end
})
const goals = computed(() =>
  (todo.value?.goalIds ?? [])
    .map((gid) => app.goalById(gid))
    .filter((g): g is NonNullable<typeof g> => !!g),
)
const linkedItems = computed(() =>
  [...(todo.value?.linked ?? []), ...(todo.value?.parents ?? [])]
    .map((r) => app.linkableById(r))
    .filter((it): it is NonNullable<typeof it> => !!it)
    .map((it) => ('text' in it ? it.text : it.title) || '(untitled)'),
)

// --- inline editing (double-click) ------------------------------------------
const { draft, start, cancel, commit, isEditing, vFocus } = useInlineEdit((key, raw) => {
  const t = todo.value
  if (!t) return
  const value = raw.trim()
  if (key === 'text') {
    if (value) app.updateTodo(t.id, { text: value })
  } else if (key === 'description') app.updateTodo(t.id, { description: value })
  else if (key === 'tag') app.updateTodo(t.id, { tag: value })
  else if (key.startsWith('sub:') && value) app.updateTodo(Number(key.slice(4)), { text: value })
})
watch(
  () => props.todoId,
  () => cancel(),
)

const newSub = ref('')
function addSubtask() {
  const parent = todo.value
  if (!parent || !newSub.value.trim()) return
  const newId = app.addTodo(newSub.value)
  if (newId != null) app.moveTodo(newId, parent.id, subtasks.value.length)
  newSub.value = ''
}
function removeTodo(id: number) {
  app.deleteWithUndo('todos', 'todo', id)
  if (id === props.todoId) emit('select', null)
}
</script>

<template>
  <div :style="pane">
    <Transition name="pane-swap" mode="out-in">
      <div :key="todoId ?? 'empty'" class="pane-swap__body">
        <div v-if="!todo" :style="s.empty">Select a todo to see its details and subtasks.</div>

        <template v-else>
          <!-- Header: breadcrumb, title, status & actions -->
          <section :style="card">
            <div v-if="ancestors.length" :style="row">
              <template v-for="a in ancestors" :key="a.id">
                <button type="button" :style="crumbBtn" @click="emit('select', a.id)">
                  {{ a.text || '(untitled)' }}
                </button>
                <span :style="dimSmall">›</span>
              </template>
            </div>

            <TextInput
              v-if="isEditing('text')"
              v-model="draft"
              v-focus
              size="lg"
              aria-label="Todo title"
              @keydown.enter="commit"
              @keydown.esc="cancel"
              @blur="commit"
            />
            <div
              v-else
              :style="titleStyle(todo.status === 'done')"
              title="Double-click to edit"
              @dblclick="start('text', todo.text)"
            >
              {{ todo.text || '(untitled)' }}
            </div>

            <div :style="headerRow">
              <div :style="metaGroup">
                <StatusPill :status="todo.status" @cycle="app.cycleTodoStatus(todo.id)" />
                <TextInput
                  v-if="isEditing('tag')"
                  v-model="draft"
                  v-focus
                  size="sm"
                  placeholder="Tag"
                  aria-label="Tag"
                  :style="{ width: '160px' }"
                  @keydown.enter="commit"
                  @keydown.esc="cancel"
                  @blur="commit"
                />
                <span
                  v-else-if="todo.tag"
                  :style="chipStyle(todo.tag)"
                  title="Double-click to edit"
                  @dblclick="start('tag', todo.tag)"
                  >{{ todo.tag }}</span
                >
                <span
                  v-else
                  :style="pill"
                  title="Double-click to add a tag"
                  @dblclick="start('tag', '')"
                  >+ tag</span
                >
                <span v-if="todo.isPublic" :style="pill">🌐 Public</span>
                <span v-if="todo.rolloverCount > 0" :style="pill"
                  >rolled over ×{{ todo.rolloverCount }}</span
                >
              </div>
              <div :style="actionBar">
                <RemindBell collection="todos" :id="todo.id" />
                <ShareGlobeButton entity-type="todo" :item="todo" variant="row" />
                <MoveToDeadlineButton
                  type="todo"
                  :item-id="todo.id"
                  @moved="emit('select', null)"
                />
                <button
                  type="button"
                  :style="iconBtn"
                  title="Open in editor"
                  @click="app.openEdit('todo', todo.id)"
                >
                  <Icon name="chevron-right" size="md" />
                </button>
                <button
                  type="button"
                  :style="s.del"
                  title="Delete todo"
                  @click="removeTodo(todo.id)"
                >
                  ×
                </button>
              </div>
            </div>
          </section>

          <!-- At a glance -->
          <div :style="statGrid">
            <div :style="statTile">
              <span :style="dimSmall">Subtasks</span>
              <span :style="statValue">{{ subDone }}/{{ subtasks.length }}</span>
            </div>
            <div :style="statTile">
              <span :style="dimSmall">Status</span>
              <span :style="statValue">{{ STATUS_LABEL[todo.status] }}</span>
            </div>
            <div :style="statTile">
              <span :style="dimSmall">Reminders</span>
              <span :style="statValue">{{ todo.reminderIds.length }}</span>
            </div>
          </div>

          <!-- Description -->
          <PaneSection title="Description" storage-key="todo:description">
            <RichDescription
              :model-value="todo.description"
              empty-text="No description — double-click to write one."
              @update:model-value="app.updateTodo(todo.id, { description: $event })"
            />
          </PaneSection>

          <!-- Subtasks -->
          <PaneSection
            title="Subtasks"
            storage-key="todo:subtasks"
            :count="subDone + '/' + subtasks.length"
          >
            <span v-if="allDescendants > subtasks.length" :style="dimSmall"
              >{{ allDescendants }} in total, nested</span
            >
            <ProgressBar v-if="subtasks.length" :value="subDone" :max="subtasks.length" size="sm" />

            <div v-for="st in subtasks" :key="st.id" :style="subRow">
              <button
                type="button"
                :style="boxStyle(st.status === 'done')"
                aria-label="Toggle done"
                @click="app.toggleTodo(st.id)"
              >
                <Icon
                  v-if="st.status === 'done'"
                  name="check"
                  size="xs"
                  :style="{ color: c.onAccent }"
                />
              </button>
              <TextInput
                v-if="isEditing('sub:' + st.id)"
                v-model="draft"
                v-focus
                size="sm"
                aria-label="Subtask title"
                :style="grow"
                @keydown.enter="commit"
                @keydown.esc="cancel"
                @blur="commit"
              />
              <span
                v-else
                :style="subText(st.status === 'done')"
                title="Double-click to rename"
                @dblclick="start('sub:' + st.id, st.text)"
                >{{ st.text || '(untitled)' }}</span
              >
              <span :style="pill">{{ kidCount(st.id) }} sub</span>
              <button
                type="button"
                :style="iconBtn"
                title="Open subtask"
                @click="emit('select', st.id)"
              >
                <Icon name="chevron-right" size="md" />
              </button>
              <button type="button" :style="s.del" @click="removeTodo(st.id)">×</button>
            </div>
            <div v-if="!subtasks.length" :style="placeholder">No subtasks yet.</div>

            <form :style="row" @submit.prevent="addSubtask">
              <TextInput
                v-model="newSub"
                size="sm"
                placeholder="Add a subtask…"
                aria-label="New subtask"
                :style="grow"
              />
              <button type="submit" :style="addBtn">Add</button>
            </form>
          </PaneSection>

          <!-- Details -->
          <PaneSection title="Details" storage-key="todo:details">
            <div :style="infoGrid">
              <span :style="infoKey">Created</span>
              <span :style="infoVal">{{ fmtDate(todo.createdAt) || '—' }}</span>
              <span :style="infoKey">Last updated</span>
              <span :style="infoVal">{{ fmtDate(todo.updatedAt) || '—' }}</span>
              <template v-if="todo.completedAt">
                <span :style="infoKey">Completed</span>
                <span :style="infoVal">{{ fmtDate(todo.completedAt) }}</span>
              </template>
              <template v-if="scheduled">
                <span :style="infoKey">Scheduled</span>
                <span :style="infoVal">{{ scheduled }}</span>
              </template>
              <template v-if="todo.rolledOverAt">
                <span :style="infoKey">Last rolled over</span>
                <span :style="infoVal">{{ fmtDate(todo.rolledOverAt) }}</span>
              </template>
              <template v-if="goals.length">
                <span :style="infoKey">Goals</span>
                <span :style="row">
                  <button
                    v-for="g in goals"
                    :key="g.id"
                    type="button"
                    :style="accentPill"
                    @click="app.openGoalDialog(g.id)"
                  >
                    ◎ {{ g.title || 'Goal' }}
                  </button>
                </span>
              </template>
              <template v-if="linkedItems.length">
                <span :style="infoKey">Linked</span>
                <span :style="row">
                  <span v-for="(l, i) in linkedItems" :key="i" :style="pill">{{ l }}</span>
                </span>
              </template>
              <template v-if="todo.isPublic && todo.sharedAt">
                <span :style="infoKey">Shared</span>
                <span :style="infoVal">{{ fmtDate(todo.sharedAt) }}</span>
              </template>
            </div>
          </PaneSection>

          <span :style="dimSmall"
            >Tip: double-click the title, tag, description or a subtask to edit.</span
          >
        </template>
      </div>
    </Transition>
  </div>
</template>
