<script setup lang="ts">
// History: every finished or archived item in a list, with the actions to
// manage it (create, read, update, delete).
//
// "Clear completed" and ⋯ → Archive stamp `archivedAt` instead of deleting, so
// those items are still in the workspace document in Supabase — they just had
// no screen. This is that screen, opened from the list's header:
//
//   Create  — "Log a finished item" adds something already done
//   Read    — grouped by day, searchable, filterable, with a task's status log
//   Update  — rename inline, put back in the list, or reopen as pending
//   Delete  — one at a time (with Undo) or in bulk (confirmed)
//
// Every action goes through the same store functions the lists use, so links,
// reminders, the sync guard and public shares behave exactly as they do there.
import { computed, nextTick, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { relLabel } from '@/utils/upcoming'
import {
  filterHistory,
  groupByDay,
  inHistory,
  toEntry,
  type HistoryEntry,
  type HistoryFilter,
} from '@/utils/historyItems'
import type { ItemStatus, Task, Todo } from '@/types'

const props = defineProps<{ collection: 'tasks' | 'todos' }>()
const app = useAppStore()
const { isMobile } = useStyles()

const open = ref(false)
const filter = ref<HistoryFilter>('all')
const query = ref('')
const now = ref(Date.now())
const isTasks = computed(() => props.collection === 'tasks')
const noun = computed(() => (isTasks.value ? 'task' : 'todo'))

watch(open, (on) => {
  if (!on) return
  now.value = Date.now()
  selected.value = new Set()
  editingId.value = null
  confirmBulk.value = false
})

// --- read -------------------------------------------------------------------
const entries = computed<HistoryEntry[]>(() =>
  isTasks.value
    ? app.tasks.filter(inHistory).map((t: Task) => toEntry(t, t.title))
    : app.todos.filter(inHistory).map((t: Todo) => toEntry(t, t.text)),
)
const counts = computed(() => ({
  all: entries.value.length,
  completed: entries.value.filter((e) => e.archivedAt == null).length,
  archived: entries.value.filter((e) => e.archivedAt != null).length,
}))
const visible = computed(() => filterHistory(entries.value, filter.value, query.value))
const groups = computed(() => groupByDay(visible.value, now.value))
const filterOptions = computed(() => [
  { value: 'all', label: `All · ${counts.value.all}` },
  { value: 'completed', label: `In list · ${counts.value.completed}` },
  { value: 'archived', label: `Cleared · ${counts.value.archived}` },
])

const expanded = ref<number | null>(null)
const STATUS_WORD: Record<ItemStatus, string> = {
  pending: 'Reopened',
  progress: 'Started',
  done: 'Completed',
}
function ago(ms: number | null) {
  return ms ? relLabel(ms - now.value) : ''
}
function meta(e: HistoryEntry): string {
  const parts: string[] = []
  if (e.status === 'done' && e.completedAt) parts.push('Done ' + ago(e.completedAt))
  else if (e.status !== 'done') parts.push(e.status === 'progress' ? 'In progress' : 'Not done')
  if (e.archivedAt) parts.push('cleared ' + ago(e.archivedAt))
  return parts.join(' · ')
}

// --- create -----------------------------------------------------------------
const draft = ref('')
function logFinished() {
  const title = draft.value.trim()
  if (!title) return
  const at = Date.now()
  if (isTasks.value) {
    app.addTask(title, '', {
      status: 'done',
      done: true,
      completedAt: at,
      statusLog: [{ at, status: 'done' }],
    })
  } else {
    app.addTodo(title, '', '', { status: 'done', done: true, completedAt: at })
  }
  draft.value = ''
  now.value = at
  app.showToastMsg(`Logged "${title.length > 28 ? title.slice(0, 28) + '…' : title}" as done`)
}

// --- update -----------------------------------------------------------------
const editingId = ref<number | null>(null)
const editText = ref('')
// A function ref: the edit row sits inside a v-for, where a string ref is an array.
let editRoot: HTMLElement | null = null
function bindEdit(el: unknown) {
  editRoot = el instanceof HTMLElement ? el : null
}
function startEdit(e: HistoryEntry) {
  editingId.value = e.id
  editText.value = e.title
  void nextTick(() => editRoot?.querySelector('input')?.focus())
}
function saveEdit() {
  const id = editingId.value
  const text = editText.value.trim()
  editingId.value = null
  if (id == null || !text) return
  if (isTasks.value) app.updateTask(id, 'title', text)
  else app.updateTodo(id, { text })
}
function onEditKey(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    saveEdit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    editingId.value = null
  }
}

function setArchived(id: number, archivedAt: number | null) {
  if (isTasks.value) app.patchTask(id, { archivedAt })
  else app.updateTodo(id, { archivedAt })
}
function setStatus(id: number, status: ItemStatus) {
  if (isTasks.value) app.setTaskStatus(id, status)
  else app.setTodoStatus(id, status)
}
/** Back into the list's Completed shelf, still done. */
function restore(e: HistoryEntry) {
  setArchived(e.id, null)
  app.showToastWithUndo('Put back in the list', () => setArchived(e.id, e.archivedAt))
}
/** Back into the list as work to do. */
function reopen(e: HistoryEntry) {
  setArchived(e.id, null)
  setStatus(e.id, 'pending')
  app.showToastWithUndo('Reopened', () => {
    setStatus(e.id, e.status)
    setArchived(e.id, e.archivedAt)
  })
}
function clearOne(e: HistoryEntry) {
  setArchived(e.id, Date.now())
}
function openTask(e: HistoryEntry) {
  open.value = false
  app.openDetail('task', e.id)
}

// --- delete -----------------------------------------------------------------
function remove(e: HistoryEntry) {
  app.deleteWithUndo(props.collection, isTasks.value ? 'task' : 'todo', e.id)
}

// --- bulk -------------------------------------------------------------------
const selected = ref(new Set<number>())
const confirmBulk = ref(false)
const busy = ref(false)
const allVisibleSelected = computed(
  () => visible.value.length > 0 && visible.value.every((e) => selected.value.has(e.id)),
)
function toggleSelect(id: number, on: boolean) {
  const next = new Set(selected.value)
  if (on) next.add(id)
  else next.delete(id)
  selected.value = next
}
function toggleAll(on: boolean) {
  selected.value = on ? new Set(visible.value.map((e) => e.id)) : new Set()
}
function selectedEntries() {
  return entries.value.filter((e) => selected.value.has(e.id))
}
function bulkRestore() {
  const picked = selectedEntries()
  for (const e of picked) setArchived(e.id, null)
  selected.value = new Set()
  app.showToastWithUndo(`Put ${picked.length} back in the list`, () => {
    for (const e of picked) setArchived(e.id, e.archivedAt)
  })
}
function bulkClear() {
  const at = Date.now()
  for (const e of selectedEntries()) if (e.archivedAt == null) setArchived(e.id, at)
  selected.value = new Set()
}
async function bulkDelete() {
  if (busy.value) return
  busy.value = true
  try {
    await app.deleteManyWithProgress(props.collection, [...selected.value])
    selected.value = new Set()
    confirmBulk.value = false
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <button
    type="button"
    class="panel-action"
    :title="`History — completed and cleared ${collection}`"
    :aria-label="`History, ${counts.all} completed or cleared ${collection}`"
    @click="open = true"
  >
    <Icon name="history" size="sm" />
    <span v-if="!isMobile">History</span>
  </button>

  <Modal
    :open="open"
    :title="`History · ${isTasks ? 'Tasks' : 'Todos'}`"
    size="lg"
    resizable
    @close="open = false"
  >
    <div class="hist">
      <!-- Create: something already finished, logged straight into history. -->
      <form class="hist__log" @submit.prevent="logFinished">
        <TextInput
          v-model="draft"
          icon="circle-check-big"
          :placeholder="`Log a finished ${noun}…`"
          :aria-label="`Log a finished ${noun}`"
          size="sm"
        />
        <Button type="submit" size="sm" variant="tinted" :disabled="!draft.trim()">Log done</Button>
      </form>

      <div class="hist__tools">
        <SegmentedControl v-model="filter" :options="filterOptions" size="sm" aria-label="Show" />
        <TextInput
          v-model="query"
          class="hist__search"
          type="search"
          icon="search"
          size="sm"
          clearable
          placeholder="Search title or tag"
          aria-label="Search history"
          :autocorrect="false"
        />
      </div>

      <div v-if="visible.length" class="hist__bulk">
        <Checkbox
          :model-value="allVisibleSelected"
          :indeterminate="selected.size > 0 && !allVisibleSelected"
          :label="selected.size ? `${selected.size} selected` : 'Select all'"
          @update:model-value="toggleAll"
        />
        <template v-if="selected.size">
          <Button size="sm" variant="ghost" @click="bulkRestore">
            <Icon name="undo-2" size="xs" />Put back
          </Button>
          <Button size="sm" variant="ghost" @click="bulkClear">
            <Icon name="archive" size="xs" />Clear
          </Button>
          <Button v-if="!confirmBulk" size="sm" variant="danger" @click="confirmBulk = true">
            <Icon name="trash-2" size="xs" />Delete
          </Button>
          <span v-else class="hist__confirm" role="alert">
            Delete {{ selected.size }} for good (with their subtasks)?
            <Button size="sm" variant="ghost" :disabled="busy" @click="confirmBulk = false"
              >Cancel</Button
            >
            <Button size="sm" variant="danger" :disabled="busy" @click="bulkDelete">{{
              busy ? 'Deleting…' : 'Delete'
            }}</Button>
          </span>
        </template>
      </div>

      <div class="hist__list">
        <p v-if="!entries.length" class="hist__empty">
          Nothing finished yet. Completed and cleared {{ collection }} will show up here.
        </p>
        <p v-else-if="!visible.length" class="hist__empty">Nothing matches.</p>

        <section v-for="group in groups" :key="group.key" class="hist__group">
          <h3 class="hist__day">
            {{ group.label }} <span>{{ group.entries.length }}</span>
          </h3>
          <div
            v-for="e in group.entries"
            :key="e.id"
            class="hist__row"
            :class="{ 'is-selected': selected.has(e.id) }"
          >
            <Checkbox
              :model-value="selected.has(e.id)"
              :aria-label="'Select ' + e.title"
              @update:model-value="toggleSelect(e.id, $event)"
            />

            <div class="hist__main">
              <div v-if="editingId === e.id" :ref="bindEdit" class="hist__edit">
                <TextInput
                  v-model="editText"
                  size="sm"
                  :aria-label="'Rename ' + e.title"
                  @keydown="onEditKey"
                />
                <Button size="sm" @click="saveEdit">Save</Button>
                <Button size="sm" variant="ghost" @click="editingId = null">Cancel</Button>
              </div>
              <template v-else>
                <button
                  type="button"
                  class="hist__title"
                  :class="{ 'is-done': e.status === 'done' }"
                  title="Rename"
                  @click="startEdit(e)"
                >
                  <span class="hist__titleText">{{ e.title }}</span>
                </button>
                <div class="hist__meta">
                  <span v-if="e.archivedAt" class="hist__badge">Cleared</span>
                  <span v-if="e.tag" class="hist__tag">#{{ e.tag }}</span>
                  <span>{{ meta(e) }}</span>
                  <button
                    v-if="e.statusLog.length"
                    type="button"
                    class="hist__logToggle"
                    :aria-expanded="expanded === e.id"
                    @click="expanded = expanded === e.id ? null : e.id"
                  >
                    {{ expanded === e.id ? 'Hide' : 'Activity' }} ({{ e.statusLog.length }})
                  </button>
                </div>
                <ol v-if="expanded === e.id" class="hist__activity">
                  <li v-for="(s, i) in [...e.statusLog].reverse()" :key="s.at + '-' + i">
                    {{ STATUS_WORD[s.status] }} · {{ new Date(s.at).toLocaleString() }}
                  </li>
                </ol>
              </template>
            </div>

            <div v-if="editingId !== e.id" class="hist__actions">
              <button
                v-if="isTasks"
                type="button"
                class="hist__act"
                title="Open details"
                aria-label="Open details"
                @click="openTask(e)"
              >
                <Icon name="external-link" size="sm" />
              </button>
              <button
                type="button"
                class="hist__act"
                title="Rename"
                aria-label="Rename"
                @click="startEdit(e)"
              >
                <Icon name="pencil" size="sm" />
              </button>
              <button
                v-if="e.archivedAt"
                type="button"
                class="hist__act"
                title="Put back in the list"
                aria-label="Put back in the list"
                @click="restore(e)"
              >
                <Icon name="undo-2" size="sm" />
              </button>
              <button
                v-else
                type="button"
                class="hist__act"
                title="Clear from the list"
                aria-label="Clear from the list"
                @click="clearOne(e)"
              >
                <Icon name="archive" size="sm" />
              </button>
              <button
                type="button"
                class="hist__act"
                title="Reopen as not done"
                aria-label="Reopen as not done"
                @click="reopen(e)"
              >
                <Icon name="rotate-ccw" size="sm" />
              </button>
              <button
                type="button"
                class="hist__act is-danger"
                title="Delete"
                aria-label="Delete"
                @click="remove(e)"
              >
                <Icon name="trash-2" size="sm" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>

    <template #footer>
      <Button variant="ghost" @click="open = false">Close</Button>
    </template>
  </Modal>
</template>

<style scoped>
.hist {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.hist__log {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}
.hist__log > :first-child {
  flex: 1;
  min-width: 0;
}
.hist__tools {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  align-items: center;
}
.hist__search {
  flex: 1 1 180px;
  min-width: 0;
}
.hist__bulk {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-height: 32px;
  padding: 0 var(--sp-2);
}
.hist__confirm {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  color: var(--theme-danger);
  font-size: var(--text-xs);
}
.hist__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  max-height: 56vh;
  overflow-y: auto;
  padding-right: 2px;
}
.hist__empty {
  margin: 0;
  padding: var(--sp-5) var(--sp-4);
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-card);
  color: var(--theme-dim);
  font-size: var(--text-sm);
  text-align: center;
}
.hist__group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hist__day {
  position: sticky;
  top: 0;
  z-index: 1;
  margin: 0;
  padding: var(--sp-1) var(--sp-2);
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.hist__day span {
  margin-left: 4px;
  opacity: 0.7;
}
.hist__row {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-2);
  border-radius: var(--radius-md);
  transition: background var(--dur-fast) ease;
}
.hist__row:hover,
.hist__row:focus-within,
.hist__row.is-selected {
  background: color-mix(in srgb, var(--theme-text) 5%, transparent);
}
.hist__main {
  flex: 1;
  min-width: 0;
}
.hist__title {
  display: block;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-sm);
  text-align: left;
  overflow-wrap: anywhere;
  cursor: text;
}
.hist__title.is-done {
  color: var(--theme-dim);
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--theme-dim) 50%, transparent);
}
.hist__title:hover {
  color: var(--theme-text);
}
/* Two lines at rest so a long title does not stretch its row; hovered (or
   focused from the keyboard) the rest scrolls vertically inside the same box. */
.hist__titleText {
  display: block;
  min-width: 0;
  max-height: calc(2 * 1.45em);
  line-height: 1.45;
  overflow: hidden;
  overflow-wrap: anywhere;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in oklch, var(--theme-text) 25%, transparent) transparent;
}
.hist__title:hover .hist__titleText,
.hist__title:focus-visible .hist__titleText {
  overflow-y: auto;
}
.hist__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
}
.hist__badge,
.hist__tag {
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
}
.hist__badge {
  color: var(--theme-accent);
}
.hist__logToggle {
  padding: 0;
  border: none;
  background: none;
  color: var(--theme-accent);
  font: inherit;
  cursor: pointer;
}
.hist__activity {
  margin: var(--sp-2) 0 0;
  padding-left: var(--sp-4);
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  line-height: 1.7;
}
.hist__edit {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}
.hist__edit > :first-child {
  flex: 1;
  min-width: 0;
}
.hist__actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--dur-fast) ease;
}
.hist__row:hover .hist__actions,
.hist__row:focus-within .hist__actions {
  opacity: 1;
}
.hist__act {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
}
.hist__act:hover {
  background: color-mix(in srgb, var(--theme-text) 8%, transparent);
  color: var(--theme-text);
}
.hist__act.is-danger:hover {
  background: color-mix(in srgb, var(--theme-danger) 14%, transparent);
  color: var(--theme-danger);
}
@media (hover: none) {
  .hist__actions {
    opacity: 1;
  }
}
@media (max-width: 560px) {
  .hist__row {
    flex-wrap: wrap;
  }
  .hist__actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
