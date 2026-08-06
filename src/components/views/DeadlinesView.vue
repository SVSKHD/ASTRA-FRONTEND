<script setup lang="ts">
// Deadlines carry no lifecycle of their own, so the Done/Not-done split reads
// naturally by date: upcoming deadlines are the active region, elapsed ones fall
// into the collapsed Completed section below. No carried-over accordion — a
// deadline's date is fixed and can't be rolled forward.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, rowBase } from '@/styles'
import { urg } from '@/utils/colors'
import { splitList } from '@/utils/listSplit'
import ListToolbar from '@/components/ListToolbar.vue'
import CompletedSection from '@/components/CompletedSection.vue'
import ProgressLine from '@/components/ProgressLine.vue'
import type { Deadline } from '@/types'

const app = useAppStore()
const ui = useUiStore()
const { c, dark, s, panelStyle } = useStyles()
const { deadlines, hideCompleted } = storeToRefs(app)
const { now } = storeToRefs(ui)

defineExpose({ focus: () => app.openCreate('deadline') })

const today = computed(() => {
  const d = new Date(now.value)
  d.setHours(0, 0, 0, 0)
  return d
})
function dueMs(t: Deadline): number {
  return new Date(t.due + 'T23:59:59').getTime()
}
function isPast(t: Deadline): boolean {
  return dueMs(t) < now.value
}

const split = computed(() =>
  splitList(deadlines.value, {
    isDone: isPast,
    isCarried: () => false,
    completedAt: dueMs, // elapsed order by due date
    completedSort: 'recent',
  }),
)

interface DlView extends Deadline {
  days: number
  badge: string
  dateLabel: string
  col: string
}
function toView(t: Deadline): DlView {
  const due = new Date(t.due + 'T00:00:00')
  const days = Math.round((due.getTime() - today.value.getTime()) / 86400000)
  const col = urg(days, dark.value)
  return {
    ...t,
    days,
    col,
    badge: days < 0 ? 'past' : days === 0 ? 'today' : days + 'd',
    dateLabel: due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }
}
const upcoming = computed<DlView[]>(() =>
  [...split.value.active].sort((a, b) => (a.due < b.due ? -1 : 1)).map(toView),
)
const past = computed<DlView[]>(() => split.value.completed.map(toView))

function badgeStyle(col: string) {
  return pxify({
    flexShrink: 0,
    minWidth: 46,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 600,
    padding: '6px 9px',
    borderRadius: 10,
    background: 'transparent',
    color: col,
    border: '1px solid ' + col,
    boxShadow: dark.value ? '0 0 12px ' + col : 'none',
    letterSpacing: '0.02em',
  })
}
const row = computed(() => pxify(rowBase(c.value)))
const rowDim = computed(() => pxify({ ...rowBase(c.value), opacity: 0.55 }))
</script>

<template>
  <div :style="panelStyle">
    <ListToolbar title="Deadlines" new-label="New deadline" @new="app.openCreate('deadline')" />
    <ProgressLine :done="split.stats.done" :total="split.stats.total" />
    <div v-if="deadlines.length === 0" :style="s.empty">No deadlines set.</div>
    <div :style="s.list">
      <div v-for="t in upcoming" :key="t.id" :style="row" v-hover-style="s.rowHover">
        <span :style="badgeStyle(t.col)">{{ t.badge }}</span>
        <div :style="s.taskMain" @click="app.openEdit('deadline', t.id)">
          <span :style="s.dlTitle">{{ t.title }}</span>
          <span :style="s.dlDate">{{ t.dateLabel }}</span>
        </div>
        <button :style="s.shareBtn" @click="app.share('deadline', t)">↗</button>
        <button :style="s.del" @click="app.deleteWithUndo('deadlines', 'deadline', t.id)">×</button>
      </div>
    </div>

    <CompletedSection
      v-if="!hideCompleted && past.length > 0"
      collection="deadlines"
      :count="past.length"
      sort="recent"
    >
      <div v-for="t in past" :key="t.id" :style="rowDim">
        <span :style="badgeStyle(t.col)">{{ t.badge }}</span>
        <div :style="s.taskMain" @click="app.openEdit('deadline', t.id)">
          <span :style="s.dlTitle">{{ t.title }}</span>
          <span :style="s.dlDate">{{ t.dateLabel }}</span>
        </div>
        <button :style="s.del" @click="app.deleteWithUndo('deadlines', 'deadline', t.id)">×</button>
      </div>
    </CompletedSection>
  </div>
</template>
