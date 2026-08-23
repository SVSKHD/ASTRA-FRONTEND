<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { merge, pxify, rowBase, typeStep } from '@/styles'
import { occurrences, repFreqLabel } from '@/utils/reminders'
import { splitList } from '@/utils/listSplit'
import { useLongList } from '@/composables/useLongList'
import { relLabel } from '@/utils/upcoming'
import ReminderTimeline from '@/components/ReminderTimeline.vue'
import ListToolbar from '@/components/ListToolbar.vue'
import UpNextBand from '@/components/UpNextBand.vue'
import ProgressLine from '@/components/ProgressLine.vue'
import CompletedSection from '@/components/CompletedSection.vue'
import { PRIORITY_ORDER, type Priority, type Reminder } from '@/types'

const app = useAppStore()
const ui = useUiStore()
const { c, dark, s, panelStyle } = useStyles()
const { reminders, hideCompleted } = storeToRefs(app)
const { now } = storeToRefs(ui)

// Creating happens in ItemDialog and editing in ReminderDialog, so N / ⌘K
// opens the create dialog rather than focusing a form this tab no longer
// carries — that whole eight-row form was the bulk of the tab's height.
defineExpose({ focus: () => app.openCreate('reminder') })

const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', normal: 'Normal', low: 'Low' }
function priorityColor(p: Priority): string {
  if (p === 'high') return dark.value ? 'oklch(0.72 0.18 25)' : 'oklch(0.58 0.19 25)'
  if (p === 'low') return c.value.dim
  return dark.value ? 'oklch(0.78 0.13 88)' : 'oklch(0.62 0.13 70)'
}

// A reminder is "done" once acknowledged or cancelled — the done/not-done split
// reads that the way todos read `status === 'done'`.
function isDone(r: Reminder): boolean {
  return r.acknowledgedAt != null || r.cancelledAt != null
}
function doneAt(r: Reminder): number | null {
  return r.acknowledgedAt ?? r.cancelledAt ?? null
}

const completedSort = ref<'recent' | 'original'>('recent')
const split = computed(() =>
  splitList(reminders.value, {
    isDone,
    isCarried: () => false, // overdue reminders surface in the Up next band, not a carried run
    completedAt: doneAt,
    completedSort: completedSort.value,
  }),
)

interface RemView {
  id: number
  title: string
  freqLabel: string
  nextLabel: string
  syncLabel: string
  syncColor: string
  priority: Priority
  priorityLabel: string
  priorityColor: string
  done: boolean
  doneLabel: string
  cancelled: boolean
}
function toView(r: Reminder): RemView {
  const occ = occurrences(r, now.value)
  const nextLabel = occ.next
    ? new Date(occ.next).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'elapsed'
  const syncLabel =
    r.calSync === 'synced'
      ? 'In calendar'
      : r.calSync === 'pending'
        ? 'Syncing…'
        : r.calSync === 'error'
          ? 'Sync failed'
          : 'Local only'
  const syncColor =
    r.calSync === 'synced'
      ? dark.value
        ? 'oklch(0.75 0.14 145)'
        : 'oklch(0.6 0.14 145)'
      : r.calSync === 'error'
        ? dark.value
          ? 'oklch(0.72 0.18 25)'
          : 'oklch(0.58 0.19 25)'
        : c.value.dim
  const at = doneAt(r)
  return {
    id: r.id,
    title: r.title,
    freqLabel: repFreqLabel(r.repeat),
    nextLabel,
    syncLabel,
    syncColor,
    priority: r.priority,
    priorityLabel: PRIORITY_LABEL[r.priority],
    priorityColor: priorityColor(r.priority),
    done: isDone(r),
    cancelled: r.cancelledAt != null,
    doneLabel: at != null ? relLabel(at - now.value) : '',
  }
}
// Active: highest priority first, then soonest next occurrence.
const activeView = computed<RemView[]>(() =>
  [...split.value.active]
    .sort((a, b) => {
      const byPriority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      if (byPriority !== 0) return byPriority
      const an = occurrences(a, now.value).next ?? Number.POSITIVE_INFINITY
      const bn = occurrences(b, now.value).next ?? Number.POSITIVE_INFINITY
      return an - bn
    })
    .map(toView),
)
const completedView = computed<RemView[]>(() => split.value.completed.map(toView))
// A completed list is unbounded — it grows for as long as the workspace is
// used. Past 100 rows it renders in windows so opening the section stays
// instant however many years are behind it.
const completedWindow = useLongList(completedView)

function rowStyle(done = false) {
  return merge(rowBase(c.value), { cursor: 'pointer', opacity: done ? 0.55 : 1 })
}
function priorityChipStyle(color: string) {
  return pxify({
    ...typeStep('2xs'),
    padding: '3px 8px',
    borderRadius: 8,
    background: 'transparent',
    border: '1px solid ' + color,
    color,
    letterSpacing: '0.04em',
    flexShrink: 0,
  })
}
function syncChipStyle(color: string) {
  return pxify({
    ...typeStep('2xs'),
    padding: '3px 8px',
    borderRadius: 8,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color,
    letterSpacing: '0.03em',
  })
}
const doneChip = computed(() =>
  pxify({
    ...typeStep('2xs'),
    padding: '3px 8px',
    borderRadius: 8,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color: c.value.dim,
  }),
)
function findReminder(id: number): Reminder | undefined {
  return reminders.value.find((r) => r.id === id)
}

// Only one timeline is open at a time — several 190px strips at once would bury
// the rest of the list.
const expandedId = ref<number | null>(null)
function toggleExpanded(id: number) {
  expandedId.value = expandedId.value === id ? null : id
}
const rowWrapStyle = pxify({ display: 'flex', flexDirection: 'column' })
function chevronStyle(open: boolean) {
  return pxify({
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    ...typeStep('xs'),
    color: c.value.dim,
    padding: '2px 6px',
    transform: open ? 'rotate(180deg)' : 'none',
    transition: 'transform .2s ease',
  })
}
</script>

<template>
  <div :style="panelStyle">
    <ListToolbar title="Reminders" new-label="New reminder" @new="app.openCreate('reminder')" />
    <UpNextBand />
    <ProgressLine :done="split.stats.done" :total="split.stats.total" />
    <div v-if="reminders.length === 0" :style="s.empty">No reminders set.</div>
    <div :style="s.list">
      <div v-for="it in activeView" :key="it.id" :style="rowWrapStyle">
        <div :style="rowStyle()" v-hover-style="s.rowHover" @click="app.openReminderDialog(it.id)">
          <div :style="s.taskMain">
            <span :style="s.dlTitle">{{ it.title }}</span>
            <span :style="s.dlDate">{{ it.freqLabel }} · next {{ it.nextLabel }}</span>
          </div>
          <span :style="priorityChipStyle(it.priorityColor)">{{ it.priorityLabel }}</span>
          <span :style="syncChipStyle(it.syncColor)">{{ it.syncLabel }}</span>
          <button
            :style="chevronStyle(expandedId === it.id)"
            :aria-expanded="expandedId === it.id"
            aria-label="Upcoming dates"
            @click.stop="toggleExpanded(it.id)"
          >
            ▾
          </button>
          <button :style="s.shareBtn" @click.stop="app.share('reminder', findReminder(it.id)!)">
            ↗
          </button>
          <button :style="s.del" @click.stop="app.deleteWithUndo('reminders', 'reminder', it.id)">
            ×
          </button>
        </div>
        <ReminderTimeline v-if="expandedId === it.id" :reminder="findReminder(it.id)!" :now="now" />
      </div>
    </div>

    <CompletedSection
      v-if="!hideCompleted && completedView.length > 0"
      collection="reminders"
      :count="completedView.length"
      :sort="completedSort"
      @toggle-sort="completedSort = completedSort === 'recent' ? 'original' : 'recent'"
    >
      <div v-for="it in completedWindow.visible.value" :key="it.id" :style="rowStyle(true)">
        <div :style="s.taskMain" @click="app.openReminderDialog(it.id)">
          <span :style="s.dlTitle">{{ it.title }}</span>
          <span :style="s.dlDate">
            {{ it.cancelled ? 'cancelled' : 'acknowledged' }}
            <template v-if="it.doneLabel">· {{ it.doneLabel }}</template>
          </span>
        </div>
        <span :style="doneChip">{{ it.cancelled ? 'Cancelled' : 'Done' }}</span>
        <button :style="s.del" @click.stop="app.deleteWithUndo('reminders', 'reminder', it.id)">
          ×
        </button>
      </div>
      <button
        v-if="completedWindow.remaining.value > 0"
        :style="s.showMoreRow"
        @click="completedWindow.more()"
      >
        Show {{ Math.min(100, completedWindow.remaining.value) }} more ({{
          completedWindow.remaining.value
        }}
        hidden)
      </button>
    </CompletedSection>
  </div>
</template>
