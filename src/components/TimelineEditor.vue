<script setup lang="ts">
// Writing a Timeline entry: a title, the day it sits on, where it stands, the
// tasks and notes it is linked to, and the write-up itself in markdown — the
// same editor notes use, so the toolbar, paste handling and preview are one
// thing to learn.
//
// Driven by `app.timelineEditor`, so it can be opened from the sidebar, from a
// task's Timeline section (pre-linked to that task), or anywhere else. Nothing
// is written until Save (or ⌘/Ctrl+Enter); closing with changes asks first.
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { noteLabel } from '@/utils/notes'
import {
  TIMELINE_STATUSES,
  todayYmd,
  linkedRows,
  rowLabel,
  formatTimelineBody,
} from '@/utils/timeline'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import TextInput from '@/components/ui/TextInput.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import MultiSelect from '@/components/ui/MultiSelect.vue'
import NoteEditor from '@/components/notes/NoteEditor.vue'
import type { TimelineStatus } from '@/types'

const app = useAppStore()
const { timelineEditor, timeline, tasks, todos, notes } = storeToRefs(app)

const open = computed(() => timelineEditor.value != null)
const editingId = computed(() => timelineEditor.value?.id ?? null)

const form = reactive({
  title: '',
  body: '',
  date: todayYmd(),
  status: 'planned' as TimelineStatus,
  taskIds: [] as string[],
  todoIds: [] as string[],
  noteIds: [] as string[],
})
// What the form held when it opened, so "changed?" is a comparison, not a flag
// every field has to remember to set.
let initial = ''
const snapshot = () => JSON.stringify(form)
const dirty = computed(() => open.value && snapshot() !== initial)
const confirmDiscard = ref(false)

watch(
  timelineEditor,
  (ed) => {
    confirmDiscard.value = false
    if (!ed) return
    const e = ed.id != null ? timeline.value.find((x) => x.id === ed.id) : undefined
    Object.assign(form, {
      title: e?.title ?? '',
      body: e?.body ?? '',
      date: e?.date ?? todayYmd(),
      status: e?.status ?? 'planned',
      taskIds: (e?.taskIds ?? ed.taskIds).map(String),
      todoIds: (e?.todoIds ?? ed.todoIds).map(String),
      noteIds: (e?.noteIds ?? ed.noteIds).map(String),
    })
    initial = snapshot()
  },
  { immediate: true },
)

// Tasks grouped by project; finished ones last and marked, since a feature is
// as often written up after it ships as before.
const taskOptions = computed(() =>
  [...tasks.value]
    .filter((t) => !t.archivedAt)
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'))
    .map((t) => ({
      value: String(t.id),
      label: t.status === 'done' ? `${t.title} ✓` : t.title,
      group: t.tag || 'No project',
    })),
)
const todoOptions = computed(() =>
  todos.value
    .filter((t) => !t.archivedAt)
    .map((t) => ({
      value: String(t.id),
      label:
        rowLabel(
          linkedRows(
            [t.id],
            todos.value.map((todo) => ({ ...todo, title: todo.text })),
          )[0]!,
        ) + (t.status === 'done' ? ' ?' : ''),
      group: t.tag || 'No project',
    })),
)
function formatWork() {
  form.body = formatTimelineBody(form.body, {
    tasks: linkedRows(
      form.taskIds.map(Number),
      tasks.value.map((t) => ({ ...t, done: t.status === 'done' })),
    ),
    todos: linkedRows(
      form.todoIds.map(Number),
      todos.value.map((t) => ({ ...t, title: t.text, done: t.status === 'done' })),
    ),
  })
}
const noteOptions = computed(() =>
  [...notes.value]
    .sort((a, b) => (b.updatedAt ?? b.ts) - (a.updatedAt ?? a.ts))
    .map((n) => ({ value: String(n.id), label: noteLabel(n) })),
)
const statusOptions = TIMELINE_STATUSES.map((s) => ({ value: s.value, label: s.label }))

const canSave = computed(() => !!(form.title.trim() || form.body.trim()))

function save() {
  if (!canSave.value) return
  const payload = {
    title: form.title,
    body: form.body,
    date: form.date || todayYmd(),
    status: form.status,
    taskIds: form.taskIds.map(Number),
    todoIds: form.todoIds.map(Number),
    noteIds: form.noteIds.map(Number),
  }
  if (editingId.value == null) {
    if (app.addTimelineEntry(payload) != null) app.showToastMsg('Added to the timeline')
  } else {
    app.updateTimelineEntry(editingId.value, payload)
    app.showToastMsg('Timeline entry saved')
  }
  app.closeTimelineEditor()
}
function requestClose() {
  if (dirty.value && !confirmDiscard.value) {
    confirmDiscard.value = true
    return
  }
  app.closeTimelineEditor()
}
function remove() {
  if (editingId.value != null) app.removeTimelineEntry(editingId.value)
}
</script>

<template>
  <Modal
    :open="open"
    :title="editingId == null ? 'New timeline entry' : 'Edit timeline entry'"
    size="lg"
    @close="requestClose"
  >
    <div class="tle" @keydown.ctrl.enter.prevent="save" @keydown.meta.enter.prevent="save">
      <label class="tle__field">
        <span class="tle__label">Feature</span>
        <TextInput v-model="form.title" placeholder="e.g. Installation scheduling board" />
      </label>
      <div class="tle__row">
        <label class="tle__field">
          <span class="tle__label">Date</span>
          <GlassDatePicker v-model="form.date" mode="date" placeholder="Pick a day" />
        </label>
        <div class="tle__field">
          <span class="tle__label">Status</span>
          <SegmentedControl v-model="form.status" :options="statusOptions" aria-label="Status" />
        </div>
      </div>
      <div class="tle__row">
        <div class="tle__field">
          <span class="tle__label"><Icon name="list" size="xs" /> Tasks</span>
          <MultiSelect
            v-model="form.taskIds"
            :options="taskOptions"
            placeholder="Link tasks…"
            :max-chips="2"
          />
        </div>
        <div class="tle__field">
          <span class="tle__label"><Icon name="notebook" size="xs" /> Notes</span>
          <MultiSelect
            v-model="form.noteIds"
            :options="noteOptions"
            placeholder="Link notes…"
            :max-chips="2"
          />
        </div>
      </div>
      <div class="tle__field">
        <span class="tle__label"><Icon name="list" size="xs" /> Todos</span>
        <MultiSelect
          v-model="form.todoIds"
          :options="todoOptions"
          placeholder="Link todos?"
          :max-chips="2"
        />
      </div>
      <div class="tle__field">
        <span class="tle__label">Write-up</span>
        <Button variant="ghost" size="sm" @click="formatWork">Refresh linked checklists</Button>
        <NoteEditor
          v-model="form.body"
          compact
          placeholder="What it is, why it matters, how it works — in markdown"
          @save="save"
        />
      </div>
    </div>

    <template #footer>
      <template v-if="confirmDiscard">
        <span class="tle__warn">Discard your changes?</span>
        <span class="tle__spacer" />
        <Button variant="ghost" @click="confirmDiscard = false">Keep editing</Button>
        <Button variant="danger" @click="app.closeTimelineEditor()">Discard</Button>
      </template>
      <template v-else>
        <Button v-if="editingId != null" variant="danger" size="sm" @click="remove">
          <Icon name="trash" size="xs" /> Delete
        </Button>
        <span class="tle__spacer" />
        <Button variant="ghost" @click="requestClose">Cancel</Button>
        <Button variant="primary" :disabled="!canSave" @click="save">
          {{ editingId == null ? 'Add to timeline' : 'Save' }}
        </Button>
      </template>
    </template>
  </Modal>
</template>

<style scoped>
.tle {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.tle__row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-3);
}
@media (max-width: 640px) {
  .tle__row {
    grid-template-columns: minmax(0, 1fr);
  }
}
.tle__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.tle__label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}
.tle__spacer {
  flex: 1;
}
.tle__warn {
  color: var(--theme-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}
</style>
