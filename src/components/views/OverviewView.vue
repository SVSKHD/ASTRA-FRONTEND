<script setup lang="ts">
// The Overview tab: a month selector driving four fulfilment cards
// (Tasks / Todos / Reminders / Finances) and a per-metric comparison against
// the previous month. One monthKey ref drives everything; it persists to the
// URL (?month=YYYY-MM) and localStorage so a reload keeps the view.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useAppStore } from '@/stores/app'
import { storeToRefs } from 'pinia'
import { botDisplayStatus } from '@/utils/bots'
import { debtSummary, monthTotals } from '@/utils/finance'
import { useStyles } from '@/composables/useStyles'
import { useMonthlyOverview } from '@/composables/useMonthlyOverview'
import { pxify, typeStep } from '@/styles'
import { formatINR } from '@/utils/currency'
import { bucketPct, type Bucket, type MonthlyOverview } from '@/utils/overview'
import { currentMonthKey, monthLabel, shiftMonth } from '@/utils/budget'
import MonthPicker from '@/components/MonthPicker.vue'
import OverviewUpNext from '@/components/OverviewUpNext.vue'
import GoalsDashboardCard from '@/components/GoalsDashboardCard.vue'
import RepoDashboardCard from '@/components/RepoDashboardCard.vue'
import WalletsDashboardCard from '@/components/WalletsDashboardCard.vue'
import type { TabKey } from '@/types'
import Icon from '@/components/ui/Icon.vue'
import type { IconName } from '@/components/ui/icons'

const ui = useUiStore()
const { c, panelStyle } = useStyles()
const route = useRoute()
const router = useRouter()

// This tab can be focused by the keyboard shortcuts; nothing to focus here.
defineExpose({ focus: () => {} })

const STORE_KEY = 'aureon:overviewMonth'
const CURRENT = currentMonthKey()
const validMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)

// Initial month: URL query wins, then localStorage, then the current month.
function initialMonth(): string {
  const q = route.query.month
  if (validMonth(q)) return q > CURRENT ? CURRENT : q
  try {
    const stored = localStorage.getItem(STORE_KEY)
    if (validMonth(stored)) return stored > CURRENT ? CURRENT : stored
  } catch {
    /* ignore */
  }
  return CURRENT
}
const monthKey = ref(initialMonth())

// Persist to URL + localStorage on change.
watch(monthKey, (m) => {
  try {
    localStorage.setItem(STORE_KEY, m)
  } catch {
    /* ignore */
  }
  void router.replace({ query: { ...route.query, month: m } })
})

const isCurrent = computed(() => monthKey.value === CURRENT)
const prevLabelShort = computed(() => monthLabel(shiftMonth(monthKey.value, -1)).split(' ')[0])
function resetToCurrent() {
  monthKey.value = CURRENT
}

const { overview, previous } = useMonthlyOverview(monthKey)

// --- cards ------------------------------------------------------------------
const GREEN = 'oklch(0.72 0.15 150)'
const AMBER = 'oklch(0.8 0.16 72)'
const RED = 'oklch(0.64 0.22 25)'
const monthName = computed(() => monthLabel(monthKey.value).split(' ')[0])

interface CardModel {
  key: string
  label: string
  tab: TabKey
  bucket: Bucket
  prev: Bucket
  fulfilled: number
  ofText: string
  pct: number
  barColor: string
  zero: boolean
  zeroText: string
}

const financeState = computed(() => {
  const spent = fin.value.out
  const income = fin.value.income
  const remaining = income - spent
  if (remaining < 0) return { color: RED, over: true }
  const remPct = income > 0 ? (remaining / income) * 100 : 0
  if (income <= 0) return { color: AMBER, over: false }
  if (remPct < 15) return { color: RED, over: false }
  if (remPct < 40) return { color: AMBER, over: false }
  return { color: GREEN, over: false }
})

const cards = computed<CardModel[]>(() => {
  const o = overview.value
  const p = previous.value
  return [
    {
      key: 'tasks',
      label: 'Tasks',
      tab: 'tasks',
      bucket: o.tasks,
      prev: p.tasks,
      fulfilled: o.tasks.done,
      ofText: 'of ' + o.tasks.total,
      pct: bucketPct(o.tasks),
      barColor: c.value.accent,
      zero: o.tasks.total === 0,
      zeroText: 'No tasks due in ' + monthName.value,
    },
    {
      key: 'todos',
      label: 'Todos',
      tab: 'todo',
      bucket: o.todos,
      prev: p.todos,
      fulfilled: o.todos.done,
      ofText: 'of ' + o.todos.total,
      pct: bucketPct(o.todos),
      barColor: c.value.accent,
      zero: o.todos.total === 0,
      zeroText: 'No todos due in ' + monthName.value,
    },
    {
      key: 'reminders',
      label: 'Reminders',
      tab: 'reminders',
      bucket: o.reminders,
      prev: p.reminders,
      fulfilled: o.reminders.done,
      ofText: 'of ' + o.reminders.total,
      pct: bucketPct(o.reminders),
      barColor: c.value.accent,
      zero: o.reminders.total === 0,
      zeroText: 'No reminders in ' + monthName.value,
    },
    {
      key: 'finances',
      label: 'Finances',
      tab: 'finances',
      bucket: { done: 0, total: 0 },
      prev: { done: 0, total: 0 },
      fulfilled: 0,
      ofText: '',
      pct:
        fin.value.income > 0
          ? Math.min(100, Math.round((fin.value.out / fin.value.income) * 100))
          : fin.value.out > 0
            ? 100
            : 0,
      barColor: financeState.value.color,
      zero: fin.value.income === 0 && fin.value.out === 0 && fin.value.in === 0,
      zeroText: 'No finances in ' + monthName.value,
    },
  ]
})

// Comparison %: fulfilment for buckets, % of income used for finance.
function metricPct(cardKey: string, o: MonthlyOverview): number | null {
  if (cardKey === 'finances') {
    if (o.finance.income <= 0) return null
    return Math.round((o.finance.spent / o.finance.income) * 100)
  }
  const b = cardKey === 'tasks' ? o.tasks : cardKey === 'todos' ? o.todos : o.reminders
  return b.total > 0 ? bucketPct(b) : null
}
function comparison(cardKey: string): { dir: 'up' | 'down' | 'flat'; delta: number } | null {
  const now = metricPct(cardKey, overview.value)
  const before = metricPct(cardKey, previous.value)
  if (now === null || before === null) return null
  const delta = now - before
  return { dir: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat', delta: Math.abs(delta) }
}

function goTo(tab: TabKey) {
  ui.setTab(tab)
}

// --- fifth card: Bots -------------------------------------------------------
const app = useAppStore()
const { bots } = storeToRefs(app)
const { now } = storeToRefs(ui)
const botsRunning = computed(() => {
  void now.value
  return bots.value.filter((b) => botDisplayStatus(b, now.value) === 'running').length
})
const botsPct = computed(() =>
  bots.value.length ? Math.round((botsRunning.value / bots.value.length) * 100) : 0,
)
const botsPl = computed(() => bots.value.reduce((sum, b) => sum + (b.realizedPl || 0), 0))
function fmtUsd(n: number): string {
  return (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US')
}

// Scope-aware finance figures for the finance card, derived from the unified
// transactions collection (post-migration) rather than the frozen legacy array.
const { transactions, debts, finScope } = storeToRefs(app)
const fin = computed(() => {
  const t = monthTotals(transactions.value, finScope.value, monthKey.value)
  const baseline = app.baselineIncome(finScope.value, monthKey.value)
  const income = baseline || t.incomeReceived
  const ds = debtSummary(debts.value, finScope.value, now.value)
  return { in: t.incomeReceived, out: t.out, net: t.net, income, overdue: ds.overdueCount }
})
function fmtSignedInr(n: number): string {
  return (n >= 0 ? '+' : '−') + formatINR(Math.abs(n))
}

// --- styles -----------------------------------------------------------------
const headerRow = pxify({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  flexWrap: 'wrap',
})
const resetChip = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid ' + c.value.accent,
    background: 'transparent',
    color: c.value.accent,
    cursor: 'pointer',
  }),
)
// A 2×2 grid of separate floating tiles (not four stretched across), with wide
// gaps so they read as distinct objects.
const gridStyle = computed(() =>
  pxify({
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 20,
  }),
)
const cardBase = computed(() => ({
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 8,
  padding: '18px 18px 15px',
  borderRadius: 18,
  background: c.value.card,
  border: '1px solid ' + c.value.border,
  // Its own shadow so each tile floats separately from its neighbours.
  boxShadow: c.value.shadow,
  cursor: 'pointer',
  minWidth: 0,
  transition: 'transform .2s ease, box-shadow .25s ease, border-color .25s ease',
}))
// Staggered mount: fade + rise, 40ms per card.
function cardStyleFor(i: number) {
  return pxify({
    ...cardBase.value,
    animation: 'fadeUp .4s ease both',
    animationDelay: i * 40 + 'ms',
  })
}
const cardHover = computed(() =>
  pxify({
    transform: 'translateY(-4px)',
    boxShadow: '0 18px 40px rgba(0,0,0,0.30)',
    borderColor: c.value.accent,
  }),
)
const cardTop = pxify({ display: 'flex', alignItems: 'center', gap: 8 })
const cardLabel = computed(() =>
  pxify({
    ...typeStep('xs'),
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: c.value.dim,
  }),
)
const bigNum = computed(() =>
  pxify({
    ...typeStep('xl'),
    fontWeight: 'var(--weight-semibold)',
    color: c.value.text,
    lineHeight: 1.05,
  }),
)
const ofStyle = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim }))
const zeroStyle = computed(() => pxify({ ...typeStep('sm'), color: c.value.dim, padding: '6px 0' }))
function trackStyle() {
  return pxify({
    position: 'relative',
    height: 6,
    borderRadius: 999,
    background: c.value.input,
    overflow: 'hidden',
  })
}
function fillStyle(pct: number, color: string) {
  return pxify({
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: Math.max(0, Math.min(100, pct)) + '%',
    borderRadius: 999,
    background: color,
    boxShadow: '0 0 8px ' + color,
    transition: 'width .5s cubic-bezier(.4,1,.4,1), background .3s ease',
  })
}
const pctStyle = computed(() =>
  pxify({ ...typeStep('xs'), color: c.value.dim, alignSelf: 'flex-end' }),
)
const iconWrap = computed(() =>
  pxify({ color: c.value.accent, display: 'grid', placeItems: 'center' }),
)

const compareRow = computed(() =>
  pxify({ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }),
)
function compareLineStyle(dir: 'up' | 'down' | 'flat') {
  return pxify({
    ...typeStep('xs'),
    color: dir === 'up' ? GREEN : dir === 'down' ? RED : c.value.dim,
  })
}

// Which icon each summary card carries. A lookup rather than a chain of
// template branches: the icon set is one component now, so choosing an icon is
// choosing a name (section 21e).
const CARD_ICONS: Record<string, IconName> = {
  tasks: 'list',
  todos: 'check-square',
  reminders: 'bell',
  finances: 'rupee',
}
function cardIcon(key: string): IconName {
  return CARD_ICONS[key] ?? 'list'
}
</script>

<template>
  <div :style="panelStyle">
    <div :style="headerRow">
      <MonthPicker v-model="monthKey" />
      <button v-if="!isCurrent" type="button" :style="resetChip" @click="resetToCurrent">
        This month
      </button>
    </div>

    <OverviewUpNext />

    <GoalsDashboardCard />

    <RepoDashboardCard />

    <WalletsDashboardCard />

    <div :style="gridStyle">
      <div
        v-for="(card, idx) in cards"
        :key="card.key"
        :style="cardStyleFor(idx)"
        v-hover-style="cardHover"
        role="button"
        :aria-label="'Open ' + card.label + ' for ' + monthName"
        @click="goTo(card.tab)"
      >
        <div :style="cardTop">
          <span :style="iconWrap">
            <Icon :name="cardIcon(card.key)" size="sm" :style="{ color: c.accent }" />
          </span>
          <span :style="cardLabel">{{ card.label }}</span>
        </div>

        <template v-if="card.zero">
          <span :style="zeroStyle">{{ card.zeroText }}</span>
        </template>
        <template v-else-if="card.key === 'finances'">
          <span :style="bigNum">{{ formatINR(fin.out) }}</span>
          <span :style="ofStyle">
            {{ financeState.over ? 'over ' : 'of ' }}{{ formatINR(fin.income) }}
          </span>
          <div :style="trackStyle()"><span :style="fillStyle(card.pct, card.barColor)"></span></div>
          <span :style="pctStyle">
            In {{ formatINR(fin.in) }} · Net {{ fmtSignedInr(fin.net) }}
            <template v-if="fin.overdue">
              · <span :style="{ color: RED }">{{ fin.overdue }} debt overdue</span></template
            >
          </span>
        </template>
        <template v-else>
          <span :style="bigNum">{{ card.fulfilled }}</span>
          <span :style="ofStyle">{{ card.ofText }} done</span>
          <div :style="trackStyle()"><span :style="fillStyle(card.pct, card.barColor)"></span></div>
          <span :style="pctStyle">{{ card.pct }}% complete</span>
        </template>
      </div>

      <!-- Fifth card: Bots — N running · today's P/L. Tapping opens the Bots tab. -->
      <div
        :style="cardStyleFor(cards.length)"
        v-hover-style="cardHover"
        role="button"
        aria-label="Open Bots"
        @click="goTo('bots')"
      >
        <div :style="cardTop">
          <span :style="iconWrap">
            <Icon name="bot" size="sm" :style="{ color: c.accent }" />
          </span>
          <span :style="cardLabel">Bots</span>
        </div>
        <template v-if="!bots.length">
          <span :style="zeroStyle">No bots connected</span>
        </template>
        <template v-else>
          <span :style="bigNum">{{ botsRunning }}</span>
          <span :style="ofStyle">of {{ bots.length }} running</span>
          <div :style="trackStyle()"><span :style="fillStyle(botsPct, c.accent)"></span></div>
          <span :style="pctStyle">today {{ fmtUsd(botsPl) }}</span>
        </template>
      </div>
    </div>

    <!-- comparison vs previous month -->
    <div :style="compareRow">
      <template v-for="card in cards" :key="'cmp-' + card.key">
        <span v-if="comparison(card.key)" :style="compareLineStyle(comparison(card.key)!.dir)">
          {{
            comparison(card.key)!.dir === 'up'
              ? '▲'
              : comparison(card.key)!.dir === 'down'
                ? '▼'
                : '·'
          }}
          {{ comparison(card.key)!.delta }}% {{ card.label }} vs {{ prevLabelShort }}
        </span>
      </template>
    </div>
  </div>
</template>
