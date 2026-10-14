<script setup lang="ts">
// The selected event, pinned at the top of the calendar's side column. A click
// on the grid selects rather than opens: what it is and when, and the two
// things worth doing from here — mark it done, or open it in its own editor.
import { computed } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import {
  SOURCE_COLOR,
  SOURCE_ICON,
  SOURCE_LABEL,
  durationLabel,
  type CalEvent,
} from '@/utils/calendarEvents'

const props = defineProps<{ event: CalEvent }>()
const emit = defineEmits<{ close: []; open: [CalEvent]; complete: [CalEvent] }>()

const completable = computed(() => props.event.source === 'task' || props.event.source === 'todo')

function hm(ms: number): string {
  const d = new Date(ms)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

// "Thursday 8 Oct · 11:00–12:30"
const when = computed(() => {
  const start = new Date(props.event.start)
  const day =
    start.toLocaleDateString(undefined, { weekday: 'long' }) +
    ' ' +
    start.getDate() +
    ' ' +
    start.toLocaleDateString(undefined, { month: 'short' })
  if (props.event.allDay) return `${day} · All day`
  if (props.event.source === 'reminder') return `${day} · ${hm(props.event.start)}`
  return `${day} · ${hm(props.event.start)}–${hm(props.event.end)}`
})
const showDuration = computed(() => !props.event.allDay && props.event.source !== 'reminder')
</script>

<template>
  <section
    class="ces"
    :class="{ 'is-done': event.completed }"
    :style="{ '--src': SOURCE_COLOR[event.source] }"
    aria-label="Selected event"
  >
    <header class="ces__top">
      <span class="ces__kind">
        <Icon :name="SOURCE_ICON[event.source]" size="xs" />
        {{ SOURCE_LABEL[event.source] }}
      </span>
      <button type="button" class="ces__x" aria-label="Clear selection" @click="emit('close')">
        <Icon name="x" size="xs" />
      </button>
    </header>
    <h3 class="ces__title">{{ event.title }}</h3>
    <p class="ces__line"><Icon name="calendar" size="xs" />{{ when }}</p>
    <p v-if="showDuration" class="ces__line">
      <Icon name="timer" size="xs" />{{ durationLabel(event.durationMins) }}
    </p>
    <footer class="ces__actions">
      <button
        v-if="completable"
        type="button"
        class="ces__btn ces__btn--primary"
        @click="emit('complete', event)"
      >
        {{ event.completed ? 'Reopen' : 'Mark done' }}
      </button>
      <button type="button" class="ces__btn" @click="emit('open', event)">Open</button>
    </footer>
  </section>
</template>

<style scoped>
.ces {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 16px;
  border-radius: 20px;
  background: var(--theme-card);
  color: var(--theme-text);
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--shadow-ink, #000) 6%, transparent),
    0 12px 28px -18px color-mix(in srgb, var(--shadow-ink, #000) 35%, transparent);
}
.ces__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ces__kind {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--src) 18%, transparent);
  color: var(--theme-text);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
}
.ces__kind :deep(svg) {
  color: var(--src);
}
.ces__x {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
}
.ces__x:hover {
  background: color-mix(in oklch, var(--theme-text) 7%, transparent);
  color: var(--theme-text);
}
.ces__title {
  margin: 6px 0 4px;
  min-width: 0;
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  line-height: 1.25;
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}
.ces.is-done .ces__title {
  text-decoration: line-through;
  text-decoration-color: color-mix(in oklch, var(--theme-text) 45%, transparent);
}
.ces__line {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.ces__actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.ces__btn {
  flex: 1;
  height: 42px;
  border: 0;
  border-radius: 14px;
  /* The secondary action is neutral, so the accent stays on Mark done. */
  background: color-mix(in oklch, var(--theme-text) 6%, transparent);
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  transition: filter var(--dur-fast) ease;
}
.ces__btn:hover {
  filter: brightness(0.97);
}
.ces__btn--primary {
  background: var(--theme-accent);
  color: var(--theme-on-accent);
}
.ces__btn--primary:hover {
  filter: brightness(1.06);
}
.ces__btn:focus-visible,
.ces__x:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
</style>
