<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, merge, rowBase } from '@/styles'
import { occurrences, repFreqLabel } from '@/utils/reminders'
import ReminderTimeline from '@/components/ReminderTimeline.vue'
import { PRIORITY_ORDER, type Priority, type Reminder, type RepeatType } from '@/types'

const app = useAppStore()
const ui = useUiStore()
const { c, dark, s, panelStyle } = useStyles()
const { reminders } = storeToRefs(app)
const { now } = storeToRefs(ui)

const remInputRef = ref<HTMLInputElement | null>(null)
defineExpose({ focus: () => remInputRef.value?.focus() })

const title = ref('')
const note = ref('')
const start = ref('')
const repeatType = ref<RepeatType>('none')
const repeatN = ref(1)
const weekdays = ref<number[]>([])
const priority = ref<Priority>('normal')
const addToCalendar = ref(false)

const isInterval = computed(() => repeatType.value !== 'none' && repeatType.value !== 'weekdays')
const isWeekdays = computed(() => repeatType.value === 'weekdays')

function add() {
  const repeat =
    repeatType.value === 'weekdays'
      ? { type: 'weekdays' as const, weekdays: weekdays.value.slice() }
      : { type: repeatType.value, n: repeatN.value || 1 }
  app.addReminder({
    title: title.value,
    note: note.value,
    start: start.value,
    repeat,
    priority: priority.value,
    addToCalendar: addToCalendar.value,
  })
  if (title.value.trim() && start.value) {
    title.value = ''
    note.value = ''
    start.value = ''
    repeatType.value = 'none'
    repeatN.value = 1
    weekdays.value = []
    priority.value = 'normal'
    addToCalendar.value = false
  }
}

const weekdayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
function toggleWeekday(i: number) {
  const wd = weekdays.value.slice()
  const idx = wd.indexOf(i)
  if (idx === -1) wd.push(i)
  else wd.splice(idx, 1)
  weekdays.value = wd
}
function weekdayBtnStyle(i: number) {
  const active = weekdays.value.indexOf(i) !== -1
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

const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', normal: 'Normal', low: 'Low' }
function priorityColor(p: Priority): string {
  if (p === 'high') return dark.value ? 'oklch(0.72 0.18 25)' : 'oklch(0.58 0.19 25)'
  if (p === 'low') return c.value.dim
  return dark.value ? 'oklch(0.78 0.13 88)' : 'oklch(0.62 0.13 70)'
}

interface RemView {
  id: number
  title: string
  freqLabel: string
  nextLabel: string
  syncLabel: string
  syncColor: string
  priority: Priority
  priorityLabel: string
  priorityColor: string
}
// Highest priority first; within a priority, soonest next occurrence first.
const sortedReminders = computed(() =>
  [...reminders.value].sort((a, b) => {
    const byPriority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (byPriority !== 0) return byPriority
    const an = occurrences(a, now.value).next ?? Number.POSITIVE_INFINITY
    const bn = occurrences(b, now.value).next ?? Number.POSITIVE_INFINITY
    return an - bn
  }),
)
const view = computed<RemView[]>(() =>
  sortedReminders.value.map((r) => {
    const occ = occurrences(r, now.value)
    const nextLabel = occ.next
      ? new Date(occ.next).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'elapsed'
    const syncLabel =
      r.calSync === 'synced'
        ? 'In calendar'
        : r.calSync === 'pending'
          ? 'Syncing…'
          : r.calSync === 'error'
            ? 'Sync failed'
            : 'Local only'
    const syncColor =
      r.calSync === 'synced'
        ? dark.value
          ? 'oklch(0.75 0.14 145)'
          : 'oklch(0.6 0.14 145)'
        : r.calSync === 'error'
          ? dark.value
            ? 'oklch(0.72 0.18 25)'
            : 'oklch(0.58 0.19 25)'
          : c.value.dim
    return {
      id: r.id,
      title: r.title,
      freqLabel: repFreqLabel(r.repeat),
      nextLabel,
      syncLabel,
      syncColor,
      priority: r.priority,
      priorityLabel: PRIORITY_LABEL[r.priority],
      priorityColor: priorityColor(r.priority),
    }
  }),
)

function rowStyle() {
  return merge(rowBase(c.value), { cursor: 'pointer' })
}
function priorityChipStyle(color: string) {
  return pxify({
    fontSize: 9,
    padding: '3px 8px',
    borderRadius: 8,
    background: 'transparent',
    border: '1px solid ' + color,
    color,
    letterSpacing: '0.04em',
    flexShrink: 0,
  })
}
function syncChipStyle(color: string) {
  return pxify({
    fontSize: 9,
    padding: '3px 8px',
    borderRadius: 8,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color,
    letterSpacing: '0.03em',
  })
}
function findReminder(id: number): Reminder | undefined {
  return reminders.value.find((r) => r.id === id)
}

// Only one timeline is open at a time — several 190px strips at once would bury
// the rest of the list.
const expandedId = ref<number | null>(null)
function toggleExpanded(id: number) {
  expandedId.value = expandedId.value === id ? null : id
}
const rowWrapStyle = pxify({ display: 'flex', flexDirection: 'column' })
const calAskStyle = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 11,
    color: c.value.dim,
    padding: '2px 4px 6px',
    cursor: 'pointer',
  }),
)
function chevronStyle(open: boolean) {
  return pxify({
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 11,
    color: c.value.dim,
    padding: '2px 6px',
    transform: open ? 'rotate(180deg)' : 'none',
    transition: 'transform .2s ease',
  })
}
</script>

<template>
  <div :style="panelStyle">
    <div :style="s.inputRow">
      <input
        ref="remInputRef"
        :style="s.input"
        placeholder="Reminder title…"
        v-model="title"
        @keydown.enter="add"
      />
    </div>
    <div :style="s.inputRow">
      <input :style="s.input" placeholder="Note (optional)" v-model="note" @keydown.enter="add" />
    </div>
    <div :style="s.inputRow">
      <input :style="s.input" type="datetime-local" v-model="start" @keydown.enter="add" />
      <select :style="s.select" v-model="repeatType">
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
    <div v-if="isInterval" :style="s.inputRow">
      <input
        :style="s.editInputSmall"
        type="number"
        min="1"
        v-model.number="repeatN"
        @keydown.enter="add"
      />
    </div>
    <div v-if="isWeekdays" :style="s.weekdayRow">
      <button
        v-for="(nm, i) in weekdayNames"
        :key="i"
        :style="weekdayBtnStyle(i)"
        @click="toggleWeekday(i)"
      >
        {{ nm }}
      </button>
    </div>
    <div :style="s.inputRow">
      <select :style="s.select" v-model="priority">
        <option value="high">High priority</option>
        <option value="normal">Normal priority</option>
        <option value="low">Low priority</option>
      </select>
      <button :style="s.addBtn" v-hover-style="s.addBtnHover" @click="add">+</button>
    </div>
    <label :style="calAskStyle">
      <input type="checkbox" v-model="addToCalendar" />
      <span>Add to Google Calendar</span>
    </label>
    <div v-if="reminders.length === 0" :style="s.empty">No reminders set.</div>
    <div :style="s.list">
      <div v-for="it in view" :key="it.id" :style="rowWrapStyle">
        <div :style="rowStyle()" v-hover-style="s.rowHover" @click="app.openReminderDialog(it.id)">
          <div :style="s.taskMain">
            <span :style="s.dlTitle">{{ it.title }}</span>
            <span :style="s.dlDate">{{ it.freqLabel }} · next {{ it.nextLabel }}</span>
          </div>
          <span :style="priorityChipStyle(it.priorityColor)">{{ it.priorityLabel }}</span>
          <span :style="syncChipStyle(it.syncColor)">{{ it.syncLabel }}</span>
          <button
            :style="chevronStyle(expandedId === it.id)"
            :aria-expanded="expandedId === it.id"
            aria-label="Upcoming dates"
            @click.stop="toggleExpanded(it.id)"
          >
            ▾
          </button>
          <button :style="s.shareBtn" @click.stop="app.share('reminder', findReminder(it.id)!)">
            ↗
          </button>
          <button :style="s.del" @click.stop="app.deleteWithUndo('reminders', 'reminder', it.id)">
            ×
          </button>
        </div>
        <ReminderTimeline v-if="expandedId === it.id" :reminder="findReminder(it.id)!" :now="now" />
      </div>
    </div>
  </div>
</template>
