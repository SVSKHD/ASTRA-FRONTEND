<script setup lang="ts">
// The Calendar tab (section 15). Month / Week / Day / Agenda over one unified
// event list, built on FullCalendar so drag, resize, overlap layout and
// timezone handling are not hand-rolled.
//
// FullCalendar ships its own CSS variables; they are remapped to the section-7
// theme tokens in the scoped block below, so the grid reads on every theme
// rather than looking like a bolted-on widget.
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import Icon from '@/components/ui/Icon.vue'
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
import {
  CALENDAR_VIEWS,
  SOURCE_COLOR,
  SOURCE_ICON,
  SOURCE_LABEL,
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
const calendarTabs = computed(() =>
  CALENDAR_VIEWS.map((view) => ({
    value: view.key,
    label: isMobile.value ? view.short : view.label,
  })),
)
const VIEW_ICON: Record<CalendarViewKey, 'calendar' | 'columns' | 'clock' | 'list'> = {
  dayGridMonth: 'calendar',
  timeGridWeek: 'columns',
  timeGridDay: 'clock',
  listMonth: 'list',
}

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
// The hover card is anchored to the EVENT, not to the pointer: beside the chip
// it describes, on whichever side has room. It used to sit at the pointer's
// position — inside a panel whose slide-in transform made `position: fixed`
// relative to the panel, not the window — so it landed a long way from the
// thing it was about. And it closed the instant the pointer left the chip, so
// its Open and Complete buttons could not be reached; a short grace period now
// lets the pointer travel onto the card, and the card holds itself open.
const CARD_W = 300
let leaveTimer: ReturnType<typeof setTimeout> | undefined
function onEventMouseEnter(arg: { event: { id: string }; el: HTMLElement }) {
  if (isMobile.value || dragging.value) return
  clearTimeout(leaveTimer)
  const r = arg.el.getBoundingClientRect()
  const roomRight = window.innerWidth - r.right
  const x = roomRight > CARD_W + 16 ? r.right + 8 : Math.max(8, r.left - CARD_W - 8)
  showCard(arg.event.id, x, r.top, false)
}
function onEventMouseLeave() {
  if (isMobile.value) return
  clearTimeout(leaveTimer)
  leaveTimer = setTimeout(() => (hovered.value = null), 180)
}
function holdCard() {
  clearTimeout(leaveTimer)
}
function releaseCard() {
  onEventMouseLeave()
}
onBeforeUnmount(() => clearTimeout(leaveTimer))
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
  // Month and Agenda are as tall as their content, so the page scrolls and the
  // grid never grows a scrollbar of its own inside it. Week and Day keep a
  // fixed height: twenty-four hours of slots are meant to scroll.
  height:
    calendarView.value === 'dayGridMonth' || calendarView.value === 'listMonth'
      ? ('auto' as const)
      : '100%',
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
  // Two full cards a day, then "+N more": a card big enough to read beats a
  // third one cut to a sliver.
  dayMaxEvents: 2,
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

// ---- the head --------------------------------------------------------------
// "October 2026" as a big month and a quieter year; a week or day range that
// does not end in a year is shown whole.
const periodParts = computed(() => {
  const m = /^(.*?)\s+(\d{4})$/.exec(periodTitle.value.trim())
  return m ? { main: m[1], year: m[2] } : { main: periodTitle.value, year: '' }
})
// Section 24d, one accent per surface: the filters stay neutral and the hue is
// kept for the events — an icon says which source a chip is, not a colour.
const sourceFilters: {
  key: 'tasks' | 'todos' | 'goals' | 'reminders'
  source: 'task' | 'todo' | 'goal' | 'reminder'
  label: string
  icon: 'list' | 'check-square' | 'flag' | 'bell'
}[] = [
  { key: 'tasks', source: 'task', label: 'Tasks', icon: 'list' },
  { key: 'todos', source: 'todo', label: 'Todos', icon: 'check-square' },
  { key: 'goals', source: 'goal', label: 'Goals', icon: 'flag' },
  { key: 'reminders', source: 'reminder', label: 'Reminders', icon: 'bell' },
]

// ---- styles ----------------------------------------------------------------
const projectOptions = computed(() => [
  { value: '', label: 'All projects' },
  ...tags.value.map((t) => ({ value: t, label: t })),
])
const projectSelectStyle = computed(() =>
  // Capped rather than flexible. It was the only full-width control in the row
  // and it dwarfed everything beside it.
  pxify({ maxWidth: 240, minWidth: 0, flex: '1 1 140px' }),
)
// A floor under the grid. It sizes itself to 100% of what it is given, and a
// parent that gives it no height of its own (a short phone, a host that is
// not a fixed-height stage) collapsed it to a sliver of the week header.
const gridWrap = pxify({ flex: 1, minHeight: 520, overflow: 'hidden' })
// Section 24c, acceptance 124. A two-column grid with min-width: 0 on both
// tracks. It was a flex row whose panel had a fixed width and no min-width, so
// the grid — which can always shrink — pushed it past the left edge instead of
// taking the squeeze itself. min-width: 0 is what lets a grid track actually
// be as narrow as its column says, rather than as wide as its content.
function bodyGrid(withPanel: boolean) {
  return pxify({
    display: 'grid',
    gridTemplateColumns: withPanel ? '260px minmax(0, 1fr)' : 'minmax(0, 1fr)',
    gap: 'var(--sp-3)',
    flex: 1,
    // Never shorter than what it holds: a month sized to its weeks must not be
    // squeezed by the column and clipped at the bottom.
    minHeight: 'min-content',
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
    <!-- The head: what period this is, big, and the ways to move through it. -->
    <header class="calv__head">
      <span class="calv__mark" aria-hidden="true"><Icon name="calendar" size="md" /></span>
      <div class="calv__title">
        <span class="calv__eyebrow">Calendar</span>
        <h2 class="calv__period">
          {{ periodParts.main
          }}<span v-if="periodParts.year" class="calv__year"> {{ periodParts.year }}</span>
        </h2>
      </div>
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
      <div class="calv__jump">
        <Icon name="calendar-check" size="sm" class="calv__jump-icon" />
        <GlassDatePicker
          v-model="jumpDate"
          size="md"
          placeholder="Jump to date"
          @update:model-value="onJump"
        />
      </div>
      <!-- The range switch: four real targets, not a strip of small words. -->
      <div class="calv__views" role="tablist" aria-label="Calendar range">
        <button
          v-for="t in calendarTabs"
          :key="t.value"
          type="button"
          role="tab"
          class="calv__view"
          :class="{ 'is-on': calendarView === t.value }"
          :aria-selected="calendarView === t.value"
          @click="switchView(t.value)"
        >
          <Icon :name="VIEW_ICON[t.value]" size="xs" />
          <span>{{ t.label }}</span>
        </button>
      </div>
    </header>

    <!-- What is on the grid: one chip per source, then a project. -->
    <!-- The filters double as the legend: each wears the same tile, in the
         same colour, as its events on the grid. Off greys the tile out. -->
    <div class="calv__filters">
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
          <span class="calv__chip-tile"><Icon :name="f.icon" size="xs" /></span>
          {{ f.label }}
        </button>
      </div>
      <div :style="projectSelectStyle">
        <Select
          :model-value="filters.project"
          :options="projectOptions"
          size="md"
          aria-label="Project"
          @update:model-value="calendar.setFilters({ project: $event })"
        />
      </div>
      <span class="calv__spacer" />
      <button
        v-if="!panelOpen"
        type="button"
        class="calv__chip calv__chip--panel"
        @click="panelOpen = true"
      >
        <Icon name="list" size="xs" /> Unscheduled
        <span class="calv__chip-n">{{
          calendar.unscheduled.value.tasks.length + calendar.unscheduled.value.todos.length
        }}</span>
      </button>
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
      <div :style="gridWrap" class="cal-host">
        <FullCalendar ref="calendarRef" :options="options">
          <template #eventContent="arg">
            <!-- The chip: whose it is (icon in its colour), when, and what —
                 and on a tall enough block, the first line of its notes. -->
            <div
              class="cal-event"
              :class="{
                'cal-done': arg.event.extendedProps.completed,
                'cal-event--block': arg.view.type.startsWith('timeGrid') && !arg.event.allDay,
              }"
              :data-source="arg.event.extendedProps.source"
              :style="{
                '--bar': arg.event.extendedProps.barColor,
                '--chip-bg': arg.event.extendedProps.chipBg,
              }"
              @touchstart="onEventTouchStart(arg.event.id)"
              @touchend="cancelPress"
              @touchmove="cancelPress"
            >
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
              <span class="cal-ev-body">
                <span class="cal-title">{{ arg.event.title }}</span>
                <span class="cal-ev-meta">
                  <span class="cal-time">{{ arg.event.allDay ? 'All day' : arg.timeText }}</span>
                  <span class="cal-kind">{{
                    SOURCE_LABEL[arg.event.extendedProps.source as CalEvent['source']]
                  }}</span>
                </span>
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
              </span>
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

    <!-- Teleported: the panel's slide-in transform would otherwise make the
         card's fixed position relative to the panel instead of the window. -->
    <Teleport to="body">
      <CalEventCard
        v-if="hovered"
        :event="hovered.event"
        :x="hovered.x"
        :y="hovered.y"
        :sheet="hovered.sheet"
        @hold="holdCard"
        @release="releaseCard"
        @close="hovered = null"
        @open="openEvent"
        @complete="completeEvent"
      />
    </Teleport>
  </div>
</template>

<style>
/* ---- the head and the filters ----------------------------------------------- */
.calv__head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.calv__mark {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: linear-gradient(
    145deg,
    var(--theme-accent),
    color-mix(in oklch, var(--theme-accent) 65%, var(--theme-text))
  );
  color: var(--theme-on-accent);
  box-shadow: 0 10px 22px -12px var(--theme-accent);
}
.calv__title {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.calv__eyebrow {
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.calv__period {
  margin: 0;
  color: var(--theme-text);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
}
.calv__year {
  margin-left: 0.3em;
  color: var(--theme-dim);
  font-weight: var(--weight-medium);
}
/* Previous, Today, Next as one joined control rather than three loose buttons. */
.calv__nav {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-text) 6%, transparent);
}
.calv__nav-btn {
  display: grid;
  place-items: center;
  height: 30px;
  min-width: 30px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  transition: background var(--dur-fast) ease;
}
.calv__nav-btn:hover {
  background: color-mix(in oklch, var(--theme-text) 8%, transparent);
}
.calv__nav-today {
  padding: 0 12px;
  background: var(--glass-solid, var(--theme-card));
  box-shadow: 0 1px 3px color-mix(in srgb, var(--shadow-ink, #000) 18%, transparent);
}
.calv__nav-btn:focus-visible,
.calv__chip:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.calv__spacer {
  flex: 1;
}
/* Jump to: the date picker's trigger restated as the same soft 44px control as
   the range switch beside it, with a calendar glyph, instead of an outlined
   box in a different height and weight. */
.calv__jump {
  position: relative;
  min-width: 170px;
}
.calv__jump-icon {
  position: absolute;
  top: 50%;
  left: 14px;
  z-index: 1;
  transform: translateY(-50%);
  color: var(--theme-accent);
  pointer-events: none;
}
.calv__head .calv__jump .gdp__trigger {
  height: 44px;
  padding-left: 40px;
  border: 0;
  border-radius: 14px;
  background: color-mix(in oklch, var(--theme-text) 6%, transparent);
  color: var(--theme-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}
.calv__head .calv__jump .gdp__trigger:hover {
  background: color-mix(in oklch, var(--theme-text) 9%, transparent);
}
/* The range switch: a 44px track with 36px targets and a raised thumb. */
.calv__views {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  background: color-mix(in oklch, var(--theme-text) 6%, transparent);
}
.calv__view {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition:
    background var(--dur-fast) ease,
    color var(--dur-fast) ease;
}
.calv__view:hover:not(.is-on) {
  color: var(--theme-text);
  background: color-mix(in oklch, var(--theme-text) 5%, transparent);
}
.calv__view.is-on {
  background: var(--glass-solid, var(--theme-card));
  color: var(--theme-text);
  font-weight: var(--weight-semibold);
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--shadow-ink, #000) 12%, transparent),
    0 4px 12px -6px color-mix(in srgb, var(--shadow-ink, #000) 35%, transparent);
}
.calv__view.is-on svg {
  color: var(--theme-accent);
}
.calv__view:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 1px;
}
/* Week and day still scroll their hours; the bar does it quietly. */
.cal-host .fc .fc-scroller {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in oklch, var(--theme-text) 18%, transparent) transparent;
}
.calv__filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
/* The legend: one soft track, like the range switch, holding four toggles. */
.calv__legend {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 4px;
  border-radius: 14px;
  background: color-mix(in oklch, var(--theme-text) 5%, transparent);
}
.calv__chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px 0 8px;
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
    color var(--dur-fast) ease,
    opacity var(--dur-fast) ease;
}
.calv__chip:hover {
  color: var(--theme-text);
  background: color-mix(in oklch, var(--theme-text) 5%, transparent);
}
/* On is shown by the source's own tile lighting up and the label going to
   full strength — no accent ring of its own, so the one accent on the page
   stays where it means something (today, the selected range). */
.calv__chip.is-on {
  color: var(--theme-text);
}
.calv__chip:not(.is-on) {
  opacity: 0.6;
}
.calv__chip-tile {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: color-mix(in oklch, var(--theme-text) 8%, transparent);
  color: var(--theme-dim);
  transition:
    background var(--dur-fast) ease,
    color var(--dur-fast) ease;
}
.calv__chip.is-on .calv__chip-tile {
  background: color-mix(in oklch, var(--src) 24%, transparent);
  color: var(--src);
}
/* The Unscheduled toggle sits outside the legend as a soft button of its own. */
.calv__chip--panel {
  height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  background: color-mix(in oklch, var(--theme-text) 6%, transparent);
  color: var(--theme-text);
  opacity: 1;
}
.calv__chip--panel:not(.is-on) {
  opacity: 1;
}
.calv__chip--panel svg {
  color: var(--theme-accent);
}
.calv__chip-n {
  min-width: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-accent) 18%, transparent);
  color: var(--theme-text);
  font-size: var(--text-2xs);
  line-height: 1.6;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* FullCalendar's own variables, remapped onto the app's theme tokens so the grid
   belongs to the theme rather than sitting on top of it. Global (not scoped)
   because FullCalendar renders outside this component's scope attribute.

   The grid is one rounded card. Its inner lines are a faint wash of the text
   colour rather than the theme border, which on the dark themes was a bright
   blue-grey drawn round every one of forty-two cells. */
.cal-host {
  --cal-line: color-mix(in oklch, var(--theme-text) 8%, transparent);
  --fc-border-color: var(--cal-line);
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
  overflow: hidden;
  border: 1px solid var(--cal-line);
  border-radius: 20px;
  background: color-mix(in oklch, var(--theme-card) 70%, transparent);
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
/* The weekday row: a quiet band, small caps. */
.cal-host .fc .fc-col-header-cell {
  background: color-mix(in oklch, var(--theme-text) 4%, transparent);
  border-left-color: transparent;
  border-right-color: transparent;
}
.cal-host .fc .fc-col-header-cell-cushion {
  padding: 10px 4px;
  font-size: var(--text-2xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
/* Weekends recessed a touch, so the working week reads as the block it is. */
.cal-host .fc .fc-daygrid-day:is(.fc-day-sat, .fc-day-sun),
.cal-host .fc .fc-timegrid-col:is(.fc-day-sat, .fc-day-sun) {
  background: color-mix(in oklch, var(--theme-text) 2.5%, transparent);
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
  display: grid;
  place-items: center;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
}
/* Out-of-month days (section 24b). The number keeps the muted colour, which now
   clears 4.5:1; what marks the day as out of scope is the cell being recessed.
   Dimming the text further was the old approach and it made those numbers
   effectively invisible — the distinction was being carried by the one property
   that also has to stay readable. */
.cal-host .fc .fc-day-other {
  background: color-mix(in oklch, var(--text-primary, currentColor) 3%, transparent);
}
.cal-host .fc .fc-day-other .fc-daygrid-day-number {
  opacity: 0.75;
}
/* Today: the number in a filled accent circle, and the faintest tint on the
   cell. It was a 1px ring round the cell, which on the dark themes looked like
   a selection box someone had left behind. */
.cal-host .fc .fc-day-today {
  background: color-mix(in oklch, var(--theme-accent) 6%, transparent);
}
.cal-host .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  box-shadow: 0 4px 10px -4px var(--theme-accent);
}
.cal-host .fc .fc-col-header-cell.fc-day-today .fc-col-header-cell-cushion {
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
  margin-top: 4px;
  min-width: 0;
}
.cal-host .fc .fc-daygrid-day-events {
  padding: 0 4px 4px;
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
/* The chip is two columns: a small tile with the source's glyph in the
   source's colour, then the time and the title. The bar on the left edge
   stays — it is the project's colour, and the tile is the source's. */
.cal-event {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 6px 8px 6px 6px;
  border-left: 3px solid var(--bar);
  border-radius: 10px;
  background: var(--chip-bg, color-mix(in oklch, var(--bar) 12%, transparent));
  color: var(--text-primary, var(--theme-text));
  overflow: hidden;
  cursor: grab;
  box-shadow: 0 1px 2px color-mix(in srgb, var(--shadow-ink, #000) 10%, transparent);
  transition:
    transform 0.15s var(--ease-out, ease),
    box-shadow 0.15s var(--ease-out, ease);
}
.cal-event:hover {
  transform: translateY(-1px);
  box-shadow:
    0 0 0 1px color-mix(in oklch, var(--bar) 55%, transparent),
    0 6px 14px -8px color-mix(in srgb, var(--shadow-ink, #000) 50%, transparent);
}
/* Two lines a card: the title, and under it when and what. 44px is the
   smallest that holds both at a size you can read across a room. */
.cal-host .fc-daygrid-event .cal-event {
  min-height: 44px;
}
.cal-event:active {
  cursor: grabbing;
}
.cal-ev-icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  margin-top: 1px;
  border-radius: 8px;
  background: color-mix(in oklch, var(--bar) 24%, transparent);
  color: var(--bar);
}
.cal-ev-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
/* Two lines before the ellipsis. One line cut every real title — "Pay Credit
   car…" — to a word and a half; two lines say what the thing is. */
.cal-title {
  min-width: 0;
  font-size: var(--text-sm);
  line-height: 1.3;
  font-weight: var(--weight-semibold);
  white-space: normal;
  overflow: hidden;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
.cal-ev-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted, var(--theme-dim));
  font-size: var(--text-2xs);
  white-space: nowrap;
}
.cal-time {
  flex-shrink: 0;
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.cal-kind {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cal-kind::before {
  content: '·';
  margin-right: 6px;
}
.cal-sub {
  min-width: 0;
  color: var(--text-muted, var(--theme-dim));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* A timed block in week/day view: the title may wrap to two lines. */
.cal-event--block {
  height: 100%;
}
.cal-event--block .cal-title {
  min-width: 0;
  white-space: normal;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
@media (prefers-reduced-motion: reduce) {
  .cal-event,
  .cal-event:hover {
    transition: none;
    transform: none;
  }
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
/* Done, but still readable: a little dimmer, a soft strike, and the tile turns
   into a green tick. At 55% opacity with a full-strength strike the title was
   gone — and "what did I already do this week" is a question worth reading. */
.cal-done {
  opacity: 0.72;
}
.cal-done .cal-title {
  text-decoration: line-through;
  text-decoration-color: color-mix(in oklch, var(--theme-text) 45%, transparent);
}
.cal-done .cal-ev-icon {
  background: color-mix(in oklch, var(--theme-success) 20%, transparent);
  color: var(--theme-success);
}
/* Room for two cards and a "+N more" without the month feeling cramped. */
.cal-host .fc .fc-dayGridMonth-view .fc-daygrid-day-frame {
  min-height: 148px;
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
