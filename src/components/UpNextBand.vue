<script setup lang="ts">
// The pinned "Up next" band at the top of the Reminders stage: the reminders
// firing within the next 24h (up to 3) as floating glass cards with a large live
// countdown and inline Acknowledge / Snooze / Skip. Overdue-unacknowledged cards
// go red and stay pinned; under 15 minutes they pulse and the countdown turns
// accent. The countdown reads a single shared clock, not a per-card timer.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { useReminderClock } from '@/composables/useReminderClock'
import { DANGER, WARNING, pxify, typeStep } from '@/styles'
import {
  upcomingReminders,
  nextBeyondWindow,
  countdownClock,
  relLabel,
  ticksBySecond,
  SOON_MS,
  type UpcomingReminder,
} from '@/utils/upcoming'
import { type Priority } from '@/types'

const app = useAppStore()
const { c, dark } = useStyles()
const { reminders } = storeToRefs(app)
const { nowMs } = useReminderClock()

const cards = computed<UpcomingReminder[]>(() =>
  upcomingReminders(reminders.value, nowMs.value, { limit: 3 }),
)
const nextBeyond = computed(() => nextBeyondWindow(reminders.value, nowMs.value))
const nextBeyondLabel = computed(() =>
  nextBeyond.value == null
    ? ''
    : new Date(nextBeyond.value).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
)

const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', normal: 'Normal', low: 'Low' }
function priorityColor(p: Priority): string {
  if (p === 'high') return DANGER
  if (p === 'low') return c.value.dim
  return WARNING
}
const dangerColor = computed(() => DANGER)
const accentColor = computed(() => c.value.accent)

// Big countdown text: MM:SS under an hour, coarser above; "Xh ago" for overdue.
function bigLabel(u: UpcomingReminder): string {
  return u.overdue ? relLabel(u.ms) : countdownClock(u.ms)
}
function isSoon(u: UpcomingReminder): boolean {
  return !u.overdue && u.ms <= SOON_MS
}
function sub(u: UpcomingReminder): string {
  return u.overdue ? 'overdue' : 'in ' + relLabel(u.ms).replace(/^in /, '')
}
// eslint keep: reading nowMs in the ticks label keeps it reactive per second.
function tickHint(u: UpcomingReminder): boolean {
  void nowMs.value
  return ticksBySecond(u.ms)
}

const bandStyle = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-3)',
    padding: 12,
    borderRadius: 'var(--radius-dialog)',
    background: dark.value ? 'rgba(30,34,64,0.4)' : 'rgba(255,255,255,0.4)',
    border: '1px solid ' + c.value.border,
    boxShadow: dark.value ? '0 10px 30px rgba(0,0,0,0.35)' : '0 10px 30px rgba(80,90,160,0.12)',
    backdropFilter: 'blur(14px)',
  }),
)
const bandHead = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: c.value.dim,
  }),
)
const cardsWrap = pxify({ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' })

function cardStyle(u: UpcomingReminder) {
  const border = u.overdue ? dangerColor.value : isSoon(u) ? accentColor.value : c.value.border
  const base = pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    padding: '12px 14px',
    borderRadius: 'var(--radius-dialog)',
    background: c.value.card,
    border: '1px solid ' + border,
    boxShadow: u.overdue
      ? '0 0 0 1px ' + dangerColor.value + ', 0 8px 24px rgba(0,0,0,0.18)'
      : '0 8px 24px rgba(0,0,0,0.12)',
  }) as Record<string, string | number>
  if (isSoon(u)) base.animation = 'pulse 1.6s ease-in-out infinite'
  return base
}
function countdownStyle(u: UpcomingReminder) {
  const col = u.overdue ? dangerColor.value : isSoon(u) ? accentColor.value : c.value.text
  return pxify({
    ...typeStep('lg'),
    fontWeight: 'var(--weight-semibold)',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
    minWidth: 78,
    color: col,
    textShadow: dark.value && (u.overdue || isSoon(u)) ? '0 0 12px ' + col : 'none',
  })
}
const cdSub = computed(() => pxify({ ...typeStep('2xs'), color: c.value.dim, marginTop: 4 }))
const mainCol = pxify({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-1)',
})
const titleStyle = computed(() =>
  pxify({
    ...typeStep('base'),
    fontWeight: 'var(--weight-semibold)',
    color: c.value.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
)
const chipRow = pxify({
  display: 'flex',
  gap: 'var(--sp-2)',
  flexWrap: 'wrap',
  alignItems: 'center',
})
function priorityChip(p: Priority) {
  const col = priorityColor(p)
  return pxify({
    ...typeStep('2xs'),
    padding: '2px 7px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid ' + col,
    color: col,
    letterSpacing: '0.04em',
  })
}
const sourceChip = computed(() =>
  pxify({
    ...typeStep('2xs'),
    padding: '2px 7px',
    borderRadius: 'var(--radius-control)',
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color: c.value.dim,
    cursor: 'pointer',
    maxWidth: 160,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
)
const actionsCol = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  alignItems: 'flex-end',
})
const actionRow = pxify({ display: 'flex', gap: 'var(--sp-2)' })
function btn(kind: 'primary' | 'ghost') {
  return pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '5px 9px',
    borderRadius: 'var(--radius-pill)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    border: '1px solid ' + (kind === 'primary' ? c.value.accent : c.value.border),
    background: kind === 'primary' ? c.value.accent : 'transparent',
    color: kind === 'primary' ? c.value.onAccent : c.value.dim,
  })
}
const emptyStyle = computed(() =>
  pxify({ ...typeStep('xs'), color: c.value.dim, padding: '6px 2px', textAlign: 'center' }),
)

// The chip label + which collection a source-linked reminder points at.
function sourceLabel(u: UpcomingReminder): string {
  const sr = u.reminder.sourceRef
  if (!sr) return ''
  const noun = sr.collection === 'todos' ? 'Todo' : sr.collection === 'tasks' ? 'Task' : 'Reminder'
  return 'from ' + noun
}
function openSource(u: UpcomingReminder) {
  const sr = u.reminder.sourceRef
  if (!sr) return
  if (sr.collection === 'todos') app.openEdit('todo', sr.id)
  else if (sr.collection === 'tasks') app.openEdit('task', sr.id)
}

// Minutes from now until tomorrow 09:00 local, for the "tomorrow" snooze.
function minsUntilTomorrow9(): number {
  const now = new Date(nowMs.value)
  const t = new Date(now)
  t.setDate(t.getDate() + 1)
  t.setHours(9, 0, 0, 0)
  return Math.max(1, Math.round((t.getTime() - now.getTime()) / 60000))
}
</script>

<template>
  <div :style="bandStyle" aria-label="Up next">
    <div :style="bandHead">
      <span>Up next</span>
    </div>
    <div v-if="cards.length === 0" :style="emptyStyle">
      Nothing due in the next 24 hours<template v-if="nextBeyondLabel">
        · next {{ nextBeyondLabel }}</template
      >
    </div>
    <div v-else :style="cardsWrap">
      <div v-for="u in cards" :key="u.reminder.id" :style="cardStyle(u)">
        <div>
          <div :style="countdownStyle(u)" :data-ticks="tickHint(u) ? 'sec' : 'min'">
            {{ bigLabel(u) }}
          </div>
          <div :style="cdSub">{{ sub(u) }}</div>
        </div>
        <div :style="mainCol">
          <span :style="titleStyle">{{ u.reminder.title }}</span>
          <div :style="chipRow">
            <span :style="priorityChip(u.reminder.priority)">{{
              PRIORITY_LABEL[u.reminder.priority]
            }}</span>
            <span
              v-if="u.reminder.sourceRef"
              :style="sourceChip"
              role="button"
              @click="openSource(u)"
              >{{ sourceLabel(u) }}</span
            >
          </div>
        </div>
        <div :style="actionsCol">
          <div :style="actionRow">
            <button :style="btn('primary')" @click="app.acknowledgeReminder(u.reminder.id)">
              Acknowledge
            </button>
            <button :style="btn('ghost')" @click="app.skipReminder(u.reminder.id)">Skip</button>
          </div>
          <div :style="actionRow">
            <button :style="btn('ghost')" @click="app.snoozeReminder(u.reminder.id, 10)">
              10m
            </button>
            <button :style="btn('ghost')" @click="app.snoozeReminder(u.reminder.id, 60)">1h</button>
            <button
              :style="btn('ghost')"
              @click="app.snoozeReminder(u.reminder.id, minsUntilTomorrow9())"
            >
              Tomorrow
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
