<script setup lang="ts">
// Scrollable strip of a reminder's projected occurrences.
//
// Two modes. Without `upcoming`, the window runs from now to 31 Dec of the
// current year and scrolling to either end widens it by CHUNK_MONTHS, so the
// strip reads as one continuous run of dates in both directions. With
// `upcoming`, it shows exactly that many future occurrences with full dates —
// the individual reminder page wants a fixed forecast, not a calendar window
// that happens to be short when the year is nearly over.
import { computed, nextTick, ref, watch } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { occurrencesBetween, upcomingOccurrences } from '@/utils/reminders'
import type { Reminder } from '@/types'

const props = defineProps<{ reminder: Reminder; now: number; upcoming?: number }>()

const CHUNK_MONTHS = 6
// Past and future extension of the base window, in months.
const backMonths = ref(0)
const forwardMonths = ref(0)

const scroller = ref<HTMLElement | null>(null)

function shiftMonths(ms: number, months: number): number {
  const d = new Date(ms)
  d.setMonth(d.getMonth() + months)
  return d.getTime()
}

const windowFrom = computed(() => shiftMonths(props.now, -backMonths.value))
const windowTo = computed(() => {
  const endOfYear = new Date(new Date(props.now).getFullYear(), 11, 31, 23, 59, 59, 999).getTime()
  return shiftMonths(endOfYear, forwardMonths.value)
})

const dates = computed(() =>
  props.upcoming
    ? upcomingOccurrences(props.reminder, props.now, props.upcoming)
    : occurrencesBetween(props.reminder, windowFrom.value, windowTo.value),
)

// Reset the window whenever the strip is pointed at a different reminder.
watch(
  () => props.reminder.id,
  () => {
    backMonths.value = 0
    forwardMonths.value = 0
  },
)

const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const dayFmt = new Intl.DateTimeFormat(undefined, { day: '2-digit', weekday: 'short' })
// Upcoming mode has no month headers to carry the year, so each row spells the
// full date out — a 26-day repeat runs past New Year within twelve steps.
const fullDayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

interface Row {
  key: string
  monthLabel: string | null
  dayLabel: string
  timeLabel: string
  isPast: boolean
  isNext: boolean
}

const rows = computed<Row[]>(() => {
  let lastMonth = ''
  // The first occurrence at or after now is the one the row header calls
  // "next"; everything before it is greyed as elapsed.
  const nextMs = dates.value.find((d) => d >= props.now)
  return dates.value.map((ms) => {
    const monthKey = new Date(ms).getFullYear() + '-' + new Date(ms).getMonth()
    const monthLabel = props.upcoming || monthKey === lastMonth ? null : monthFmt.format(ms)
    lastMonth = monthKey
    return {
      key: String(ms),
      monthLabel,
      dayLabel: props.upcoming ? fullDayFmt.format(ms) : dayFmt.format(ms),
      timeLabel: timeFmt.format(ms),
      isPast: ms < props.now,
      isNext: ms === nextMs,
    }
  })
})

// Growing backwards prepends rows, which would yank the viewport. Restore the
// scroll offset by the height the content gained.
async function extendBackwards() {
  const el = scroller.value
  const before = el?.scrollHeight ?? 0
  backMonths.value += CHUNK_MONTHS
  await nextTick()
  if (el) el.scrollTop += el.scrollHeight - before
}

function onScroll() {
  const el = scroller.value
  // Upcoming mode is a fixed-length list; widening the window would silently
  // grow it past the requested count.
  if (!el || props.upcoming) return
  if (el.scrollTop <= 8) void extendBackwards()
  else if (el.scrollHeight - el.scrollTop - el.clientHeight <= 8)
    forwardMonths.value += CHUNK_MONTHS
}

const { c } = useStyles()

const scrollerStyle = computed(() =>
  pxify({
    maxHeight: props.upcoming ? 260 : 190,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    marginTop: 8,
    padding: '6px 8px',
    borderRadius: 'var(--radius-dialog)',
    background: c.value.input,
    border: '1px solid ' + c.value.border,
  }),
)
const monthLabelStyle = computed(() =>
  pxify({
    ...typeStep('2xs'),
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: c.value.dim,
    padding: '8px 2px 3px',
  }),
)
function rowStyle(row: Row) {
  return pxify({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--sp-3)',
    padding: '5px 8px',
    borderRadius: 'var(--radius-control)',
    ...typeStep('xs'),
    opacity: row.isPast ? 0.42 : 1,
    color: c.value.text,
    background: row.isNext ? c.value.card : 'transparent',
    border: '1px solid ' + (row.isNext ? c.value.border : 'transparent'),
  })
}
const timeStyle = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim }))
const hintStyle = computed(() =>
  pxify({ ...typeStep('2xs'), color: c.value.dim, textAlign: 'center', padding: '4px 0' }),
)
const emptyStyle = computed(() =>
  pxify({ ...typeStep('xs'), color: c.value.dim, padding: '10px 4px', textAlign: 'center' }),
)

// A one-off whose date has passed produces nothing, which otherwise reads as a
// broken timeline rather than an accurate one.
const emptyMessage = computed(() => {
  const type = props.reminder.repeat?.type || 'none'
  if (type === 'none') {
    return new Date(props.reminder.start).getTime() < props.now
      ? 'This one-off reminder has already passed.'
      : 'This one-off reminder falls outside this range.'
  }
  if (props.upcoming) return 'This reminder has no upcoming occurrences.'
  return 'No occurrences in this range — scroll up or down to widen it.'
})
</script>

<template>
  <div ref="scroller" :style="scrollerStyle" @scroll.stop="onScroll" @click.stop>
    <div v-if="rows.length === 0" :style="emptyStyle">{{ emptyMessage }}</div>
    <template v-else>
      <span v-if="!upcoming" :style="hintStyle">↑ earlier</span>
      <span v-else :style="hintStyle">Next {{ rows.length }} occurrences</span>
      <template v-for="row in rows" :key="row.key">
        <span v-if="row.monthLabel" :style="monthLabelStyle">{{ row.monthLabel }}</span>
        <div :style="rowStyle(row)">
          <span>{{ row.dayLabel }}</span>
          <span :style="timeStyle">{{ row.timeLabel }}</span>
        </div>
      </template>
      <span v-if="!upcoming" :style="hintStyle">↓ later</span>
    </template>
  </div>
</template>
