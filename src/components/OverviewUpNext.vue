<script setup lang="ts">
// The compact "Up next" tile on Overview: anything firing within 24h, surfaced
// as the soonest countdown plus a count, jumping to the Reminders tab on tap.
// Reads the same shared clock and windowing as the full band, so the two never
// disagree.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useReminderClock } from '@/composables/useReminderClock'
import { DANGER, pxify, typeStep } from '@/styles'
import { upcomingReminders, countdownClock, relLabel, SOON_MS } from '@/utils/upcoming'

const app = useAppStore()
const ui = useUiStore()
const { c, dark } = useStyles()
const { reminders } = storeToRefs(app)
const { nowMs } = useReminderClock()

const list = computed(() => upcomingReminders(reminders.value, nowMs.value, { limit: 3 }))
const soonest = computed(() => list.value[0] ?? null)
const overdue = computed(() => !!soonest.value?.overdue)
const soon = computed(() => !!soonest.value && !overdue.value && soonest.value.ms <= SOON_MS)
const bigLabel = computed(() => {
  const u = soonest.value
  if (!u) return ''
  return u.overdue ? relLabel(u.ms) : countdownClock(u.ms)
})

const accent = computed(() => c.value.accent)
const danger = computed(() => DANGER)

const tileStyle = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    padding: '12px 14px',
    borderRadius: 'var(--radius-dialog)',
    cursor: 'pointer',
    background: c.value.card,
    border:
      '1px solid ' + (overdue.value ? danger.value : soon.value ? accent.value : c.value.border),
    boxShadow: dark.value ? '0 8px 24px rgba(0,0,0,0.25)' : '0 8px 24px rgba(80,90,160,0.1)',
  }),
)
const label = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: c.value.dim,
  }),
)
const bigStyle = computed(() =>
  pxify({
    ...typeStep('lg'),
    fontWeight: 'var(--weight-semibold)',
    fontVariantNumeric: 'tabular-nums',
    color: overdue.value ? danger.value : soon.value ? accent.value : c.value.text,
  }),
)
const titleStyle = computed(() =>
  pxify({
    ...typeStep('sm'),
    color: c.value.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
)
const metaStyle = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim }))
const mainCol = pxify({ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 })
</script>

<template>
  <div
    :style="tileStyle"
    role="button"
    aria-label="Up next reminders"
    @click="ui.setTab('reminders')"
  >
    <div>
      <div :style="label">Up next</div>
      <div v-if="soonest" :style="bigStyle">{{ bigLabel }}</div>
    </div>
    <div :style="mainCol">
      <template v-if="soonest">
        <span :style="titleStyle">{{ soonest.reminder.title }}</span>
        <span :style="metaStyle"> {{ list.length }} due in the next 24h </span>
      </template>
      <template v-else>
        <span :style="titleStyle">Nothing due soon</span>
        <span :style="metaStyle">Next 24 hours are clear</span>
      </template>
    </div>
  </div>
</template>
