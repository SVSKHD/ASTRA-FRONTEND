<script setup lang="ts">
// The task side of the detail dialog (section 18c). Everything here is inline
// editable — there is no edit mode and no Save button. The free-text fields
// autosave 600ms after typing stops (useInlineField); every other control writes
// on change, because a picker or a select has no half-finished state to protect.
//
// The body renders into the shell's slots: the inline title goes in the header,
// the ⋯ menu beside it, and the sections stack in the body.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useInlineField } from '@/composables/useInlineField'
import { buildIndex, ancestorsOf, childrenOf } from '@/utils/taskTree'
import {
  daysRemaining,
  formatMinutes,
  fromLocalInput,
  parseMinutes,
  relativeStamp,
  statusWord,
  toLocalInput,
} from '@/utils/detailFields'
import DetailSection from '@/components/detail/DetailSection.vue'
import NotesSection from '@/components/detail/NotesSection.vue'
import StatusPill from '@/components/StatusPill.vue'
import IssueChip from '@/components/IssueChip.vue'
import TagPicker from '@/components/TagPicker.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import { fullName } from '@/utils/githubModel'
import { STATUS_LABEL, type ItemStatus, type Priority, type Task } from '@/types'

const props = defineProps<{ taskId: number }>()
const emit = defineEmits<{ open: [{ kind: 'task' | 'goal'; id: number }]; close: [] }>()

const app = useAppStore()
const auth = useAuthStore()
const { tasks, goals, repos } = storeToRefs(app)

const task = computed<Task | undefined>(() => tasks.value.find((t) => t.id === props.taskId))
const index = computed(() => buildIndex(tasks.value))

// --- the dirty flag the shell's close guard reads ---------------------------
// Two fields can be mid-write at once, so it is a count rather than a boolean.
const pendingFields = ref(new Set<string>())
function fieldDirty(name: string) {
  return (dirty: boolean) => {
    if (dirty) pendingFields.value.add(name)
    else pendingFields.value.delete(name)
    app.setDetailDirty(pendingFields.value.size > 0)
  }
}

// There is no description field here any more. `task.notes` was the free-text
// notes box, and section 22a retired it: a note is a document now. The string
// stays readable — the NOTES section below shows it as a row and offers to
// convert it — but nothing on this dialog writes to it, so there is no second
// surface for the same text to drift on.

const goalChoices = computed(() => goals.value.filter((g) => g.status !== 'archived'))
const menuItems = computed(() => [
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'convert', label: 'Convert to goal point', disabled: !goalChoices.value.length },
  { value: 'archive', label: 'Archive' },
  { value: 'delete', label: 'Delete' },
])
const converting = ref(false)

function onMenu(action: string) {
  if (!task.value) return
  if (action === 'duplicate') {
    const copy = app.duplicateTask(props.taskId)
    if (copy != null) emit('open', { kind: 'task', id: copy })
  } else if (action === 'convert') {
    converting.value = true
  } else if (action === 'archive') {
    app.archiveTask(props.taskId)
    emit('close')
  } else if (action === 'delete') {
    app.deleteWithUndo('tasks', 'task', props.taskId)
    emit('close')
  }
}
function convertTo(goalId: number) {
  converting.value = false
  if (app.convertTaskToGoalPoint(props.taskId, goalId) != null)
    emit('open', { kind: 'goal', id: goalId })
}

// --- meta row ---------------------------------------------------------------
const PRIORITIES: Priority[] = ['low', 'normal', 'high']
const assignee = useInlineField({
  value: () => task.value?.assignee ?? '',
  commit: (next) => app.patchTask(props.taskId, { assignee: next.trim() }),
  onDirty: fieldDirty('assignee'),
})
// Estimate takes free text ('1h30', '90'), so it commits on blur rather than on
// every keystroke — '1' and '1h' are different numbers and only the last is meant.
const estimateText = ref('')
const estimateFocused = ref(false)
const estimateValue = computed(() =>
  estimateFocused.value ? estimateText.value : formatMinutes(task.value?.estimateMins ?? null),
)
function onEstimateFocus() {
  estimateFocused.value = true
  estimateText.value = task.value?.estimateMins != null ? String(task.value.estimateMins) : ''
}
function onEstimateInput(event: Event) {
  estimateText.value = (event.target as HTMLInputElement).value
}
function onEstimateBlur() {
  estimateFocused.value = false
  const raw = estimateText.value.trim()
  // An emptied field clears the estimate; anything unparseable leaves it alone.
  if (!raw) app.patchTask(props.taskId, { estimateMins: null })
  else {
    const mins = parseMinutes(raw)
    if (mins != null) app.patchTask(props.taskId, { estimateMins: mins })
  }
}

const spent = computed(() => formatMinutes(task.value?.spentMins ?? 0))
function addSpent(minutes: number) {
  app.patchTask(props.taskId, { spentMins: Math.max(0, (task.value?.spentMins ?? 0) + minutes) })
}

const dueChip = computed(() => daysRemaining(task.value?.deadline ?? ''))

function setStart(value: string) {
  const startAt = fromLocalInput(value)
  void app.rescheduleItem('task', props.taskId, {
    startAt,
    endAt: task.value?.endAt ?? null,
    allDay: task.value?.allDay ?? false,
    durationMins: task.value?.durationMins ?? null,
  })
}
function setEnd(value: string) {
  void app.rescheduleItem('task', props.taskId, {
    startAt: task.value?.startAt ?? null,
    endAt: fromLocalInput(value),
    allDay: task.value?.allDay ?? false,
    durationMins: task.value?.durationMins ?? null,
  })
}
const scheduled = computed(() => task.value?.startAt != null)
// "Add to calendar" for an unscheduled task means giving it a time — the next
// whole hour, an hour long, which is the least surprising default to then drag.
function addToCalendar() {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  start.setHours(start.getHours() + 1)
  void app.rescheduleItem('task', props.taskId, {
    startAt: start.getTime(),
    endAt: start.getTime() + 3_600_000,
    allDay: false,
    durationMins: 60,
  })
}
function removeFromCalendar() {
  void app.unscheduleItem('task', props.taskId)
}

// --- breadcrumb --------------------------------------------------------------
// ancestorsOf walks upwards (nearest parent first); a breadcrumb reads downwards,
// so it is reversed here to give "Parent › Child ›".
const ancestors = computed(() => ancestorsOf(index.value, props.taskId).slice().reverse())

// --- subtasks ----------------------------------------------------------------
const subtasks = computed(() => childrenOf(index.value, props.taskId) as Task[])
const subtaskDraft = ref('')
function addSubtask() {
  const text = subtaskDraft.value.trim()
  if (!text) return
  const newId = app.addTask(text, task.value?.tag ?? '')
  if (newId != null) app.moveTask(newId, props.taskId, subtasks.value.length)
  subtaskDraft.value = ''
}
const dragSubtaskId = ref<number | null>(null)
function onSubtaskDrop(position: number) {
  if (dragSubtaskId.value != null) app.moveTask(dragSubtaskId.value, props.taskId, position)
  dragSubtaskId.value = null
}

// --- goals -------------------------------------------------------------------
const attachedGoals = computed(() =>
  (task.value?.goalIds ?? [])
    .map((gid) => goals.value.find((g) => g.id === gid))
    .filter((g): g is NonNullable<typeof g> => !!g),
)
const attaching = ref(false)
const unattachedGoals = computed(() =>
  goalChoices.value.filter((g) => !(task.value?.goalIds ?? []).includes(g.id)),
)
function attach(goalId: number) {
  app.attachToGoal('tasks', props.taskId, goalId)
  attaching.value = false
}

// --- GitHub ------------------------------------------------------------------
const link = computed(() => task.value?.github ?? null)
const connected = computed(() => app.githubConnected)
const targetRepo = ref('')
const linkQuery = ref('')
const linkMode = ref(false)
const creating = ref(false)
const chosenRepo = computed(
  () =>
    targetRepo.value ||
    repos.value.find((r) => r.fullName === task.value?.repo)?.id ||
    repos.value[0]?.id ||
    '',
)
const candidates = computed(() => (linkMode.value ? app.linkableIssues(linkQuery.value) : []))
async function createIssue() {
  if (!chosenRepo.value || creating.value) return
  creating.value = true
  await app.createIssueFromTask(props.taskId, chosenRepo.value)
  creating.value = false
}
function linkIssue(issueId: string) {
  app.linkIssueToTask(props.taskId, issueId)
  linkMode.value = false
  linkQuery.value = ''
}

// --- activity ----------------------------------------------------------------
const history = computed(() => [...(task.value?.statusLog ?? [])].reverse())

// The dialog flushes the body before it tears it down, so a write still inside
// its 600ms window is not lost to the close.
defineExpose({
  flush() {
    assignee.flush()
    if (estimateFocused.value) onEstimateBlur()
  },
  // The counterpart, for a reader who answered "discard" to the close guard.
  revert() {
    assignee.revert()
    estimateFocused.value = false
  },
})
</script>

<template>
  <template v-if="task">
    <div class="tdb">
      <!-- The inline title lives in the shell's header, which the host fills;
           what stays here is everything the header cannot hold. -->
      <div class="tdb__row tdb__row--head">
        <StatusPill :status="task.status" @cycle="app.cycleTaskStatus(task.id)" />
        <span v-if="dueChip" class="tdb__chip" :class="`tdb__chip--${dueChip.tone}`">
          {{ dueChip.text }}
        </span>
        <span class="tdb__spacer"></span>
        <Dropdown label="Task actions" :items="menuItems" @select="onMenu" />
      </div>

      <!-- Convert to goal point asks which goal rather than guessing. -->
      <div v-if="converting" class="tdb__picker">
        <span class="tdb__pickerlabel">Convert into a point on…</span>
        <button
          v-for="g in goalChoices"
          :key="g.id"
          type="button"
          class="tdb__pick"
          @click="convertTo(g.id)"
        >
          {{ g.title || 'Untitled goal' }}
        </button>
        <button type="button" class="tdb__pick" @click="converting = false">Cancel</button>
      </div>

      <!-- Where this sits in the hierarchy, one click from each ancestor. -->
      <nav v-if="ancestors.length" class="tdb__crumbs" aria-label="Parent tasks">
        <template v-for="a in ancestors" :key="a.id">
          <button
            type="button"
            class="tdb__crumb"
            @click="emit('open', { kind: 'task', id: a.id })"
          >
            {{ a.title || 'Untitled' }}
          </button>
          <span class="tdb__crumbsep" aria-hidden="true">›</span>
        </template>
      </nav>

      <DetailSection label="Details">
        <div class="tdb__grid">
          <label class="tdb__field">
            <span class="tdb__key">Project</span>
            <TagPicker
              :model-value="task.tag"
              label=""
              @update:model-value="app.updateTask(task.id, 'tag', $event)"
            />
          </label>
          <label class="tdb__field">
            <span class="tdb__key">Assignee</span>
            <input
              class="tdb__input"
              placeholder="Nobody"
              :value="assignee.draft.value"
              @input="assignee.onInput"
              @focus="assignee.onFocus"
              @blur="assignee.onBlur"
              @keydown="assignee.onKeydown"
            />
          </label>
          <label class="tdb__field">
            <span class="tdb__key">Priority</span>
            <select
              class="tdb__input"
              :value="task.priority ?? 'normal'"
              @change="
                app.patchTask(task.id, {
                  priority: ($event.target as HTMLSelectElement).value as Priority,
                })
              "
            >
              <option v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</option>
            </select>
          </label>
          <label class="tdb__field">
            <span class="tdb__key">Due</span>
            <GlassDatePicker
              size="sm"
              clearable
              placeholder="No due date"
              :model-value="task.deadline"
              @update:model-value="app.updateTask(task.id, 'deadline', String($event ?? ''))"
            />
          </label>
          <label class="tdb__field">
            <span class="tdb__key">Starts</span>
            <GlassDatePicker
              size="sm"
              clearable
              mode="datetime"
              placeholder="Not scheduled"
              :model-value="toLocalInput(task.startAt)"
              @update:model-value="setStart(String($event ?? ''))"
            />
          </label>
          <label class="tdb__field">
            <span class="tdb__key">Ends</span>
            <GlassDatePicker
              size="sm"
              clearable
              mode="datetime"
              placeholder="Open ended"
              :model-value="toLocalInput(task.endAt)"
              @update:model-value="setEnd(String($event ?? ''))"
            />
          </label>
          <label class="tdb__field">
            <span class="tdb__key">Estimate</span>
            <input
              class="tdb__input"
              placeholder="e.g. 1h 30m"
              :value="estimateValue"
              @focus="onEstimateFocus"
              @input="onEstimateInput"
              @blur="onEstimateBlur"
            />
          </label>
          <div class="tdb__field">
            <span class="tdb__key">Time spent</span>
            <div class="tdb__spent">
              <span class="tdb__value">{{ spent }}</span>
              <button type="button" class="tdb__mini" @click="addSpent(15)">+15m</button>
              <button type="button" class="tdb__mini" @click="addSpent(60)">+1h</button>
              <button
                v-if="(task.spentMins ?? 0) > 0"
                type="button"
                class="tdb__mini"
                @click="app.patchTask(task.id, { spentMins: 0 })"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </DetailSection>

      <DetailSection
        label="Subtasks"
        :hint="`${subtasks.filter((s) => s.done).length}/${subtasks.length}`"
      >
        <div
          v-for="(sub, i) in subtasks"
          :key="sub.id"
          class="tdb__sub"
          draggable="true"
          @dragstart="dragSubtaskId = sub.id"
          @dragover.prevent
          @drop="onSubtaskDrop(i)"
        >
          <button
            type="button"
            class="tdb__box"
            :class="sub.done && 'tdb__box--on'"
            :aria-label="sub.done ? 'Mark not done' : 'Mark done'"
            @click.stop="app.toggleTask(sub.id)"
          >
            <span v-if="sub.done" aria-hidden="true">✓</span>
          </button>
          <button
            type="button"
            class="tdb__subtitle"
            :class="sub.done && 'tdb__subtitle--done'"
            @click="emit('open', { kind: 'task', id: sub.id })"
          >
            {{ sub.title || 'Untitled' }}
          </button>
        </div>
        <div class="tdb__addrow">
          <input
            class="tdb__input"
            placeholder="Add a subtask…"
            :value="subtaskDraft"
            @input="subtaskDraft = ($event.target as HTMLInputElement).value"
            @keydown.enter.prevent="addSubtask"
          />
          <button type="button" class="tdb__mini" @click="addSubtask">Add</button>
        </div>
      </DetailSection>

      <DetailSection label="Goals">
        <div class="tdb__chips">
          <button
            v-for="g in attachedGoals"
            :key="g.id"
            type="button"
            class="tdb__goal"
            @click="emit('open', { kind: 'goal', id: g.id })"
          >
            ◎ {{ g.title || 'Untitled goal' }}
            <span
              class="tdb__x"
              role="none"
              @click.stop="app.detachFromGoal('tasks', task.id, g.id)"
              >×</span
            >
          </button>
          <button
            v-if="unattachedGoals.length"
            type="button"
            class="tdb__mini"
            @click="attaching = !attaching"
          >
            {{ attaching ? 'Cancel' : 'Attach to goal…' }}
          </button>
        </div>
        <div v-if="attaching" class="tdb__picker">
          <button
            v-for="g in unattachedGoals"
            :key="g.id"
            type="button"
            class="tdb__pick"
            @click="attach(g.id)"
          >
            {{ g.title || 'Untitled goal' }}
          </button>
        </div>
      </DetailSection>

      <DetailSection label="GitHub">
        <div v-if="link" class="tdb__row">
          <IssueChip :link="link" />
          <span class="tdb__muted">{{ fullName(link.repoId) }}</span>
          <button type="button" class="tdb__mini" @click="app.unlinkIssueFromTask(task.id)">
            Unlink
          </button>
        </div>
        <template v-else-if="connected && repos.length">
          <div class="tdb__row">
            <select
              class="tdb__input"
              :value="chosenRepo"
              @change="targetRepo = ($event.target as HTMLSelectElement).value"
            >
              <option v-for="r in repos" :key="r.id" :value="r.id">{{ r.fullName }}</option>
            </select>
            <button type="button" class="tdb__mini" :disabled="creating" @click="createIssue">
              {{ creating ? '…' : 'Create issue' }}
            </button>
            <button type="button" class="tdb__mini" @click="linkMode = !linkMode">
              {{ linkMode ? 'Cancel' : 'Link existing' }}
            </button>
          </div>
          <template v-if="linkMode">
            <input
              class="tdb__input"
              placeholder="Search by number or title…"
              :value="linkQuery"
              @input="linkQuery = ($event.target as HTMLInputElement).value"
            />
            <div v-if="!candidates.length" class="tdb__muted">No unlinked issues match.</div>
            <div v-for="iss in candidates" :key="iss.id" class="tdb__row">
              <span class="tdb__muted">#{{ iss.number }} · {{ iss.title }}</span>
              <button type="button" class="tdb__mini" @click="linkIssue(iss.id)">Link</button>
            </div>
          </template>
        </template>
        <div v-else class="tdb__row">
          <span class="tdb__muted">
            {{
              connected
                ? 'Link a repository in Settings → GitHub to create issues from tasks.'
                : 'GitHub is not connected.'
            }}
          </span>
          <button v-if="!connected" type="button" class="tdb__mini" @click="auth.openGithubPanel()">
            Connect
          </button>
        </div>
      </DetailSection>

      <DetailSection label="Calendar">
        <div class="tdb__row">
          <span class="tdb__muted">
            {{
              scheduled
                ? `Scheduled for ${new Date(task.startAt!).toLocaleString()}`
                : 'Not on the calendar.'
            }}
          </span>
          <button v-if="!scheduled" type="button" class="tdb__mini" @click="addToCalendar">
            Add to calendar
          </button>
          <button v-else type="button" class="tdb__mini" @click="removeFromCalendar">Remove</button>
        </div>
      </DetailSection>

      <NotesSection type="task" :id="taskId" />

      <DetailSection label="Activity" collapsible :start-open="false">
        <div class="tdb__muted">Created {{ relativeStamp(task.createdAt) }}</div>
        <div class="tdb__muted">Updated {{ relativeStamp(task.updatedAt) }}</div>
        <div v-if="task.rolloverCount" class="tdb__muted">
          Carried over {{ task.rolloverCount }} time{{ task.rolloverCount === 1 ? '' : 's' }}
        </div>
        <div v-for="(entry, i) in history" :key="`${entry.at}-${i}`" class="tdb__muted">
          {{ statusWord(entry.status) }} · {{ relativeStamp(entry.at) }}
        </div>
        <div v-if="!history.length" class="tdb__muted">
          No status changes recorded yet — currently {{ STATUS_LABEL[task.status as ItemStatus] }}.
        </div>
      </DetailSection>
    </div>
  </template>
</template>

<style scoped>
.tdb {
  display: contents;
}
.tdb__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.tdb__row--head {
  padding-bottom: var(--sp-1);
}
.tdb__spacer {
  flex: 1;
}
.tdb__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sp-3);
}
.tdb__field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.tdb__key {
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.tdb__value {
  font-size: var(--text-sm);
  color: var(--theme-text);
}
.tdb__input {
  min-width: 0;
  padding: var(--sp-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: var(--theme-input, transparent);
  color: var(--theme-text);
  font-size: var(--text-sm);
  font-family: inherit;
}
.tdb__spent {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.tdb__mini {
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  cursor: pointer;
  white-space: nowrap;
}
.tdb__mini:hover:not(:disabled) {
  color: var(--theme-text);
}
.tdb__chip {
  padding: 2px var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid currentColor;
  font-size: var(--text-xs);
  font-weight: 600;
}
.tdb__chip--overdue {
  color: oklch(0.64 0.22 25);
}
.tdb__chip--today {
  color: oklch(0.72 0.16 55);
}
.tdb__chip--ahead {
  color: var(--theme-dim);
}
.tdb__crumbs {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  flex-wrap: wrap;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.tdb__crumb {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--theme-dim);
  font-size: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
}
.tdb__crumb:hover {
  color: var(--theme-text);
}
.tdb__sub {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-1) 0;
}
.tdb__box {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--glass-border);
  background: transparent;
  color: var(--theme-on-accent, #fff);
  font-size: 11px;
  cursor: pointer;
}
.tdb__box--on {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
}
.tdb__subtitle {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
}
.tdb__subtitle--done {
  text-decoration: line-through;
  color: var(--theme-dim);
}
.tdb__addrow {
  display: flex;
  gap: var(--sp-2);
}
.tdb__addrow .tdb__input {
  flex: 1;
}
.tdb__chips {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.tdb__goal {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: 2px var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-accent);
  background: transparent;
  color: var(--theme-accent);
  font-size: var(--text-xs);
  cursor: pointer;
}
.tdb__x {
  opacity: 0.7;
  cursor: pointer;
}
.tdb__picker {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  padding: var(--sp-2);
  border-radius: var(--radius-md);
  border: 1px dashed var(--glass-border);
}
.tdb__pickerlabel {
  font-size: var(--text-xs);
  color: var(--theme-dim);
  width: 100%;
}
.tdb__pick {
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-xs);
  cursor: pointer;
}
.tdb__muted {
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
</style>
