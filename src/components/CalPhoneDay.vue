<script setup lang="ts">
// The calendar on a phone: one day at a time, under a strip of its week.
//
// A seven-column time grid does not fit 390px, and the old Day view spent
// most of the width on an hour gutter and empty slots. This is the day as a
// list instead — all-day items as pills, then each timed item as a card
// beside its start time — with the week above it to move around in. Swipe the
// strip for the next or previous week.
import { computed, ref, watch } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import {
  SOURCE_COLOR,
  SOURCE_ICON,
  SOURCE_LABEL,
  durationLabel,
  type CalEvent,
} from '@/utils/calendarEvents'

const props = defineProps<{ events: CalEvent[]; selectedId: string | null }>()
const emit = defineEmits<{
  // The week on screen, so the parent builds events for it.
  range: [start: number, end: number]
  select: [CalEvent]
  create: [{ start: number; end: number; anchor: DOMRect }]
}>()

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
// By calendar day rather than by 24h, so a DST change does not shift the strip.
function addDays(ms: number, n: number): number {
  const d = new Date(ms)
  d.setDate(d.getDate() + n)
  return d.getTime()
}
function mondayOf(ms: number): number {
  const d = new Date(startOfDay(ms))
  return addDays(d.getTime(), -((d.getDay() + 6) % 7))
}
function hm(ms: number): string {
  const d = new Date(ms)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

const today = ref(startOfDay(Date.now()))
const day = ref(today.value)
const weekStart = computed(() => mondayOf(day.value))
const week = computed(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart.value, i)))
watch(weekStart, (s) => emit('range', s, addDays(s, 7)), { immediate: true })

function eventsOn(d0: number): CalEvent[] {
  const d1 = addDays(d0, 1)
  return props.events.filter((e) => e.end > d0 && e.start < d1)
}
const busy = computed(() => new Set(week.value.filter((d) => eventsOn(d).length > 0)))
const items = computed(() => eventsOn(day.value))
const allDay = computed(() => items.value.filter((e) => e.allDay))
const timed = computed(() => items.value.filter((e) => !e.allDay).sort((a, b) => a.start - b.start))

const monthLabel = computed(() =>
  new Date(day.value).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
)
const dayLabel = computed(() => {
  const d = new Date(day.value)
  return (
    d.toLocaleDateString(undefined, { weekday: 'long' }) +
    ', ' +
    d.getDate() +
    ' ' +
    d.toLocaleDateString(undefined, { month: 'short' })
  )
})
const letter = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: 'narrow' })
const longDay = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

function cardSub(e: CalEvent): string {
  if (e.source === 'reminder') return `${SOURCE_LABEL.reminder} · ${hm(e.start)}`
  return `${SOURCE_LABEL[e.source]} · ${hm(e.start)}–${hm(e.end)}`
}
function timeSub(e: CalEvent): string {
  return e.source === 'reminder' ? 'remind' : durationLabel(e.durationMins)
}

// Swipe the strip sideways to change week; the weekday is kept.
let touchX: number | null = null
function onTouchStart(ev: TouchEvent) {
  touchX = ev.touches[0]?.clientX ?? null
}
function onTouchEnd(ev: TouchEvent) {
  const end = ev.changedTouches[0]?.clientX
  if (touchX === null || end === undefined) return
  const dx = end - touchX
  touchX = null
  if (Math.abs(dx) > 48) day.value = addDays(day.value, dx < 0 ? 7 : -7)
}

// New item on the day on screen: the next whole hour if it is today, else 9:00.
function create(ev: MouseEvent) {
  const start = new Date(day.value)
  if (day.value === today.value) start.setHours(new Date().getHours() + 1, 0, 0, 0)
  else start.setHours(9, 0, 0, 0)
  const anchor = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  emit('create', { start: start.getTime(), end: start.getTime() + 60 * 60_000, anchor })
}

function goToday() {
  today.value = startOfDay(Date.now())
  day.value = today.value
}
defineExpose({ today: goToday })
</script>

<template>
  <div class="cpd">
    <header class="cpd__head">
      <div class="cpd__titles">
        <span class="cpd__eyebrow">{{ monthLabel }}</span>
        <h2 class="cpd__title">Calendar</h2>
      </div>
      <button type="button" class="cpd__add" aria-label="New on this day" @click="create">
        <Icon name="plus" size="md" />
      </button>
    </header>

    <div
      class="cpd__strip"
      role="tablist"
      aria-label="Days of the week"
      @touchstart.passive="onTouchStart"
      @touchend="onTouchEnd"
    >
      <button
        v-for="d in week"
        :key="d"
        type="button"
        role="tab"
        class="cpd__day"
        :class="{ 'is-on': d === day, 'is-today': d === today }"
        :aria-selected="d === day"
        :aria-label="longDay(d)"
        @click="day = d"
      >
        <span class="cpd__day-l">{{ letter(d) }}</span>
        <span class="cpd__day-n">{{ new Date(d).getDate() }}</span>
        <span class="cpd__dot" :class="{ 'is-busy': busy.has(d) }" aria-hidden="true" />
      </button>
    </div>

    <div class="cpd__dayhead">
      <h3 class="cpd__dayname">{{ dayLabel }}</h3>
      <button v-if="day !== today" type="button" class="cpd__today" @click="goToday">Today</button>
      <span class="cpd__count">{{ items.length }} item{{ items.length === 1 ? '' : 's' }}</span>
    </div>

    <div v-if="allDay.length" class="cpd__allday">
      <button
        v-for="e in allDay"
        :key="e.id"
        type="button"
        class="cpd__pill"
        :class="{ 'is-done': e.completed, 'is-on': e.id === selectedId }"
        :style="{ '--src': SOURCE_COLOR[e.source] }"
        @click="emit('select', e)"
      >
        <Icon :name="e.completed ? 'check' : SOURCE_ICON[e.source]" size="xs" />
        <span class="cpd__pill-t">{{ e.title }}</span>
      </button>
    </div>

    <ol v-if="timed.length" class="cpd__list">
      <li v-for="e in timed" :key="e.id" class="cpd__row">
        <span class="cpd__time">
          <span class="cpd__time-h">{{ hm(e.start) }}</span>
          <span class="cpd__time-d" :class="{ 'is-on': e.id === selectedId }">{{
            timeSub(e)
          }}</span>
        </span>
        <button
          type="button"
          class="cpd__card"
          :class="{ 'is-done': e.completed, 'is-on': e.id === selectedId }"
          :style="{ '--src': SOURCE_COLOR[e.source] }"
          @click="emit('select', e)"
        >
          <span class="cpd__tile" aria-hidden="true">
            <Icon :name="e.completed ? 'check' : SOURCE_ICON[e.source]" size="sm" />
          </span>
          <span class="cpd__card-text">
            <span class="cpd__card-title">{{ e.title }}</span>
            <span class="cpd__card-sub">{{ cardSub(e) }}</span>
          </span>
        </button>
      </li>
    </ol>

    <div v-if="!items.length" class="cpd__empty">
      <p class="cpd__empty-title">Nothing on this day</p>
      <p class="cpd__empty-text">Tap + to plan something, or pick another day.</p>
    </div>
  </div>
</template>

<style scoped>
.cpd {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding-bottom: 24px;
}
.cpd__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.cpd__titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.cpd__eyebrow {
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}
.cpd__title {
  margin: 0;
  color: var(--theme-text);
  font-size: var(--text-2xl, 28px);
  font-weight: var(--weight-semibold);
  line-height: 1.1;
  letter-spacing: -0.01em;
}
.cpd__add {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border: 0;
  border-radius: 50%;
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  box-shadow: 0 10px 22px -10px var(--theme-accent);
  cursor: pointer;
}

/* ---- the week strip ---- */
.cpd__strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
  padding: 8px;
  border-radius: 20px;
  background: var(--theme-card);
  box-shadow: 0 10px 24px -18px color-mix(in srgb, var(--shadow-ink, #000) 40%, transparent);
  touch-action: pan-y;
}
.cpd__day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 0;
  padding: 8px 0 7px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--theme-text);
  font: inherit;
  cursor: pointer;
  transition: background var(--dur-fast) ease;
}
.cpd__day-l {
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
}
.cpd__day-n {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.cpd__day.is-today:not(.is-on) .cpd__day-n {
  color: var(--theme-accent);
}
.cpd__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: transparent;
}
.cpd__dot.is-busy {
  background: var(--theme-accent);
}
.cpd__day.is-on {
  background: var(--theme-accent);
  box-shadow: 0 8px 16px -10px var(--theme-accent);
}
.cpd__day.is-on .cpd__day-l,
.cpd__day.is-on .cpd__day-n {
  color: var(--theme-on-accent);
}
.cpd__day.is-on .cpd__dot.is-busy {
  background: var(--theme-on-accent);
}
.cpd__day:focus-visible,
.cpd__card:focus-visible,
.cpd__pill:focus-visible,
.cpd__add:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}

/* ---- the day ---- */
.cpd__dayhead {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 2px;
}
.cpd__dayname {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--theme-text);
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
}
.cpd__today {
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-accent) 14%, transparent);
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
.cpd__count {
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.cpd__allday {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cpd__pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  height: 30px;
  padding: 0 12px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: color-mix(in oklch, var(--src) 20%, var(--theme-card));
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
.cpd__pill :deep(svg) {
  flex-shrink: 0;
  color: color-mix(in oklch, var(--src) 70%, var(--theme-text));
}
.cpd__pill-t {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.cpd__pill.is-on {
  border-color: var(--theme-text);
}
.cpd__pill.is-done .cpd__pill-t,
.cpd__card.is-done .cpd__card-title {
  text-decoration: line-through;
  text-decoration-color: color-mix(in oklch, var(--theme-text) 45%, transparent);
}
.cpd__pill.is-done,
.cpd__card.is-done {
  opacity: 0.72;
}

.cpd__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.cpd__row {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.cpd__time {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  font-variant-numeric: tabular-nums;
}
.cpd__time-h {
  color: var(--theme-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}
.cpd__time-d {
  color: var(--theme-dim);
  font-size: var(--text-2xs);
}
.cpd__time-d.is-on {
  color: var(--theme-accent);
  font-weight: var(--weight-semibold);
}
.cpd__card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 2px solid transparent;
  border-radius: 18px;
  background: var(--theme-card);
  color: var(--theme-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 8px 20px -16px color-mix(in srgb, var(--shadow-ink, #000) 45%, transparent);
}
.cpd__card.is-on {
  border-color: var(--theme-text);
}
.cpd__tile {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: color-mix(in oklch, var(--src) 22%, transparent);
  color: color-mix(in oklch, var(--src) 75%, var(--theme-text));
}
.cpd__card-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.cpd__card-title {
  min-width: 0;
  overflow: hidden;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.cpd__card-sub {
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.cpd__empty {
  padding: 28px 12px;
  border-radius: 18px;
  background: color-mix(in oklch, var(--theme-text) 4%, transparent);
  text-align: center;
}
.cpd__empty-title {
  margin: 0 0 4px;
  color: var(--theme-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}
.cpd__empty-text {
  margin: 0;
  color: var(--theme-dim);
  font-size: var(--text-xs);
}
@media (prefers-reduced-motion: reduce) {
  .cpd__day {
    transition: none;
  }
}
</style>
