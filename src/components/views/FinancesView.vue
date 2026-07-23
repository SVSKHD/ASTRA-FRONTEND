<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, rowBase } from '@/styles'
import { CATEGORY_COLOR } from '@/utils/colors'
import ListToolbar from '@/components/ListToolbar.vue'
import type { Finance } from '@/types'

const app = useAppStore()
const { c, s, panelStyle } = useStyles()
const { finances } = storeToRefs(app)

// Create and edit both live in ItemDialog now, so N / ⌘K opens that rather
// than focusing a form this tab no longer carries.
defineExpose({ focus: () => app.openCreate('finance') })

const money = (n: number) => '$' + n.toFixed(2)

const totals = computed(() => {
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 6)
  weekAgo.setHours(0, 0, 0, 0)
  const ym = new Date().toISOString().slice(0, 7)
  let wk = 0
  let mo = 0
  finances.value.forEach((f) => {
    const fd = new Date(f.date + 'T00:00:00')
    if (fd >= weekAgo) wk += f.amount
    if (f.date.slice(0, 7) === ym) mo += f.amount
  })
  return { wk, mo }
})

// Animated count-up of the totals.
const dispWeek = ref(totals.value.wk)
const dispMonth = ref(totals.value.mo)
let raf = 0
watch(
  totals,
  (t) => {
    const fromWk = dispWeek.value
    const fromMo = dispMonth.value
    const start = performance.now()
    const dur = 500
    cancelAnimationFrame(raf)
    const step = (nowTs: number) => {
      const p = Math.min(1, (nowTs - start) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      dispWeek.value = fromWk + (t.wk - fromWk) * e
      dispMonth.value = fromMo + (t.mo - fromMo) * e
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  },
  { deep: true },
)

const weekTotal = computed(() => money(dispWeek.value))
const monthTotal = computed(() => money(dispMonth.value))

interface FinView {
  id: number
  label: string
  meta: string
  amountLabel: string
  color: string
}
const view = computed<FinView[]>(() =>
  [...finances.value]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
    .map((f) => ({
      id: f.id,
      label: f.note || f.category,
      meta:
        f.category +
        ' · ' +
        new Date(f.date + 'T00:00:00').toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        }),
      amountLabel: money(f.amount),
      color: CATEGORY_COLOR[f.category] || c.value.dim,
    })),
)

function dotStyle(color: string) {
  return pxify({
    width: 9,
    height: 9,
    borderRadius: '50%',
    flexShrink: 0,
    background: color,
    boxShadow: '0 0 8px ' + color,
  })
}
function findFinance(id: number): Finance | undefined {
  return finances.value.find((f) => f.id === id)
}
const row = computed(() => pxify(rowBase(c.value)))
</script>

<template>
  <div :style="panelStyle">
    <div :style="s.totalsRow">
      <div :style="s.totalCard">
        <span :style="s.totalLabel">This Week</span><span :style="s.totalVal">{{ weekTotal }}</span>
      </div>
      <div :style="s.totalCard">
        <span :style="s.totalLabel">This Month</span
        ><span :style="s.totalVal">{{ monthTotal }}</span>
      </div>
    </div>
    <ListToolbar title="Spending" new-label="New entry" @new="app.openCreate('finance')" />
    <div v-if="finances.length === 0" :style="s.empty">No expenses logged.</div>
    <div :style="s.list">
      <div v-for="it in view" :key="it.id" :style="row" v-hover-style="s.rowHover">
        <span :style="dotStyle(it.color)"></span>
        <div :style="s.taskMain" @click="app.openEdit('finance', it.id)">
          <span :style="s.finNote">{{ it.label }}</span>
          <span :style="s.finMeta">{{ it.meta }}</span>
        </div>
        <span :style="s.amount">{{ it.amountLabel }}</span>
        <button :style="s.shareBtn" @click="app.share('finance', findFinance(it.id)!)">↗</button>
        <button :style="s.del" @click="app.deleteWithUndo('finances', 'finance', it.id)">×</button>
      </div>
    </div>
  </div>
</template>
