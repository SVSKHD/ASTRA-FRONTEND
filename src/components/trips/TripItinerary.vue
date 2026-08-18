<script setup lang="ts">
// The trip as a day-by-day itinerary that doubles as a segmented timeline: a
// continuous rail runs down the left, a day-divider node heads each day, and a
// place node sits at every stop showing its time and the gap since the previous
// one. Each day is a collapsible glass accordion with a sticky header (day
// number, date, count, start → end span). Under each place: exact time, name,
// full address, complete notes and a lazy photo grid (object-fit cover, sharp
// 2× thumbnails from the full-res source, skeleton while loading). Clicking a
// photo asks the page to open the lightbox at that photo. Works for a To-Visit
// trip too — it just reads planned dates.
import { ref } from 'vue'
import { sanitize } from '@/utils/sanitizeHtml'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { formatGap } from '@/utils/geo'
import { dayColor, type DayGroup } from '@/utils/tripDays'
import SmartImage from '@/components/trips/SmartImage.vue'
import type { TripPlace } from '@/types'

defineProps<{ days: DayGroup[]; active?: number | null }>()
const emit = defineEmits<{
  (e: 'select', placeId: number): void
  (e: 'photo', placeId: number, index: number): void
}>()

const { c } = useStyles()

// Collapsed day keys (all expanded by default).
const collapsed = ref<Set<string>>(new Set())
function toggle(key: string) {
  const next = new Set(collapsed.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsed.value = next
}
const isOpen = (key: string) => !collapsed.value.has(key)

function timeOf(value: string): string {
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return ''
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
function gap(day: DayGroup, i: number): string {
  if (i === 0) return ''
  return formatGap(day.places[i - 1].visitedAt, day.places[i].visitedAt)
}
function tint(day: DayGroup): string {
  return day.unscheduled ? c.value.dim : dayColor(day.dayNumber - 1)
}

// --- styles -----------------------------------------------------------------
const wrap = pxify({ display: 'flex', flexDirection: 'column', gap: 14 })
function dayCard(day: DayGroup) {
  return pxify({
    borderRadius: 20,
    border: '1px solid ' + c.value.border,
    background: 'rgba(255,255,255,0.015)',
    overflow: 'hidden',
    borderLeft: '3px solid ' + tint(day),
  })
}
function dayHeader() {
  return pxify({
    position: 'sticky',
    top: 0,
    zIndex: 3,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '12px 14px',
    border: 'none',
    background: c.value.glass,
    backdropFilter: 'blur(24px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(24px) saturate(1.6)',
    color: c.value.text,
    cursor: 'pointer',
    textAlign: 'left',
  })
}
function dayBadge(day: DayGroup) {
  return pxify({
    flexShrink: 0,
    minWidth: 30,
    height: 30,
    padding: '0 8px',
    borderRadius: 10,
    display: 'grid',
    placeItems: 'center',
    fontSize: 12,
    fontWeight: 800,
    color: '#fff',
    background: tint(day),
  })
}
const dayTitleWrap = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  flex: 1,
  minWidth: 0,
})
const dayTitle = () => pxify({ fontSize: 14, fontWeight: 700, color: c.value.text })
const daySub = () => pxify({ fontSize: 11, color: c.value.dim })
const chevron = (open: boolean) =>
  pxify({
    fontSize: 11,
    color: c.value.dim,
    transform: open ? 'rotate(90deg)' : 'none',
    transition: 'transform .3s ease',
  })
const bodyPad = pxify({ padding: '4px 14px 14px' })
function node(i: number, total: number) {
  return pxify({
    display: 'grid',
    gridTemplateColumns: '26px 1fr',
    gap: 12,
    paddingBottom: i === total - 1 ? 0 : 4,
  })
}
const rail = pxify({ display: 'flex', flexDirection: 'column', alignItems: 'center' })
function dot(day: DayGroup, activeState: boolean) {
  return pxify({
    width: 24,
    height: 24,
    flexShrink: 0,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    fontSize: 10.5,
    fontWeight: 700,
    marginTop: 2,
    color: '#fff',
    background: tint(day),
    outline: activeState ? '3px solid ' + c.value.accent : 'none',
    cursor: 'pointer',
  })
}
function line(last: boolean) {
  return pxify({
    flex: 1,
    width: 2,
    minHeight: 16,
    background: last ? 'transparent' : c.value.border,
    marginTop: 2,
  })
}
const placeBody = pxify({ minWidth: 0, paddingBottom: 14 })
const placeName = () =>
  pxify({ fontSize: 14, fontWeight: 600, color: c.value.text, cursor: 'pointer' })
const metaRow = pxify({
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
  marginTop: 2,
})
const timePill = () => pxify({ fontSize: 11, fontWeight: 600, color: c.value.text })
const gapChip = () =>
  pxify({
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 8,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color: c.value.accent,
  })
const addr = () => pxify({ fontSize: 11.5, color: c.value.dim, marginTop: 3, lineHeight: 1.4 })
const notes = () =>
  pxify({
    fontSize: 12.5,
    lineHeight: 1.55,
    color: c.value.text,
    marginTop: 7,
    padding: '9px 11px',
    borderRadius: 10,
    background: c.value.input,
  })
const photoGrid = pxify({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
  gap: 6,
  marginTop: 9,
})
const photoBtn = pxify({ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' })
const emptyStyle = () =>
  pxify({ textAlign: 'center', color: c.value.dim, fontSize: 12.5, padding: '24px 0' })

function placeTime(p: TripPlace): string {
  return timeOf(p.visitedAt)
}

// Trip notes are rich text the owner wrote, but this same component renders a
// public share in a stranger's browser — so the stored HTML is sanitised on the
// way to the DOM rather than trusted (section 17: no unsanitised v-html).
function safe(html: unknown): string {
  return sanitize(String(html ?? ''))
}
</script>

<template>
  <div :style="wrap">
    <div v-if="days.length === 0" :style="emptyStyle()">
      No places yet — add a stop to build the itinerary.
    </div>

    <section v-for="day in days" :key="day.key" :style="dayCard(day)">
      <button :style="dayHeader()" @click="toggle(day.key)">
        <span :style="dayBadge(day)">{{ day.unscheduled ? '—' : 'D' + day.dayNumber }}</span>
        <span :style="dayTitleWrap">
          <span :style="dayTitle()">
            {{ day.unscheduled ? 'Unscheduled' : 'Day ' + day.dayNumber + ' — ' + day.dateLabel }}
          </span>
          <span :style="daySub()">
            {{ day.count }} place{{ day.count === 1 ? '' : 's' }}
            <template v-if="day.startTime">
              · {{ day.startTime
              }}<template v-if="day.endTime !== day.startTime"> – {{ day.endTime }}</template>
            </template>
          </span>
        </span>
        <span :style="chevron(isOpen(day.key))">▶</span>
      </button>

      <div v-show="isOpen(day.key)" :style="bodyPad">
        <div v-for="(p, i) in day.places" :key="p.id" :style="node(i, day.places.length)">
          <div :style="rail">
            <button
              :style="dot(day, p.id === active)"
              title="Show on map"
              @click="emit('select', p.id)"
            >
              {{ i + 1 }}
            </button>
            <span :style="line(i === day.places.length - 1)"></span>
          </div>
          <div :style="placeBody">
            <span :style="placeName()" @click="emit('select', p.id)">
              {{ p.name || 'Untitled place' }}
            </span>
            <div :style="metaRow">
              <span v-if="placeTime(p)" :style="timePill()">{{ placeTime(p) }}</span>
              <span v-else :style="timePill()">No time set</span>
              <span v-if="gap(day, i)" :style="gapChip()">{{ gap(day, i) }}</span>
            </div>
            <div v-if="p.address" :style="addr()">📍 {{ p.address }}</div>
            <div v-if="p.notes" class="rich" :style="notes()" v-html="safe(p.notes)"></div>
            <div :style="photoGrid">
              <button
                v-for="(url, pi) in p.photos"
                :key="pi"
                :style="photoBtn"
                :aria-label="'Open photo ' + (pi + 1)"
                @click="emit('photo', p.id, pi)"
              >
                <SmartImage :src="url" alt="Trip photo" :radius="10" />
              </button>
              <!-- No photos: keep the slot at the same size with a placeholder. -->
              <SmartImage v-if="!p.photos.length" :radius="10" />
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
