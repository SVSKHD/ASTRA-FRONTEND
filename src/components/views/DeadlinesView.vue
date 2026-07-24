<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, rowBase } from '@/styles'
import { urg } from '@/utils/colors'
import ListToolbar from '@/components/ListToolbar.vue'
import type { Deadline } from '@/types'

const app = useAppStore()
const { c, dark, s, panelStyle } = useStyles()
const { deadlines } = storeToRefs(app)

// Create and edit both live in ItemDialog now, so N / ⌘K opens that rather
// than focusing a form this tab no longer carries.
defineExpose({ focus: () => app.openCreate('deadline') })

const today = computed(() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})

interface DlView extends Deadline {
  days: number
  badge: string
  dateLabel: string
  col: string
}
const view = computed<DlView[]>(() =>
  [...deadlines.value]
    .sort((a, b) => (a.due < b.due ? -1 : 1))
    .map((t) => {
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
    }),
)

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
</script>

<template>
  <div :style="panelStyle">
    <ListToolbar title="Deadlines" new-label="New deadline" @new="app.openCreate('deadline')" />
    <div v-if="deadlines.length === 0" :style="s.empty">No deadlines set.</div>
    <div :style="s.list">
      <div v-for="t in view" :key="t.id" :style="row" v-hover-style="s.rowHover">
        <span :style="badgeStyle(t.col)">{{ t.badge }}</span>
        <div :style="s.taskMain" @click="app.openEdit('deadline', t.id)">
          <span :style="s.dlTitle">{{ t.title }}</span>
          <span :style="s.dlDate">{{ t.dateLabel }}</span>
        </div>
        <button :style="s.shareBtn" @click="app.share('deadline', t)">↗</button>
        <button :style="s.del" @click="app.deleteWithUndo('deadlines', 'deadline', t.id)">×</button>
      </div>
    </div>
  </div>
</template>
