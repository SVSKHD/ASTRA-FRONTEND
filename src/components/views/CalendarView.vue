<script setup lang="ts">
// The Calendar tab (section 15). Month / Week / Day / Agenda over one unified
// event list, built on FullCalendar so drag, resize, overlap layout and
// timezone handling are not hand-rolled.
//
// FullCalendar ships its own CSS variables; they are remapped to the section-7
// theme tokens in the scoped block below, so the grid reads on every theme
// rather than looking like a bolted-on widget.
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import Select from '@/components/ui/Select.vue'
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
import { pxify, typeStep } from '@/styles'
import { useCalendar } from '@/composables/useCalendar'
import { surfacePair } from '@/themes/surfacePair'
import CalEventCard from '@/components/CalEventCard.vue'
import CalQuickCreate from '@/components/CalQuickCreate.vue'
import UnscheduledPanel from '@/components/UnscheduledPanel.vue'
import Tabs from '@/components/ui/Tabs.vue'
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
const calendarTabs = computed(() =>
  CALENDAR_VIEWS.map((view) => ({
    value: view.key,
    label: isMobile.value ? view.short : view.label,
  })),
)

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
// The component instance, and the element inside it. Read through on demand
// rather than snapshotted, since the panel is v-if'd and remounts.
const panelRef = ref<InstanceType<typeof UnscheduledPanel> | null>(null)
const panelEl = computed<HTMLElement | null>(() => panelRef.value?.el ?? null)
let draggable: Draggable | null = null

// Bound to the element whenever there is one, rather than once on mount: the
// panel is v-if'd, so closing and reopening it produces a *new* node, and a
// Draggable still holding the old one leaves the rows looking draggable and
// doing nothing.
watch(
  panelEl,
  (el) => {
    draggable?.destroy()
    draggable = el
      ? new Draggable(el, {
          itemSelector: '.unsched-item',
          // The drop handler reads the real item off the element's dataset;
          // this is only what the ghost shows while dragging.
          eventData: (node) => ({
            title: node.getAttribute('data-title') || '',
            duration: '00:30',
          }),
        })
      : null
  },
  { immediate: true, flush: 'post' },
)
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
interface CellAnchor {
  top: number
  left: number
  width: number
  height: number
}
const quick = ref<{
  start: number
  end: number
  allDay: boolean
  anchor: CellAnchor
} | null>(null)

// The popover is anchored to the cell, not to the pointer. Anchoring to the
// pointer is what let it open half a pixel from the right edge of the window
// and then be clipped: the cell has a width, so "is there room beside this"
// is a question with an answer.
function anchorFor(jsEvent: MouseEvent | null): CellAnchor {
  const cell = (jsEvent?.target as HTMLElement | null)?.closest?.(
    '.fc-daygrid-day, .fc-timegrid-col, .fc-list-day',
  )
  if (cell) {
    const r = cell.getBoundingClientRect()
    return { top: r.top, left: r.left, width: r.width, height: r.height }
  }
  // Keyboard selection, or a drag that ended outside a cell: a zero-width box
  // at the pointer still places correctly, it just cannot flip early.
  return { top: jsEvent?.clientY ?? 80, left: jsEvent?.clientX ?? 80, width: 0, height: 0 }
}

function onSelect(arg: DateSelectArg) {
  quick.value = {
    start: arg.start.getTime(),
    end: arg.end.getTime(),
    allDay: arg.allDay,
    anchor: anchorFor(arg.jsEvent as MouseEvent | null),
  }
}
function onQuickCreate(payload: {
  kind: 'task' | 'todo' | 'reminder'
  title: string
  project: string
  allDay: boolean
}) {
  const range = quick.value
  if (!range) return
  app.createScheduledItem(payload.kind, payload.title, payload.project, {
    startAt: range.start,
    endAt: range.end,
    // The popover's own All-day switch wins over what the drag implied: the
    // reader has seen the range and said otherwise.
    allDay: payload.allDay,
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
    anchor: anchorFor(arg.jsEvent),
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
      // Section 24b: the fill is measured against the text that has to sit on
      // it, here, once per event — not left to a color-mix in the stylesheet
      // that nobody can check. When the tint cannot carry the text this comes
      // back as a plain elevated surface, and the bar still says whose it is.
      chipBg: surfacePair(event.barColor, c.value).background,
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
    gap: 'var(--sp-2)',
    flexWrap: isMobile.value ? 'wrap' : 'nowrap',
  }),
)
function segBtn(active: boolean) {
  return pxify({
    ...typeStep('sm'),
    fontWeight: 'var(--weight-semibold)',
    height: 32,
    padding: '0 12px',
    borderRadius: 'var(--radius-control)',
    cursor: 'pointer',
    // Section 24d, one accent per surface: inactive is neutral. Four filter
    // chips in four hues plus a purple active state plus coloured events left
    // the eye with nothing to land on, so the hue withdraws to the events —
    // the only place it carries information the label does not already give.
    border: '1px solid ' + (active ? c.value.accent : c.value.border),
    background: active
      ? 'color-mix(in oklch, ' + c.value.accent + ' 18%, transparent)'
      : 'transparent',
    color: active ? c.value.text : c.value.dim,
  })
}
const chipBtn = segBtn
const projectOptions = computed(() => [
  { value: '', label: 'All projects' },
  ...tags.value.map((t) => ({ value: t, label: t })),
])
const projectSelectStyle = computed(() =>
  // Capped rather than flexible. It was the only full-width control in the row
  // and it dwarfed everything beside it.
  pxify({ maxWidth: 240, minWidth: 0, flex: '1 1 140px' }),
)
const titleStyle = computed(() =>
  pxify({
    ...typeStep('base'),
    fontWeight: 'var(--weight-semibold)',
    color: c.value.text,
    whiteSpace: 'nowrap',
  }),
)
const gridWrap = pxify({ flex: 1, minHeight: 0, overflow: 'hidden' })
// Section 24c, acceptance 124. A two-column grid with min-width: 0 on both
// tracks. It was a flex row whose panel had a fixed width and no min-width, so
// the grid — which can always shrink — pushed it past the left edge instead of
// taking the squeeze itself. min-width: 0 is what lets a grid track actually
// be as narrow as its column says, rather than as wide as its content.
function bodyGrid(withPanel: boolean) {
  return pxify({
    display: 'grid',
    gridTemplateColumns: withPanel ? '260px minmax(0, 1fr)' : 'auto minmax(0, 1fr)',
    gap: 'var(--sp-3)',
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  })
}
const hintStyle = computed(() =>
  pxify({
    position: 'fixed',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 19,
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '6px 12px',
    borderRadius: 'var(--radius-card)',
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
      <Tabs
        size="sm"
        :model-value="calendarView"
        :tabs="calendarTabs"
        aria-label="Calendar range"
        @update:model-value="switchView($event as CalendarViewKey)"
      />
    </div>

    <div :style="headerRow">
      <button
        :style="chipBtn(filters.tasks)"
        @click="calendar.setFilters({ tasks: !filters.tasks })"
      >
        Tasks
      </button>
      <button
        :style="chipBtn(filters.todos)"
        @click="calendar.setFilters({ todos: !filters.todos })"
      >
        Todos
      </button>
      <button
        :style="chipBtn(filters.goals)"
        @click="calendar.setFilters({ goals: !filters.goals })"
      >
        Goals
      </button>
      <button
        :style="chipBtn(filters.reminders)"
        @click="calendar.setFilters({ reminders: !filters.reminders })"
      >
        Reminders
      </button>
      <div :style="projectSelectStyle">
        <Select
          :model-value="filters.project"
          :options="projectOptions"
          size="sm"
          @update:model-value="calendar.setFilters({ project: $event })"
        />
      </div>
    </div>

    <div :style="bodyGrid(panelOpen)">
      <!-- Unscheduled: drag onto the grid to schedule, drag back to unschedule -->
      <UnscheduledPanel
        v-if="panelOpen"
        ref="panelRef"
        :tasks="calendar.unscheduled.value.tasks"
        :todos="calendar.unscheduled.value.todos"
        @close="panelOpen = false"
      />
      <button v-else :style="s.editBtn" @click="panelOpen = true">Unscheduled</button>

      <div :style="gridWrap" class="cal-host">
        <FullCalendar ref="calendarRef" :options="options">
          <template #eventContent="arg">
            <div
              class="cal-event"
              :class="{ 'cal-done': arg.event.extendedProps.completed }"
              :style="{
                '--bar': arg.event.extendedProps.barColor,
                '--chip-bg': arg.event.extendedProps.chipBg,
              }"
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
      :anchor="quick.anchor"
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
  --fc-border-color: var(--border-subtle, var(--theme-border, rgba(255, 255, 255, 0.14)));
  --fc-page-bg-color: transparent;
  --fc-neutral-bg-color: transparent;
  --fc-list-event-hover-bg-color: transparent;
  /* Section 24c: today is a ring, not a fill. A filled cell competes with the
     events inside it — the one day whose contents matter most is the one the
     highlight was making hardest to read. */
  --fc-today-bg-color: transparent;
  --fc-now-indicator-color: var(--theme-accent);
  /* Selection at 6% (section 24c). It used to be 18%, stronger than the event
     chips at 12%, so dragging out a range hid what was already there. */
  --fc-highlight-color: color-mix(in oklch, var(--theme-accent) 6%, transparent);
  height: 100%;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-primary, var(--theme-text));
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
.cal-host .fc .fc-timegrid-slot-label-cushion,
.cal-host .fc .fc-list-day-cushion {
  color: var(--text-muted, var(--theme-dim));
  font-weight: var(--weight-semibold);
}
/* The day number: small, muted, tabular, top-right. Tabular because a column of
   proportional figures shifts left and right as the month goes from 9 to 10. */
.cal-host .fc .fc-daygrid-day-number {
  color: var(--text-muted, var(--theme-dim));
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  padding: 4px 6px;
}
/* Out-of-month days (section 24b). The number keeps the muted colour, which now
   clears 4.5:1; what marks the day as out of scope is the cell being recessed.
   Dimming the text further was the old approach and it made those numbers
   effectively invisible — the distinction was being carried by the one property
   that also has to stay readable. */
.cal-host .fc .fc-day-other {
  background: color-mix(in oklch, var(--text-primary, currentColor) 5%, transparent);
}
.cal-host .fc .fc-day-other .fc-daygrid-day-number {
  opacity: 0.75;
}
/* Today: a 1px accent ring drawn inside the cell. */
.cal-host .fc .fc-day-today {
  box-shadow: inset 0 0 0 1px var(--theme-accent);
}
.cal-host .fc .fc-day-today .fc-daygrid-day-number {
  color: var(--theme-accent);
}
.cal-host .fc-event {
  background: transparent;
  border: none;
  box-shadow: none;
}
/* Month cells: three events at 20px with a 2px gap, then "+N more". */
.cal-host .fc .fc-daygrid-day-events {
  min-width: 0;
  margin: 0;
}
.cal-host .fc .fc-daygrid-event-harness {
  margin-top: 2px;
  min-width: 0;
}
.cal-host .fc .fc-daygrid-more-link {
  display: block;
  padding: 0 4px;
  font-size: var(--text-xs);
  line-height: 20px;
  color: var(--text-muted, var(--theme-dim));
  font-weight: var(--weight-semibold);
}
/* ---- the event chip (section 24b) ----------------------------------------
   A 12% tint of the source colour, a 3px bar of it at full strength down the
   left edge, and the text at --text-primary.

   --chip-bg is computed per event in script, by surfacePair, which measures the
   tint against the text that will sit on it and substitutes a plain elevated
   surface when the pair fails. That measurement cannot be done in CSS, which is
   why the chip used to be a color-mix nobody had checked: on a dark theme with
   a dark project colour it rendered dark text on a dark fill and the chip
   became a coloured smudge.

   The hue is never the text. Coloured text on a coloured fill of the same hue
   is two values a few steps apart on one axis, and no ratio rescues it. */
.cal-event {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  padding: 2px 6px;
  border-left: 3px solid var(--bar);
  border-radius: var(--radius-control);
  background: var(--chip-bg, color-mix(in oklch, var(--bar) 12%, transparent));
  color: var(--text-primary, var(--theme-text));
  overflow: hidden;
  cursor: grab;
}
.cal-host .fc-daygrid-event .cal-event {
  min-height: 20px;
  justify-content: center;
}
.cal-event:active {
  cursor: grabbing;
}
.cal-title {
  min-width: 0;
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cal-sub {
  min-width: 0;
  color: var(--text-muted, var(--theme-dim));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Month view: one line per item — dot, time, title. */
.cal-row {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
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
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted, var(--theme-dim));
}
/* Completed items (section 24b): full colour, struck through, at 55% — one
   signal carried by two properties that agree, rather than a strike stacked on
   a faded colour, which is two signals and no legibility. */
.cal-done {
  opacity: 0.55;
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
