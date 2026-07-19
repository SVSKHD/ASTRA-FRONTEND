<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { occurrences, buildGCalUrl } from '@/utils/reminders'
import type { Reminder, RepeatType } from '@/types'

const app = useAppStore()
const ui = useUiStore()
const { c, s } = useStyles()
const { dialogReminderId, dialogClosing, reminders } = storeToRefs(app)
const { now } = storeToRefs(ui)

const reminder = computed<Reminder | undefined>(() =>
  reminders.value.find((r) => r.id === dialogReminderId.value),
)
const rep = computed(() => reminder.value?.repeat || { type: 'none' as RepeatType })
const isInterval = computed(() => rep.value.type !== 'none' && rep.value.type !== 'weekdays')
const isWeekdays = computed(() => rep.value.type === 'weekdays')

const dialogCardStyle = computed(() =>
  pxify({
    position: 'fixed',
    top: '50%',
    left: '50%',
    zIndex: 16,
    width: 'min(92vw,460px)',
    maxHeight: '86vh',
    overflowY: 'auto',
    background: c.value.glass,
    backdropFilter: 'blur(30px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    borderRadius: 26,
    padding: 22,
    boxShadow: c.value.shadow,
    color: c.value.text,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    animation: dialogClosing.value
      ? 'springOut .22s ease forwards'
      : 'springIn .4s cubic-bezier(.34,1.56,.64,1) both',
  }),
)

const weekdayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
function weekdayBtnStyle(i: number) {
  const active = (rep.value.weekdays || []).indexOf(i) !== -1
  return pxify({
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: '1px solid ' + c.value.border,
    fontSize: 10,
    cursor: 'pointer',
    background: active ? c.value.accent : 'transparent',
    color: active ? c.value.onAccent : c.value.dim,
  })
}

const nextLabel = computed(() => {
  if (!reminder.value) return ''
  const occ = occurrences(reminder.value, now.value)
  return occ.next
    ? new Date(occ.next).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'elapsed'
})

function updTitle(e: Event) {
  if (reminder.value) app.updateReminder(reminder.value.id, 'title', (e.target as HTMLInputElement).value)
}
function updNote(e: Event) {
  if (reminder.value) app.updateReminder(reminder.value.id, 'note', (e.target as HTMLTextAreaElement).value)
}
function updStart(e: Event) {
  if (reminder.value) app.updateReminder(reminder.value.id, 'start', (e.target as HTMLInputElement).value)
}
function updRepeatType(e: Event) {
  if (!reminder.value) return
  const type = (e.target as HTMLSelectElement).value as RepeatType
  app.updateReminder(reminder.value.id, 'repeat', { type, n: rep.value.n || 1, weekdays: rep.value.weekdays || [] })
}
function updRepeatN(e: Event) {
  if (!reminder.value) return
  const n = parseInt((e.target as HTMLInputElement).value) || 1
  app.updateReminder(reminder.value.id, 'repeat', { ...rep.value, n })
}
function onCalLink() {
  if (reminder.value) window.open(buildGCalUrl(reminder.value), '_blank')
}
function onDelete() {
  if (!reminder.value) return
  app.deleteWithUndo('reminders', 'reminder', reminder.value.id)
  app.closeReminderDialog()
}
</script>

<template>
  <template v-if="dialogReminderId != null && reminder">
    <div :style="s.dialogOverlay" @click="app.closeReminderDialog()"></div>
    <div :style="dialogCardStyle">
      <div :style="s.dialogHeader">
        <input :style="s.dialogTitleInput" :value="reminder.title" @input="updTitle" />
        <button :style="s.del" @click="app.closeReminderDialog()">×</button>
      </div>
      <div :style="s.dialogRow">
        <input :style="s.editInputSmall" type="datetime-local" :value="reminder.start" @input="updStart" />
        <select :style="s.select" :value="rep.type" @change="updRepeatType">
          <option value="none">One-off</option>
          <option value="minutes">Every N minutes</option>
          <option value="hours">Every N hours</option>
          <option value="days">Every N days</option>
          <option value="weeks">Every N weeks</option>
          <option value="months">Every N months</option>
          <option value="years">Every N years</option>
          <option value="weekdays">Specific weekdays</option>
        </select>
      </div>
      <div v-if="isInterval" :style="s.dialogRow">
        <input :style="s.editInputSmall" type="number" min="1" :value="rep.n || 1" @input="updRepeatN" />
      </div>
      <div v-if="isWeekdays" :style="s.weekdayRow">
        <button
          v-for="(nm, i) in weekdayNames"
          :key="i"
          :style="weekdayBtnStyle(i)"
          @click="app.toggleWeekday(reminder.id, i)"
        >
          {{ nm }}
        </button>
      </div>
      <textarea :style="s.dialogNotes" placeholder="Notes…" :value="reminder.note" @input="updNote"></textarea>
      <div :style="s.dialogGithub">
        <span :style="s.finMeta">Next: {{ nextLabel }} · {{ reminder.calSync }}</span>
        <div :style="s.dialogActions">
          <button :style="s.editBtn" @click="onCalLink">Add to Google Calendar</button>
          <button :style="s.editBtn" @click="app.syncCalendar(reminder.id)">Sync</button>
        </div>
      </div>
      <div :style="s.dialogActions">
        <button :style="s.editBtn" @click="app.share('reminder', reminder)">Share</button>
        <button :style="s.cancelBtn" @click="onDelete">Delete</button>
      </div>
    </div>
  </template>
</template>
