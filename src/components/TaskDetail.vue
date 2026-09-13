<script setup lang="ts">
// Right-hand detail pane of the Tasks view: the selected task as a rich,
// read-only sheet. Double-click any value (title, tag, priority, due date,
// assignee, estimate, spent, repo, notes, a subtask's title) to edit it inline —
// Enter or blur saves, Escape cancels; pickers save on choosing. Subtasks are the
// task's parentId children.
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useInlineEdit } from '@/composables/useInlineEdit'
import { fmtDate, fmtDay, useDetailStyles } from '@/composables/useDetailStyles'
import { buildIndex, childrenOf, ancestorsOf, descendantsOf } from '@/utils/taskTree'
import { daysRemaining, formatMinutes, parseMinutes, statusWord } from '@/utils/detailFields'
import StatusPill from '@/components/StatusPill.vue'
import RemindBell from '@/components/RemindBell.vue'
import IssueChip from '@/components/IssueChip.vue'
import MoveToDeadlineButton from '@/components/MoveToDeadlineButton.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import PaneSection from '@/components/detail/PaneSection.vue'
import TextInput from '@/components/ui/TextInput.vue'
import RichDescription from '@/components/detail/RichDescription.vue'
import Select from '@/components/ui/Select.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import Icon from '@/components/ui/Icon.vue'
import { STATUS_LABEL, type Priority } from '@/types'

const props = defineProps<{ taskId: number | null }>()
const emit = defineEmits<{ select: [id: number | null] }>()

const app = useAppStore()
const { tasks } = storeToRefs(app)
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
  editableVal,
  pill,
  accentPill,
  toneStyle,
  subRow,
  boxStyle,
  subText,
  iconBtn,
  addBtn,
  chipStyle,
} = useDetailStyles()

const index = computed(() => buildIndex(tasks.value))
const task = computed(() => (props.taskId == null ? undefined : index.value.byId.get(props.taskId)))
const subtasks = computed(() => (task.value ? childrenOf(index.value, task.value.id) : []))
const subDone = computed(() => subtasks.value.filter((t) => t.status === 'done').length)
const allDescendants = computed(() =>
  task.value ? descendantsOf(index.value, task.value.id).length : 0,
)
const ancestors = computed(() => (task.value ? ancestorsOf(index.value, task.value.id) : []))
function kidCount(id: number) {
  return childrenOf(index.value, id).length
}

const due = computed(() => (task.value?.deadline ? daysRemaining(task.value.deadline) : null))
const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
]
const priorityLabel = computed(
  () => PRIORITY_OPTIONS.find((o) => o.value === (task.value?.priority ?? 'normal'))?.label ?? '',
)
const scheduled = computed(() => {
  const t = task.value
  if (!t?.startAt) return ''
  if (t.allDay) return fmtDate(t.startAt, false) + ' · all day'
  const end = t.endAt
    ? ' – ' +
      new Date(t.endAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : ''
  return fmtDate(t.startAt) + end
})
const goals = computed(() =>
  (task.value?.goalIds ?? [])
    .map((gid) => app.goalById(gid))
    .filter((g): g is NonNullable<typeof g> => !!g),
)
const linkedItems = computed(() =>
  [...(task.value?.linked ?? []), ...(task.value?.parents ?? [])]
    .map((r) => app.linkableById(r))
    .filter((it): it is NonNullable<typeof it> => !!it)
    .map((it) => ('text' in it ? it.text : it.title) || '(untitled)'),
)
const activity = computed(() => [...(task.value?.statusLog ?? [])].reverse().slice(0, 8))

// --- inline editing -----------------------------------------------------------
const { draft, start, cancel, commit, isEditing, pick, vFocus } = useInlineEdit((key, raw) => {
  const t = task.value
  if (!t) return
  const value = raw.trim()
  if (key === 'title') {
    if (value) app.patchTask(t.id, { title: value })
  } else if (key === 'notes') app.patchTask(t.id, { notes: value })
  else if (key === 'tag') app.updateTask(t.id, 'tag', value)
  else if (key === 'deadline') app.patchTask(t.id, { deadline: value })
  else if (key === 'assignee') app.patchTask(t.id, { assignee: value })
  else if (key === 'repo') app.patchTask(t.id, { repo: value })
  else if (key === 'priority' && value) app.patchTask(t.id, { priority: value as Priority })
  else if (key === 'estimate') app.patchTask(t.id, { estimateMins: parseMinutes(value) })
  else if (key === 'spent') app.patchTask(t.id, { spentMins: parseMinutes(value) ?? 0 })
  else if (key.startsWith('sub:') && value) app.patchTask(Number(key.slice(4)), { title: value })
})
watch(
  () => props.taskId,
  () => cancel(),
)

const newSub = ref('')
function addSubtask() {
  const parent = task.value
  if (!parent || !newSub.value.trim()) return
  const newId = app.addTask(newSub.value, '')
  if (newId != null) app.moveTask(newId, parent.id, subtasks.value.length)
  newSub.value = ''
}
function removeTask(id: number) {
  app.deleteWithUndo('tasks', 'task', id)
  if (id === props.taskId) emit('select', null)
}
</script>

<template>
  <div :style="pane">
    <Transition name="pane-swap" mode="out-in">
      <div :key="taskId ?? 'empty'" class="pane-swap__body">
        <div v-if="!task" :style="s.empty">Select a task to see its details and subtasks.</div>

        <template v-else>
          <!-- Header -->
          <section :style="card">
            <div v-if="ancestors.length" :style="row">
              <template v-for="a in ancestors" :key="a.id">
                <button type="button" :style="crumbBtn" @click="emit('select', a.id)">
                  {{ a.title || '(untitled)' }}
                </button>
                <span :style="dimSmall">›</span>
              </template>
            </div>

            <TextInput
              v-if="isEditing('title')"
              v-model="draft"
              v-focus
              size="lg"
              aria-label="Task title"
              @keydown.enter="commit"
              @keydown.esc="cancel"
              @blur="commit"
            />
            <div
              v-else
              :style="titleStyle(task.status === 'done')"
              title="Double-click to edit"
              @dblclick="start('title', task.title)"
            >
              {{ task.title || '(untitled)' }}
            </div>

            <div :style="headerRow">
              <div :style="metaGroup">
                <StatusPill :status="task.status" @cycle="app.cycleTaskStatus(task.id)" />
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
                  v-else-if="task.tag"
                  :style="chipStyle(task.tag)"
                  title="Double-click to edit"
                  @dblclick="start('tag', task.tag)"
                  >{{ task.tag }}</span
                >
                <span
                  v-else
                  :style="pill"
                  title="Double-click to add a tag"
                  @dblclick="start('tag', '')"
                  >+ tag</span
                >
                <span v-if="due" :style="toneStyle(due)">{{ due.text }}</span>
                <IssueChip v-if="task.github" :link="task.github" compact />
                <span v-if="task.rolloverCount > 0" :style="pill"
                  >rolled over ×{{ task.rolloverCount }}</span
                >
              </div>
              <div :style="actionBar">
                <RemindBell collection="tasks" :id="task.id" />
                <button
                  type="button"
                  :style="iconBtn"
                  title="Share"
                  @click="app.share('task', task)"
                >
                  ↗
                </button>
                <MoveToDeadlineButton
                  type="task"
                  :item-id="task.id"
                  :default-due="task.deadline"
                  @moved="emit('select', null)"
                />
                <button
                  type="button"
                  :style="iconBtn"
                  title="Open full page"
                  @click="app.openTaskView(task.id)"
                >
                  <Icon name="chevron-right" size="md" />
                </button>
                <button
                  type="button"
                  :style="s.del"
                  title="Delete task"
                  @click="removeTask(task.id)"
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
              <span :style="statValue">{{ STATUS_LABEL[task.status] }}</span>
            </div>
            <div :style="statTile">
              <span :style="dimSmall">Time spent</span>
              <span :style="statValue"
                >{{ formatMinutes(task.spentMins)
                }}<span v-if="task.estimateMins != null" :style="dimSmall">
                  / {{ formatMinutes(task.estimateMins) }}</span
                ></span
              >
            </div>
            <div :style="statTile">
              <span :style="dimSmall">Due</span>
              <span :style="statValue">{{ task.deadline ? fmtDay(task.deadline) : '—' }}</span>
            </div>
          </div>

          <!-- Notes -->
          <PaneSection title="Description" storage-key="task:notes">
            <RichDescription
              :model-value="task.notes"
              empty-text="No description — double-click to write one."
              @update:model-value="app.patchTask(task.id, { notes: $event })"
            />
          </PaneSection>

          <!-- Subtasks -->
          <PaneSection
            title="Subtasks"
            storage-key="task:subtasks"
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
                @click="app.toggleTask(st.id)"
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
                @dblclick="start('sub:' + st.id, st.title)"
                >{{ st.title || '(untitled)' }}</span
              >
              <span v-if="st.deadline" :style="toneStyle(daysRemaining(st.deadline))">{{
                fmtDay(st.deadline)
              }}</span>
              <span :style="pill">{{ kidCount(st.id) }} sub</span>
              <button
                type="button"
                :style="iconBtn"
                title="Open subtask"
                @click="emit('select', st.id)"
              >
                <Icon name="chevron-right" size="md" />
              </button>
              <button type="button" :style="s.del" @click="removeTask(st.id)">×</button>
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
          <PaneSection title="Details" storage-key="task:details">
            <div :style="infoGrid">
              <span :style="infoKey">Priority</span>
              <span v-if="isEditing('priority')" :style="row">
                <Select
                  :model-value="task.priority ?? 'normal'"
                  :options="PRIORITY_OPTIONS"
                  size="sm"
                  :style="grow"
                  @update:model-value="pick('priority', $event)"
                />
                <button type="button" :style="iconBtn" title="Close" @click="cancel">✕</button>
              </span>
              <span
                v-else
                :style="editableVal"
                title="Double-click to edit"
                @dblclick="start('priority', task.priority ?? 'normal')"
                >{{ priorityLabel }}</span
              >

              <span :style="infoKey">Due date</span>
              <span v-if="isEditing('deadline')" :style="row">
                <GlassDatePicker
                  :model-value="task.deadline"
                  clearable
                  placeholder="Due date"
                  size="sm"
                  @update:model-value="pick('deadline', $event)"
                />
                <button type="button" :style="iconBtn" title="Close" @click="cancel">✕</button>
              </span>
              <span
                v-else
                :style="editableVal"
                title="Double-click to edit"
                @dblclick="start('deadline', task.deadline)"
                >{{ task.deadline ? fmtDay(task.deadline) : '—' }}</span
              >

              <span :style="infoKey">Assignee</span>
              <TextInput
                v-if="isEditing('assignee')"
                v-model="draft"
                v-focus
                size="sm"
                placeholder="Who owns this?"
                aria-label="Assignee"
                @keydown.enter="commit"
                @keydown.esc="cancel"
                @blur="commit"
              />
              <span
                v-else
                :style="editableVal"
                title="Double-click to edit"
                @dblclick="start('assignee', task.assignee)"
                >{{ task.assignee || '—' }}</span
              >

              <span :style="infoKey">Estimate</span>
              <TextInput
                v-if="isEditing('estimate')"
                v-model="draft"
                v-focus
                size="sm"
                placeholder="e.g. 1h 30m"
                aria-label="Estimate"
                @keydown.enter="commit"
                @keydown.esc="cancel"
                @blur="commit"
              />
              <span
                v-else
                :style="editableVal"
                title="Double-click to edit"
                @dblclick="
                  start(
                    'estimate',
                    task.estimateMins != null ? formatMinutes(task.estimateMins) : '',
                  )
                "
                >{{ task.estimateMins != null ? formatMinutes(task.estimateMins) : '—' }}</span
              >

              <span :style="infoKey">Time spent</span>
              <TextInput
                v-if="isEditing('spent')"
                v-model="draft"
                v-focus
                size="sm"
                placeholder="e.g. 45m"
                aria-label="Time spent"
                @keydown.enter="commit"
                @keydown.esc="cancel"
                @blur="commit"
              />
              <span
                v-else
                :style="editableVal"
                title="Double-click to edit"
                @dblclick="start('spent', formatMinutes(task.spentMins))"
                >{{ formatMinutes(task.spentMins) }}</span
              >

              <span :style="infoKey">Repository</span>
              <TextInput
                v-if="isEditing('repo')"
                v-model="draft"
                v-focus
                size="sm"
                placeholder="owner/repo"
                aria-label="Repository"
                @keydown.enter="commit"
                @keydown.esc="cancel"
                @blur="commit"
              />
              <span
                v-else
                :style="editableVal"
                title="Double-click to edit"
                @dblclick="start('repo', task.repo)"
                >{{ task.repo || '—' }}</span
              >

              <span :style="infoKey">Created</span>
              <span :style="infoVal">{{ fmtDate(task.createdAt) || '—' }}</span>
              <span :style="infoKey">Last updated</span>
              <span :style="infoVal">{{ fmtDate(task.updatedAt) || '—' }}</span>
              <template v-if="task.completedAt">
                <span :style="infoKey">Completed</span>
                <span :style="infoVal">{{ fmtDate(task.completedAt) }}</span>
              </template>
              <template v-if="scheduled">
                <span :style="infoKey">Scheduled</span>
                <span :style="infoVal">{{ scheduled }}</span>
              </template>
              <template v-if="task.rolledOverAt">
                <span :style="infoKey">Last rolled over</span>
                <span :style="infoVal">{{ fmtDate(task.rolledOverAt) }}</span>
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
            </div>
          </PaneSection>

          <!-- Activity -->
          <PaneSection
            v-if="activity.length"
            title="Activity"
            storage-key="task:activity"
            :count="activity.length"
            :default-open="false"
          >
            <div :style="infoGrid">
              <template v-for="(a, i) in activity" :key="i">
                <span :style="infoKey">{{ fmtDate(a.at) }}</span>
                <span :style="infoVal">→ {{ statusWord(a.status) }}</span>
              </template>
            </div>
          </PaneSection>

          <span :style="dimSmall">Tip: double-click any value to edit it.</span>
        </template>
      </div>
    </Transition>
  </div>
</template>
