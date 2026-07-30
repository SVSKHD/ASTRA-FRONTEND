<script setup lang="ts">
// Expenses against a monthly income, in INR. The top card shows income (inline
// editable) and what's left this month — a big, colour-coded number over a
// spend bar that grows/shrinks as expenses are added or removed. A month
// switcher moves between months; income applies per month and carries forward.
//
// Every rupee figure comes from useMonthlyBudget, so this view and any
// dashboard widget agree, and nothing stores a running balance to drift.
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { useMonthlyBudget } from '@/composables/useMonthlyBudget'
import { pxify, rowBase } from '@/styles'
import { CATEGORY_COLOR } from '@/utils/colors'
import { formatINR, parseINR } from '@/utils/currency'
import { currentMonthKey, monthLabel, shiftMonth } from '@/utils/budget'
import ListToolbar from '@/components/ListToolbar.vue'
import OfflineChip from '@/components/OfflineChip.vue'
import type { Finance } from '@/types'

const app = useAppStore()
const { c, s, panelStyle } = useStyles()
const { finances } = storeToRefs(app)

defineExpose({ focus: () => app.openCreate('finance') })

// --- month switcher ---------------------------------------------------------
const monthKey = ref(currentMonthKey())
const monthTitle = computed(() => monthLabel(monthKey.value))
const isCurrentMonth = computed(() => monthKey.value === currentMonthKey())
function prevMonth() {
  monthKey.value = shiftMonth(monthKey.value, -1)
}
function nextMonth() {
  monthKey.value = shiftMonth(monthKey.value, 1)
}

const { income, spent, remaining, percentUsed, byCategory } = useMonthlyBudget(monthKey)

// --- state colour -----------------------------------------------------------
const GREEN = 'oklch(0.72 0.15 150)'
const AMBER = 'oklch(0.8 0.16 72)'
const RED = 'oklch(0.64 0.22 25)'

const remainingPct = computed(() => (income.value > 0 ? (remaining.value / income.value) * 100 : 0))
const isOver = computed(() => remaining.value < 0)
const state = computed<'over' | 'red' | 'amber' | 'green'>(() => {
  if (isOver.value) return 'over'
  if (income.value <= 0) return 'amber'
  const p = remainingPct.value
  if (p < 15) return 'red'
  if (p < 40) return 'amber'
  return 'green'
})
const stateColor = computed(() =>
  state.value === 'green' ? GREEN : state.value === 'amber' ? AMBER : RED,
)

// --- animated remaining number + bar ---------------------------------------
// A count-up/down tween so the number visibly moves when an expense is added or
// removed; the bar width transitions in CSS off the same figures.
const disp = ref(remaining.value)
let raf = 0
watch(remaining, (to) => {
  const from = disp.value
  const start = performance.now()
  const dur = 500
  cancelAnimationFrame(raf)
  const step = (t: number) => {
    const p = Math.min(1, (t - start) / dur)
    const e = 1 - Math.pow(1 - p, 3)
    disp.value = from + (to - from) * e
    if (p < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
})

const bigValue = computed(() =>
  isOver.value ? 'Over by ' + formatINR(Math.abs(disp.value)) : formatINR(disp.value),
)
const bigLabel = computed(() => (isOver.value ? 'Over budget' : 'Remaining this month'))
const barPct = computed(() => Math.max(0, Math.min(100, percentUsed.value)))

// --- expenses for the selected month ----------------------------------------
interface FinRow {
  id: number
  label: string
  meta: string
  amountLabel: string
  color: string
}
const monthExpenses = computed<FinRow[]>(() =>
  finances.value
    .filter((f) => (f.date || '').slice(0, 7) === monthKey.value)
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
      amountLabel: formatINR(f.amount),
      color: CATEGORY_COLOR[f.category] || c.value.dim,
    })),
)
function findFinance(id: number): Finance | undefined {
  return finances.value.find((f) => f.id === id)
}

// --- income editor ----------------------------------------------------------
const incomeOpen = ref(false)
const incomeInput = ref('')
function openIncome() {
  incomeInput.value = income.value > 0 ? String(income.value) : ''
  incomeOpen.value = true
}
function saveIncome() {
  app.setMonthlyIncome(monthKey.value, parseINR(incomeInput.value))
  incomeOpen.value = false
}

// --- styles -----------------------------------------------------------------
const switcherRow = pxify({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
})
const switcherBtn = computed(() =>
  pxify({
    width: 30,
    height: 30,
    borderRadius: 999,
    border: '1px solid ' + c.value.border,
    background: c.value.card,
    color: c.value.text,
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    fontSize: 15,
    lineHeight: 1,
  }),
)
const switcherLabel = computed(() =>
  pxify({ fontSize: 13, fontWeight: 600, color: c.value.text, minWidth: 120, textAlign: 'center' }),
)
const card = computed(() =>
  pxify({
    background: c.value.card,
    border: '1px solid ' + c.value.border,
    borderRadius: 20,
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  }),
)
const incomeRow = pxify({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
})
const incomeCol = pxify({ display: 'flex', flexDirection: 'column', gap: 2 })
const incomeLabel = computed(() =>
  pxify({ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.value.dim }),
)
const incomeValueBtn = computed(() =>
  pxify({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: 'transparent',
    border: 'none',
    color: c.value.text,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    padding: 0,
  }),
)
const editHint = computed(() => pxify({ fontSize: 11, color: c.value.accent, fontWeight: 600 }))
const remainingCol = pxify({ display: 'flex', flexDirection: 'column', gap: 4 })
const bigNumber = computed(() =>
  pxify({
    fontSize: 34,
    fontWeight: 700,
    lineHeight: 1.05,
    color: stateColor.value,
    transition: 'color .3s ease',
  }),
)
const bigLabelStyle = computed(() =>
  pxify({ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: c.value.dim }),
)
const barTrack = computed(() =>
  pxify({
    position: 'relative',
    height: 10,
    borderRadius: 999,
    background: c.value.input,
    overflow: 'hidden',
  }),
)
const barFill = computed(() =>
  pxify({
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: barPct.value + '%',
    borderRadius: 999,
    background:
      'linear-gradient(90deg, ' +
      stateColor.value +
      ' 0%, color-mix(in oklch, ' +
      stateColor.value +
      ' 70%, white) 100%)',
    boxShadow: '0 0 12px ' + stateColor.value,
    transition: 'width .5s cubic-bezier(.4,1,.4,1), background .3s ease',
  }),
)
const barMeta = computed(() =>
  pxify({ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: c.value.dim }),
)
const sectionLabel = computed(() =>
  pxify({
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: c.value.dim,
  }),
)
const catList = pxify({ display: 'flex', flexDirection: 'column', gap: 8 })
const catRow = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    borderRadius: 12,
    background: c.value.card,
    border: '1px solid ' + c.value.border,
  }),
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
const catName = computed(() => pxify({ flex: 1, fontSize: 13, color: c.value.text }))
const catPct = computed(() =>
  pxify({ fontSize: 11, color: c.value.dim, minWidth: 44, textAlign: 'right' }),
)
const catAmount = computed(() =>
  pxify({ fontSize: 13, fontWeight: 600, color: c.value.text, minWidth: 72, textAlign: 'right' }),
)
const row = computed(() => pxify(rowBase(c.value)))

// income dialog input
const incField = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    borderRadius: 14,
    border: '1px solid ' + c.value.accent,
    background: c.value.input,
    overflow: 'hidden',
  }),
)
const incPrefix = computed(() =>
  pxify({ padding: '11px 4px 11px 14px', color: c.value.dim, fontSize: 16 }),
)
const incInput = computed(() =>
  pxify({
    flex: 1,
    minWidth: 0,
    padding: '11px 14px 11px 4px',
    border: 'none',
    background: 'transparent',
    color: c.value.text,
    fontSize: 16,
    outline: 'none',
  }),
)
</script>

<template>
  <div :style="panelStyle">
    <!-- Month switcher -->
    <div :style="switcherRow">
      <button :style="switcherBtn" aria-label="Previous month" @click="prevMonth">‹</button>
      <span :style="switcherLabel">{{ monthTitle }}</span>
      <button
        :style="[switcherBtn, isCurrentMonth ? { opacity: 0.4, cursor: 'default' } : {}]"
        aria-label="Next month"
        :disabled="isCurrentMonth"
        @click="nextMonth"
      >
        ›
      </button>
    </div>

    <!-- Income + remaining -->
    <div :style="card">
      <div :style="incomeRow">
        <div :style="incomeCol">
          <span :style="incomeLabel">Monthly Income</span>
          <button :style="incomeValueBtn" @click="openIncome">
            {{ income > 0 ? formatINR(income) : 'Set income' }}
            <span :style="editHint">Edit</span>
          </button>
        </div>
      </div>

      <div :style="remainingCol">
        <span :style="bigLabelStyle">{{ bigLabel }}</span>
        <span :style="bigNumber">{{ bigValue }}</span>
      </div>

      <div :style="barTrack"><span :style="barFill"></span></div>
      <div :style="barMeta">
        <span>Spent {{ formatINR(spent) }}</span>
        <span>of {{ income > 0 ? formatINR(income) : '—' }}</span>
      </div>
    </div>

    <!-- Category breakdown -->
    <template v-if="byCategory.length">
      <span :style="sectionLabel">By category</span>
      <div :style="catList">
        <div v-for="cat in byCategory" :key="cat.category" :style="catRow">
          <span :style="dotStyle(CATEGORY_COLOR[cat.category] || c.dim)"></span>
          <span :style="catName">{{ cat.category }}</span>
          <span :style="catPct">{{ Math.round(cat.pct) }}%</span>
          <span :style="catAmount">{{ formatINR(cat.total) }}</span>
        </div>
      </div>
    </template>

    <!-- Expenses this month -->
    <ListToolbar title="Expenses" new-label="New expense" @new="app.openCreate('finance')" />
    <div v-if="monthExpenses.length === 0" :style="s.empty">No expenses in {{ monthTitle }}.</div>
    <div :style="s.list">
      <div v-for="it in monthExpenses" :key="it.id" :style="row" v-hover-style="s.rowHover">
        <span :style="dotStyle(it.color)"></span>
        <div :style="s.taskMain" @click="app.openEdit('finance', it.id)">
          <span :style="s.finNote">{{ it.label }}</span>
          <span :style="s.finMeta">{{ it.meta }}</span>
          <OfflineChip :pending="app.isItemPending('finance', it.id)" />
        </div>
        <span :style="s.amount">{{ it.amountLabel }}</span>
        <button :style="s.shareBtn" @click="app.share('finance', findFinance(it.id)!)">↗</button>
        <button :style="s.del" @click="app.deleteWithUndo('finances', 'finance', it.id)">×</button>
      </div>
    </div>

    <!-- Income editor -->
    <template v-if="incomeOpen">
      <div :style="s.dialogOverlay" @click="incomeOpen = false"></div>
      <div :style="s.shareCard" @keydown.enter="saveIncome" @keydown.esc="incomeOpen = false">
        <span :style="s.drawerTitle">Monthly income · {{ monthTitle }}</span>
        <div :style="incField">
          <span :style="incPrefix">₹</span>
          <input
            :style="incInput"
            type="number"
            min="0"
            inputmode="numeric"
            placeholder="0"
            :value="incomeInput"
            @input="incomeInput = ($event.target as HTMLInputElement).value"
          />
        </div>
        <div :style="s.dialogActions">
          <button :style="s.cancelBtn" @click="incomeOpen = false">Cancel</button>
          <button :style="s.saveBtn" @click="saveIncome">Save</button>
        </div>
      </div>
    </template>
  </div>
</template>
