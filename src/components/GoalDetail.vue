<script setup lang="ts">
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import TextArea from '@/components/ui/TextArea.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Button from '@/components/ui/Button.vue'
import Modal from '@/components/ui/Modal.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
// Goal detail (task 8), the wide page. Laid out as a hero (ring, title,
// description, status), a strip of stat tiles (points, time, timeline, links),
// then two columns once the page is wide enough: the work itself (checklist,
// learnings, conclusion) on the left, its context (recurrence, KPIs, attached
// tasks and todos) on the right. Attached items reuse TreeList and are linked
// by reference — attaching never moves, detaching never deletes. Deleting a
// goal prompts (unlink everything / delete checklist only) and never
// cascade-deletes tasks or todos. Secondary actions live in one overflow menu.
import { computed, ref, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useGoals } from '@/composables/useGoals'
import { useStyles } from '@/composables/useStyles'
import { useSyncGuard } from '@/composables/useSyncGuard'
import { daysRemaining } from '@/utils/detailFields'
import { vScrollFade } from '@/directives/scrollFade'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import TreeList from '@/components/TreeList.vue'
import Icon from '@/components/ui/Icon.vue'
import GoalMetricPanel from '@/components/GoalMetricPanel.vue'
import GoalPointRow from '@/components/goals/GoalPointRow.vue'
import MilestoneKpis from '@/components/goals/MilestoneKpis.vue'
import MilestoneLearnings from '@/components/goals/MilestoneLearnings.vue'
import MilestoneConclusion from '@/components/goals/MilestoneConclusion.vue'
import MilestoneStatus from '@/components/goals/MilestoneStatus.vue'
import MilestoneSaveState from '@/components/goals/MilestoneSaveState.vue'
import { isClosed } from '@/utils/milestoneProgress'
import type { GoalStatus } from '@/types'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'

const props = defineProps<{ goalId: number }>()
const emit = defineEmits<{ (e: 'back'): void }>()

const app = useAppStore()
const ui = useUiStore()
const goalsApi = useGoals()
const { isMobile } = useStyles()
const guard = useSyncGuard()
const { goals, goalChecklist, tasks, todos } = storeToRefs(app)
const { now } = storeToRefs(ui)

const goal = computed(() => goals.value.find((g) => g.id === props.goalId))
// Closed milestones are read-only until reopened (spec section 5).
const closed = computed(() => !!goal.value && isClosed(goal.value))
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

// Done comes from closing with a conclusion, not from this picker.
const STATUS_OPTS: GoalStatus[] = ['active', 'paused', 'archived']

// --- attached items (reuse TreeList; root = attached with no attached parent) --
function rootIdsOf(collection: 'tasks' | 'todos') {
  const attached =
    collection === 'tasks' ? app.tasksOfGoal(props.goalId) : app.todosOfGoal(props.goalId)
  const set = new Set(attached.map((t) => t.id))
  return attached.filter((t) => t.parentId == null || !set.has(t.parentId)).map((t) => t.id)
}
const taskRootIds = computed(() => rootIdsOf('tasks'))
const todoRootIds = computed(() => rootIdsOf('todos'))
const taskCount = computed(() => app.tasksOfGoal(props.goalId).length)
const todoCount = computed(() => app.todosOfGoal(props.goalId).length)

// --- hero / stat tiles ---------------------------------------------------------
const percent = computed(() => Math.round(progress.value.ratio * 100))
// Ticks over with the ui clock, so "3 days left" rolls at midnight on its own.
const daysLeft = computed(() =>
  goal.value && !closed.value ? daysRemaining(goal.value.targetDate, new Date(now.value)) : null,
)
// Spent against estimate, capped for the bar; over-budget shows as a full bar
// in the warning colour rather than overflowing the tile.
const timeRatio = computed(() =>
  time.value.estimate ? Math.min(1, time.value.spent / time.value.estimate) : 0,
)
const overBudget = computed(() => !!time.value.estimate && time.value.spent > time.value.estimate)

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
// The row hands back values rather than events, and brackets each write with
// the edit guard so a remote snapshot cannot land mid-keystroke.
function onItemTextValue(id: number, text: string) {
  beginEditItem(id)
  app.updateChecklistItem(id, { text })
  endEditItem(id)
}
function onEstimateValue(id: number, estimateMins: number | null) {
  beginEditItem(id)
  app.updateChecklistItem(id, { estimateMins })
  endEditItem(id)
}
// Plain Enter finishes a point and moves to the next, adding one at the end.
async function onItemCommit(index: number) {
  if (!checklist.value[index + 1]) {
    app.addChecklistItem(props.goalId, '')
    await nextTick()
  }
  await nextTick()
  const fields = document.querySelectorAll<HTMLTextAreaElement>('.gpr__text')
  fields[index + 1]?.focus()
}
// The picker hands back the value itself; the edit guard still brackets it so a
// remote snapshot cannot land mid-change.
function onDueValue(id: number, value: string) {
  beginEditItem(id)
  app.updateChecklistItem(id, { dueAt: value })
  endEditItem(id)
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

// --- export (canonical JSON, task 10a) ---------------------------------------
function onExport() {
  const json = app.exportGoal(props.goalId, new Date().toISOString())
  if (!json) return
  const name = (goal.value?.title || 'goals').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'goals'
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.goals.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// --- duplicate / archive ------------------------------------------------------
function onDuplicate() {
  void goalsApi.duplicate(props.goalId)
  emit('back')
}
function onToggleArchive() {
  if (goal.value?.status === 'archived') void goalsApi.unarchive(props.goalId)
  else void goalsApi.archive(props.goalId)
}

// --- overflow menu -------------------------------------------------------------
const menuItems = computed(() => [
  { value: 'duplicate', label: 'Duplicate', icon: 'copy' as const },
  {
    value: 'archive',
    label: goal.value?.status === 'archived' ? 'Unarchive' : 'Archive',
    icon: 'archive' as const,
  },
  { value: 'export', label: 'Export as JSON', icon: 'download' as const },
  { value: 'delete', label: 'Delete…', icon: 'trash' as const, danger: true },
])
function onMenu(value: string) {
  if (value === 'duplicate') onDuplicate()
  else if (value === 'archive') onToggleArchive()
  else if (value === 'export') onExport()
  else if (value === 'delete') confirmDelete.value = true
}

// --- delete prompt -----------------------------------------------------------
const confirmDelete = ref(false)
function doDelete(checklistOnly: boolean) {
  confirmDelete.value = false
  if (checklistOnly) {
    app.deleteGoal(props.goalId, true)
    return
  }
  // Unlink-everything delete goes through the composable so it carries the 8s
  // Undo toast (restores the goal, its checklist and the attachment links).
  void goalsApi.remove(props.goalId)
  emit('back')
}
</script>

<template>
  <div v-if="goal" class="gd" :class="{ 'is-closed': closed, 'is-mobile': isMobile }">
    <!-- The head stays put: what the milestone is and where it stands are
         always in view while the sections below scroll under it. -->
    <div class="gd__head">
      <!-- Top bar: the way back, the save state, and every secondary action. -->
      <div class="gd__bar">
        <button type="button" class="panel-action gd__back" @click="emit('back')">
          <Icon name="chevron-left" size="sm" />All milestones
        </button>
        <div class="gd__bar-end">
          <MilestoneSaveState />
          <Dropdown :items="menuItems" label="Milestone actions" variant="icon" @select="onMenu" />
        </div>
      </div>

      <!-- Hero -->
      <section class="gd__hero">
        <ProgressRing :ratio="progress.ratio" :size="isMobile ? 56 : 76" :stroke="6" />
        <div class="gd__heading">
          <TextInput
            class="gd__title"
            :model-value="goal.title"
            placeholder="Milestone title"
            aria-label="Milestone title"
            @update:model-value="app.updateGoal(goal.id, { title: $event })"
          />
          <div class="gd__meta">
            <MilestoneStatus :goal-id="goal.id" full />
            <Select
              v-if="!closed"
              class="gd__status"
              :model-value="goal.status"
              @update:model-value="app.setGoalStatus(goal.id, $event as GoalStatus)"
              :options="[...STATUS_OPTS.map((st) => ({ value: String(st), label: st }))]"
            />
            <span v-if="daysLeft" class="gd__chip" :class="`is-${daysLeft.tone}`">
              <Icon name="flag" size="xs" />{{ daysLeft.text }}
            </span>
          </div>
          <TextArea
            :model-value="goal.description"
            placeholder="What does done look like? Add a description…"
            @update:model-value="app.updateGoal(goal.id, { description: $event })"
          />
        </div>
      </section>

      <!-- Stat tiles: the four numbers worth a glance before scrolling. -->
      <div class="gd__stats">
        <div class="gd__tile">
          <span class="gd__tile-label"><Icon name="check-square" size="xs" />Points</span>
          <span class="gd__tile-value">
            {{ progress.done }}<small>/ {{ progress.total }}</small>
            <em>{{ percent }}%</em>
          </span>
          <div class="gd__bar-track">
            <div class="gd__bar-fill" :style="{ width: progress.ratio * 100 + '%' }"></div>
          </div>
        </div>
        <div class="gd__tile">
          <span class="gd__tile-label"><Icon name="clock" size="xs" />Time</span>
          <span class="gd__tile-value">
            {{ fmtMins(time.spent) }}<small>/ {{ fmtMins(time.estimate) }} est.</small>
          </span>
          <div class="gd__bar-track">
            <div
              class="gd__bar-fill"
              :class="{ 'is-over': overBudget }"
              :style="{ width: timeRatio * 100 + '%' }"
            ></div>
          </div>
        </div>
        <div class="gd__tile gd__tile--wide">
          <span class="gd__tile-label"><Icon name="calendar" size="xs" />Timeline</span>
          <div class="gd__dates">
            <GlassDatePicker
              :model-value="goal.startDate"
              placeholder="Start"
              @update:model-value="app.updateGoal(goal.id, { startDate: String($event ?? '') })"
            />
            <Icon name="chevron-right" size="sm" class="gd__dates-arrow" />
            <GlassDatePicker
              :model-value="goal.targetDate"
              :min="goal.startDate || null"
              placeholder="Target"
              @update:model-value="app.updateGoal(goal.id, { targetDate: String($event ?? '') })"
            />
          </div>
        </div>
        <div class="gd__tile">
          <span class="gd__tile-label"><Icon name="paperclip" size="xs" />Linked</span>
          <span class="gd__tile-value">
            {{ taskCount }}<small>tasks</small>{{ todoCount }}<small>todos</small>
          </span>
        </div>
      </div>
    </div>

    <!-- Only this part scrolls: as one column when narrow, each column on its
         own when wide, so a long checklist never drags the tasks out of view. -->
    <div v-scroll-fade class="gd__grid">
      <!-- The work: points, what they taught, and how the milestone closes. -->
      <div v-scroll-fade class="gd__col">
        <section class="gd__card">
          <header class="gd__card-head">
            <Icon name="check-square" size="sm" />
            <h3>Checklist</h3>
            <span class="gd__count">{{ progress.done }}/{{ progress.total }}</span>
          </header>
          <div v-if="checklist.length === 0" class="gd__empty">
            No points yet — break the milestone into the steps that get it done.
          </div>
          <div class="gd__points">
            <div
              v-for="(item, i) in checklist"
              :key="item.id"
              :draggable="!closed"
              class="gd__point"
              :class="{ 'is-dragging': dragItemId === item.id }"
              @dragstart="onItemDragStart(item.id)"
              @dragover.prevent
              @drop="onItemDrop(i)"
              @dragend="dragItemId = null"
            >
              <!-- The same row the dialog uses (section 20b), so a point reads and
                   behaves identically on the wide page and in the dialog. -->
              <GoalPointRow
                :point="item"
                :spent="liveSpent(item.id)"
                :mobile="isMobile"
                :locked="closed"
                @toggle="app.toggleChecklistItem(item.id)"
                @update:text="onItemTextValue(item.id, $event)"
                @commit="onItemCommit(i)"
                @update:estimate="onEstimateValue(item.id, $event)"
                @update:due="onDueValue(item.id, $event)"
                @toggle-timer="toggleTimer(item.id, item.timerStartedAt != null)"
                @remove="app.deleteChecklistItem(item.id)"
              />
            </div>
          </div>
          <form v-if="!closed" class="gd__add" @submit.prevent="addItem">
            <TextInput v-model="draft" icon="plus" placeholder="Add a point…" size="sm" />
            <Button type="submit" size="sm" variant="tinted" :disabled="!draft.trim()">Add</Button>
          </form>
        </section>

        <!-- Everything the points taught, with their examples. -->
        <section class="gd__card">
          <header class="gd__card-head">
            <Icon name="notebook" size="sm" />
            <h3>What I’ve learnt</h3>
          </header>
          <MilestoneLearnings :goal-id="goalId" />
        </section>

        <!-- How the milestone closes: the step that turns 100% into Completed. -->
        <section class="gd__card">
          <header class="gd__card-head">
            <Icon name="flag" size="sm" />
            <h3>Conclusion</h3>
          </header>
          <MilestoneConclusion :goal-id="goalId" />
        </section>
      </div>

      <!-- The context: recurrence, the numbers, and the linked work. -->
      <div v-scroll-fade class="gd__col">
        <!-- GoalMetricPanel draws its own card, so it gets a heading, not a box. -->
        <section class="gd__plain">
          <header class="gd__card-head">
            <Icon name="repeat" size="sm" />
            <h3>Recurrence</h3>
          </header>
          <GoalMetricPanel :goal-id="goalId" />
        </section>

        <section class="gd__card">
          <header class="gd__card-head">
            <Icon name="star" size="sm" />
            <h3>KPIs</h3>
          </header>
          <MilestoneKpis :goal-id="goalId" />
        </section>

        <section class="gd__card">
          <header class="gd__card-head">
            <Icon name="list" size="sm" />
            <h3>Tasks</h3>
            <span class="gd__count">{{ taskCount }}</span>
            <div class="gd__card-actions">
              <Button size="sm" variant="ghost" @click="openPicker('tasks')">Attach</Button>
              <Button size="sm" variant="ghost" @click="createInGoal('tasks')">+ New</Button>
            </div>
          </header>
          <div v-if="taskRootIds.length === 0" class="gd__empty">No tasks attached.</div>
          <TreeList v-else collection="tasks" :root-ids="taskRootIds" />
        </section>

        <section class="gd__card">
          <header class="gd__card-head">
            <Icon name="check" size="sm" />
            <h3>Todos</h3>
            <span class="gd__count">{{ todoCount }}</span>
            <div class="gd__card-actions">
              <Button size="sm" variant="ghost" @click="openPicker('todos')">Attach</Button>
              <Button size="sm" variant="ghost" @click="createInGoal('todos')">+ New</Button>
            </div>
          </header>
          <div v-if="todoRootIds.length === 0" class="gd__empty">No todos attached.</div>
          <TreeList v-else collection="todos" :root-ids="todoRootIds" />
        </section>
      </div>
    </div>

    <!-- Attach picker -->
    <Modal :open="pickerFor != null" :title="`Attach ${pickerFor ?? ''}`" @close="pickerFor = null">
      <div class="gd__picker">
        <TextInput v-model="pickerSearch" icon="search" placeholder="Search…" size="sm" />
        <div class="gd__pick-list">
          <label
            v-for="row in pickerRows"
            :key="row.id"
            class="gd__pick-row"
            :class="{ 'is-on': row.attached }"
          >
            <Checkbox
              :model-value="row.attached"
              @update:model-value="togglePick(row.id, row.attached)"
            />
            <span>{{ row.label }}</span>
          </label>
          <div v-if="pickerRows.length === 0" class="gd__empty">Nothing to attach.</div>
        </div>
      </div>
      <template #footer>
        <Button variant="primary" @click="pickerFor = null">Done</Button>
      </template>
    </Modal>

    <!-- Delete prompt -->
    <Modal
      :open="confirmDelete"
      :title="`Delete “${goal.title || 'milestone'}”?`"
      size="sm"
      @close="confirmDelete = false"
    >
      <p class="gd__note">
        Attached tasks and todos are never deleted — they only lose this milestone link.
      </p>
      <template #footer>
        <Button variant="secondary" @click="confirmDelete = false">Cancel</Button>
        <Button variant="secondary" @click="doDelete(true)">Delete checklist only</Button>
        <Button variant="danger" @click="doDelete(false)">Delete milestone</Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
/* The page itself never scrolls: the head is fixed and the grid below takes
   the rest of the height and scrolls inside it. */
.gd {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.gd__head {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  flex: none;
}
/* A long description would push the scrolling part off the screen, so it
   scrolls inside its own field past a few lines. */
.gd__heading :deep(textarea) {
  max-height: 88px;
  overflow-y: auto;
}

/* --- top bar ------------------------------------------------------------- */
.gd__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
}
.gd__back {
  color: var(--theme-dim);
}
.gd__back:hover {
  color: var(--theme-text);
}
.gd__bar-end {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

/* --- hero ---------------------------------------------------------------- */
.gd__hero {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-4);
  padding: var(--sp-5);
  border-radius: var(--radius-xl, var(--radius-card));
  border: 1px solid var(--theme-border);
  background:
    radial-gradient(
      120% 140% at 0% 0%,
      color-mix(in srgb, var(--theme-accent) 10%, transparent),
      transparent 60%
    ),
    var(--theme-card);
}
.gd__heading {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
/* The library field, dressed as a heading: no box until hovered or focused,
   then it shows it is a field. */
.gd__title {
  margin-left: -11px;
  width: calc(100% + 11px);
}
.gd__title :deep(.ui-control) {
  padding: 2px 10px;
  border-color: transparent;
  background: transparent;
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);
  line-height: 1.2;
}
.gd__title :deep(.ui-control:hover) {
  border-color: var(--theme-border);
}
.gd__title :deep(.ui-control:focus-within) {
  border-color: var(--theme-accent);
  background: var(--theme-input);
}
.gd__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}
.gd__status {
  width: auto;
  min-width: 120px;
}
.gd__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-border);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: var(--theme-dim);
}
.gd__chip.is-today {
  color: var(--theme-warning);
  border-color: color-mix(in srgb, var(--theme-warning) 40%, transparent);
}
.gd__chip.is-overdue {
  color: var(--theme-danger);
  border-color: color-mix(in srgb, var(--theme-danger) 40%, transparent);
  background: color-mix(in srgb, var(--theme-danger) 8%, transparent);
}

/* --- stat tiles ---------------------------------------------------------- */
.gd__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--sp-3);
}
.gd__tile {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-card);
  border: 1px solid var(--theme-border);
  background: var(--theme-card);
}
.gd__tile--wide {
  grid-column: span 2;
}
.gd__tile-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.gd__tile-value {
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  color: var(--theme-text);
}
.gd__tile-value small {
  margin: 0 10px 0 4px;
  font-size: var(--text-sm);
  font-weight: var(--weight-normal);
  color: var(--theme-dim);
}
.gd__tile-value em {
  font-style: normal;
  font-size: var(--text-sm);
  color: var(--theme-accent);
}
.gd__bar-track {
  height: 6px;
  margin-top: auto;
  border-radius: var(--radius-pill);
  background: var(--theme-input);
  overflow: hidden;
}
.gd__bar-fill {
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--theme-accent);
  transition: width 0.35s var(--ease-out, ease);
}
.gd__bar-fill.is-over {
  background: var(--theme-warning);
}
.gd__dates {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}
.gd__dates > :not(.gd__dates-arrow) {
  flex: 1;
  min-width: 130px;
}
.gd__dates-arrow {
  color: var(--theme-dim);
}

/* --- body columns -------------------------------------------------------- */
/* Narrow: one column, and the grid is the scroller. */
.gd__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: var(--sp-4);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-bottom: var(--sp-6);
}
.gd__col {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
}
/* Wide: two columns that each scroll on their own, so reading the checklist
   never moves the tasks and KPIs out of view. */
@container (min-width: 880px) {
  .gd__grid {
    grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr);
    align-content: stretch;
    overflow: hidden;
    padding-bottom: 0;
  }
  .gd__col {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-bottom: var(--sp-6);
    scrollbar-gutter: stable;
  }
}
/* A phone or a short window has no room for a fixed head: it scrolls as one
   page again, with only the top bar pinned so the way back is always there. */
.gd.is-mobile {
  overflow-y: auto;
}
.gd.is-mobile .gd__grid,
.gd.is-mobile .gd__col {
  overflow: visible;
  flex: none;
}
.gd.is-mobile .gd__bar {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: var(--sp-2) 0;
  background: var(--theme-surface);
}
@media (max-height: 640px) {
  .gd {
    overflow-y: auto;
  }
  .gd__grid,
  .gd__col {
    overflow: visible !important;
    flex: none;
  }
  .gd__bar {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: var(--sp-2) 0;
    background: var(--theme-surface);
  }
}
.gd__card,
.gd__plain {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.gd__card {
  padding: var(--sp-4);
  border-radius: var(--radius-card);
  border: 1px solid var(--theme-border);
  background: var(--theme-card);
}
.gd__card-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 28px;
  color: var(--theme-dim);
}
.gd__card-head h3 {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.gd__count {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: var(--theme-input);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--theme-dim);
}
.gd__card-actions {
  display: flex;
  gap: var(--sp-1);
  margin-left: auto;
}
.gd__empty {
  padding: var(--sp-3);
  border-radius: var(--radius-control);
  border: 1px dashed var(--theme-border);
  font-size: var(--text-sm);
  text-align: center;
  color: var(--theme-dim);
}
.gd__points {
  display: flex;
  flex-direction: column;
}
.gd__point {
  border-radius: var(--radius-control);
  transition: opacity var(--dur-fast, 150ms) ease;
}
.gd__point.is-dragging {
  opacity: 0.4;
}
.gd__add {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.gd__add > :first-child {
  flex: 1;
}

/* --- dialogs ------------------------------------------------------------- */
.gd__picker {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.gd__pick-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  max-height: 50vh;
  overflow-y: auto;
}
.gd__pick-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 8px 10px;
  border-radius: var(--radius-control);
  border: 1px solid var(--theme-border);
  font-size: var(--text-sm);
  color: var(--theme-text);
  cursor: pointer;
  transition:
    background var(--dur-fast, 150ms) ease,
    border-color var(--dur-fast, 150ms) ease;
}
.gd__pick-row:hover {
  background: var(--theme-input);
}
.gd__pick-row.is-on {
  border-color: color-mix(in srgb, var(--theme-accent) 50%, transparent);
  background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
}
.gd__note {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-dim);
}

/* --- narrow -------------------------------------------------------------- */
@container (max-width: 520px) {
  .gd__hero {
    flex-direction: column;
    padding: var(--sp-4);
  }
  .gd__tile--wide {
    grid-column: 1 / -1;
  }
  .gd__title :deep(.ui-control) {
    font-size: var(--text-xl);
  }
}
</style>
