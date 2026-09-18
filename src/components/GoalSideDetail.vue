<script setup lang="ts">
// Right-hand detail pane of the Goals view: the selected goal as a rich,
// read-only sheet — progress, description, checklist, attached tasks/todos and
// dates. Double-click a value (title, status, description, dates, a checklist
// point) to edit it inline; Enter or blur saves, Escape cancels, pickers save on
// choosing.
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useInlineEdit } from '@/composables/useInlineEdit'
import { fmtDate, fmtDay, useDetailStyles } from '@/composables/useDetailStyles'
import { daysRemaining, formatMinutes } from '@/utils/detailFields'
import { checkTick, pxify } from '@/styles'
import StatusPill from '@/components/StatusPill.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import PaneSection from '@/components/detail/PaneSection.vue'
import TextInput from '@/components/ui/TextInput.vue'
import TextArea from '@/components/ui/TextArea.vue'
import Select from '@/components/ui/Select.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import Icon from '@/components/ui/Icon.vue'
import type { GoalStatus } from '@/types'

const props = defineProps<{ goalId: number | null }>()
const emit = defineEmits<{ select: [id: number | null] }>()

const app = useAppStore()
const { goals, goalChecklist, tasks, todos } = storeToRefs(app)
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
  dimSmall,
  titleStyle,
  bodyText,
  placeholder,
  statGrid,
  statTile,
  statValue,
  statAccent,
  infoGrid,
  infoKey,
  infoVal,
  editableVal,
  pill,
  toneStyle,
  subRow,
  boxStyle,
  subText,
  iconBtn,
  addBtn,
} = useDetailStyles()

const STATUS_OPTIONS: { value: GoalStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'done', label: 'Done' },
  { value: 'archived', label: 'Archived' },
]
const statusLabel = (st: GoalStatus) => STATUS_OPTIONS.find((o) => o.value === st)?.label ?? st

const goal = computed(() =>
  props.goalId == null ? undefined : goals.value.find((g) => g.id === props.goalId),
)
const checklist = computed(() => {
  const gid = goal.value?.id
  if (gid == null) return []
  return goalChecklist.value.filter((ci) => ci.goalId === gid).sort((a, b) => a.order - b.order)
})
const checklistDone = computed(() => checklist.value.filter((ci) => ci.done).length)
const attachedTasks = computed(() => {
  const gid = goal.value?.id
  return gid == null ? [] : tasks.value.filter((t) => t.goalIds?.includes(gid))
})
const attachedTodos = computed(() => {
  const gid = goal.value?.id
  return gid == null ? [] : todos.value.filter((t) => t.goalIds?.includes(gid))
})
const progress = computed(() =>
  goal.value ? app.goalProgress(goal.value.id) : { done: 0, total: 0, ratio: 0 },
)
const pct = computed(() =>
  progress.value.total ? Math.round((progress.value.done / progress.value.total) * 100) : 0,
)
const target = computed(() =>
  goal.value?.targetDate ? daysRemaining(goal.value.targetDate) : null,
)
const spentTotal = computed(() => checklist.value.reduce((n, ci) => n + (ci.spentMins || 0), 0))

// --- inline editing -----------------------------------------------------------
const { draft, start, cancel, commit, isEditing, pick, vFocus } = useInlineEdit((key, raw) => {
  const g = goal.value
  if (!g) return
  const value = raw.trim()
  if (key === 'title') {
    if (value) app.updateGoal(g.id, { title: value })
  } else if (key === 'description') app.updateGoal(g.id, { description: value })
  else if (key === 'status' && value) app.updateGoal(g.id, { status: value as GoalStatus })
  else if (key === 'startDate') app.updateGoal(g.id, { startDate: value })
  else if (key === 'targetDate') app.updateGoal(g.id, { targetDate: value })
  else if (key.startsWith('ci:') && value)
    app.updateChecklistItem(Number(key.slice(3)), { text: value })
})
watch(
  () => props.goalId,
  () => cancel(),
)

const newPoint = ref('')
function addPoint() {
  if (!goal.value || !newPoint.value.trim()) return
  app.addChecklistItem(goal.value.id, newPoint.value)
  newPoint.value = ''
}
function removeGoal() {
  if (!goal.value) return
  app.removeGoalWithUndo(goal.value.id)
  emit('select', null)
}

const swatch = computed(() =>
  pxify({
    width: 12,
    height: 12,
    borderRadius: '50%',
    flexShrink: 0,
    background: goal.value?.color || c.value.accent,
  }),
)
</script>

<template>
  <div :style="pane">
    <Transition name="pane-swap" mode="out-in">
      <div :key="goalId ?? 'empty'" class="pane-swap__body">
        <div v-if="!goal" :style="s.empty">Select a goal to see its progress and details.</div>

        <template v-else>
          <!-- Header -->
          <section :style="card">
            <div :style="row">
              <span :style="swatch"></span>
              <span v-if="goal.icon" :style="dimSmall">{{ goal.icon }}</span>
              <span :style="dimSmall">Goal</span>
            </div>

            <TextInput
              v-if="isEditing('title')"
              v-model="draft"
              v-focus
              size="lg"
              aria-label="Goal title"
              @keydown.enter="commit"
              @keydown.esc="cancel"
              @blur="commit"
            />
            <div
              v-else
              :style="titleStyle(goal.status === 'done')"
              title="Double-click to edit"
              @dblclick="start('title', goal.title)"
            >
              {{ goal.title || '(untitled goal)' }}
            </div>

            <div :style="headerRow">
              <div :style="metaGroup">
                <span v-if="isEditing('status')" :style="row">
                  <Select
                    :model-value="goal.status"
                    :options="STATUS_OPTIONS"
                    size="sm"
                    @update:model-value="pick('status', $event)"
                  />
                  <button type="button" :style="iconBtn" title="Close" @click="cancel">✕</button>
                </span>
                <span
                  v-else
                  :style="pill"
                  title="Double-click to change status"
                  @dblclick="start('status', goal.status)"
                  >{{ statusLabel(goal.status) }}</span
                >
                <span v-if="target" :style="toneStyle(target)">{{ target.text }}</span>
                <span v-if="goal.recurrence?.enabled" :style="pill">↻ recurring</span>
              </div>
              <div :style="actionBar">
                <button
                  type="button"
                  :style="iconBtn"
                  title="Open full page"
                  @click="app.openGoalPage(goal.id)"
                >
                  <Icon name="chevron-right" size="md" />
                </button>
                <button type="button" :style="s.del" title="Delete goal" @click="removeGoal">
                  ×
                </button>
              </div>
            </div>
          </section>

          <!-- At a glance -->
          <div :style="statGrid">
            <div :style="statTile">
              <span :style="dimSmall">Progress</span>
              <span :style="statAccent">{{ pct }}%</span>
            </div>
            <div :style="statTile">
              <span :style="dimSmall">Checklist</span>
              <span :style="statValue">{{ checklistDone }}/{{ checklist.length }}</span>
            </div>
            <div :style="statTile">
              <span :style="dimSmall">Tasks · Todos</span>
              <span :style="statValue"
                >{{ attachedTasks.length }} · {{ attachedTodos.length }}</span
              >
            </div>
            <div :style="statTile">
              <span :style="dimSmall">Time spent</span>
              <span :style="statValue">{{ formatMinutes(spentTotal) }}</span>
            </div>
          </div>
          <ProgressBar :value="progress.done" :max="progress.total || 1" size="sm" />

          <!-- Description -->
          <PaneSection title="Description" storage-key="goal:description">
            <TextArea
              v-if="isEditing('description')"
              v-model="draft"
              v-focus
              :rows="4"
              placeholder="Describe the goal…  (Ctrl+Enter to save)"
              @keydown.esc="cancel"
              @keydown.enter.ctrl="commit"
              @blur="commit"
            />
            <div
              v-else-if="goal.description"
              :style="bodyText"
              title="Double-click to edit"
              @dblclick="start('description', goal.description)"
            >
              {{ goal.description }}
            </div>
            <div v-else :style="placeholder" @dblclick="start('description', '')">
              No description — double-click to add one.
            </div>
          </PaneSection>

          <!-- Checklist -->
          <PaneSection
            title="Checklist"
            storage-key="goal:checklist"
            :count="checklistDone + '/' + checklist.length"
          >
            <ProgressBar
              v-if="checklist.length"
              :value="checklistDone"
              :max="checklist.length"
              size="sm"
            />

            <div v-for="ci in checklist" :key="ci.id" :style="subRow">
              <button
                type="button"
                :style="boxStyle(ci.done)"
                aria-label="Toggle done"
                @click="app.toggleChecklistItem(ci.id)"
              >
                <Icon
                  v-if="ci.done"
                  name="check"
                  size="xs"
                  :style="[checkTick, { color: c.onAccent }]"
                />
              </button>
              <TextInput
                v-if="isEditing('ci:' + ci.id)"
                v-model="draft"
                v-focus
                size="sm"
                aria-label="Checklist point"
                :style="grow"
                @keydown.enter="commit"
                @keydown.esc="cancel"
                @blur="commit"
              />
              <span
                v-else
                :style="subText(ci.done)"
                title="Double-click to rename"
                @dblclick="start('ci:' + ci.id, ci.text)"
                >{{ ci.text || '(untitled)' }}</span
              >
              <span v-if="ci.dueAt" :style="toneStyle(ci.done ? null : daysRemaining(ci.dueAt))">{{
                fmtDay(ci.dueAt)
              }}</span>
              <span v-if="ci.estimateMins != null || ci.spentMins" :style="pill"
                >{{ formatMinutes(ci.spentMins)
                }}<template v-if="ci.estimateMins != null">
                  / {{ formatMinutes(ci.estimateMins) }}</template
                ></span
              >
              <button type="button" :style="s.del" @click="app.deleteChecklistItem(ci.id)">
                ×
              </button>
            </div>
            <div v-if="!checklist.length" :style="placeholder">No checklist points yet.</div>

            <form :style="row" @submit.prevent="addPoint">
              <TextInput
                v-model="newPoint"
                size="sm"
                placeholder="Add a checklist point…"
                aria-label="New checklist point"
                :style="grow"
              />
              <button type="submit" :style="addBtn">Add</button>
            </form>
          </PaneSection>

          <!-- Attached tasks & todos -->
          <PaneSection
            title="Attached items"
            storage-key="goal:attached"
            :count="attachedTasks.length + attachedTodos.length"
          >
            <div v-for="t in attachedTasks" :key="'task:' + t.id" :style="subRow">
              <StatusPill :status="t.status" @cycle="app.cycleTaskStatus(t.id)" />
              <span
                :style="[subText(t.status === 'done'), { cursor: 'pointer' }]"
                @click="app.openTaskDialog(t.id)"
                >{{ t.title || '(untitled)' }}</span
              >
              <span :style="pill">Task</span>
              <button
                type="button"
                :style="s.del"
                title="Detach from goal"
                @click="app.detachFromGoal('tasks', t.id, goal.id)"
              >
                ×
              </button>
            </div>
            <div v-for="t in attachedTodos" :key="'todo:' + t.id" :style="subRow">
              <StatusPill :status="t.status" @cycle="app.cycleTodoStatus(t.id)" />
              <span
                :style="[subText(t.status === 'done'), { cursor: 'pointer' }]"
                @click="app.openEdit('todo', t.id)"
                >{{ t.text || '(untitled)' }}</span
              >
              <span :style="pill">Todo</span>
              <button
                type="button"
                :style="s.del"
                title="Detach from goal"
                @click="app.detachFromGoal('todos', t.id, goal.id)"
              >
                ×
              </button>
            </div>
            <div v-if="!attachedTasks.length && !attachedTodos.length" :style="placeholder">
              No tasks or todos attached.
            </div>
          </PaneSection>

          <!-- Details -->
          <PaneSection title="Details" storage-key="goal:details">
            <div :style="infoGrid">
              <span :style="infoKey">Start date</span>
              <span v-if="isEditing('startDate')" :style="row">
                <GlassDatePicker
                  :model-value="goal.startDate"
                  clearable
                  placeholder="Start"
                  size="sm"
                  @update:model-value="pick('startDate', $event)"
                />
                <button type="button" :style="iconBtn" title="Close" @click="cancel">✕</button>
              </span>
              <span
                v-else
                :style="editableVal"
                title="Double-click to edit"
                @dblclick="start('startDate', goal.startDate)"
                >{{ goal.startDate ? fmtDay(goal.startDate) : '—' }}</span
              >

              <span :style="infoKey">Target date</span>
              <span v-if="isEditing('targetDate')" :style="row">
                <GlassDatePicker
                  :model-value="goal.targetDate"
                  :min="goal.startDate || null"
                  clearable
                  placeholder="Target"
                  size="sm"
                  @update:model-value="pick('targetDate', $event)"
                />
                <button type="button" :style="iconBtn" title="Close" @click="cancel">✕</button>
              </span>
              <span
                v-else
                :style="editableVal"
                title="Double-click to edit"
                @dblclick="start('targetDate', goal.targetDate)"
                >{{ goal.targetDate ? fmtDay(goal.targetDate) : '—' }}</span
              >

              <span :style="infoKey">Created</span>
              <span :style="infoVal">{{ fmtDate(goal.createdAt) || '—' }}</span>
              <span :style="infoKey">Last updated</span>
              <span :style="infoVal">{{ fmtDate(goal.updatedAt) || '—' }}</span>
              <span :style="infoKey">Source</span>
              <span :style="infoVal">{{
                goal.source === 'url-import' ? 'Imported' : 'Manual'
              }}</span>
              <template v-if="goal.sourceUrl">
                <span :style="infoKey">Source link</span>
                <a :href="goal.sourceUrl" target="_blank" rel="noopener" :style="infoVal">{{
                  goal.sourceUrl
                }}</a>
              </template>
            </div>
          </PaneSection>

          <span :style="dimSmall">Tip: double-click any value to edit it.</span>
        </template>
      </div>
    </Transition>
  </div>
</template>
