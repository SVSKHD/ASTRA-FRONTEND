<script setup lang="ts">
// The right-hand detail of the Reminders tab, in the same shape as a todo's:
// a hero with its chips and actions, the title large (double-click to edit) and
// when it rings next; then every field, editable in place (ReminderForm), and
// its Google Calendar. Changes write through, as the todo pane's do.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useInlineEdit } from '@/composables/useInlineEdit'
import { useDetailStyles } from '@/composables/useDetailStyles'
import PaneToolbar from '@/components/detail/PaneToolbar.vue'
import PaneButton from '@/components/detail/PaneButton.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Chip from '@/components/ui/Chip.vue'
import Icon from '@/components/ui/Icon.vue'
import ReminderForm from '@/components/reminders/ReminderForm.vue'
import ReminderCalendar from '@/components/reminders/ReminderCalendar.vue'
import { occurrences, repFreqLabel } from '@/utils/reminders'
import { relLabel } from '@/utils/upcoming'
import {
  formFromReminder,
  isReminderDone,
  sourceLabel,
  whenLabel,
  type ReminderFormValue,
} from '@/utils/reminderView'
import { vScrollFade } from '@/directives/scrollFade'
import type { Reminder } from '@/types'

const props = defineProps<{ reminderId: number | null }>()
const emit = defineEmits<{ close: [] }>()

const app = useAppStore()
const ui = useUiStore()
const { reminders } = storeToRefs(app)
const { now } = storeToRefs(ui)
const { pane } = useDetailStyles()

const reminder = computed<Reminder | undefined>(() =>
  reminders.value.find((r) => r.id === props.reminderId),
)
const value = computed<ReminderFormValue | null>(() =>
  reminder.value ? formFromReminder(reminder.value) : null,
)
const done = computed(() => (reminder.value ? isReminderDone(reminder.value) : false))
const next = computed(() => (reminder.value ? occurrences(reminder.value, now.value) : null))
const nextLine = computed(() => {
  const r = reminder.value
  const occ = next.value
  if (!r || !occ) return ''
  if (r.cancelledAt != null) return 'Cancelled'
  if (r.acknowledgedAt != null) return 'Done'
  if (occ.next != null)
    return `Rings ${whenLabel(occ.next, now.value)} · ${relLabel(occ.next - now.value)}`
  if (occ.last != null) return `Missed · was due ${whenLabel(occ.last, now.value)}`
  return 'No time set'
})
const PRIORITY_LABEL = { high: 'High', normal: 'Normal', low: 'Low' } as const

const { draft, start, cancel, commit, isEditing, vFocus } = useInlineEdit((key, raw) => {
  const r = reminder.value
  const v = raw.trim()
  if (r && key === 'title' && v) app.updateReminder(r.id, 'title', v)
})

function patch(p: Partial<ReminderFormValue>) {
  const r = reminder.value
  if (!r) return
  for (const [k, v] of Object.entries(p)) {
    if (k !== 'addToCalendar') app.updateReminder(r.id, k as keyof Reminder, v)
  }
}
function toggleDone() {
  const r = reminder.value
  if (!r) return
  if (done.value) app.patchReminder(r.id, { acknowledgedAt: null, cancelledAt: null })
  else app.acknowledgeReminder(r.id)
}
function snooze(mins: number) {
  if (reminder.value) app.snoozeReminder(reminder.value.id, mins)
}
function minsToTomorrow9() {
  const t = new Date(now.value)
  t.setDate(t.getDate() + 1)
  t.setHours(9, 0, 0, 0)
  return Math.max(1, Math.round((t.getTime() - now.value) / 60_000))
}
function openSource() {
  const sr = reminder.value?.sourceRef
  if (!sr) return
  if (sr.collection === 'todos') app.openEdit('todo', sr.id)
  else if (sr.collection === 'tasks') app.openEdit('task', sr.id)
  else if (sr.collection === 'ideas') app.openEdit('idea', sr.id)
}
function remove() {
  const r = reminder.value
  if (!r) return
  app.deleteWithUndo('reminders', 'reminder', r.id)
  emit('close')
}
</script>

<template>
  <div v-scroll-fade :style="pane">
    <Transition name="pane-swap" mode="out-in">
      <div :key="reminderId ?? 'empty'" class="pane-swap__body rdp">
        <template v-if="reminder && value">
          <section class="dp-hero">
            <div class="dp-top">
              <Chip
                size="sm"
                :label="PRIORITY_LABEL[reminder.priority] + ' priority'"
                :class="'rdp__prio is-' + reminder.priority"
              />
              <Chip
                size="sm"
                icon="repeat"
                :label="reminder.repeat?.type === 'none' ? 'Once' : repFreqLabel(reminder.repeat)"
              />
              <Chip
                v-if="reminder.sourceRef"
                size="sm"
                tone="accent"
                icon="link"
                :label="sourceLabel(reminder)"
                @click="openSource"
              />
              <PaneToolbar class="dp-actions">
                <PaneButton
                  :icon="done ? 'rotate-ccw' : 'check'"
                  :label="done ? 'Reopen' : 'Mark done'"
                  tone="accent"
                  @click="toggleDone"
                />
                <PaneButton icon="share-2" label="Share" @click="app.share('reminder', reminder)" />
                <PaneButton
                  icon="external-link"
                  label="Open in dialog"
                  @click="app.openReminderDialog(reminder.id)"
                />
                <PaneButton icon="trash" label="Delete reminder" tone="danger" @click="remove" />
              </PaneToolbar>
            </div>

            <TextInput
              v-if="isEditing('title')"
              v-model="draft"
              v-focus
              size="lg"
              aria-label="Reminder title"
              @keydown.enter="commit"
              @keydown.esc="cancel"
              @blur="commit"
            />
            <h2
              v-else
              class="dp-title"
              :class="{ 'is-done': done }"
              title="Double-click to edit"
              @dblclick="start('title', reminder.title)"
            >
              {{ reminder.title || '(untitled)' }}
            </h2>

            <div class="rdp__when" :class="{ 'is-missed': !done && next?.next == null }">
              <Icon name="alarm-clock" size="sm" />
              <span>{{ nextLine }}</span>
            </div>

            <div v-if="!done" class="rdp__snooze" role="group" aria-label="Snooze">
              <span class="rdp__snoozeLabel">Snooze</span>
              <Chip size="sm" label="10 min" @click="snooze(10)" />
              <Chip size="sm" label="1 hour" @click="snooze(60)" />
              <Chip size="sm" label="Tomorrow 9 AM" @click="snooze(minsToTomorrow9())" />
            </div>
          </section>

          <ReminderForm :value="value" :now="now" hide-title @patch="patch">
            <template #calendar>
              <ReminderCalendar :reminder="reminder" />
            </template>
          </ReminderForm>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.rdp {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}
.rdp__when {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--theme-accent);
}
.rdp__when.is-missed {
  color: var(--theme-danger);
}
.rdp__snooze {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.rdp__snoozeLabel {
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.rdp__prio.is-high {
  color: var(--theme-danger);
}
.rdp__prio.is-normal {
  color: var(--theme-warning);
}
</style>
