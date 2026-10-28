<script setup lang="ts">
// Right-hand detail pane of the Goals view: the selected goal as a rich,
// read-only sheet — progress, description, checklist, attached tasks/todos and
// dates. Double-click a value (title, status, description, dates, a checklist
// point) to edit it inline; Enter or blur saves, Escape cancels, pickers save on
// choosing.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useInlineEdit } from '@/composables/useInlineEdit'
import { fmtDate, fmtDay, useDetailStyles } from '@/composables/useDetailStyles'
import { daysRemaining, formatMinutes } from '@/utils/detailFields'
import { pxify } from '@/styles'
import StatusPill from '@/components/StatusPill.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import PaneSection from '@/components/detail/PaneSection.vue'
import TextInput from '@/components/ui/TextInput.vue'
import TextArea from '@/components/ui/TextArea.vue'
import Select from '@/components/ui/Select.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import SubCheck from '@/components/ui/SubCheck.vue'
import PaneButton from '@/components/detail/PaneButton.vue'
import PaneToolbar from '@/components/detail/PaneToolbar.vue'
import Icon from '@/components/ui/Icon.vue'
import MilestoneKpis from '@/components/goals/MilestoneKpis.vue'
import MilestoneLearnings from '@/components/goals/MilestoneLearnings.vue'
import PointLearnings from '@/components/goals/PointLearnings.vue'
import PointSubtasks from '@/components/goals/PointSubtasks.vue'
import MilestoneConclusion from '@/components/goals/MilestoneConclusion.vue'
import MilestoneStatus from '@/components/goals/MilestoneStatus.vue'
import MilestoneSaveState from '@/components/goals/MilestoneSaveState.vue'
import { isClosed, pointProgress } from '@/utils/milestoneProgress'
import { kpisRatio, learningProgress } from '@/utils/milestoneTracking'
import type { GoalStatus } from '@/types'
import { vScrollFade } from '@/directives/scrollFade'

const props = defineProps<{ goalId: number | null }>()
const emit = defineEmits<{ select: [id: number | null] }>()

const app = useAppStore()
const ui = useUiStore()
// Where this goal was moved to, if it has been: the menu shows that instead
// of offering a second move.
const moved = computed(() => (props.goalId == null ? null : app.goalMovedTo(props.goalId)))
const movedTo = computed(() => (moved.value?.collection === 'tasks' ? 'Tasks' : 'Todos'))
const { goals, goalChecklist, tasks, todos } = storeToRefs(app)
const {
  c,
  pane,
  row,
  grow,
  dimSmall,
  placeholder,
  infoGrid,
  infoKey,
  infoVal,
  editableVal,
  pill,
  toneStyle,
  iconBtn,
  addBtn,
} = useDetailStyles()

// Done is reached by closing with a conclusion, so it is not a status to pick.
const STATUS_OPTIONS: { value: GoalStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
]
const statusLabel = (st: GoalStatus) =>
  STATUS_OPTIONS.find((o) => o.value === st)?.label ?? (st === 'done' ? 'Done' : st)

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
const spentTotal = computed(() => checklist.value.reduce((n, ci) => n + (ci.spentMins || 0), 0))
const kpiPct = computed(() => {
  const r = kpisRatio(goal.value?.kpis)
  return r == null ? null : Math.round(r * 100)
})
const learnt = computed(() => learningProgress(checklist.value))
// Closed milestones are read-only until reopened (spec section 5).
const closed = computed(() => !!goal.value && isClosed(goal.value))
// Which points have their subtasks unfolded. Several may be open at once.
const openSubs = ref<Set<number>>(new Set())
function toggleSubs(id: number) {
  const next = new Set(openSubs.value)
  if (!next.delete(id)) next.add(id)
  openSubs.value = next
}
const goalOptions = computed(() => [
  { value: '', label: 'No goal' },
  ...app.skillGoals.map((g) => ({ value: String(g.id), label: g.title })),
])

// The sticky context bar (spec 3.3): title, state, deadline and progress stay
// in view once the hero has scrolled away.
const hero = ref<HTMLElement | null>(null)
const heroVisible = ref(true)
let heroObserver: IntersectionObserver | undefined
watch(hero, (el) => {
  heroObserver?.disconnect()
  heroVisible.value = true
  if (!el || typeof IntersectionObserver === 'undefined') return
  heroObserver = new IntersectionObserver(([entry]) => (heroVisible.value = entry.isIntersecting))
  heroObserver.observe(el)
})
onBeforeUnmount(() => heroObserver?.disconnect())
// The point whose learnings are open under it; one at a time keeps the list
// readable. The summary below opens one by its title.
const openLearn = ref<number | null>(null)
watch(
  () => props.goalId,
  () => {
    openLearn.value = null
    openSubs.value = new Set()
  },
)

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
  <div v-scroll-fade :style="pane">
    <Transition name="pane-swap" mode="out-in">
      <div :key="goalId ?? 'empty'" class="pane-swap__body">
        <div v-if="!goal" class="gsd-empty">
          <span class="gsd-empty__icon" aria-hidden="true"><Icon name="flag" size="lg" /></span>
          <p class="gsd-empty__title">Pick a milestone</p>
          <p class="gsd-empty__text">
            Select a milestone to see its progress, KPIs, learnings and everything attached to it.
          </p>
        </div>

        <template v-else>
          <div v-if="!heroVisible" class="gsd-sticky" aria-hidden="true">
            <span class="gsd-sticky__title">{{ goal.title || '(untitled milestone)' }}</span>
            <MilestoneStatus :goal-id="goal.id" />
            <span class="gsd-sticky__pct">{{ Math.round(progress.ratio * 100) }}%</span>
            <MilestoneSaveState />
          </div>
          <!-- The hero, as every detail pane has it: the goal's colour, status
               and target with the actions, the title large, the description as
               reading text, and how far it has got. -->
          <section ref="hero" class="dp-hero">
            <div class="dp-top">
              <span :style="swatch"></span>
              <span v-if="goal.icon" :style="dimSmall">{{ goal.icon }}</span>
              <span v-if="isEditing('status')" :style="row">
                <Select
                  :model-value="goal.status"
                  :options="STATUS_OPTIONS"
                  size="sm"
                  @update:model-value="pick('status', $event)"
                />
                <button
                  type="button"
                  :style="iconBtn"
                  title="Close"
                  aria-label="Close"
                  @click="cancel"
                >
                  <Icon name="x" size="xs" />
                </button>
              </span>
              <span
                v-else-if="!closed"
                :style="pill"
                title="Double-click to change status"
                @dblclick="start('status', goal.status)"
                >{{ statusLabel(goal.status) }}</span
              >
              <span v-if="goal.recurrence?.enabled" :style="pill" class="gsd-pill">
                <Icon name="repeat" size="xs" />Recurring
              </span>
              <PaneToolbar class="dp-actions">
                <!-- The goal as a todo or task, its points as subtasks; done
                     there is done here. Once moved, where it went instead. -->
                <button
                  v-if="moved"
                  type="button"
                  class="moved-chip"
                  :title="'Open ' + movedTo"
                  @click="ui.setTab(moved.collection === 'tasks' ? 'tasks' : 'todo')"
                >
                  <Icon name="check" size="xs" />In {{ movedTo }}
                </button>
                <template v-else>
                  <PaneButton
                    icon="check-square"
                    label="Move to Todos"
                    @click="app.moveGoalTo('todos', goal.id)"
                  />
                  <PaneButton
                    icon="list"
                    label="Move to Tasks"
                    @click="app.moveGoalTo('tasks', goal.id)"
                  />
                </template>
                <PaneButton
                  icon="external-link"
                  label="Open full page"
                  @click="app.openGoalPage(goal.id)"
                />
                <PaneButton
                  icon="trash"
                  label="Delete milestone"
                  tone="danger"
                  @click="removeGoal"
                />
              </PaneToolbar>
            </div>

            <TextInput
              v-if="isEditing('title')"
              v-model="draft"
              v-focus
              size="lg"
              aria-label="Milestone title"
              @keydown.enter="commit"
              @keydown.esc="cancel"
              @blur="commit"
            />
            <h2
              v-else
              class="dp-title"
              :class="{ 'is-done': goal.status === 'done' }"
              title="Double-click to edit"
              @dblclick="start('title', goal.title)"
            >
              {{ goal.title || '(untitled milestone)' }}
            </h2>

            <TextArea
              v-if="isEditing('description')"
              v-model="draft"
              v-focus
              :rows="4"
              placeholder="Describe the milestone…  (Ctrl+Enter to save)"
              @keydown.esc="cancel"
              @keydown.enter.ctrl="commit"
              @blur="commit"
            />
            <div
              v-else-if="goal.description"
              class="dp-desc"
              title="Double-click to edit"
              @dblclick="start('description', goal.description)"
            >
              {{ goal.description }}
            </div>
            <div v-else :style="placeholder" @dblclick="start('description', '')">
              No description — double-click to add one.
            </div>

            <div v-if="progress.total" class="dp-progress">
              <ProgressBar class="dp-progress__bar" :value="progress.done" :max="progress.total" />
              <span class="dp-progress__count">{{ progress.done }} of {{ progress.total }}</span>
            </div>
            <div class="gsd-meta">
              <MilestoneStatus :goal-id="goal.id" full />
              <MilestoneSaveState />
            </div>
            <!-- The milestone's three readings side by side: done, measured, learnt. -->
            <div class="gsd-stats">
              <span class="gsd-stat">
                <Icon name="check-square" size="xs" />
                <strong>{{ Math.round(progress.ratio * 100) }}%</strong> done
              </span>
              <span v-if="kpiPct != null" class="gsd-stat">
                <Icon name="target" size="xs" />
                <strong>{{ kpiPct }}%</strong> KPIs
              </span>
              <span v-if="learnt.total" class="gsd-stat">
                <Icon name="lightbulb" size="xs" />
                <strong>{{ learnt.covered }}/{{ learnt.total }}</strong> points learnt
              </span>
            </div>
          </section>

          <PaneSection
            title="KPIs"
            storage-key="goal:kpis"
            :count="kpiPct != null ? kpiPct + '%' : undefined"
          >
            <MilestoneKpis :goal-id="goal.id" />
          </PaneSection>

          <!-- Checklist: one card per point. -->
          <PaneSection
            title="Checklist"
            storage-key="goal:checklist"
            :count="checklistDone + '/' + checklist.length"
          >
            <div class="dp-subs">
              <template v-for="ci in checklist" :key="ci.id">
                <div class="dp-sub">
                  <SubCheck
                    :done="ci.done"
                    size="md"
                    :disabled="closed"
                    @toggle="!closed && app.toggleChecklistItem(ci.id)"
                  />
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
                    class="dp-sub__text"
                    :class="{ 'is-done': ci.done }"
                    title="Double-click to rename"
                    @dblclick="!closed && start('ci:' + ci.id, ci.text)"
                    >{{ ci.text || '(untitled)' }}</span
                  >
                  <span
                    v-if="ci.dueAt"
                    :style="toneStyle(ci.done ? null : daysRemaining(ci.dueAt))"
                    >{{ fmtDay(ci.dueAt) }}</span
                  >
                  <div class="dp-sub__actions">
                    <button
                      v-if="ci.subtasks?.length || !closed"
                      type="button"
                      class="gsd-learnt gsd-subs"
                      :class="{
                        'is-empty': !ci.subtasks?.length,
                        'is-open': openSubs.has(ci.id),
                        'is-complete':
                          ci.subtasks?.length && pointProgress(ci).done === pointProgress(ci).total,
                      }"
                      :aria-expanded="openSubs.has(ci.id)"
                      :title="ci.subtasks?.length ? 'Subtasks' : 'Break this point into subtasks'"
                      @click="toggleSubs(ci.id)"
                    >
                      <Icon name="list-checks" size="xs" />{{
                        ci.subtasks?.length
                          ? `${pointProgress(ci).done}/${pointProgress(ci).total}`
                          : ''
                      }}
                    </button>
                    <button
                      type="button"
                      class="gsd-learnt"
                      :class="{ 'is-empty': !ci.learnings?.length, 'is-open': openLearn === ci.id }"
                      :aria-expanded="openLearn === ci.id"
                      :title="
                        ci.learnings?.length
                          ? 'What this point taught'
                          : 'Write down what you learnt'
                      "
                      @click="openLearn = openLearn === ci.id ? null : ci.id"
                    >
                      <Icon name="lightbulb" size="xs" />{{ ci.learnings?.length || '' }}
                    </button>
                    <span v-if="ci.estimateMins != null || ci.spentMins" :style="pill"
                      >{{ formatMinutes(ci.spentMins)
                      }}<template v-if="ci.estimateMins != null">
                        / {{ formatMinutes(ci.estimateMins) }}</template
                      ></span
                    >
                    <PaneButton
                      v-if="!closed"
                      icon="trash"
                      label="Delete checklist point"
                      tone="danger"
                      @click="app.deleteChecklistItem(ci.id)"
                    />
                  </div>
                </div>
                <PointSubtasks
                  v-if="openSubs.has(ci.id)"
                  :point-id="ci.id"
                  :subtasks="ci.subtasks ?? []"
                  :locked="closed"
                />
                <PointLearnings v-if="openLearn === ci.id" :point-id="ci.id" />
              </template>
              <div v-if="!checklist.length" :style="placeholder">No checklist points yet.</div>

              <form v-if="!closed" class="dp-add" @submit.prevent="addPoint">
                <TextInput
                  v-model="newPoint"
                  size="sm"
                  placeholder="Add a checklist point…"
                  aria-label="New checklist point"
                  :style="grow"
                />
                <button type="submit" :style="addBtn">Add</button>
              </form>
            </div>
          </PaneSection>

          <PaneSection
            title="What I've learnt"
            storage-key="goal:learnt"
            :count="learnt.covered + '/' + learnt.total"
          >
            <MilestoneLearnings :goal-id="goal.id" @open-point="openLearn = $event" />
          </PaneSection>

          <!-- How the milestone closes (spec section 5): the step that turns
               100% into Completed. -->
          <PaneSection
            title="Conclusion"
            storage-key="goal:conclusion"
            :count="closed ? 'Completed' : 'Open'"
          >
            <MilestoneConclusion :goal-id="goal.id" />
          </PaneSection>

          <!-- Attached tasks & todos, as cards too. -->
          <PaneSection
            title="Attached items"
            storage-key="goal:attached"
            :count="attachedTasks.length + attachedTodos.length"
          >
            <div class="dp-subs">
              <div v-for="t in attachedTasks" :key="'task:' + t.id" class="dp-sub">
                <StatusPill :status="t.status" @cycle="app.cycleTaskStatus(t.id)" />
                <span
                  class="dp-sub__text"
                  :class="{ 'is-done': t.status === 'done' }"
                  :style="{ cursor: 'pointer' }"
                  @click="app.openTaskDialog(t.id)"
                  >{{ t.title || '(untitled)' }}</span
                >
                <span :style="pill">Task</span>
                <div class="dp-sub__actions">
                  <PaneButton
                    icon="x"
                    label="Detach from milestone"
                    tone="danger"
                    @click="app.detachFromGoal('tasks', t.id, goal.id)"
                  />
                </div>
              </div>
              <div v-for="t in attachedTodos" :key="'todo:' + t.id" class="dp-sub">
                <StatusPill :status="t.status" @cycle="app.cycleTodoStatus(t.id)" />
                <span
                  class="dp-sub__text"
                  :class="{ 'is-done': t.status === 'done' }"
                  :style="{ cursor: 'pointer' }"
                  @click="app.openEdit('todo', t.id)"
                  >{{ t.text || '(untitled)' }}</span
                >
                <span :style="pill">Todo</span>
                <div class="dp-sub__actions">
                  <PaneButton
                    icon="x"
                    label="Detach from milestone"
                    tone="danger"
                    @click="app.detachFromGoal('todos', t.id, goal.id)"
                  />
                </div>
              </div>
              <div v-if="!attachedTasks.length && !attachedTodos.length" :style="placeholder">
                No tasks or todos attached.
              </div>
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
                <button
                  type="button"
                  :style="iconBtn"
                  title="Close"
                  aria-label="Close"
                  @click="cancel"
                >
                  <Icon name="x" size="xs" />
                </button>
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
                <button
                  type="button"
                  :style="iconBtn"
                  title="Close"
                  aria-label="Close"
                  @click="cancel"
                >
                  <Icon name="x" size="xs" />
                </button>
              </span>
              <span
                v-else
                :style="editableVal"
                title="Double-click to edit"
                @dblclick="start('targetDate', goal.targetDate)"
                >{{ goal.targetDate ? fmtDay(goal.targetDate) : '—' }}</span
              >

              <span :style="infoKey">Goal</span>
              <Select
                size="sm"
                aria-label="Goal this milestone belongs to"
                :model-value="goal.skillGoalId != null ? String(goal.skillGoalId) : ''"
                :options="goalOptions"
                @update:model-value="app.setMilestoneGoal(goal.id, $event ? Number($event) : null)"
              />

              <span :style="infoKey">Time spent</span>
              <span :style="infoVal">{{ formatMinutes(spentTotal) }}</span>

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

<style scoped>
/* Nothing selected: what the pane is for, and how to fill it. */
.gsd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin: 48px auto 0;
  max-width: 280px;
  text-align: center;
}
.gsd-empty__icon {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  margin-bottom: 6px;
  border-radius: 18px;
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
  color: var(--theme-accent);
}
.gsd-empty__title {
  margin: 0;
  color: var(--theme-text);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
}
.gsd-empty__text {
  margin: 0;
  color: var(--theme-dim);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
}
/* State, dates and the save state, under the description. */
.gsd-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
/* The context bar that stays once the hero scrolls away. */
.gsd-sticky {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin: 0 0 var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--glass-solid, var(--theme-card));
  box-shadow: var(--elev-1);
}
.gsd-sticky__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}
.gsd-sticky__pct {
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--theme-accent);
}
.gsd-subs.is-complete {
  color: var(--theme-success);
}
/* Done, measured, learnt: one line of three readings under the bar. */
.gsd-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.gsd-stat,
.gsd-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.gsd-stat {
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-text) 6%, transparent);
  color: var(--theme-dim);
  font-size: var(--text-2xs);
}
.gsd-stat strong {
  color: var(--theme-text);
  font-variant-numeric: tabular-nums;
}
/* A point's learnings: a bulb with a count, quiet until there is one. */
.gsd-learnt {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 24px;
  padding: 0 8px;
  border-radius: var(--radius-pill);
  border: 1px solid color-mix(in oklch, var(--theme-accent) 35%, transparent);
  background: color-mix(in oklch, var(--theme-accent) 10%, transparent);
  color: var(--theme-accent);
  font-family: inherit;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
.gsd-learnt.is-empty:not(.is-open) {
  border-color: transparent;
  background: transparent;
  color: var(--theme-dim);
}
.gsd-learnt.is-open {
  background: color-mix(in oklch, var(--theme-accent) 20%, transparent);
}
/* "In Todos": where a moved goal went, and the way there. */
.moved-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  border: 1px solid color-mix(in srgb, var(--theme-accent) 40%, transparent);
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  color: var(--theme-accent);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  cursor: pointer;
}
.moved-chip:hover {
  background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
}
</style>
