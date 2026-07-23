<script setup lang="ts">
// A day card's header, and the accordion's handle: the day, how many of its
// items are pending / in progress / done, and a chevron that folds the card.
// Shared by the todo and task lists so a day reads and behaves the same in both.
//
// The counts deliberately describe the whole day, not the filtered subset — a
// day's true shape should not change because you are looking at one status.
import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify, statusStat } from '@/styles'
import { STATUS_CYCLE, STATUS_LABEL, type ItemStatus } from '@/types'
import type { StatusCounts } from '@/utils/dayGroups'

const props = defineProps<{
  label: string
  counts: StatusCounts
  total: number
  open: boolean
}>()
defineEmits<{ (e: 'toggle'): void }>()

const { c, s } = useStyles()

const stats = computed(() =>
  STATUS_CYCLE.map((status: ItemStatus) => ({
    status,
    n: props.counts[status] ?? 0,
    label: STATUS_LABEL[status].toLowerCase(),
    style: pxify(statusStat(c.value, status, (props.counts[status] ?? 0) > 0)),
  })),
)

const chevron = computed(() =>
  pxify({
    fontSize: 10,
    color: c.value.dim,
    // Matches the body's fold so the chevron and the height move as one.
    transform: props.open ? 'rotate(90deg)' : 'none',
    transition: 'transform .55s cubic-bezier(.22,1,.36,1)',
  }),
)
</script>

<template>
  <button
    :style="s.dayGroupHead"
    :aria-expanded="open"
    :title="(open ? 'Collapse ' : 'Expand ') + label"
    @click="$emit('toggle')"
  >
    <span :style="s.dayGroupLabel">
      <span :style="chevron">▶</span>
      <span :style="s.dayGroupLabelBase">{{ label }}</span>
    </span>
    <span :style="s.dayStats">
      <span v-for="st in stats" :key="st.status" :style="st.style">{{ st.n }} {{ st.label }}</span>
      <span :style="s.dayCount">{{ total }} total</span>
    </span>
  </button>
</template>
