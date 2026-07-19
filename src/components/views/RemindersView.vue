<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, merge, rowBase } from '@/styles'
import { occurrences, repFreqLabel } from '@/utils/reminders'
import type { Reminder, RepeatType } from '@/types'

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

const isInterval = computed(() => repeatType.value !== 'none' && repeatType.value !== 'weekdays')
const isWeekdays = computed(() => repeatType.value === 'weekdays')

function add() {
  const repeat =
    repeatType.value === 'weekdays'
      ? { type: 'weekdays' as const, weekdays: weekdays.value.slice() }
      : { type: repeatType.value, n: repeatN.value || 1 }
  app.addReminder({ title: title.value, note: note.value, start: start.value, repeat })
  if (title.value.trim() && start.value) {
    title.value = ''
    note.value = ''
    start.value = ''
    repeatType.value = 'none'
    repeatN.value = 1
    weekdays.value = []
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

interface RemView {
  id: number
  title: string
  freqLabel: string
  nextLabel: string
  syncLabel: string
  syncColor: string
}
const view = computed<RemView[]>(() =>
  reminders.value.map((r) => {
    const occ = occurrences(r, now.value)
    const nextLabel = occ.next
      ? new Date(occ.next).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'elapsed'
    const syncLabel = r.calSync === 'synced' ? 'Synced' : r.calSync === 'pending' ? 'Syncing…' : 'Local only'
    const syncColor =
      r.calSync === 'synced' ? (dark.value ? 'oklch(0.75 0.14 145)' : 'oklch(0.6 0.14 145)') : c.value.dim
    return { id: r.id, title: r.title, freqLabel: repFreqLabel(r.repeat), nextLabel, syncLabel, syncColor }
  }),
)

function rowStyle() {
  return merge(rowBase(c.value), { cursor: 'pointer' })
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
</script>

<template>
  <div :style="panelStyle">
    <div :style="s.inputRow">
      <input ref="remInputRef" :style="s.input" placeholder="Reminder title…" v-model="title" />
    </div>
    <div :style="s.inputRow">
      <input :style="s.input" placeholder="Note (optional)" v-model="note" />
    </div>
    <div :style="s.inputRow">
      <input :style="s.input" type="datetime-local" v-model="start" />
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
      <input :style="s.editInputSmall" type="number" min="1" v-model.number="repeatN" />
      <button :style="s.addBtn" v-hover-style="s.addBtnHover" @click="add">+</button>
    </div>
    <div v-if="isWeekdays" :style="s.weekdayRow">
      <button v-for="(nm, i) in weekdayNames" :key="i" :style="weekdayBtnStyle(i)" @click="toggleWeekday(i)">
        {{ nm }}
      </button>
      <button :style="s.addBtn" v-hover-style="s.addBtnHover" @click="add">+</button>
    </div>
    <div v-if="reminders.length === 0" :style="s.empty">No reminders set.</div>
    <div :style="s.list">
      <div v-for="it in view" :key="it.id" :style="rowStyle()" v-hover-style="s.rowHover" @click="app.openReminderDialog(it.id)">
        <div :style="s.taskMain">
          <span :style="s.dlTitle">{{ it.title }}</span>
          <span :style="s.dlDate">{{ it.freqLabel }} · next {{ it.nextLabel }}</span>
        </div>
        <span :style="syncChipStyle(it.syncColor)">{{ it.syncLabel }}</span>
        <button :style="s.shareBtn" @click.stop="app.share('reminder', findReminder(it.id)!)">↗</button>
        <button :style="s.del" @click.stop="app.deleteWithUndo('reminders', 'reminder', it.id)">×</button>
      </div>
    </div>
  </div>
</template>
