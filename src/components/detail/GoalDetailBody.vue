<script setup lang="ts">
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
// The goal side of the detail dialog (section 18d). The same rules as the task
// body — inline everything, no Save button — over a different set of blocks:
// progress, timeline, the recurring/metric panel, the points checklist, the
// attached tasks and todos, and the description.
//
// The recurrence block is GoalMetricPanel, unchanged from section 11: today's
// occurrence with its tick control, the capture popover, target vs actual and
// the mini chart already live there, and a second implementation of any of that
// would drift from the one on the wide page.
import { computed, nextTick, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useInlineField } from '@/composables/useInlineField'
import { daysRemaining, formatMinutes, relativeStamp } from '@/utils/detailFields'
import DetailSection from '@/components/detail/DetailSection.vue'
import NotesSection from '@/components/detail/NotesSection.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import GoalMetricPanel from '@/components/GoalMetricPanel.vue'
import GoalPointRow from '@/components/goals/GoalPointRow.vue'
import NoteEditor from '@/components/notes/NoteEditor.vue'
import ColorPicker from '@/components/ui/ColorPicker.vue'
import { downloadText } from '@/utils/noteExport'
import type { GoalStatus } from '@/types'

const props = defineProps<{ goalId: number }>()
const emit = defineEmits<{ open: [{ kind: 'task' | 'goal'; id: number }]; close: [] }>()

const app = useAppStore()
const ui = useUiStore()
const router = useRouter()
const { isMobile } = useStyles()
const { goals, goalChecklist } = storeToRefs(app)
const { now } = storeToRefs(ui)

const goal = computed(() => goals.value.find((g) => g.id === props.goalId))

// --- the dirty flag the shell's close guard reads ---------------------------
const pendingFields = ref(new Set<string>())
function fieldDirty(name: string) {
  return (dirty: boolean) => {
    if (dirty) pendingFields.value.add(name)
    else pendingFields.value.delete(name)
    // The names, not the count: the sheet that asks about them says which.
    app.setDetailDirty([...pendingFields.value])
  }
}

const description = useInlineField({
  value: () => goal.value?.description ?? '',
  commit: (next) => app.updateGoal(props.goalId, { description: next }),
  onDirty: fieldDirty('description'),
})

// --- header ------------------------------------------------------------------
const STATUSES: GoalStatus[] = ['active', 'paused', 'done', 'archived']
const menuItems = [
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'archive', label: 'Archive' },
  { value: 'export', label: 'Export JSON' },
  // Section 23: the schema is most wanted right after Export JSON, by somebody
  // looking at a document and wondering what else they could have put in it.
  { value: 'help', label: 'Help' },
  { value: 'delete', label: 'Delete' },
]
function onMenu(action: string) {
  // Help is about goals in general, not about this one, so it works whether or
  // not the goal behind the dialog has finished loading.
  if (action === 'help') {
    app.openGoalHelp('json')
    return
  }
  if (!goal.value) return
  if (action === 'duplicate') {
    const copy = app.duplicateGoal(props.goalId)
    if (copy != null) emit('open', { kind: 'goal', id: copy })
  } else if (action === 'archive') {
    app.archiveGoal(props.goalId)
    emit('close')
  } else if (action === 'export') {
    // exportGoal already produces the document JSON; this only names the file
    // and hands it over, through the same anchor the notes export uses.
    const json = app.exportGoal(props.goalId, new Date().toISOString())
    if (!json) return
    const slug =
      (goal.value.title || 'goal')
        .toLowerCase()
        .replace(/[^\w]+/g, '-')
        .replace(/^-|-$/g, '') || 'goal'
    downloadText(json, `${slug}.json`, 'application/json;charset=utf-8')
  } else if (action === 'delete') {
    app.removeGoalWithUndo(props.goalId)
    emit('close')
  }
}

// --- progress ----------------------------------------------------------------
const progress = computed(() => app.goalProgress(props.goalId))
const counts = computed(() => app.goalCounts(props.goalId))
const points = computed(() => app.checklistOf(props.goalId))
const attachedTasks = computed(() => app.tasksOfGoal(props.goalId))
const attachedTodos = computed(() => app.todosOfGoal(props.goalId))
const pointsDone = computed(() => points.value.filter((p) => p.done).length)
const tasksDone = computed(() => attachedTasks.value.filter((t) => t.done).length)
const todosDone = computed(() => attachedTodos.value.filter((t) => t.done).length)

// Estimated vs spent across the points, including a timer that is running now.
const time = computed(() => {
  const base = app.goalTime(props.goalId)
  let live = 0
  for (const item of goalChecklist.value) {
    if (item.goalId === props.goalId && item.timerStartedAt != null)
      live += Math.max(0, Math.round((now.value - item.timerStartedAt) / 60000))
  }
  return { estimate: base.estimate, spent: base.spent + live }
})
function liveSpent(itemId: number): number {
  const item = goalChecklist.value.find((c) => c.id === itemId)
  if (!item) return 0
  const running =
    item.timerStartedAt != null
      ? Math.max(0, Math.round((now.value - item.timerStartedAt) / 60000))
      : 0
  return item.spentMins + running
}

// --- timeline ----------------------------------------------------------------
const daysChip = computed(() => daysRemaining(goal.value?.targetDate ?? ''))

// --- points ------------------------------------------------------------------
const pointDraft = ref('')
function addPoint() {
  const text = pointDraft.value.trim()
  if (!text) return
  app.addChecklistItem(props.goalId, text)
  pointDraft.value = ''
}
const dragPointId = ref<number | null>(null)
function onPointDrop(position: number) {
  if (dragPointId.value != null) app.moveChecklistItem(dragPointId.value, position)
  dragPointId.value = null
}
// Plain Enter on a point finishes it and moves to the next — creating one at
// the end, so a list can be typed straight through without reaching for the
// mouse (section 20b).
async function onPointCommit(index: number) {
  const next = points.value[index + 1]
  if (!next) {
    app.addChecklistItem(props.goalId, '')
    await nextTick()
  }
  await nextTick()
  const fields = document.querySelectorAll<HTMLTextAreaElement>('.gpr__text')
  fields[index + 1]?.focus()
}
function toggleTimer(itemId: number, running: boolean) {
  if (running) app.stopChecklistTimer(itemId)
  else app.startChecklistTimer(itemId)
}

// --- attachments -------------------------------------------------------------
// Attached tasks drill in rather than opening fresh, so the back arrow returns
// to this goal (section 18d).
function openTask(taskId: number) {
  emit('open', { kind: 'task', id: taskId })
}

// --- footer ------------------------------------------------------------------
function openFullPage() {
  void router.push(`/goals/${props.goalId}`)
}

defineExpose({
  flush() {
    description.flush()
  },
  revert() {
    description.revert()
  },
})
</script>

<template>
  <div v-if="goal" class="gdb">
    <div class="gdb__row gdb__row--head">
      <span class="gdb__swatch" :style="{ background: goal.color || 'var(--theme-accent)' }"></span>
      <ColorPicker
        label="Goal colour"
        :model-value="goal.color"
        @update:model-value="app.setGoalColor(goal.id, $event)"
      />
      <Select
        class="gdb__input gdb__status"
        aria-label="Goal status"
        :model-value="goal.status"
        @update:model-value="app.setGoalStatus(goal.id, $event as GoalStatus)"
        :options="[...STATUSES.map((st) => ({ value: String(st), label: st }))]"
      />
      <span v-if="daysChip" class="gdb__chip" :class="`gdb__chip--${daysChip.tone}`">
        {{ daysChip.text }}
      </span>
      <span class="gdb__spacer"></span>
      <Dropdown label="Goal actions" :items="menuItems" @select="onMenu" />
    </div>

    <DetailSection label="Progress">
      <div class="gdb__progress">
        <ProgressRing :ratio="progress.ratio" :size="56" :color="goal.color || undefined" />
        <div class="gdb__progresstext">
          <ProgressBar :value="progress.done" :max="Math.max(1, progress.total)" />
          <span class="gdb__muted">
            {{ progress.done }} of {{ progress.total }} done — {{ pointsDone }}/{{
              counts.checklist
            }}
            points, {{ tasksDone }}/{{ counts.tasks }} tasks, {{ todosDone }}/{{ counts.todos }}
            todos
          </span>
          <span class="gdb__muted">
            {{ formatMinutes(time.spent) }} spent of {{ formatMinutes(time.estimate) }} estimated
          </span>
        </div>
      </div>
    </DetailSection>

    <DetailSection label="Timeline">
      <div class="gdb__grid">
        <label class="gdb__field">
          <span class="gdb__key">Starts</span>
          <GlassDatePicker
            size="sm"
            clearable
            placeholder="No start date"
            :model-value="goal.startDate"
            @update:model-value="app.setGoalTimeline(goal.id, { start: String($event ?? '') })"
          />
        </label>
        <label class="gdb__field">
          <span class="gdb__key">Target</span>
          <GlassDatePicker
            size="sm"
            clearable
            placeholder="No target date"
            :model-value="goal.targetDate"
            @update:model-value="app.setGoalTimeline(goal.id, { target: String($event ?? '') })"
          />
        </label>
      </div>
    </DetailSection>

    <!-- Recurrence and the metric, when the goal has them. -->
    <DetailSection label="Repeats">
      <GoalMetricPanel :goal-id="goal.id" />
    </DetailSection>

    <DetailSection label="Points" :hint="`${pointsDone}/${points.length}`">
      <div
        v-for="(point, i) in points"
        :key="point.id"
        draggable="true"
        @dragstart="dragPointId = point.id"
        @dragover.prevent
        @drop="onPointDrop(i)"
      >
        <GoalPointRow
          :point="point"
          :spent="liveSpent(point.id)"
          :mobile="isMobile"
          @toggle="app.toggleChecklistItem(point.id)"
          @update:text="app.updateChecklistItem(point.id, { text: $event })"
          @commit="onPointCommit(i)"
          @update:estimate="app.updateChecklistItem(point.id, { estimateMins: $event })"
          @update:due="app.updateChecklistItem(point.id, { dueAt: $event })"
          @toggle-timer="toggleTimer(point.id, point.timerStartedAt != null)"
          @remove="app.deleteChecklistItem(point.id)"
        />
      </div>
      <div class="gdb__addrow">
        <TextInput
          placeholder="Add a point…"
          :model-value="pointDraft"
          @update:model-value="pointDraft = $event"
          @keydown.enter.prevent="addPoint"
        />
        <button type="button" class="gdb__mini" @click="addPoint">Add</button>
      </div>
    </DetailSection>

    <DetailSection label="Tasks" :hint="`${tasksDone}/${attachedTasks.length}`">
      <div v-for="t in attachedTasks" :key="t.id" class="gdb__attached">
        <button
          type="button"
          class="gdb__box"
          :class="t.done && 'gdb__box--on'"
          :aria-label="t.done ? 'Mark not done' : 'Mark done'"
          @click.stop="app.toggleTask(t.id)"
        >
          <span v-if="t.done" aria-hidden="true">✓</span>
        </button>
        <button
          type="button"
          class="gdb__attachedtitle"
          :class="t.done && 'gdb__attachedtitle--done'"
          @click="openTask(t.id)"
        >
          {{ t.title || 'Untitled' }}
        </button>
        <button
          type="button"
          class="gdb__mini"
          @click.stop="app.detachFromGoal('tasks', t.id, goal.id)"
        >
          Detach
        </button>
      </div>
      <span v-if="!attachedTasks.length" class="gdb__muted">No tasks attached.</span>
    </DetailSection>

    <DetailSection label="Todos" :hint="`${todosDone}/${attachedTodos.length}`">
      <div v-for="t in attachedTodos" :key="t.id" class="gdb__attached">
        <button
          type="button"
          class="gdb__box"
          :class="t.done && 'gdb__box--on'"
          :aria-label="t.done ? 'Mark not done' : 'Mark done'"
          @click.stop="app.toggleTodo(t.id)"
        >
          <span v-if="t.done" aria-hidden="true">✓</span>
        </button>
        <span class="gdb__attachedtitle" :class="t.done && 'gdb__attachedtitle--done'">
          {{ t.text || 'Untitled' }}
        </span>
        <button
          type="button"
          class="gdb__mini"
          @click.stop="app.detachFromGoal('todos', t.id, goal.id)"
        >
          Detach
        </button>
      </div>
      <span v-if="!attachedTodos.length" class="gdb__muted">No todos attached.</span>
    </DetailSection>

    <DetailSection label="Description">
      <NoteEditor
        :model-value="description.draft.value"
        placeholder="What does done look like?"
        @update:model-value="description.set"
      />
    </DetailSection>

    <NotesSection type="goal" :id="goalId" />

    <DetailSection label="Activity" collapsible :start-open="false">
      <span class="gdb__muted">Created {{ relativeStamp(goal.createdAt) }}</span>
      <span class="gdb__muted">Updated {{ relativeStamp(goal.updatedAt) }}</span>
    </DetailSection>

    <div class="gdb__footer">
      <button type="button" class="gdb__mini" @click="openFullPage">Open full page</button>
    </div>
  </div>
</template>

<style scoped>
.gdb {
  display: contents;
}
.gdb__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.gdb__spacer {
  flex: 1;
}
.gdb__swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}
.gdb__status {
  text-transform: capitalize;
}
.gdb__chip {
  padding: 2px var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid currentColor;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
}
.gdb__chip--overdue {
  color: oklch(0.64 0.22 25);
}
.gdb__chip--today {
  color: oklch(0.72 0.16 55);
}
.gdb__chip--ahead {
  color: var(--theme-dim);
}
.gdb__progress {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.gdb__progresstext {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.gdb__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sp-3);
}
.gdb__field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.gdb__key {
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.gdb__input {
  min-width: 0;
  padding: var(--sp-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: var(--theme-input, transparent);
  color: var(--theme-text);
  font-size: var(--text-xs);
  font-family: inherit;
}
.gdb__point,
.gdb__attached {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.gdb__pointtext {
  flex: 1;
  min-width: 120px;
}
.gdb__pointtext--done {
  text-decoration: line-through;
  color: var(--theme-dim);
}
.gdb__mins {
  width: 64px;
  flex-shrink: 0;
}
.gdb__box {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--glass-border);
  background: transparent;
  color: var(--theme-on-accent, #fff);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  cursor: pointer;
}
.gdb__box--on {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
}
.gdb__attachedtitle {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-xs);
  text-align: left;
  cursor: pointer;
}
.gdb__attachedtitle--done {
  text-decoration: line-through;
  color: var(--theme-dim);
}
.gdb__mini {
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  cursor: pointer;
  white-space: nowrap;
}
.gdb__mini:hover {
  color: var(--theme-text);
}
.gdb__addrow {
  display: flex;
  gap: var(--sp-2);
}
.gdb__addrow .gdb__input {
  flex: 1;
}
.gdb__muted {
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.gdb__footer {
  display: flex;
  justify-content: flex-end;
}
</style>
