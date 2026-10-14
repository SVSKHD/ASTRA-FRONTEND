<script setup lang="ts">
// The Calendar tab (section 15). Month / Week / Day / Agenda over one unified
// event list, built on FullCalendar so drag, resize, overlap layout and
// timezone handling are not hand-rolled.
//
// FullCalendar ships its own CSS variables; they are remapped to the section-7
// theme tokens in the scoped block below, so the grid reads on every theme
// rather than looking like a bolted-on widget.
//
// On a phone there is no grid at all: seven columns of hours do not fit, so
// the tab is a day list under its week (CalPhoneDay) instead.
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import Icon from '@/components/ui/Icon.vue'
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
import { hasCalendarToken } from '@/utils/gcal'
import CalEventCard from '@/components/CalEventCard.vue'
import CalEventSummary from '@/components/CalEventSummary.vue'
import CalPhoneDay from '@/components/CalPhoneDay.vue'
import CalQuickCreate from '@/components/CalQuickCreate.vue'
import UnscheduledPanel from '@/components/UnscheduledPanel.vue'
import {
  CALENDAR_VIEWS,
  SOURCE_COLOR,
  SOURCE_ICON,
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
const { c, dark, isMobile, panelStyle } = useStyles()
const { calendarView, tags, tasks, todos } = storeToRefs(app)

const calendar = useCalendar(
  () => dark.value,
  () => c.value.mono === true,
)
const { events, filters } = calendar

const calendarRef = shallowRef<InstanceType<typeof FullCalendar> | null>(null)
const phoneRef = ref<InstanceType<typeof CalPhoneDay> | null>(null)

defineExpose({
  focus: () => (isMobile.value ? phoneRef.value?.today() : api()?.today()),
})

function api() {
  return calendarRef.value?.getApi()
}

const DAY_START = '08:00:00'
async function switchView(view: CalendarViewKey) {
  app.setCalendarView(view)
  api()?.changeView(view)
  // The view changes before its new height arrives (it was 'auto' for a
  // month), so scrollTime lands on a grid with nothing to scroll. Scroll once
  // the height is in.
  await nextTick()
  requestAnimationFrame(() => api()?.scrollToTime(DAY_START))
}

// The window FullCalendar is showing, for the head's title.
const shown = ref<{ start: Date; end: Date; type: string } | null>(null)
function onDatesSet(arg: DatesSetArg) {
  shown.value = { start: arg.view.currentStart, end: arg.view.currentEnd, type: arg.view.type }
  // Range-scoped: only the visible window (plus a week of padding) is built.
  calendar.setRange(arg.start.getTime(), arg.end.getTime())
}

// --- selection ---------------------------------------------------------------
// A click selects: the event is outlined on the grid and described in the
// side column, with Mark done and Open there. A second click on the selected
// event opens it. On a phone a tap selects and raises the sheet.
const selectedId = ref<string | null>(null)
const selected = computed(() => events.value.find((e) => e.id === selectedId.value) ?? null)
const sheetEvent = ref<CalEvent | null>(null)

function eventById(id: string): CalEvent | undefined {
  return events.value.find((e) => e.id === id)
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
// The component instance, and the element inside it. Read through on demand
// rather than snapshotted, since the panel is v-if'd and remounts.
const panelRef = ref<InstanceType<typeof UnscheduledPanel> | null>(null)
const panelEl = computed<HTMLElement | null>(() => panelRef.value?.el ?? null)
let draggable: Draggable | null = null

// Bound to the element whenever there is one, rather than once on mount: the
// panel is v-if'd (it is not on a phone), so a resize across the breakpoint
// produces a *new* node, and a Draggable still holding the old one leaves the
// rows looking draggable and doing nothing.
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
// The head's "New event": the next whole hour today, an hour long, anchored to
// the button so the popover opens beside it rather than over the grid.
function onNewEvent(ev: MouseEvent) {
  const start = new Date()
  start.setHours(start.getHours() + 1, 0, 0, 0)
  const { top, left, width, height } = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  quick.value = {
    start: start.getTime(),
    end: start.getTime() + 60 * 60_000,
    allDay: false,
    anchor: { top, left, width, height },
  }
}
// The phone's + button: the day on screen, anchored to the button.
function onPhoneCreate(arg: { start: number; end: number; anchor: DOMRect }) {
  const { top, left, width, height } = arg.anchor
  quick.value = {
    start: arg.start,
    end: arg.end,
    allDay: false,
    anchor: { top, left, width, height },
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

// Open the underlying item in its own editor.
function openEvent(event: CalEvent) {
  sheetEvent.value = null
  if (event.source === 'task') app.openEdit('task', event.refId)
  else if (event.source === 'todo') app.openEdit('todo', event.refId)
  else if (event.source === 'reminder') app.openReminderDialog(event.refId)
  else ui.setTab('goals')
}
function completeEvent(event: CalEvent) {
  if (event.source === 'task') app.toggleTask(event.refId)
  else if (event.source === 'todo') app.toggleTodo(event.refId)
  sheetEvent.value = null
}
function onEventClick(arg: { event: { id: string } }) {
  const event = eventById(arg.event.id)
  if (!event) return
  if (selectedId.value === event.id) openEvent(event)
  else selectedId.value = event.id
}
function onPhoneSelect(event: CalEvent) {
  selectedId.value = event.id
  sheetEvent.value = event
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
    durationEditable: event.editable && !event.allDay && event.source !== 'reminder',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    extendedProps: {
      // Section 24b: the fill is measured against the text that has to sit on
      // it, here, once per event — not left to a color-mix in the stylesheet
      // that nobody can check. When the tint cannot carry the text this comes
      // back as a plain elevated surface, and the icon still says what it is.
      // Tinted by source, so the grid reads as the legend says it will.
      chipBg: surfacePair(SOURCE_COLOR[event.source], c.value, 0.2).background,
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

// "9:30" and "14:00": the grid's own clock, short and 24-hour.
function hm(d: Date | null): string {
  return d ? `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` : ''
}
function hourLabel(d: Date): string {
  const h = d.getHours()
  return `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`
}
const weekdayShort = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short' })

const options = computed<CalendarOptions>(() => ({
  plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
  initialView: calendarView.value,
  // Our own header sits above; FullCalendar's toolbar would duplicate it.
  headerToolbar: false as const,
  // Month and Agenda are as tall as their content, so the page scrolls and the
  // grid never grows a scrollbar of its own inside it. Week and Day keep a
  // fixed height: twenty-four hours of slots are meant to scroll. It is sized
  // to the window, not "100%" — the panel above gives the grid no definite
  // height, so a percentage resolved to auto and all twenty-four hours were
  // laid out and clipped rather than scrolled.
  height:
    calendarView.value === 'dayGridMonth' || calendarView.value === 'listMonth'
      ? ('auto' as const)
      : 'max(520px, calc(100dvh - 250px))',
  expandRows: true,
  nowIndicator: true,
  firstDay: 1,
  // The working day in view on arrival, not midnight.
  scrollTime: DAY_START,
  allDayText: 'All day',
  // 15-minute snapping, matching the drag language of section 2b.
  snapDuration: '00:15:00',
  slotDuration: '00:30:00',
  eventTimeFormat: { hour: 'numeric', minute: '2-digit', hour12: false } as const,
  // Two full cards a day, then "+N more": a card big enough to read beats a
  // third one cut to a sliver. Only what the popover actually opens gets
  // rendered, so the cap is a real rendering saving rather than a visual crop
  // (acceptance 72).
  dayMaxEvents: 2,
  moreLinkClick: 'popover' as const,
  moreLinkContent: (arg: { num: number }) => `+${arg.num} more`,
  eventMaxStack: 4,
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
}))

// ---- Google Calendar --------------------------------------------------------
// The token lives outside the store and is not reactive, so it is re-read after
// a reconnect. Expired access is the store's flag; it wins over a stale token.
const { calendarNeedsAuth } = storeToRefs(app)
const tokenTick = ref(0)
const gcalState = computed<'synced' | 'expired' | 'off'>(() => {
  void tokenTick.value
  if (calendarNeedsAuth.value) return 'expired'
  return hasCalendarToken() ? 'synced' : 'off'
})
const gcalLabel = computed(
  () => ({ synced: 'Synced', expired: 'Reconnect', off: 'Connect' })[gcalState.value],
)
async function onGcal() {
  if (gcalState.value === 'synced') return
  await app.reconnectCalendar()
  tokenTick.value++
}

// ---- the head --------------------------------------------------------------
// "5 – 11 Oct 2026" for a week, "October 2026" for a month, the date for a day.
const periodTitle = computed(() => {
  const r = shown.value
  if (!r) return ''
  const first = r.start
  const last = new Date(r.end.getTime() - 1)
  const mon = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' })
  if (r.type === 'dayGridMonth')
    return first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  if (r.type === 'timeGridDay')
    return `${first.toLocaleDateString(undefined, { weekday: 'long' })} ${first.getDate()} ${mon(first)} ${first.getFullYear()}`
  const sameYear = first.getFullYear() === last.getFullYear()
  const sameMonth = sameYear && first.getMonth() === last.getMonth()
  const tail = `${last.getDate()} ${mon(last)} ${last.getFullYear()}`
  if (sameMonth) return `${first.getDate()} – ${tail}`
  if (sameYear) return `${first.getDate()} ${mon(first)} – ${tail}`
  return `${first.getDate()} ${mon(first)} ${first.getFullYear()} – ${tail}`
})
// Section 24d: the filters are the legend — each wears its source's dot, the
// same hue as its events on the grid. Off hollows the dot out.
const sourceFilters: {
  key: 'tasks' | 'todos' | 'goals' | 'reminders'
  source: 'task' | 'todo' | 'goal' | 'reminder'
  label: string
}[] = [
  { key: 'tasks', source: 'task', label: 'Tasks' },
  { key: 'todos', source: 'todo', label: 'Todos' },
  { key: 'goals', source: 'goal', label: 'Goals' },
  { key: 'reminders', source: 'reminder', label: 'Reminders' },
]

// ---- styles ----------------------------------------------------------------
// Only offered once there are projects to pick from; a filter that is set
// stays visible, so events never go missing for a reason nobody can see.
const showProjects = computed(() => tags.value.length > 0 || !!filters.value.project)
const projectOptions = computed(() => [
  { value: '', label: 'All projects' },
  ...tags.value.map((t) => ({ value: t, label: t })),
])
const projectSelectStyle = computed(() =>
  // Capped rather than flexible: a full-width control dwarfed the row.
  pxify({ maxWidth: 180, minWidth: 140 }),
)
// A floor under the grid. It sizes itself to 100% of what it is given, and a
// parent that gives it no height of its own (a host that is not a fixed-height
// stage) collapsed it to a sliver of the week header.
const gridWrap = pxify({ flex: 1, minHeight: 520, overflow: 'hidden' })
// Section 24c, acceptance 124. A two-column grid with min-width: 0 on both
// tracks: the calendar, and the side column with the selection and the
// unscheduled list. min-width: 0 is what lets a grid track actually be as
// narrow as its column says, rather than as wide as its content.
const bodyGrid = pxify({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 288px',
  gap: 'var(--sp-4)',
  flex: 1,
  // Never shorter than what it holds: a month sized to its weeks must not be
  // squeezed by the column and clipped at the bottom.
  minHeight: 'min-content',
  minWidth: 0,
})
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
    <!-- ---- phone: a day list under its week ---- -->
    <CalPhoneDay
      v-if="isMobile"
      ref="phoneRef"
      :events="events"
      :selected-id="selectedId"
      @range="(s: number, e: number) => calendar.setRange(s, e)"
      @select="onPhoneSelect"
      @create="onPhoneCreate"
    />

    <template v-else>
      <!-- The top line: where the calendar syncs to, and the one primary action. -->
      <div class="calv__top">
        <button
          type="button"
          class="calv__gcal"
          :class="'is-' + gcalState"
          :title="
            gcalState === 'synced' ? 'Reminders sync to Google Calendar' : 'Connect Google Calendar'
          "
          @click="onGcal"
        >
          <span class="calv__gcal-g" aria-hidden="true">G</span>
          <span class="calv__gcal-name">Google Calendar</span>
          <span class="calv__gcal-state">{{ gcalLabel }}</span>
        </button>
        <button type="button" class="calv__new" @click="onNewEvent">
          <Icon name="plus" size="sm" />
          New event
        </button>
      </div>

      <!-- The head: what period this is, big, and the ways to move through it. -->
      <header class="calv__head">
        <h2 class="calv__period">{{ periodTitle }}</h2>
        <div class="calv__nav" role="group" aria-label="Move through the calendar">
          <button type="button" class="calv__nav-btn" aria-label="Previous" @click="api()?.prev()">
            <Icon name="chevron-left" size="sm" />
          </button>
          <button type="button" class="calv__nav-btn calv__nav-today" @click="api()?.today()">
            Today
          </button>
          <button type="button" class="calv__nav-btn" aria-label="Next" @click="api()?.next()">
            <Icon name="chevron-right" size="sm" />
          </button>
        </div>
        <span class="calv__spacer" />
        <!-- The filters double as the legend: each wears the same hue as its
             events on the grid. Off hollows the dot and greys the label. -->
        <div class="calv__legend" role="group" aria-label="Show on the calendar">
          <button
            v-for="f in sourceFilters"
            :key="f.key"
            type="button"
            class="calv__chip"
            :class="{ 'is-on': filters[f.key] }"
            :aria-pressed="filters[f.key]"
            :style="{ '--src': SOURCE_COLOR[f.source] }"
            :title="(filters[f.key] ? 'Hide ' : 'Show ') + f.label.toLowerCase()"
            @click="calendar.setFilters({ [f.key]: !filters[f.key] })"
          >
            <span class="calv__chip-dot" aria-hidden="true" />
            {{ f.label }}
          </button>
        </div>
        <div v-if="showProjects" class="calv__project" :style="projectSelectStyle">
          <Select
            :model-value="filters.project"
            :options="projectOptions"
            size="sm"
            aria-label="Project"
            @update:model-value="calendar.setFilters({ project: $event })"
          />
        </div>
        <!-- The range switch: four real targets, the current one a dark thumb. -->
        <div class="calv__views" role="tablist" aria-label="Calendar range">
          <button
            v-for="t in CALENDAR_VIEWS"
            :key="t.key"
            type="button"
            role="tab"
            class="calv__view"
            :class="{ 'is-on': calendarView === t.key }"
            :aria-selected="calendarView === t.key"
            @click="switchView(t.key)"
          >
            {{ t.label }}
          </button>
        </div>
      </header>

      <div :style="bodyGrid">
        <div :style="gridWrap" class="cal-host">
          <FullCalendar ref="calendarRef" :options="options">
            <!-- "Mon 5": the weekday quiet, the date bold, today in a disc. -->
            <template #dayHeaderContent="arg">
              <span class="cal-dh">
                <span class="cal-dh__wd">{{ weekdayShort(arg.date) }}</span>
                <span v-if="arg.view.type.startsWith('timeGrid')" class="cal-dh__n">{{
                  arg.date.getDate()
                }}</span>
              </span>
            </template>
            <template #slotLabelContent="arg">{{ hourLabel(arg.date) }}</template>
            <template #eventContent="arg">
              <!-- The chip: its source's tint, its glyph, the title, and on a
                   timed block in week or day view, when. -->
              <div
                class="cal-event"
                :class="{
                  'cal-done': arg.event.extendedProps.completed,
                  'cal-event--block':
                    arg.view.type.startsWith('timeGrid') &&
                    !arg.event.allDay &&
                    arg.event.extendedProps.source !== 'reminder',
                  'cal-event--pill':
                    arg.event.allDay || arg.event.extendedProps.source === 'reminder',
                  'is-selected': arg.event.id === selectedId,
                }"
                :data-source="arg.event.extendedProps.source"
                :style="{
                  '--src': SOURCE_COLOR[arg.event.extendedProps.source as CalEvent['source']],
                  '--chip-bg': arg.event.extendedProps.chipBg,
                }"
              >
                <span class="cal-ev-line">
                  <span class="cal-ev-icon" aria-hidden="true">
                    <Icon
                      :name="
                        arg.event.extendedProps.completed
                          ? 'check'
                          : SOURCE_ICON[arg.event.extendedProps.source as CalEvent['source']]
                      "
                      size="xs"
                    />
                  </span>
                  <span
                    v-if="
                      !arg.event.allDay &&
                      !arg.view.type.startsWith('timeGrid') &&
                      arg.view.type !== 'listMonth'
                    "
                    class="cal-time"
                    >{{ hm(arg.event.start) }}</span
                  >
                  <span class="cal-title">{{ arg.event.title }}</span>
                </span>
                <span
                  v-if="
                    arg.view.type.startsWith('timeGrid') &&
                    !arg.event.allDay &&
                    arg.event.extendedProps.source !== 'reminder'
                  "
                  class="cal-time"
                  >{{ hm(arg.event.start) }}–{{ hm(arg.event.end) }}</span
                >
              </div>
            </template>
          </FullCalendar>
        </div>

        <!-- The side column: what is selected, then what has no time yet. -->
        <div class="calv__side">
          <CalEventSummary
            v-if="selected"
            :event="selected"
            @close="selectedId = null"
            @open="openEvent"
            @complete="completeEvent"
          />
          <!-- Unscheduled: drag onto the grid to schedule, drag back to unschedule -->
          <UnscheduledPanel
            ref="panelRef"
            :tasks="calendar.unscheduled.value.tasks"
            :todos="calendar.unscheduled.value.todos"
          />
        </div>
      </div>
    </template>

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

    <!-- The phone's detail sheet. Teleported: the panel's slide-in transform
         would otherwise make its fixed position relative to the panel. -->
    <Teleport to="body">
      <CalEventCard
        v-if="sheetEvent"
        :event="sheetEvent"
        :x="0"
        :y="0"
        :sheet="true"
        @close="sheetEvent = null"
        @open="openEvent"
        @complete="completeEvent"
      />
    </Teleport>
  </div>
</template>

<style>
/* ---- the top line ------------------------------------------------------------ */
.calv__top {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-bottom: 4px;
}
/* Where it syncs to: a quiet white pill, the state in full-strength text. */
.calv__gcal {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--theme-card);
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-xs);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--shadow-ink, #000) 8%, transparent);
  cursor: pointer;
}
.calv__gcal.is-synced {
  cursor: default;
}
.calv__gcal-g {
  font-weight: var(--weight-semibold);
}
.calv__gcal-state {
  color: var(--theme-text);
  font-weight: var(--weight-semibold);
}
.calv__gcal.is-expired .calv__gcal-state {
  color: var(--theme-danger, var(--theme-accent));
}
/* The one primary action on the page: the accent, filled. */
.calv__new {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 18px 0 14px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  box-shadow: 0 8px 18px -10px var(--theme-accent);
  cursor: pointer;
  transition: filter var(--dur-fast) ease;
}
.calv__new:hover {
  filter: brightness(1.06);
}
.calv__gcal:focus-visible,
.calv__new:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}

/* ---- the head ---------------------------------------------------------------- */
.calv__head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.calv__period {
  margin: 0 12px 0 0;
  color: var(--theme-text);
  font-size: var(--text-2xl, 26px);
  font-weight: var(--weight-semibold);
  letter-spacing: -0.02em;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
/* Previous, Today, Next: three soft raised buttons. */
.calv__nav {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.calv__nav-btn {
  display: grid;
  place-items: center;
  height: 34px;
  min-width: 34px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--theme-card);
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--shadow-ink, #000) 10%, transparent);
  cursor: pointer;
  transition: filter var(--dur-fast) ease;
}
.calv__nav-btn:hover {
  filter: brightness(0.97);
}
.calv__nav-today {
  padding: 0 16px;
  border-radius: 12px;
}
.calv__nav-btn:focus-visible,
.calv__chip:focus-visible,
.calv__view:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.calv__spacer {
  flex: 1;
}
/* The legend: four soft pills, a dot in each source's colour. */
.calv__legend {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
}
.calv__chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 14px 0 12px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--theme-card);
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--shadow-ink, #000) 8%, transparent);
  cursor: pointer;
  transition:
    color var(--dur-fast) ease,
    opacity var(--dur-fast) ease;
}
/* On is the dot filling and the label going to full strength — no accent of
   its own, so the one accent on the page stays where it means something. */
.calv__chip.is-on {
  color: var(--theme-text);
}
.calv__chip:not(.is-on) {
  opacity: 0.6;
}
.calv__chip-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--src);
  background: transparent;
  transition: background var(--dur-fast) ease;
}
.calv__chip.is-on .calv__chip-dot {
  background: var(--src);
}
/* The range switch: a soft 36px track, as tall as the legend pills beside it,
   the current range a dark thumb. */
.calv__views {
  display: inline-flex;
  gap: 2px;
  padding: 4px;
  border-radius: 14px;
  background: color-mix(in oklch, var(--theme-text) 7%, transparent);
}
.calv__view {
  height: 28px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  transition:
    background var(--dur-fast) ease,
    color var(--dur-fast) ease;
}
.calv__view:hover:not(.is-on) {
  color: var(--theme-text);
}
.calv__view.is-on {
  background: var(--theme-text);
  color: var(--glass-solid, var(--theme-card));
  box-shadow: 0 4px 12px -6px color-mix(in srgb, var(--shadow-ink, #000) 45%, transparent);
}

/* ---- the side column ----------------------------------------------------------- */
/* As tall as the calendar beside it and no taller: height 0 means sixty
   unscheduled rows add nothing to the row's height, and min-height 100% then
   fills what the calendar gave it. The panel scrolls inside that. */
.calv__side {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  height: 0;
  min-height: 100%;
}

/* Week and day still scroll their hours; the bar does it quietly. */
.cal-host .fc .fc-scroller {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in oklch, var(--theme-text) 18%, transparent) transparent;
}

/* FullCalendar's own variables, remapped onto the app's theme tokens so the grid
   belongs to the theme rather than sitting on top of it. Global (not scoped)
   because FullCalendar renders outside this component's scope attribute.

   The grid is one rounded card. Its inner lines are a faint wash of the text
   colour rather than the theme border. */
.cal-host {
  --cal-line: color-mix(in oklch, var(--theme-text) 7%, transparent);
  --fc-border-color: var(--cal-line);
  --fc-page-bg-color: transparent;
  --fc-neutral-bg-color: transparent;
  --fc-list-event-hover-bg-color: transparent;
  /* Section 24c: today is marked on its number, not by filling the cell. */
  --fc-today-bg-color: transparent;
  --fc-now-indicator-color: var(--theme-accent);
  /* Selection at 6% (section 24c), below the chips. */
  --fc-highlight-color: color-mix(in oklch, var(--theme-accent) 6%, transparent);
  height: 100%;
  min-width: 0;
  overflow: hidden;
  padding: 8px 10px 10px 4px;
  border-radius: 24px;
  background: var(--theme-card);
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--shadow-ink, #000) 5%, transparent),
    0 16px 36px -24px color-mix(in srgb, var(--shadow-ink, #000) 35%, transparent);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-primary, var(--theme-text));
}
/* The card draws the outer edge; the table's own would double it. */
.cal-host .fc .fc-scrollgrid {
  border: 0;
}
.cal-host .fc .fc-scrollgrid-section > td,
.cal-host .fc .fc-scrollgrid-section > th {
  border: 0;
}
/* The weekday row: no band, no rules — just "Mon 5". */
.cal-host .fc .fc-col-header-cell {
  border-color: transparent;
}
.cal-host .fc .fc-col-header-cell-cushion {
  padding: 10px 4px 12px;
}
.cal-dh {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.cal-dh__wd {
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}
.cal-dh__n {
  display: grid;
  place-items: center;
  min-width: 26px;
  height: 26px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  color: var(--theme-text);
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.cal-host .fc .fc-col-header-cell.fc-day-today .cal-dh__n {
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  box-shadow: 0 4px 10px -4px var(--theme-accent);
}
.cal-host .fc .fc-daygrid-day {
  transition: background var(--dur-fast) ease;
}
.cal-host .fc .fc-daygrid-day:hover {
  background: color-mix(in oklch, var(--theme-accent) 5%, transparent);
}
/* The day number sits top-left, in a circle that today fills. */
.cal-host .fc .fc-daygrid-day-top {
  flex-direction: row;
  padding: 6px 6px 0;
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
.cal-host .fc .fc-timegrid-slot-label-cushion,
.cal-host .fc .fc-timegrid-axis-cushion,
.cal-host .fc .fc-list-day-cushion {
  color: var(--text-muted, var(--theme-dim));
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
}
/* Half-hour rows, with only the hours ruled. */
.cal-host .fc .fc-timegrid-slot {
  height: 20px;
}
.cal-host .fc .fc-timegrid-slot-minor {
  border-top-color: transparent;
}
.cal-host .fc .fc-timegrid-slot-label {
  vertical-align: top;
  border-color: transparent;
}
.cal-host .fc .fc-timegrid-axis {
  border-color: transparent;
}
/* The all-day band: a little air above the hours. */
.cal-host .fc .fc-timegrid-divider {
  padding: 0 0 6px;
  border: 0;
  background: transparent;
}
/* In week and day view today is the disc on its header; the column stays
   clear, all-day band included. */
.cal-host .fc .fc-timegrid .fc-day-today {
  background: transparent;
}
.cal-host .fc .fc-timegrid-now-indicator-line {
  border-width: 2px 0 0;
}
/* A dot where the line starts, so "now" reads as a point on the day. */
.cal-host .fc .fc-timegrid-now-indicator-line::before {
  content: '';
  position: absolute;
  top: -6px;
  left: -5px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--fc-now-indicator-color);
}
/* The dot replaces the arrow in the hour gutter. */
.cal-host .fc .fc-timegrid-now-indicator-arrow {
  display: none;
}
/* The day number: small, muted, tabular, top-right. Tabular because a column of
   proportional figures shifts left and right as the month goes from 9 to 10. */
.cal-host .fc .fc-daygrid-day-number {
  color: var(--text-muted, var(--theme-dim));
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  display: grid;
  place-items: center;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
}
/* Out-of-month days (section 24b): the cell is recessed, the number stays
   readable. */
.cal-host .fc .fc-day-other {
  background: color-mix(in oklch, var(--text-primary, currentColor) 3%, transparent);
}
.cal-host .fc .fc-day-other .fc-daygrid-day-number {
  opacity: 0.75;
}
/* Today: the number in a filled accent circle, and the faintest tint on the
   cell. */
.cal-host .fc .fc-day-today {
  background: color-mix(in oklch, var(--theme-accent) 6%, transparent);
}
.cal-host .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  box-shadow: 0 4px 10px -4px var(--theme-accent);
}
.cal-host .fc .fc-col-header-cell.fc-day-today {
  background: transparent;
}
.cal-host .fc-event {
  background: transparent;
  border: none;
  box-shadow: none;
}
.cal-host .fc .fc-timegrid-event-harness-inset .fc-timegrid-event {
  box-shadow: none;
}
.cal-host .fc .fc-daygrid-day-events {
  min-width: 0;
  margin: 0;
  padding: 0 4px 4px;
}
.cal-host .fc .fc-daygrid-event-harness {
  margin-top: 4px;
  min-width: 0;
}
.cal-host .fc .fc-daygrid-more-link {
  display: inline-block;
  margin: 2px 0 0;
  padding: 0 8px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-text) 7%, transparent);
  font-size: var(--text-xs);
  line-height: 20px;
  color: var(--text-muted, var(--theme-dim));
  font-weight: var(--weight-semibold);
}
/* ---- the event chip (section 24b) ----------------------------------------
   A tint of the SOURCE colour — the same hue as its dot in the legend — with
   the text at --text-primary and the glyph in the source colour.

   --chip-bg is computed per event in script, by surfacePair, which measures the
   tint against the text that will sit on it and substitutes a plain elevated
   surface when the pair fails. That measurement cannot be done in CSS.

   The hue is never the text. Coloured text on a coloured fill of the same hue
   is two values a few steps apart on one axis, and no ratio rescues it. */
.cal-event {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-width: 0;
  padding: 5px 8px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: var(--chip-bg, color-mix(in oklch, var(--src) 20%, transparent));
  color: var(--text-primary, var(--theme-text));
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.15s var(--ease-out, ease);
}
.cal-event:hover {
  box-shadow: 0 6px 14px -8px color-mix(in srgb, var(--shadow-ink, #000) 45%, transparent);
}
/* Selected: a dark ring, the one the side card describes. */
.cal-event.is-selected {
  border-color: var(--theme-text);
  box-shadow: 0 8px 18px -10px color-mix(in srgb, var(--shadow-ink, #000) 55%, transparent);
}
.cal-host .fc-daygrid-event .cal-event {
  min-height: 26px;
}
.cal-event:active {
  cursor: grabbing;
}
.cal-ev-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.cal-ev-icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  color: color-mix(in oklch, var(--src) 70%, var(--theme-text));
}
.cal-title {
  min-width: 0;
  overflow: hidden;
  font-size: var(--text-xs);
  line-height: 1.35;
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.cal-time {
  flex-shrink: 0;
  color: var(--text-muted, var(--theme-dim));
  font-size: var(--text-2xs);
  font-weight: var(--weight-medium);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* A timed block in week/day view fills its slot. */
.cal-event--block {
  height: 100%;
}
/* All-day items and reminders: a single-line pill. */
.cal-event--pill {
  justify-content: center;
  padding: 3px 9px;
  border-radius: 9px;
}
@media (prefers-reduced-motion: reduce) {
  .cal-event {
    transition: none;
  }
}
/* Done, but still readable: a little dimmer, a soft strike, a tick. */
.cal-done {
  opacity: 0.6;
}
.cal-done .cal-title {
  font-weight: var(--weight-semibold);
  text-decoration: line-through;
  text-decoration-color: color-mix(in oklch, var(--theme-text) 45%, transparent);
}
.cal-done .cal-ev-icon {
  color: var(--theme-success);
}
/* Room for two cards and a "+N more" without the month feeling cramped. */
.cal-host .fc .fc-dayGridMonth-view .fc-daygrid-day-frame {
  min-height: 120px;
}
</style>
