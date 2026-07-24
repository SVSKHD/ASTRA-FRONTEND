<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { occurrences } from '@/utils/reminders'
import { urg } from '@/utils/colors'

const ui = useUiStore()
const app = useAppStore()
const { dark, s } = useStyles()
const { now } = storeToRefs(ui)
const { deadlines, reminders, ideas } = storeToRefs(app)

interface Next {
  title: string
  ms: number
  kind: 'deadline' | 'reminder'
  due?: string
}

const nextD = computed<Next | null>(() => {
  // Idea deadlines share the deadline ticker so a dated idea also surfaces here.
  const ideaDeadlines = ideas.value
    .filter((i) => i.deadline)
    .map((i) => ({ title: i.title, due: i.deadline }))
  const withMs = [
    ...deadlines.value.map((t) => ({ title: t.title, due: t.due })),
    ...ideaDeadlines,
  ].map((t) => ({
    title: t.title,
    due: t.due,
    ms: new Date(t.due + 'T23:59:59').getTime() - now.value,
    kind: 'deadline' as const,
  }))
  const overdue = withMs.filter((t) => t.ms < 0).sort((a, b) => b.ms - a.ms)
  const upcoming = withMs.filter((t) => t.ms >= 0).sort((a, b) => a.ms - b.ms)
  const nextDeadline = overdue[0] || upcoming[0] || null

  const remNexts = reminders.value
    .map((r) => {
      const occ = occurrences(r, now.value)
      return occ.next
        ? { title: r.title, ms: occ.next - now.value, kind: 'reminder' as const }
        : null
    })
    .filter((x): x is { title: string; ms: number; kind: 'reminder' } => x !== null)
    .sort((a, b) => a.ms - b.ms)
  const nextReminder = remNexts[0]

  let result: Next | null = nextDeadline
  if (nextReminder && (!nextDeadline || nextDeadline.ms < 0 || nextReminder.ms < nextDeadline.ms)) {
    result = nextReminder
  }
  return result
})

const hasTicker = computed(() => !!nextD.value)

const tickerTitle = computed(() => {
  const n = nextD.value
  if (!n) return ''
  return (n.kind === 'reminder' ? 'Reminder: ' : '') + n.title
})
const tickerTime = computed(() => {
  const n = nextD.value
  if (!n) return ''
  const isOverdue = n.ms < 0
  const days = Math.floor(Math.abs(n.ms) / 86400000)
  const hours = Math.floor((Math.abs(n.ms) % 86400000) / 3600000)
  return isOverdue ? 'overdue' : days + 'd ' + hours + 'h'
})
const dotColor = computed(() => {
  const n = nextD.value
  if (!n) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (n.ms < 0) return dark.value ? 'oklch(0.68 0.2 25)' : 'oklch(0.58 0.2 25)'
  if (n.kind === 'reminder') return 'oklch(0.75 0.14 145)'
  const d = n.due
    ? Math.round((new Date(n.due + 'T00:00:00').getTime() - today.getTime()) / 86400000)
    : 0
  return urg(d, dark.value)
})
const tickerStyle = computed(() => {
  const base = { ...s.value.ticker } as Record<string, string | number>
  const n = nextD.value
  if (n && (n.ms < 0 || n.ms < 24 * 3600000)) {
    const anim = base.animation ? base.animation + ', ' : ''
    base.animation = anim + 'pulse 1.6s ease-in-out infinite'
  }
  return base
})
const dotStyle = computed(() =>
  pxify({
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
    background: dotColor.value,
    boxShadow: '0 0 8px ' + dotColor.value,
  }),
)

function jump() {
  ui.setTab('deadlines')
}
</script>

<template>
  <div v-if="hasTicker" :style="tickerStyle" @click="jump">
    <span :style="dotStyle"></span>
    <span :style="s.tickerLabel">NEXT</span>
    <span :style="s.tickerTitle">{{ tickerTitle }}</span>
    <span :style="s.tickerTime">{{ tickerTime }}</span>
  </div>
</template>
