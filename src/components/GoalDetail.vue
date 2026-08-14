<script setup lang="ts">
// Goal detail (task 8): header (title/description/dates/status/progress + time
// totals), an inline-CRUD checklist with per-item estimate/due and a start/stop
// timer, and Tasks/Todos sections that reuse the existing TreeList row component
// for attached items. Attaching/detaching is by reference — it never moves or
// deletes the underlying task/todo. Deleting a goal prompts (unlink everything /
// delete checklist only) and never cascade-deletes tasks or todos.
import { computed, ref, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useSyncGuard } from '@/composables/useSyncGuard'
import { pxify, rowBase } from '@/styles'
import ProgressRing from '@/components/ProgressRing.vue'
import TreeList from '@/components/TreeList.vue'
import type { GoalStatus } from '@/types'

const props = defineProps<{ goalId: number }>()
const emit = defineEmits<{ (e: 'back'): void }>()

const app = useAppStore()
const ui = useUiStore()
const { c, s, isMobile } = useStyles()
const guard = useSyncGuard()
const { goals, goalChecklist, tasks, todos } = storeToRefs(app)
const { now } = storeToRefs(ui)

const goal = computed(() => goals.value.find((g) => g.id === props.goalId))
// The checklist for this goal, reactive on the store array + now (for live timer).
const checklist = computed(() => app.checklistOf(props.goalId))
const progress = computed(() => app.goalProgress(props.goalId))

// Estimated vs spent minutes, including any live-running timer.
const time = computed(() => {
  const base = app.goalTime(props.goalId)
  let live = 0
  for (const item of goalChecklist.value) {
    if (item.goalId === props.goalId && item.timerStartedAt != null)
      live += Math.max(0, Math.round((now.value - item.timerStartedAt) / 60000))
  }
  return { estimate: base.estimate, spent: base.spent + live }
})
function fmtMins(m: number): string {
  if (!m) return '0m'
  const h = Math.floor(m / 60)
  const min = m % 60
  return h ? `${h}h${min ? ' ' + min + 'm' : ''}` : `${min}m`
}
function liveSpent(itemId: number): number {
  const it = goalChecklist.value.find((c) => c.id === itemId)
  if (!it) return 0
  const running =
    it.timerStartedAt != null ? Math.max(0, Math.round((now.value - it.timerStartedAt) / 60000)) : 0
  return it.spentMins + running
}

const STATUS_OPTS: GoalStatus[] = ['active', 'paused', 'done', 'archived']

// --- attached items (reuse TreeList; root = attached with no attached parent) --
function rootIdsOf(collection: 'tasks' | 'todos') {
  const attached =
    collection === 'tasks' ? app.tasksOfGoal(props.goalId) : app.todosOfGoal(props.goalId)
  const set = new Set(attached.map((t) => t.id))
  return attached.filter((t) => t.parentId == null || !set.has(t.parentId)).map((t) => t.id)
}
const taskRootIds = computed(() => rootIdsOf('tasks'))
const todoRootIds = computed(() => rootIdsOf('todos'))

// --- inline checklist add ----------------------------------------------------
const draft = ref('')
function addItem() {
  const t = draft.value.trim()
  if (!t) return
  app.addChecklistItem(props.goalId, t)
  draft.value = ''
}
// Inline edit protection: mark the item in the guard so a remote snapshot can't
// reorder or clobber it while a field is focused.
function beginEditItem(id: number) {
  guard.editingIds.add(id)
}
function endEditItem(id: number) {
  guard.editingIds.delete(id)
}
function onItemText(id: number, e: Event) {
  app.updateChecklistItem(id, { text: (e.target as HTMLInputElement).value })
}
function onEstimate(id: number, e: Event) {
  const v = (e.target as HTMLInputElement).value
  app.updateChecklistItem(id, { estimateMins: v === '' ? null : Math.max(0, parseInt(v, 10) || 0) })
}
function onDue(id: number, e: Event) {
  app.updateChecklistItem(id, { dueAt: (e.target as HTMLInputElement).value })
}
function toggleTimer(id: number, running: boolean) {
  if (running) app.stopChecklistTimer(id)
  else app.startChecklistTimer(id)
}

// --- checklist reorder (native DnD, fractional) ------------------------------
const dragItemId = ref<number | null>(null)
function onItemDragStart(id: number) {
  dragItemId.value = id
}
function onItemDrop(index: number) {
  if (dragItemId.value != null) app.moveChecklistItem(dragItemId.value, index)
  dragItemId.value = null
}

// --- attach picker -----------------------------------------------------------
const pickerFor = ref<'tasks' | 'todos' | null>(null)
const pickerSearch = ref('')
function openPicker(kind: 'tasks' | 'todos') {
  pickerSearch.value = ''
  pickerFor.value = kind
}
const pickerRows = computed(() => {
  if (!pickerFor.value) return []
  const q = pickerSearch.value.trim().toLowerCase()
  const src = pickerFor.value === 'tasks' ? tasks.value : todos.value
  return src
    .filter((it) => {
      const label = 'title' in it ? it.title : it.text
      return !q || label.toLowerCase().includes(q)
    })
    .slice(0, 60)
    .map((it) => ({
      id: it.id,
      label: ('title' in it ? it.title : it.text) || '(untitled)',
      attached: !!it.goalIds?.includes(props.goalId),
    }))
})
function togglePick(id: number, attached: boolean) {
  const col = pickerFor.value!
  if (attached) app.detachFromGoal(col, id, props.goalId)
  else app.attachToGoal(col, id, props.goalId)
}
async function createInGoal(collection: 'tasks' | 'todos') {
  if (collection === 'tasks') app.createTaskInGoal(props.goalId, 'New task')
  else app.createTodoInGoal(props.goalId, 'New todo')
  await nextTick()
}

// --- delete prompt -----------------------------------------------------------
const confirmDelete = ref(false)
function doDelete(checklistOnly: boolean) {
  app.deleteGoal(props.goalId, checklistOnly)
  confirmDelete.value = false
  if (!checklistOnly) emit('back')
}

// --- styles ------------------------------------------------------------------
const wrap = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
})
const backBtn = computed(() =>
  pxify({
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
  }),
)
const header = computed(() =>
  pxify({ ...rowBase(c.value), flexDirection: 'column', gap: 12, alignItems: 'stretch' }),
)
const headTop = pxify({ display: 'flex', alignItems: 'center', gap: 12 })
const titleInput = computed(() =>
  pxify({
    ...s.value.input,
    fontSize: 18,
    fontWeight: 700,
    flex: 1,
    minWidth: 0,
    background: 'transparent',
    border: 'none',
    padding: 0,
    color: c.value.text,
  }),
)
const descInput = computed(() =>
  pxify({ ...s.value.input, minHeight: 44, resize: 'vertical', width: '100%' }),
)
const dateRow = pxify({ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' })
const fieldLabel = computed(() => pxify({ fontSize: 11, color: c.value.dim, marginRight: 4 }))
const barTrack = computed(() =>
  pxify({ flex: 1, height: 8, borderRadius: 999, background: c.value.input, overflow: 'hidden' }),
)
const barFill = computed(() =>
  pxify({
    height: '100%',
    borderRadius: 999,
    background: c.value.accent,
    transition: 'width .35s ease',
  }),
)
const sectionTitle = computed(() =>
  pxify({
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: c.value.dim,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  }),
)
const smallBtn = computed(() =>
  pxify({
    fontSize: 11,
    fontWeight: 600,
    padding: '5px 10px',
    borderRadius: 999,
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
)
const itemRow = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 10,
    border: '1px solid ' + c.value.border,
    background: c.value.card,
    flexWrap: isMobile.value ? 'wrap' : 'nowrap',
  }),
)
const itemText = computed(() =>
  pxify({
    ...s.value.input,
    flex: 1,
    minWidth: 120,
    border: 'none',
    background: 'transparent',
    padding: '2px 4px',
  }),
)
const miniInput = computed(() =>
  pxify({ ...s.value.input, width: 74, padding: '4px 6px', fontSize: 12 }),
)
const dueInput = computed(() =>
  pxify({ ...s.value.input, width: 140, padding: '4px 6px', fontSize: 12 }),
)
const timerBtn = (running: boolean) =>
  pxify({
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 8px',
    borderRadius: 8,
    border: '1px solid ' + (running ? 'oklch(0.64 0.22 25)' : c.value.border),
    background: 'transparent',
    color: running ? 'oklch(0.64 0.22 25)' : c.value.dim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })
const spentTag = computed(() =>
  pxify({ fontSize: 11, color: c.value.dim, minWidth: 52, textAlign: 'right' }),
)
const gripDots = [0, 1, 2, 3, 4, 5]
const addRow = computed(() =>
  pxify({ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0' }),
)
const overlay = pxify({
  position: 'fixed',
  inset: '0',
  background: 'rgba(0,0,0,0.5)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 60,
  padding: 16,
})
const modal = computed(() =>
  pxify({
    ...rowBase(c.value),
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
    width: 'min(520px, 100%)',
    maxHeight: '80vh',
    background: c.value.glass,
    backdropFilter: 'blur(28px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(28px) saturate(1.6)',
  }),
)
const pickList = pxify({ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' })
const pickRow = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 13,
    color: c.value.text,
    border: '1px solid ' + c.value.border,
  }),
)
</script>

<template>
  <div v-if="goal" :style="wrap">
    <button :style="backBtn" @click="emit('back')">← All goals</button>

    <!-- Header -->
    <div :style="header">
      <div :style="headTop">
        <ProgressRing :ratio="progress.ratio" :size="52" />
        <input
          :style="titleInput"
          :value="goal.title"
          placeholder="Goal title"
          @input="app.updateGoal(goal.id, { title: ($event.target as HTMLInputElement).value })"
        />
        <select
          :style="s.select"
          :value="goal.status"
          @change="
            app.setGoalStatus(goal.id, ($event.target as HTMLSelectElement).value as GoalStatus)
          "
        >
          <option v-for="st in STATUS_OPTS" :key="st" :value="st">{{ st }}</option>
        </select>
        <button :style="smallBtn" @click="confirmDelete = true">Delete</button>
      </div>
      <textarea
        :style="descInput"
        :value="goal.description"
        placeholder="Description…"
        @input="
          app.updateGoal(goal.id, { description: ($event.target as HTMLTextAreaElement).value })
        "
      ></textarea>
      <div :style="dateRow">
        <label :style="fieldLabel">Start</label>
        <input
          type="date"
          :style="s.input"
          :value="goal.startDate"
          @change="
            app.updateGoal(goal.id, { startDate: ($event.target as HTMLInputElement).value })
          "
        />
        <label :style="fieldLabel">Target</label>
        <input
          type="date"
          :style="s.input"
          :value="goal.targetDate"
          @change="
            app.updateGoal(goal.id, { targetDate: ($event.target as HTMLInputElement).value })
          "
        />
      </div>
      <div :style="dateRow">
        <div :style="barTrack">
          <div :style="[barFill, { width: progress.ratio * 100 + '%' }]"></div>
        </div>
        <span :style="fieldLabel">{{ progress.done }}/{{ progress.total }}</span>
      </div>
      <div :style="fieldLabel">
        Time — estimated {{ fmtMins(time.estimate) }} · spent {{ fmtMins(time.spent) }}
      </div>
    </div>

    <!-- Checklist -->
    <div :style="sectionTitle">Checklist</div>
    <div :style="addRow">
      <input
        :style="s.input"
        style="flex: 1"
        v-model="draft"
        placeholder="Add a checklist item…"
        @keydown.enter="addItem"
      />
      <button :style="smallBtn" @click="addItem">Add</button>
    </div>
    <div v-if="checklist.length === 0" :style="s.empty">No checklist items yet.</div>
    <div
      v-for="(item, i) in checklist"
      :key="item.id"
      :style="itemRow"
      :draggable="true"
      @dragstart="onItemDragStart(item.id)"
      @dragover.prevent
      @drop="onItemDrop(i)"
    >
      <span :style="s.grip" role="button" aria-label="Drag to reorder" @click.stop
        ><span v-for="d in gripDots" :key="d" :style="s.gripDot"></span
      ></span>
      <input type="checkbox" :checked="item.done" @change="app.toggleChecklistItem(item.id)" />
      <input
        :style="itemText"
        :value="item.text"
        :placeholder="'Item'"
        @focus="beginEditItem(item.id)"
        @blur="endEditItem(item.id)"
        @input="onItemText(item.id, $event)"
      />
      <input
        :style="miniInput"
        type="number"
        min="0"
        :value="item.estimateMins ?? ''"
        placeholder="est m"
        @focus="beginEditItem(item.id)"
        @blur="endEditItem(item.id)"
        @input="onEstimate(item.id, $event)"
      />
      <input
        :style="dueInput"
        type="date"
        :value="item.dueAt"
        @focus="beginEditItem(item.id)"
        @blur="endEditItem(item.id)"
        @change="onDue(item.id, $event)"
      />
      <button
        :style="timerBtn(item.timerStartedAt != null)"
        @click="toggleTimer(item.id, item.timerStartedAt != null)"
      >
        {{ item.timerStartedAt != null ? '■ Stop' : '▶ Start' }}
      </button>
      <span :style="spentTag">{{ fmtMins(liveSpent(item.id)) }}</span>
      <button :style="s.del" @click="app.deleteChecklistItem(item.id)">×</button>
    </div>

    <!-- Tasks -->
    <div :style="sectionTitle">
      Tasks
      <button :style="smallBtn" @click="openPicker('tasks')">Attach existing…</button>
      <button :style="smallBtn" @click="createInGoal('tasks')">Create task</button>
    </div>
    <div v-if="taskRootIds.length === 0" :style="s.empty">No tasks attached.</div>
    <TreeList v-else collection="tasks" :root-ids="taskRootIds" />

    <!-- Todos -->
    <div :style="sectionTitle">
      Todos
      <button :style="smallBtn" @click="openPicker('todos')">Attach existing…</button>
      <button :style="smallBtn" @click="createInGoal('todos')">Create todo</button>
    </div>
    <div v-if="todoRootIds.length === 0" :style="s.empty">No todos attached.</div>
    <TreeList v-else collection="todos" :root-ids="todoRootIds" />

    <!-- Attach picker modal -->
    <div v-if="pickerFor" :style="overlay" @click.self="pickerFor = null">
      <div :style="modal">
        <div :style="sectionTitle">Attach {{ pickerFor }}</div>
        <input :style="s.input" v-model="pickerSearch" placeholder="Search…" />
        <div :style="pickList">
          <label v-for="row in pickerRows" :key="row.id" :style="pickRow">
            <input
              type="checkbox"
              :checked="row.attached"
              @change="togglePick(row.id, row.attached)"
            />
            <span>{{ row.label }}</span>
          </label>
          <div v-if="pickerRows.length === 0" :style="s.empty">Nothing to attach.</div>
        </div>
        <button :style="smallBtn" style="align-self: flex-end" @click="pickerFor = null">
          Done
        </button>
      </div>
    </div>

    <!-- Delete prompt -->
    <div v-if="confirmDelete" :style="overlay" @click.self="confirmDelete = false">
      <div :style="modal">
        <div :style="sectionTitle">Delete “{{ goal.title || 'goal' }}”?</div>
        <div :style="fieldLabel">
          Attached tasks and todos are never deleted — they only lose this goal link.
        </div>
        <button :style="smallBtn" @click="doDelete(false)">
          Unlink everything &amp; delete goal
        </button>
        <button :style="smallBtn" @click="doDelete(true)">Delete checklist only (keep goal)</button>
        <button :style="smallBtn" style="align-self: flex-end" @click="confirmDelete = false">
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>
