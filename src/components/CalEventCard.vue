<script setup lang="ts">
// The hover card (desktop) / long-press sheet (mobile) behind a calendar event
// (section 15, EVENT CONTENT). One component for both: the same content, laid
// out either as a floating card near the pointer or as a bottom sheet.
//
// It shows what a block cannot: the full description, project, goal chip,
// status, and the linked GitHub issue — plus the actions worth having without
// leaving the calendar.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import IssueChip from '@/components/IssueChip.vue'
import { durationLabel, type CalEvent } from '@/utils/calendarEvents'
import { STATUS_LABEL } from '@/types'

const props = defineProps<{
  event: CalEvent
  // Pointer position for the desktop card; ignored in sheet mode.
  x: number
  y: number
  sheet: boolean
}>()
const emit = defineEmits<{ close: []; open: [CalEvent]; complete: [CalEvent] }>()

const app = useAppStore()
const { c, s } = useStyles()
const { tasks, todos, goals, reminders } = storeToRefs(app)

// The underlying record, resolved per source so the card can show fields the
// event itself does not carry.
const detail = computed(() => {
  const { source, refId } = props.event
  if (source === 'task') {
    const task = tasks.value.find((t) => t.id === refId)
    return task
      ? {
          description: task.notes,
          project: task.tag,
          status: STATUS_LABEL[task.status],
          goalIds: task.goalIds ?? [],
          github: task.github ?? null,
          completable: true,
        }
      : null
  }
  if (source === 'todo') {
    const todo = todos.value.find((t) => t.id === refId)
    return todo
      ? {
          description: todo.description,
          project: todo.tag,
          status: STATUS_LABEL[todo.status],
          goalIds: todo.goalIds ?? [],
          github: null,
          completable: true,
        }
      : null
  }
  if (source === 'reminder') {
    const reminder = reminders.value.find((r) => r.id === refId)
    return reminder
      ? {
          description: reminder.note,
          project: '',
          status: reminder.acknowledgedAt ? 'Acknowledged' : reminder.priority + ' priority',
          goalIds: [],
          github: null,
          completable: false,
        }
      : null
  }
  const goal = goals.value.find((g) => g.id === refId)
  return goal
    ? {
        description: goal.description,
        project: '',
        status: goal.status,
        goalIds: [],
        github: null,
        completable: false,
      }
    : null
})

const goalNames = computed(() =>
  (detail.value?.goalIds ?? [])
    .map((id) => goals.value.find((g) => g.id === id)?.title)
    .filter((t): t is string => !!t),
)

const timeLabel = computed(() => {
  const event = props.event
  if (event.allDay) return 'All day'
  const start = new Date(event.start)
  const fmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${fmt(start)} · ${durationLabel(event.durationMins)}`
})

const card = computed(() =>
  pxify(
    props.sheet
      ? {
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 18,
          background: c.value.glass,
          backdropFilter: 'blur(30px) saturate(1.6)',
          borderTop: '1px solid ' + c.value.border,
          borderRadius: '18px 18px 0 0',
          padding: 18,
          boxShadow: c.value.shadow,
          color: c.value.text,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          animation: 'slideInR .2s ease both',
        }
      : {
          position: 'fixed',
          left: Math.min(
            props.x + 12,
            (typeof window !== 'undefined' ? window.innerWidth : 900) - 300,
          ),
          top: Math.min(
            props.y + 12,
            (typeof window !== 'undefined' ? window.innerHeight : 700) - 220,
          ),
          zIndex: 18,
          width: 280,
          background: c.value.glass,
          backdropFilter: 'blur(30px) saturate(1.6)',
          border: '1px solid ' + c.value.border,
          borderRadius: 14,
          padding: 12,
          boxShadow: c.value.shadow,
          color: c.value.text,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          pointerEvents: 'auto',
        },
  ),
)
const titleStyle = computed(() =>
  pxify({
    fontSize: 13,
    fontWeight: 700,
    color: c.value.text,
    borderLeft: '3px solid ' + props.event.barColor,
    paddingLeft: 8,
  }),
)
const metaStyle = computed(() => pxify({ fontSize: 11, color: c.value.dim }))
const descStyle = computed(() =>
  pxify({ fontSize: 12, color: c.value.dim, maxHeight: 90, overflowY: 'auto' }),
)
const chip = computed(() =>
  pxify({
    fontSize: 9,
    fontWeight: 600,
    padding: '2px 7px',
    borderRadius: 6,
    border: '1px solid ' + c.value.border,
    color: c.value.dim,
    whiteSpace: 'nowrap',
  }),
)
</script>

<template>
  <div v-if="sheet" :style="s.dialogOverlay" @click="emit('close')"></div>
  <div :style="card" @mouseleave="!sheet && emit('close')">
    <span :style="titleStyle">{{ event.title }}</span>
    <span :style="metaStyle">{{ timeLabel }}</span>
    <div v-if="detail?.description" :style="descStyle">{{ detail.description }}</div>
    <div :style="s.chipRow">
      <span v-if="detail?.project" :style="chip">{{ detail.project }}</span>
      <span v-for="name in goalNames" :key="name" :style="chip">◎ {{ name }}</span>
      <span v-if="detail?.status" :style="chip">{{ detail.status }}</span>
      <IssueChip v-if="detail?.github" :link="detail.github" compact />
    </div>
    <div :style="s.dialogActions">
      <button :style="s.saveBtn" @click="emit('open', event)">Open</button>
      <button v-if="detail?.completable" :style="s.editBtn" @click="emit('complete', event)">
        {{ event.completed ? 'Reopen' : 'Complete' }}
      </button>
      <button :style="s.cancelBtn" @click="emit('close')">Close</button>
    </div>
  </div>
</template>
