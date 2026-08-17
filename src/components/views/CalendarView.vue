<script setup lang="ts">
// The Calendar tab (section 15). Month / Week / Day / Agenda over one unified
// event list, built on FullCalendar so drag, resize, overlap layout and
// timezone handling are not hand-rolled.
//
// FullCalendar ships its own CSS variables; they are remapped to the section-7
// theme tokens in the scoped block below, so the grid reads on every theme
// rather than looking like a bolted-on widget.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import { storeToRefs } from 'pinia'
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin, { Draggable } from '@fullcalendar/interaction'
import type { CalendarOptions, DatesSetArg, EventDropArg } from '@fullcalendar/core'
import type { DateSelectArg } from '@fullcalendar/core'
import type { DropArg, EventResizeDoneArg } from '@fullcalendar/interaction'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { useCalendar } from '@/composables/useCalendar'
import CalEventCard from '@/components/CalEventCard.vue'
import CalQuickCreate from '@/components/CalQuickCreate.vue'
import {
  CALENDAR_VIEWS,
  durationLabel,
  type CalEvent,
  type CalendarViewKey,
} from '@/utils/calendarEvents'
import {
  dropPatch,
  isCopyDrag,
  moveAllDaySpan,
  resizePatch,
  schedulePatch,
  snapMinutesFor,
} from '@/utils/calendarDrag'

const app = useAppStore()
const ui = useUiStore()
const { c, s, dark, isMobile, panelStyle } = useStyles()
const { calendarView, tags, tasks, todos } = storeToRefs(app)

const calendar = useCalendar(
  () => dark.value,
  () => c.value.mono === true,
)
const { events, filters } = calendar

const calendarRef = shallowRef<InstanceType<typeof FullCalendar> | null>(null)
const jumpDate = ref('')
// The title FullCalendar computes for the current window ("June 2024"), mirrored
// here so the header can be ours rather than FullCalendar's toolbar.
const periodTitle = ref('')

// Mobile opens on Day; Agenda is one tap away. The remembered view still wins
// once the user has picked one — this is only the starting point.
const initialView = computed<CalendarViewKey>(() =>
  isMobile.value && calendarView.value === 'dayGridMonth' ? 'timeGridDay' : calendarView.value,
)

defineExpose({ focus: () => api()?.today() })

function api() {
  return calendarRef.value?.getApi()
}

function switchView(view: CalendarViewKey) {
  app.setCalendarView(view)
  api()?.changeView(view)
}
function onDatesSet(arg: DatesSetArg) {
  periodTitle.value = arg.view.title
  // Range-scoped: only the visible window (plus a week of padding) is built.
  calendar.setRange(arg.start.getTime(), arg.end.getTime())
}
function onJump() {
  if (jumpDate.value) api()?.gotoDate(jumpDate.value)
}

// --- drag to reschedule, resize to retime -----------------------------------
// The grid has already moved the block by the time these fire, so the write is
// optimistic; a failure rolls the store back and FullCalendar's own revert is
// called so the two never disagree. The dragged item is held in the sync guard
// for the duration, which is what stops a snapshot snapping it back (69).
const dragging = ref(false)
// Live duration while resizing ("1h 30m").
const resizeHint = ref('')

function scheduledOf(source: string, refId: number) {
  if (source === 'task') return tasks.value.find((t) => t.id === refId)
  if (source === 'todo') return todos.value.find((t) => t.id === refId)
  return undefined
}

async function onEventDrop(arg: EventDropArg) {
  const event = eventById(arg.event.id)
  const start = arg.event.start?.getTime()
  if (!event || start === undefined) return arg.revert()
  hovered.value = null

  if (event.source === 'reminder') {
    if (!(await app.rescheduleReminder(event.refId, start))) arg.revert()
    return
  }
  const type = event.source === 'todo' ? 'todo' : 'task'
  const item = scheduledOf(event.source, event.refId)
  if (!item) return arg.revert()

  const allDay = arg.event.allDay
  const patch =
    allDay && item.allDay
      ? // A multi-day span moved in month view keeps its length in days.
        moveAllDaySpan(item, start)
      : dropPatch(item, start, { allDay, snapMinutes: snapMinutesFor(arg.jsEvent) })

  // Alt/Option-drag duplicates at the new time instead of moving.
  if (isCopyDrag(arg.jsEvent)) {
    arg.revert()
    app.duplicateScheduled(type, event.refId, patch)
    return
  }
  app.beginCalendarDrag(type, event.refId)
  const ok = await app.rescheduleItem(type, event.refId, patch)
  app.endCalendarDrag(type, event.refId)
  if (!ok) arg.revert()
}

async function onEventResize(arg: EventResizeDoneArg) {
  resizeHint.value = ''
  const event = eventById(arg.event.id)
  const start = arg.event.start?.getTime()
  const end = arg.event.end?.getTime()
  if (!event || start === undefined || end === undefined) return arg.revert()
  const type = event.source === 'todo' ? 'todo' : 'task'
  const item = scheduledOf(event.source, event.refId)
  if (!item) return arg.revert()
  // Which edge actually moved decides the rule: bottom changes only the end,
  // top only the start.
  const patch = resizePatch(item, { start, end })
  if (!patch) return arg.revert()
  app.beginCalendarDrag(type, event.refId)
  const ok = await app.rescheduleItem(type, event.refId, patch)
  app.endCalendarDrag(type, event.refId)
  if (!ok) arg.revert()
}

// --- unscheduled panel -------------------------------------------------------
// Items with no date at all. Dragging one onto a slot schedules it (it then
// disappears from the panel because it is no longer unscheduled); dragging an
// event back over the panel unschedules it.
const panelOpen = ref(true)
const panelEl = ref<HTMLElement | null>(null)
let draggable: Draggable | null = null

onMounted(() => {
  if (panelEl.value) {
    draggable = new Draggable(panelEl.value, {
      itemSelector: '.unsched-item',
      // The drop handler reads the real item off the element's dataset; this is
      // only what the ghost shows while dragging.
      eventData: (el) => ({ title: el.getAttribute('data-title') || '', duration: '00:30' }),
    })
  }
})
onBeforeUnmount(() => draggable?.destroy())

async function onExternalDrop(arg: DropArg) {
  const el = arg.draggedEl
  const type = (el.getAttribute('data-type') as 'task' | 'todo') || 'task'
  const refId = Number(el.getAttribute('data-id'))
  if (!Number.isFinite(refId)) return
  await app.rescheduleItem(type, refId, schedulePatch(arg.date.getTime(), arg.allDay))
}

// Dropping an event over the panel takes it off the grid.
function pointerOverPanel(event: MouseEvent | TouchEvent | null): boolean {
  const el = panelEl.value
  if (!el || !event) return false
  const point = 'clientX' in event ? event : event.changedTouches?.[0]
  if (!point) return false
  const rect = el.getBoundingClientRect()
  return (
    point.clientX >= rect.left &&
    point.clientX <= rect.right &&
    point.clientY >= rect.top &&
    point.clientY <= rect.bottom
  )
}

// --- quick create ------------------------------------------------------------
const quick = ref<{ start: number; end: number; allDay: boolean; x: number; y: number } | null>(
  null,
)
function onSelect(arg: DateSelectArg) {
  quick.value = {
    start: arg.start.getTime(),
    end: arg.end.getTime(),
    allDay: arg.allDay,
    x: (arg.jsEvent as MouseEvent | null)?.clientX ?? 80,
    y: (arg.jsEvent as MouseEvent | null)?.clientY ?? 80,
  }
}
function onQuickCreate(payload: {
  kind: 'task' | 'todo' | 'reminder'
  title: string
  project: string
}) {
  const range = quick.value
  if (!range) return
  app.createScheduledItem(payload.kind, payload.title, payload.project, {
    startAt: range.start,
    endAt: range.end,
    allDay: range.allDay,
    durationMins: Math.max(1, Math.round((range.end - range.start) / 60_000)),
  })
  quick.value = null
  api()?.unselect()
}

// Double-click a day in month view creates an all-day task there.
let lastDayClick = { date: 0, at: 0 }
function onDateClick(arg: {
  date: Date
  allDay: boolean
  jsEvent: MouseEvent
  view: { type: string }
}) {
  const now = Date.now()
  const same = lastDayClick.date === arg.date.getTime() && now - lastDayClick.at < 400
  lastDayClick = { date: arg.date.getTime(), at: now }
  if (!same || arg.view.type !== 'dayGridMonth') return
  quick.value = {
    start: arg.date.getTime(),
    end: arg.date.getTime() + 24 * 60 * 60_000,
    allDay: true,
    x: arg.jsEvent.clientX,
    y: arg.jsEvent.clientY,
  }
}

// --- hover card (desktop) / long-press sheet (mobile) ------------------------
const hovered = ref<{ event: CalEvent; x: number; y: number; sheet: boolean } | null>(null)
let pressTimer: ReturnType<typeof setTimeout> | undefined

function eventById(id: string): CalEvent | undefined {
  return events.value.find((e) => e.id === id)
}
function showCard(id: string, x: number, y: number, sheet: boolean) {
  const event = eventById(id)
  if (event) hovered.value = { event, x, y, sheet }
}
function onEventMouseEnter(arg: { event: { id: string }; jsEvent: MouseEvent }) {
  if (isMobile.value) return
  showCard(arg.event.id, arg.jsEvent.clientX, arg.jsEvent.clientY, false)
}
function onEventMouseLeave() {
  if (!isMobile.value) hovered.value = null
}
// Touch: a long press opens the sheet; a short tap opens the item, and a scroll
// cancels the press so the sheet never fights the gesture.
function onEventTouchStart(id: string) {
  clearTimeout(pressTimer)
  pressTimer = setTimeout(() => showCard(id, 0, 0, true), 450)
}
function cancelPress() {
  clearTimeout(pressTimer)
}

// Open the underlying item in its own editor.
function openEvent(event: CalEvent) {
  hovered.value = null
  if (event.source === 'task') app.openEdit('task', event.refId)
  else if (event.source === 'todo') app.openEdit('todo', event.refId)
  else if (event.source === 'reminder') app.openReminderDialog(event.refId)
  else ui.setTab('goals')
}
function completeEvent(event: CalEvent) {
  if (event.source === 'task') app.toggleTask(event.refId)
  else if (event.source === 'todo') app.toggleTodo(event.refId)
  hovered.value = null
}
function onEventClick(arg: { event: { id: string }; jsEvent: MouseEvent }) {
  cancelPress()
  const event = eventById(arg.event.id)
  if (event) openEvent(event)
}

// While a drag or resize is in flight the event list is frozen: a snapshot
// landing mid-gesture must not re-layout the grid under the pointer.
let frozenEvents: ReturnType<typeof toFcEvents> = []
function toFcEvents(list: CalEvent[]) {
  return list.map((event) => ({
    id: event.id,
    title: event.title,
    start: new Date(event.start),
    end: new Date(event.end),
    allDay: event.allDay,
    editable: event.editable,
    durationEditable: event.editable && !event.allDay,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    extendedProps: {
      subtitle: event.subtitle,
      barColor: event.barColor,
      completed: event.completed,
      source: event.source,
      refId: event.refId,
      durationMins: event.durationMins,
    },
  }))
}
const fcEvents = computed(() => {
  if (dragging.value) return frozenEvents
  frozenEvents = toFcEvents(events.value)
  return frozenEvents
})

const options = computed<CalendarOptions>(() => ({
  plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
  initialView: initialView.value,
  // Our own header sits above; FullCalendar's toolbar would duplicate it.
  headerToolbar: false as const,
  height: '100%',
  expandRows: true,
  nowIndicator: true,
  firstDay: 1,
  // 15-minute snapping, matching the drag language of section 2b.
  snapDuration: '00:15:00',
  slotDuration: '00:30:00',
  slotLabelFormat: { hour: 'numeric', minute: '2-digit', omitZeroMinute: true } as const,
  eventTimeFormat: { hour: 'numeric', minute: '2-digit', omitZeroMinute: true } as const,
  // A day cell renders a handful and then "+N more" rather than growing without
  // bound: a day with forty items stays a normal-sized cell, and the rest are
  // one click away in a popover (acceptance 72).
  dayMaxEvents: isMobile.value ? 2 : 3,
  moreLinkClick: 'popover' as const,
  moreLinkContent: (arg: { num: number }) => `+${arg.num} more`,
  // Only what the popover actually opens gets rendered, so the cap is a real
  // rendering saving rather than a visual crop.
  eventMaxStack: isMobile.value ? 2 : 4,
  listDayFormat: { weekday: 'long', month: 'short', day: 'numeric' } as const,
  noEventsText: 'Nothing scheduled',
  // Agenda covers the next 30 days rather than the calendar month.
  views: { listMonth: { duration: { days: 30 }, buttonText: 'Agenda' } },
  events: fcEvents.value,
  datesSet: onDatesSet,
  // Touch: a drag or resize only begins after a deliberate long press, so a
  // scroll gesture is never mistaken for one.
  longPressDelay: 400,
  eventLongPressDelay: 400,
  selectLongPressDelay: 400,
  eventStartEditable: true,
  eventDurationEditable: true,
  // No remote reflow while a drag or resize is in flight — the grid must not
  // re-layout under the pointer.
  eventDragStart: () => {
    dragging.value = true
    hovered.value = null
  },
  eventDragStop: (arg) => {
    dragging.value = false
    // Dropped over the Unscheduled panel → take it off the grid.
    if (!pointerOverPanel(arg.jsEvent)) return
    const event = eventById(arg.event.id)
    if (!event || (event.source !== 'task' && event.source !== 'todo')) return
    void app.unscheduleItem(event.source, event.refId)
  },
  eventResizeStart: (arg) => {
    dragging.value = true
    hovered.value = null
    resizeHint.value = durationLabel(
      (arg.event.extendedProps as { durationMins: number }).durationMins,
    )
  },
  eventResizeStop: (arg) => {
    dragging.value = false
    const start = arg.event.start?.getTime()
    const end = arg.event.end?.getTime()
    resizeHint.value =
      start !== undefined && end !== undefined ? durationLabel((end - start) / 60_000) : ''
  },
  selectable: true,
  selectMirror: true,
  select: onSelect,
  dateClick: onDateClick,
  droppable: true,
  drop: onExternalDrop,
  eventDrop: onEventDrop,
  eventResize: onEventResize,
  eventClick: onEventClick,
  eventMouseEnter: onEventMouseEnter,
  eventMouseLeave: onEventMouseLeave,
}))

// ---- styles ----------------------------------------------------------------
const headerRow = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: isMobile.value ? 'wrap' : 'nowrap',
  }),
)
function segBtn(active: boolean) {
  return pxify({
    fontSize: 12,
    fontWeight: 600,
    padding: '5px 12px',
    borderRadius: 9,
    cursor: 'pointer',
    border: '1px solid ' + (active ? c.value.accent : c.value.border),
    background: active
      ? 'color-mix(in oklch, ' + c.value.accent + ' 18%, transparent)'
      : 'transparent',
    color: active ? c.value.accent : c.value.dim,
  })
}
function chipBtn(active: boolean, color: string) {
  return pxify({
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 999,
    cursor: 'pointer',
    border: '1px solid ' + (active ? color : c.value.border),
    background: active ? 'color-mix(in oklch, ' + color + ' 18%, transparent)' : 'transparent',
    color: active ? color : c.value.dim,
  })
}
const titleStyle = computed(() =>
  pxify({ fontSize: 14, fontWeight: 600, color: c.value.text, whiteSpace: 'nowrap' }),
)
const gridWrap = pxify({ flex: 1, minHeight: 0, overflow: 'hidden' })
const bodyRow = pxify({ display: 'flex', gap: 10, flex: 1, minHeight: 0 })
const panelStyleBox = computed(() =>
  pxify({
    width: 170,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    overflowY: 'auto',
    padding: 8,
    borderRadius: 12,
    border: '1px solid ' + c.value.border,
    background: 'color-mix(in oklch, ' + c.value.border + ' 18%, transparent)',
  }),
)
const panelHead = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: c.value.dim,
  }),
)
const unschedRow = computed(() =>
  pxify({
    fontSize: 12,
    padding: '6px 8px',
    borderRadius: 8,
    background: c.value.card,
    border: '1px solid ' + c.value.border,
    cursor: 'grab',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
)
const hintStyle = computed(() =>
  pxify({
    position: 'fixed',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 19,
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: 10,
    background: c.value.glass,
    border: '1px solid ' + c.value.border,
    color: c.value.text,
  }),
)
</script>

<template>
  <div :style="panelStyle">
    <div :style="headerRow">
      <button :style="s.editBtn" @click="api()?.prev()">‹</button>
      <button :style="s.editBtn" @click="api()?.today()">Today</button>
      <button :style="s.editBtn" @click="api()?.next()">›</button>
      <span :style="titleStyle">{{ periodTitle }}</span>
      <span style="flex: 1"></span>
      <GlassDatePicker
        v-model="jumpDate"
        size="sm"
        placeholder="Jump to…"
        @update:model-value="onJump"
      />
      <button
        v-for="view in CALENDAR_VIEWS"
        :key="view.key"
        :style="segBtn(calendarView === view.key)"
        @click="switchView(view.key)"
      >
        {{ isMobile ? view.short : view.label }}
      </button>
    </div>

    <div :style="headerRow">
      <button
        :style="chipBtn(filters.tasks, 'oklch(0.65 0.16 260)')"
        @click="calendar.setFilters({ tasks: !filters.tasks })"
      >
        Tasks
      </button>
      <button
        :style="chipBtn(filters.todos, 'oklch(0.68 0.14 200)')"
        @click="calendar.setFilters({ todos: !filters.todos })"
      >
        Todos
      </button>
      <button
        :style="chipBtn(filters.goals, 'oklch(0.72 0.15 150)')"
        @click="calendar.setFilters({ goals: !filters.goals })"
      >
        Goals
      </button>
      <button
        :style="chipBtn(filters.reminders, 'oklch(0.75 0.16 60)')"
        @click="calendar.setFilters({ reminders: !filters.reminders })"
      >
        Reminders
      </button>
      <select
        :style="s.select"
        :value="filters.project"
        @change="calendar.setFilters({ project: ($event.target as HTMLSelectElement).value })"
      >
        <option value="">All projects</option>
        <option v-for="tag in tags" :key="tag" :value="tag">{{ tag }}</option>
      </select>
    </div>

    <div :style="bodyRow">
      <!-- Unscheduled: drag onto the grid to schedule, drag back to unschedule -->
      <div v-if="panelOpen" ref="panelEl" :style="panelStyleBox">
        <div :style="panelHead">
          <span>Unscheduled</span>
          <button :style="s.editBtn" @click="panelOpen = false">×</button>
        </div>
        <div
          v-for="item in calendar.unscheduled.value.tasks"
          :key="'task-' + item.id"
          class="unsched-item"
          :style="unschedRow"
          :data-type="'task'"
          :data-id="item.id"
          :data-title="item.title"
        >
          {{ item.title }}
        </div>
        <div
          v-for="item in calendar.unscheduled.value.todos"
          :key="'todo-' + item.id"
          class="unsched-item"
          :style="unschedRow"
          :data-type="'todo'"
          :data-id="item.id"
          :data-title="item.text"
        >
          {{ item.text }}
        </div>
        <span
          v-if="
            !calendar.unscheduled.value.tasks.length && !calendar.unscheduled.value.todos.length
          "
          :style="s.finMeta"
          >Everything is scheduled.</span
        >
      </div>
      <button v-else :style="s.editBtn" @click="panelOpen = true">Unscheduled</button>

      <div :style="gridWrap" class="cal-host">
        <FullCalendar ref="calendarRef" :options="options">
          <template #eventContent="arg">
            <div
              class="cal-event"
              :class="{ 'cal-done': arg.event.extendedProps.completed }"
              :style="{ '--bar': arg.event.extendedProps.barColor }"
              @touchstart="onEventTouchStart(arg.event.id)"
              @touchend="cancelPress"
              @touchmove="cancelPress"
            >
              <span class="cal-title">{{ arg.event.title }}</span>
              <span
                v-if="
                  arg.event.extendedProps.subtitle &&
                  !arg.event.allDay &&
                  arg.event.extendedProps.durationMins >= 45 &&
                  arg.view.type !== 'dayGridMonth'
                "
                class="cal-sub"
                >{{ arg.event.extendedProps.subtitle }}</span
              >
            </div>
          </template>
        </FullCalendar>
      </div>
    </div>

    <div v-if="resizeHint" :style="hintStyle">{{ resizeHint }}</div>

    <CalQuickCreate
      v-if="quick"
      :start="quick.start"
      :end="quick.end"
      :all-day="quick.allDay"
      :x="quick.x"
      :y="quick.y"
      @close="quick = null"
      @create="onQuickCreate"
    />

    <CalEventCard
      v-if="hovered"
      :event="hovered.event"
      :x="hovered.x"
      :y="hovered.y"
      :sheet="hovered.sheet"
      @close="hovered = null"
      @open="openEvent"
      @complete="completeEvent"
    />
  </div>
</template>

<style>
/* FullCalendar's own variables, remapped onto the app's theme tokens so the grid
   belongs to the theme rather than sitting on top of it. Global (not scoped)
   because FullCalendar renders outside this component's scope attribute. */
.cal-host {
  --fc-border-color: var(--theme-border, rgba(255, 255, 255, 0.14));
  --fc-page-bg-color: transparent;
  --fc-neutral-bg-color: transparent;
  --fc-list-event-hover-bg-color: transparent;
  --fc-today-bg-color: color-mix(in oklch, var(--theme-accent, #7aa2ff) 10%, transparent);
  --fc-now-indicator-color: var(--theme-accent, #7aa2ff);
  --fc-highlight-color: color-mix(in oklch, var(--theme-accent, #7aa2ff) 18%, transparent);
  height: 100%;
  font-size: 12px;
  color: var(--theme-text, inherit);
}
.cal-host .fc {
  height: 100%;
}
.cal-host .fc a {
  color: inherit;
  text-decoration: none;
}
.cal-host .fc .fc-scrollgrid,
.cal-host .fc td,
.cal-host .fc th {
  border-color: var(--fc-border-color);
}
.cal-host .fc .fc-col-header-cell-cushion,
.cal-host .fc .fc-daygrid-day-number,
.cal-host .fc .fc-timegrid-slot-label-cushion,
.cal-host .fc .fc-list-day-cushion {
  color: var(--theme-dim, inherit);
  font-weight: 600;
}
.cal-host .fc .fc-list-day-cushion,
.cal-host .fc .fc-list-event:hover td {
  background: transparent;
}
.cal-host .fc-event {
  background: transparent;
  border: none;
  box-shadow: none;
}
/* Events: a coloured left bar for the project/goal, title then description. */
.cal-event {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 5px;
  border-left: 3px solid var(--bar);
  border-radius: 5px;
  background: color-mix(in oklch, var(--bar) 16%, transparent);
  overflow: hidden;
  cursor: grab;
}
.cal-event:active {
  cursor: grabbing;
}
.cal-title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cal-sub {
  opacity: 0.75;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Month view: one line per item — dot, time, title. */
.cal-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 1px 3px;
  overflow: hidden;
  cursor: grab;
}
.cal-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--bar);
}
.cal-time {
  opacity: 0.7;
  flex-shrink: 0;
}
/* Completed items: half opacity, struck-through title. */
.cal-done {
  opacity: 0.5;
}
.cal-done .cal-title {
  text-decoration: line-through;
}
/* Week view stays scrollable on a phone rather than squashing seven columns. */
@media (max-width: 640px) {
  .cal-host .fc-timeGridWeek-view .fc-scrollgrid {
    min-width: 560px;
  }
  .cal-host .fc-timeGridWeek-view {
    overflow-x: auto;
  }
}
</style>
