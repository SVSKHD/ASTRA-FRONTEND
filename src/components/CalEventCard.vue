<script setup lang="ts">
// The hover card (desktop) / long-press sheet (mobile) behind a calendar event
// (section 15, EVENT CONTENT). One component for both: the same content, laid
// out either as a floating card beside the event or as a bottom sheet.
//
// It shows what a chip cannot: whose it is and when, the full description,
// project, goals, status and the linked GitHub issue — plus the actions worth
// having without leaving the calendar.
//
// The card is anchored by the caller (beside the chip, on the side with room)
// and only clamped here to stay on screen. It tells the caller when the
// pointer is on it (`hold`) and when it has left (`release`), so a pointer
// travelling from the chip to the card does not close it on the way.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import IssueChip from '@/components/IssueChip.vue'
import Icon from '@/components/ui/Icon.vue'
import { SOURCE_ICON, SOURCE_LABEL, durationLabel, type CalEvent } from '@/utils/calendarEvents'
import { richPlain } from '@/utils/richText'
import { STATUS_LABEL } from '@/types'

const props = defineProps<{
  event: CalEvent
  // Where the card's top-left goes, in viewport pixels; ignored as a sheet.
  x: number
  y: number
  sheet: boolean
}>()
const emit = defineEmits<{
  close: []
  open: [CalEvent]
  complete: [CalEvent]
  hold: []
  release: []
}>()

const app = useAppStore()
const { tasks, todos, goals, reminders } = storeToRefs(app)

// The underlying record, resolved per source so the card can show fields the
// event itself does not carry.
const detail = computed(() => {
  const { source, refId } = props.event
  if (source === 'task') {
    const task = tasks.value.find((t) => t.id === refId)
    return task
      ? {
          description: richPlain(task.notes),
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
          description: richPlain(todo.description),
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

// "Today", "Tomorrow" or "Thu, Oct 15" — then the time and how long.
const when = computed(() => {
  const start = new Date(props.event.start)
  const today = new Date()
  const dayDiff = Math.round(
    (new Date(start).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / 86_400_000,
  )
  const day =
    dayDiff === 0
      ? 'Today'
      : dayDiff === 1
        ? 'Tomorrow'
        : dayDiff === -1
          ? 'Yesterday'
          : start.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })
  if (props.event.allDay) return { day, time: 'All day' }
  const time = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return { day, time: `${time} · ${durationLabel(props.event.durationMins)}` }
})

const place = computed(() => {
  if (props.sheet) return undefined
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200
  const h = typeof window !== 'undefined' ? window.innerHeight : 800
  return {
    left: Math.max(8, Math.min(props.x, w - 308)) + 'px',
    top: Math.max(8, Math.min(props.y, h - 300)) + 'px',
  }
})
</script>

<template>
  <div v-if="sheet" class="cec-scrim" @click="emit('close')" />
  <div
    class="cec"
    :class="{ 'cec--sheet': sheet, 'is-done': event.completed }"
    :style="[{ '--bar': event.barColor }, place]"
    role="dialog"
    :aria-label="event.title"
    @mouseenter="!sheet && emit('hold')"
    @mouseleave="!sheet && emit('release')"
  >
    <header class="cec__head">
      <span class="cec__tile" aria-hidden="true">
        <Icon :name="event.completed ? 'check' : SOURCE_ICON[event.source]" size="sm" />
      </span>
      <div class="cec__head-text">
        <span class="cec__kind">
          {{ SOURCE_LABEL[event.source] }}
          <span v-if="event.completed" class="cec__done">Done</span>
        </span>
        <h3 class="cec__title">{{ event.title }}</h3>
      </div>
      <button type="button" class="cec__x" aria-label="Close" @click="emit('close')">
        <Icon name="x" size="xs" />
      </button>
    </header>

    <div class="cec__when">
      <Icon name="clock" size="xs" />
      <span class="cec__day">{{ when.day }}</span>
      <span class="cec__dot" aria-hidden="true">·</span>
      <span>{{ when.time }}</span>
    </div>

    <p v-if="detail?.description" class="cec__desc">{{ detail.description }}</p>

    <div
      v-if="detail?.project || goalNames.length || detail?.status || detail?.github"
      class="cec__chips"
    >
      <span v-if="detail?.project" class="cec__chip"
        ><Icon name="tag" size="xs" />{{ detail.project }}</span
      >
      <span v-for="name in goalNames" :key="name" class="cec__chip"
        ><Icon name="flag" size="xs" />{{ name }}</span
      >
      <span v-if="detail?.status" class="cec__chip cec__chip--status">{{ detail.status }}</span>
      <IssueChip v-if="detail?.github" :link="detail.github" compact />
    </div>

    <footer class="cec__actions">
      <button type="button" class="cec__btn cec__btn--primary" @click="emit('open', event)">
        <Icon name="external-link" size="xs" /> Open
      </button>
      <button
        v-if="detail?.completable"
        type="button"
        class="cec__btn"
        @click="emit('complete', event)"
      >
        <Icon :name="event.completed ? 'rotate-ccw' : 'check'" size="xs" />
        {{ event.completed ? 'Reopen' : 'Complete' }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.cec-scrim {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: color-mix(in oklch, var(--glass-solid, #000) 50%, transparent);
  backdrop-filter: blur(4px);
}
.cec {
  position: fixed;
  z-index: 61;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 300px;
  padding: 14px;
  overflow: hidden;
  border: 1px solid color-mix(in oklch, var(--theme-text) 12%, transparent);
  border-radius: 18px;
  background: var(--glass-solid, var(--theme-surface));
  color: var(--theme-text);
  box-shadow:
    0 2px 6px color-mix(in srgb, var(--shadow-ink, #000) 14%, transparent),
    0 24px 48px -18px color-mix(in srgb, var(--shadow-ink, #000) 55%, transparent);
  animation: cec-in 0.16s var(--ease-out, ease) both;
}
/* The source colour runs along the top edge: whose it is, before a word. */
.cec::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: var(--bar);
}
.cec--sheet {
  inset: auto 0 0;
  width: auto;
  padding: 20px 18px calc(18px + env(safe-area-inset-bottom));
  border-radius: 22px 22px 0 0;
  animation-name: cec-up;
}
@keyframes cec-in {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.98);
  }
}
@keyframes cec-up {
  from {
    transform: translateY(100%);
  }
}
.cec__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.cec__tile {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: color-mix(in oklch, var(--bar) 22%, transparent);
  color: var(--bar);
}
.cec__head-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.cec__kind {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.cec__done {
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-success) 18%, transparent);
  color: var(--theme-success);
  letter-spacing: 0.04em;
}
.cec__title {
  margin: 0;
  min-width: 0;
  color: var(--theme-text);
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  line-height: var(--lh-base);
  overflow-wrap: anywhere;
}
.cec.is-done .cec__title {
  text-decoration: line-through;
  text-decoration-color: color-mix(in oklch, var(--theme-text) 40%, transparent);
}
.cec__x {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
}
.cec__x:hover {
  background: color-mix(in oklch, var(--theme-text) 8%, transparent);
  color: var(--theme-text);
}
.cec__when {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in oklch, var(--theme-text) 5%, transparent);
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.cec__day {
  color: var(--theme-text);
  font-weight: var(--weight-semibold);
}
.cec__desc {
  min-width: 0;
  max-height: 110px;
  margin: 0;
  overflow-y: auto;
  color: color-mix(in oklch, var(--theme-text) 80%, var(--theme-dim));
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  overflow-wrap: anywhere;
}
.cec__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cec__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-text) 7%, transparent);
  color: var(--theme-text);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
}
.cec__chip--status {
  background: color-mix(in oklch, var(--bar) 18%, transparent);
  text-transform: capitalize;
}
.cec__actions {
  display: flex;
  gap: 8px;
  padding-top: 2px;
}
.cec__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: color-mix(in oklch, var(--theme-text) 7%, transparent);
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  transition:
    background var(--dur-fast) ease,
    filter var(--dur-fast) ease;
}
.cec__btn:hover {
  background: color-mix(in oklch, var(--theme-text) 11%, transparent);
}
.cec__btn--primary {
  background: var(--theme-accent);
  color: var(--theme-on-accent);
}
.cec__btn--primary:hover {
  background: var(--theme-accent);
  filter: brightness(1.06);
}
.cec__btn:focus-visible,
.cec__x:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .cec {
    animation: none;
  }
}
</style>
