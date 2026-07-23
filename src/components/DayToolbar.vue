<script setup lang="ts">
// Sits above the day accordion in both the todo and task tabs: fold every day
// at once, and filter the rows down to one status. The filter hides rows only —
// the per-day tallies keep describing the whole day.
import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify, filterTab } from '@/styles'
import { STATUS_CYCLE, STATUS_LABEL, type ItemStatus } from '@/types'
import type { StatusFilter } from '@/stores/ui'

const props = defineProps<{ filter: StatusFilter; allOpen: boolean; newLabel: string }>()
defineEmits<{ (e: 'filter', v: StatusFilter): void; (e: 'fold'): void; (e: 'new'): void }>()

const { c, s } = useStyles()

const tabs = computed(() =>
  (['all', ...STATUS_CYCLE] as StatusFilter[]).map((v) => ({
    value: v,
    label: v === 'all' ? 'All' : STATUS_LABEL[v as ItemStatus],
    style: pxify(filterTab(c.value, v, props.filter === v)),
  })),
)
</script>

<template>
  <div :style="s.dayToolbar">
    <div :style="s.filterRow">
      <button
        v-for="t in tabs"
        :key="t.value"
        :style="t.style"
        :aria-pressed="filter === t.value"
        @click="$emit('filter', t.value)"
      >
        {{ t.label }}
      </button>
    </div>
    <div :style="s.filterRow">
      <button :style="s.foldBtn" @click="$emit('fold')">
        {{ allOpen ? 'Collapse all' : 'Expand all' }}
      </button>
      <button :style="s.newBtn" v-hover-style="s.addBtnHover" @click="$emit('new')">
        + {{ newLabel }}
      </button>
    </div>
  </div>
</template>
