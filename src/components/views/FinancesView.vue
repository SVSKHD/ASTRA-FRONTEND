<script setup lang="ts">
// Finances — reworked around scopes (Personal / Business / All), a unified
// income+expense transaction list, debts, and first-class tags. Sub-tabs inside
// the stage: Overview · Transactions · Debts · Tags. Everything derives from the
// pure selectors in utils/finance so nothing leaks across scopes and no running
// total is stored. INR throughout via formatINR().
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useDraft } from '@/composables/useDraft'
import { pxify, typeStep } from '@/styles'
import { formatINR, parseINR } from '@/utils/currency'
import { currentMonthKey } from '@/utils/budget'
import {
  balanceState,
  categoryOutflow,
  debtOutstanding,
  debtPaid,
  debtSummary,
  effectiveDebtStatus,
  extraIncome,
  filterTxns,
  isOverdue,
  monthTotals,
  tagBreakdown,
} from '@/utils/finance'
import MonthPicker from '@/components/MonthPicker.vue'
import type { Debt, FinScope, ScopeFilter, Txn } from '@/types'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'

const app = useAppStore()
const { c, s, panelStyle } = useStyles()
const { transactions, debts, finScope } = storeToRefs(app)
const { now } = storeToRefs(useUiStore())
const route = useRoute()
const router = useRouter()

defineExpose({ focus: () => {} })

const GOOD = 'oklch(0.72 0.15 150)'
const AMBER = 'oklch(0.8 0.16 72)'
const RED = 'oklch(0.64 0.22 25)'
const levelColor = { good: GOOD, warn: AMBER, bad: RED, over: RED }

// --- scope + month + sub-tab (URL-synced) ----------------------------------
const CURRENT = currentMonthKey()
const validMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)
const monthKey = ref(validMonth(route.query.month) ? String(route.query.month) : CURRENT)
if (
  route.query.scope === 'business' ||
  route.query.scope === 'all' ||
  route.query.scope === 'personal'
) {
  app.setFinScope(route.query.scope)
}
const subtab = ref<'overview' | 'transactions' | 'debts' | 'tags'>('overview')
const scope = computed<ScopeFilter>(() => finScope.value)
const isBusiness = computed(() => scope.value === 'business')

watch([monthKey, scope], ([m, sc]) => {
  void router.replace({ query: { ...route.query, month: m, scope: sc } })
})
function setScope(sc: ScopeFilter) {
  app.setFinScope(sc)
}

// Tag filter from the Tags tab / a tag chip.
const tagFilter = ref<string>('')
function filterByTag(name: string) {
  tagFilter.value = name
  subtab.value = 'transactions'
}

// --- derived figures --------------------------------------------------------
const totals = computed(() => monthTotals(transactions.value, scope.value, monthKey.value))
const baseline = computed(() => app.baselineIncome(scope.value, monthKey.value))
const basis = ref<'baseline' | 'received'>(
  (localStorage.getItem('aureon:finBasis') as 'baseline' | 'received') || 'baseline',
)
watch(basis, (b) => {
  try {
    localStorage.setItem('aureon:finBasis', b)
  } catch {
    /* ignore */
  }
})
const incomeBasis = computed(() =>
  basis.value === 'received' ? totals.value.incomeReceived : baseline.value,
)
const balance = computed(() => balanceState(incomeBasis.value, totals.value.out))
const extra = computed(() => extraIncome(totals.value.incomeReceived, baseline.value))
const segments = computed(() => categoryOutflow(transactions.value, scope.value, monthKey.value))
const tagRows = computed(() => tagBreakdown(transactions.value, scope.value, monthKey.value))
const debtSum = computed(() => debtSummary(debts.value, scope.value, now.value))
const marginPct = computed(() =>
  totals.value.incomeReceived > 0
    ? Math.round((totals.value.net / totals.value.incomeReceived) * 100)
    : 0,
)

// Extra-income list: received income beyond the baseline, largest first.
const extraIncomeList = computed(() =>
  filterTxns(transactions.value, { scope: scope.value, monthKey: monthKey.value, kind: 'income' })
    .filter((t) => t.confirmed !== false)
    .sort((a, b) => b.amount - a.amount),
)

const kindFilter = ref<'all' | 'income' | 'expense'>('all')
const monthTxns = computed(() => {
  let list = filterTxns(transactions.value, { scope: scope.value, monthKey: monthKey.value })
  if (tagFilter.value) list = list.filter((t) => t.tags.includes(tagFilter.value))
  if (kindFilter.value !== 'all') list = list.filter((t) => t.kind === kindFilter.value)
  return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
})

// Group transactions by day with a per-day net subtotal.
const txnDays = computed(() => {
  const groups = new Map<string, Txn[]>()
  for (const t of monthTxns.value) {
    const arr = groups.get(t.date) || []
    arr.push(t)
    groups.set(t.date, arr)
  }
  return [...groups.entries()].map(([date, items]) => ({
    date,
    items,
    net: items.reduce((sum, t) => sum + (t.kind === 'income' ? t.amount : -t.amount), 0),
  }))
})

const monthDebts = computed(() =>
  debts.value.filter((d) => scope.value === 'all' || d.scope === scope.value),
)
const iOweDebts = computed(() => monthDebts.value.filter((d) => d.direction === 'owed_by_me'))
const owedToMeDebts = computed(() => monthDebts.value.filter((d) => d.direction === 'owed_to_me'))

function todayInMonth(): string {
  return monthKey.value === CURRENT
    ? new Date(now.value).toISOString().slice(0, 10)
    : monthKey.value + '-01'
}

// --- add-transaction form ---------------------------------------------------
const showTxnForm = ref(false)
const txnForm = ref<Record<string, unknown>>({
  kind: 'expense',
  amount: '',
  date: CURRENT + '-01',
  note: '',
  category: '',
  source: '',
  party: '',
  tags: '',
})
useDraft('transaction', null, txnForm, {
  isEmpty: (p) => !String(p.amount ?? '').trim() && !String(p.note ?? '').trim(),
})
function openTxnForm(kind: 'income' | 'expense') {
  txnForm.value = { ...txnForm.value, kind, date: todayInMonth() }
  showTxnForm.value = true
}
function submitTxn() {
  const amount = parseINR(String(txnForm.value.amount ?? ''))
  if (!amount || amount <= 0) return
  const tags = String(txnForm.value.tags ?? '')
    .split(',')
    .map((x) => app.ensureFinTag(x))
    .filter(Boolean)
  app.addTxn({
    kind: txnForm.value.kind as Txn['kind'],
    amount,
    date: String(txnForm.value.date || todayInMonth()),
    note: String(txnForm.value.note ?? ''),
    category: String(
      txnForm.value.category || (txnForm.value.kind === 'income' ? 'Income' : 'Other'),
    ),
    source: txnForm.value.kind === 'income' ? String(txnForm.value.source || 'Other') : undefined,
    party: String(txnForm.value.party ?? '') || undefined,
    tags,
    scope: scope.value === 'all' ? 'personal' : (scope.value as FinScope),
  })
  txnForm.value = {
    kind: txnForm.value.kind,
    amount: '',
    date: todayInMonth(),
    note: '',
    category: '',
    source: '',
    party: '',
    tags: '',
  }
  showTxnForm.value = false
}

// --- add-debt form ----------------------------------------------------------
const showDebtForm = ref(false)
const debtForm = ref<Record<string, unknown>>({
  direction: 'owed_by_me',
  counterparty: '',
  principal: '',
  interestRatePct: '',
  interestType: 'none',
  startDate: todayInMonth(),
  dueDate: '',
  note: '',
})
useDraft('debt', null, debtForm, {
  isEmpty: (p) => !String(p.counterparty ?? '').trim() && !String(p.principal ?? '').trim(),
})
function submitDebt() {
  const principal = parseINR(String(debtForm.value.principal ?? ''))
  if (!String(debtForm.value.counterparty ?? '').trim() || !principal) return
  app.addDebt({
    direction: debtForm.value.direction as Debt['direction'],
    counterparty: String(debtForm.value.counterparty),
    principal,
    interestRatePct: parseINR(String(debtForm.value.interestRatePct ?? '')) || undefined,
    interestType: debtForm.value.interestType as Debt['interestType'],
    startDate: String(debtForm.value.startDate || todayInMonth()),
    dueDate: String(debtForm.value.dueDate ?? '') || undefined,
    note: String(debtForm.value.note ?? ''),
    scope: scope.value === 'all' ? 'personal' : (scope.value as FinScope),
  })
  debtForm.value = {
    direction: 'owed_by_me',
    counterparty: '',
    principal: '',
    interestRatePct: '',
    interestType: 'none',
    startDate: todayInMonth(),
    dueDate: '',
    note: '',
  }
  showDebtForm.value = false
}

// Per-debt payment input.
const payAmount = ref<Record<number, string>>({})
function recordPayment(d: Debt) {
  const amt = parseINR(payAmount.value[d.id] || '')
  if (!amt || amt <= 0) return
  app.recordDebtPayment(d.id, { amount: amt, date: todayInMonth() })
  payAmount.value = { ...payAmount.value, [d.id]: '' }
}

function daysUntil(due: string): number {
  const d = Date.parse(due + 'T23:59:59')
  if (Number.isNaN(d)) return 0
  return Math.round((d - now.value) / 86_400_000)
}
function fmtSigned(n: number): string {
  return (n >= 0 ? '+' : '−') + formatINR(Math.abs(n))
}

// Tags table sorting.
const tagSort = ref<'spent' | 'earned' | 'net' | 'count' | 'name'>('spent')
const sortedTagRows = computed(() =>
  [...tagRows.value].sort((a, b) =>
    tagSort.value === 'name'
      ? a.name.localeCompare(b.name)
      : (b[tagSort.value] as number) - (a[tagSort.value] as number),
  ),
)

const SOURCES = [
  'Salary',
  'Client payment',
  'Freelance',
  'Interest',
  'Dividend',
  'Rent',
  'Refund',
  'Gift',
  'Sale',
  'Other',
]

// --- styles -----------------------------------------------------------------
const header = pxify({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--sp-3)',
  flexWrap: 'wrap',
})
function pill(active: boolean) {
  return pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '6px 12px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + (active ? c.value.accent : c.value.border),
    background: active ? c.value.accent : 'transparent',
    color: active ? c.value.onAccent : c.value.dim,
    cursor: 'pointer',
  })
}
const pillRow = pxify({ display: 'flex', gap: 'var(--sp-2)' })
const spacer = pxify({ flex: 1 })
const body = pxify({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-4)',
  paddingTop: 14,
})
const card = computed(() =>
  pxify({
    padding: 18,
    borderRadius: 'var(--radius-dialog)',
    background: c.value.card,
    border: '1px solid ' + c.value.border,
    boxShadow: c.value.shadow,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-3)',
  }),
)
const label = computed(() =>
  pxify({
    ...typeStep('2xs'),
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: c.value.dim,
  }),
)
const big = computed(() =>
  pxify({
    ...typeStep('2xl'),
    fontWeight: 'var(--weight-semibold)',
    color: c.value.text,
    lineHeight: 1,
  }),
)
const sub = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim }))
const strong = computed(() => pxify({ color: c.value.text, fontWeight: 'var(--weight-semibold)' }))
const stackBar = pxify({
  display: 'flex',
  height: 10,
  borderRadius: 'var(--radius-pill)',
  overflow: 'hidden',
  gap: 1,
})
const rowLine = pxify({ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap', ...typeStep('sm') })
const catColors = [
  GOOD,
  AMBER,
  'oklch(0.74 0.13 250)',
  'oklch(0.72 0.16 320)',
  'oklch(0.7 0.13 190)',
  RED,
]

const inp = computed(() => s.value.input)
const miniBtn = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '8px 14px',
    borderRadius: 'var(--radius-pill)',
    border: 'none',
    background: c.value.accent,
    color: c.value.onAccent,
    cursor: 'pointer',
  }),
)
const ghostBtn = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '8px 14px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.text,
    cursor: 'pointer',
  }),
)
function tagChip(name: string) {
  const t = app.financeTags.find((x) => x.name === name)
  return pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-pill)',
    background: (t?.color || c.value.accent) + '22',
    color: t?.color || c.value.accent,
    cursor: 'pointer',
  })
}
const scopeChip = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-pill)',
    background: c.value.input,
    color: c.value.dim,
  }),
)
const formGrid = pxify({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
  gap: 'var(--sp-2)',
})
const dayHead = computed(() =>
  pxify({
    display: 'flex',
    justifyContent: 'space-between',
    ...typeStep('xs'),
    color: c.value.dim,
    padding: '6px 2px 2px',
    borderBottom: '1px solid ' + c.value.border,
  }),
)
const txnRow = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    padding: '8px 4px',
    ...typeStep('sm'),
    borderBottom: '1px solid ' + c.value.border,
  }),
)
const table = pxify({ width: '100%', borderCollapse: 'collapse', ...typeStep('xs') })
const th = computed(() =>
  pxify({
    textAlign: 'left',
    padding: '6px 8px',
    color: c.value.dim,
    borderBottom: '1px solid ' + c.value.border,
    cursor: 'pointer',
    fontWeight: 'var(--weight-semibold)',
  }),
)
const td = computed(() =>
  pxify({ padding: '6px 8px', color: c.value.text, borderBottom: '1px solid ' + c.value.border }),
)
const twoCol = pxify({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 'var(--sp-4)',
})
const summaryStrip = computed(() =>
  pxify({
    display: 'flex',
    gap: 'var(--sp-4)',
    flexWrap: 'wrap',
    alignItems: 'center',
    padding: '12px 16px',
    borderRadius: 'var(--radius-dialog)',
    background: c.value.input,
    ...typeStep('sm'),
  }),
)
const debtCard = computed(() =>
  pxify({
    padding: 14,
    borderRadius: 'var(--radius-dialog)',
    background: c.value.card,
    border: '1px solid ' + c.value.border,
    boxShadow: c.value.shadow,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-2)',
  }),
)
</script>

<template>
  <div :style="panelStyle">
    <!-- header: scope + sub-tabs + month -->
    <div :style="header">
      <div :style="pillRow">
        <button :style="pill(scope === 'personal')" @click="setScope('personal')">Personal</button>
        <button :style="pill(scope === 'business')" @click="setScope('business')">Business</button>
        <button :style="pill(scope === 'all')" @click="setScope('all')">All</button>
      </div>
      <div :style="pillRow">
        <button
          v-for="t in ['overview', 'transactions', 'debts', 'tags']"
          :key="t"
          :style="pill(subtab === t)"
          @click="subtab = t as typeof subtab"
        >
          {{ t[0].toUpperCase() + t.slice(1) }}
        </button>
      </div>
      <span :style="spacer"></span>
      <MonthPicker v-model="monthKey" />
    </div>

    <div :style="body">
      <!-- ============ OVERVIEW ============ -->
      <template v-if="subtab === 'overview'">
        <div :style="card">
          <div :style="{ display: 'flex', alignItems: 'baseline', gap: '10px' }">
            <span :style="label">{{ isBusiness ? 'Net profit' : 'Remaining' }}</span>
            <span :style="spacer"></span>
            <button
              :style="ghostBtn"
              @click="basis = basis === 'baseline' ? 'received' : 'baseline'"
            >
              {{ basis === 'baseline' ? 'Against baseline' : 'Against received' }}
            </button>
          </div>
          <span :style="[big, { color: balance.over ? RED : levelColor[balance.level] }]">
            {{
              isBusiness
                ? formatINR(totals.net)
                : balance.over
                  ? 'Over by ' + formatINR(balance.overBy)
                  : formatINR(balance.remaining)
            }}
          </span>
          <span v-if="isBusiness" :style="sub">Margin {{ marginPct }}%</span>
          <div v-if="segments.length" :style="stackBar">
            <span
              v-for="(seg, i) in segments"
              :key="seg.category"
              :style="{ width: seg.pct + '%', background: catColors[i % catColors.length] }"
              :title="seg.category + ' ' + formatINR(seg.total)"
            ></span>
          </div>
          <div :style="rowLine">
            <span
              >In
              <span :style="[strong, { color: GOOD }]">{{
                formatINR(totals.incomeReceived)
              }}</span></span
            >
            <span
              >Out <span :style="[strong, { color: RED }]">{{ formatINR(totals.out) }}</span></span
            >
            <span
              >Net
              <span :style="[strong, { color: totals.net >= 0 ? GOOD : RED }]">{{
                fmtSigned(totals.net)
              }}</span></span
            >
          </div>
        </div>

        <div :style="card">
          <div :style="{ display: 'flex', alignItems: 'center', gap: '10px' }">
            <span :style="label">{{ isBusiness ? 'Monthly revenue target' : 'Income' }}</span>
            <span :style="spacer"></span>
            <button :style="ghostBtn" @click="openTxnForm('income')">＋ Add income</button>
          </div>
          <div :style="rowLine">
            <span
              >Expected <span :style="strong">{{ formatINR(baseline) }}</span></span
            >
            <span
              >Received <span :style="strong">{{ formatINR(totals.incomeReceived) }}</span></span
            >
            <span
              >Extra
              <span :style="[strong, { color: c.accent }]">{{ formatINR(extra) }}</span></span
            >
          </div>
          <div
            v-if="extraIncomeList.length"
            :style="{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }"
          >
            <div
              v-for="t in extraIncomeList"
              :key="t.id"
              :style="{ display: 'flex', gap: '10px', ...typeStep('xs'), alignItems: 'center' }"
            >
              <span :style="{ color: GOOD, fontWeight: 'var(--weight-semibold)' }">{{
                formatINR(t.amount)
              }}</span>
              <span :style="scopeChip">{{ t.source || 'Other' }}</span>
              <span :style="sub">{{ t.note }}</span>
            </div>
          </div>
        </div>

        <div :style="summaryStrip">
          <span
            >I owe
            <span :style="[strong, { color: RED }]">{{ formatINR(debtSum.iOwe) }}</span></span
          >
          <span
            >Owed to me
            <span :style="[strong, { color: GOOD }]">{{ formatINR(debtSum.owedToMe) }}</span></span
          >
          <span
            >Net
            <span :style="[strong, { color: debtSum.net >= 0 ? GOOD : RED }]">{{
              fmtSigned(debtSum.net)
            }}</span></span
          >
          <span
            v-if="debtSum.overdueCount"
            :style="{ color: RED, fontWeight: 'var(--weight-semibold)' }"
            >{{ debtSum.overdueCount }} overdue</span
          >
        </div>
      </template>

      <!-- ============ TRANSACTIONS ============ -->
      <template v-else-if="subtab === 'transactions'">
        <div :style="{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }">
          <button :style="miniBtn" @click="openTxnForm('expense')">＋ Add expense</button>
          <button :style="ghostBtn" @click="openTxnForm('income')">＋ Add income</button>
          <span :style="spacer"></span>
          <button
            v-for="k in ['all', 'income', 'expense']"
            :key="k"
            :style="pill(kindFilter === k)"
            @click="kindFilter = k as typeof kindFilter"
          >
            {{ k[0].toUpperCase() + k.slice(1) }}
          </button>
          <span v-if="tagFilter" :style="tagChip(tagFilter)" @click="tagFilter = ''"
            >#{{ tagFilter }} ✕</span
          >
        </div>

        <div v-if="showTxnForm" :style="card">
          <div :style="label">New {{ txnForm.kind }}</div>
          <div :style="formGrid">
            <input
              :style="inp"
              v-model="txnForm.amount"
              placeholder="Amount ₹"
              inputmode="decimal"
            />
            <GlassDatePicker
              :model-value="String(txnForm.date ?? '')"
              size="sm"
              placeholder="Date"
              @update:model-value="txnForm.date = String($event ?? '')"
            />
            <input
              :style="inp"
              v-model="txnForm.category"
              :placeholder="txnForm.kind === 'income' ? 'Income' : 'Category'"
            />
            <select v-if="txnForm.kind === 'income'" :style="inp" v-model="txnForm.source">
              <option v-for="src in SOURCES" :key="src" :value="src">{{ src }}</option>
            </select>
            <input :style="inp" v-model="txnForm.party" placeholder="Party (optional)" />
            <input :style="inp" v-model="txnForm.tags" placeholder="tags, comma-separated" />
          </div>
          <input :style="inp" v-model="txnForm.note" placeholder="Note" />
          <div :style="{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }">
            <button :style="ghostBtn" @click="showTxnForm = false">Cancel</button>
            <button :style="miniBtn" @click="submitTxn">Add</button>
          </div>
        </div>

        <div v-if="!txnDays.length" :style="sub">No transactions in this month.</div>
        <div v-for="day in txnDays" :key="day.date">
          <div :style="dayHead">
            <span>{{ day.date }}</span>
            <span :style="{ color: day.net >= 0 ? GOOD : RED }">{{ fmtSigned(day.net) }}</span>
          </div>
          <div v-for="t in day.items" :key="t.id" :style="txnRow">
            <span
              :style="{
                color: t.kind === 'income' ? GOOD : c.text,
                fontWeight: 'var(--weight-semibold)',
                minWidth: '92px',
              }"
            >
              {{ t.kind === 'income' ? '+' : '−' }}{{ formatINR(t.amount) }}
            </span>
            <span :style="{ flex: 1, minWidth: 0 }">
              {{ t.note || t.category }}<span v-if="t.party" :style="sub"> · {{ t.party }}</span>
            </span>
            <span :style="scopeChip">{{ t.category }}</span>
            <span v-for="tg in t.tags" :key="tg" :style="tagChip(tg)" @click="filterByTag(tg)"
              >#{{ tg }}</span
            >
            <span v-if="scope === 'all'" :style="scopeChip">{{ t.scope }}</span>
            <button
              :style="{
                background: 'transparent',
                border: 'none',
                color: c.dim,
                cursor: 'pointer',
              }"
              @click="app.deleteTxn(t.id)"
            >
              ×
            </button>
          </div>
        </div>
      </template>

      <!-- ============ DEBTS ============ -->
      <template v-else-if="subtab === 'debts'">
        <div :style="summaryStrip">
          <span
            >Total I owe
            <span :style="[strong, { color: RED }]">{{ formatINR(debtSum.iOwe) }}</span></span
          >
          <span
            >Owed to me
            <span :style="[strong, { color: GOOD }]">{{ formatINR(debtSum.owedToMe) }}</span></span
          >
          <span
            >Net position
            <span :style="[strong, { color: debtSum.net >= 0 ? GOOD : RED }]">{{
              fmtSigned(debtSum.net)
            }}</span></span
          >
          <span
            v-if="debtSum.overdueCount"
            :style="{ color: RED, fontWeight: 'var(--weight-semibold)' }"
            >{{ debtSum.overdueCount }} overdue</span
          >
          <span :style="spacer"></span>
          <button :style="ghostBtn" @click="showDebtForm = !showDebtForm">＋ Add debt</button>
        </div>

        <div v-if="showDebtForm" :style="card">
          <div :style="formGrid">
            <select :style="inp" v-model="debtForm.direction">
              <option value="owed_by_me">I owe</option>
              <option value="owed_to_me">Owed to me</option>
            </select>
            <input :style="inp" v-model="debtForm.counterparty" placeholder="Counterparty" />
            <input
              :style="inp"
              v-model="debtForm.principal"
              placeholder="Principal ₹"
              inputmode="decimal"
            />
            <input
              :style="inp"
              v-model="debtForm.interestRatePct"
              placeholder="Interest % (opt)"
              inputmode="decimal"
            />
            <select :style="inp" v-model="debtForm.interestType">
              <option value="none">No interest</option>
              <option value="simple">Simple</option>
              <option value="compound">Compound</option>
            </select>
            <GlassDatePicker
              :model-value="String(debtForm.startDate ?? '')"
              size="sm"
              placeholder="Start date"
              @update:model-value="debtForm.startDate = String($event ?? '')"
            />
            <GlassDatePicker
              :model-value="String(debtForm.dueDate ?? '')"
              size="sm"
              :min="String(debtForm.startDate ?? '') || null"
              placeholder="Due date"
              @update:model-value="debtForm.dueDate = String($event ?? '')"
            />
          </div>
          <div :style="{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }">
            <button :style="ghostBtn" @click="showDebtForm = false">Cancel</button>
            <button :style="miniBtn" @click="submitDebt">Add debt</button>
          </div>
        </div>

        <div :style="twoCol">
          <div :style="{ display: 'flex', flexDirection: 'column', gap: '10px' }">
            <div :style="label">I owe</div>
            <div v-if="!iOweDebts.length" :style="sub">Nothing owed.</div>
            <div v-for="d in iOweDebts" :key="d.id" :style="debtCard">
              <div :style="{ display: 'flex', alignItems: 'center', gap: '8px' }">
                <span :style="strong">{{ d.counterparty }}</span>
                <span v-if="scope === 'all'" :style="scopeChip">{{ d.scope }}</span>
                <span :style="spacer"></span>
                <span
                  v-if="d.dueDate"
                  :style="{
                    ...typeStep('xs'),
                    fontWeight: 'var(--weight-semibold)',
                    color: isOverdue(d, now) ? RED : c.dim,
                  }"
                >
                  {{ isOverdue(d, now) ? 'overdue' : 'in ' + daysUntil(d.dueDate) + 'd' }}
                </span>
              </div>
              <span :style="big">{{ formatINR(debtOutstanding(d, now)) }}</span>
              <span :style="sub"
                >of {{ formatINR(d.principal)
                }}<span v-if="d.interestRatePct">
                  · {{ d.interestRatePct }}% {{ d.interestType }}</span
                ></span
              >
              <div
                :style="{
                  height: '6px',
                  borderRadius: '999px',
                  background: c.input,
                  overflow: 'hidden',
                }"
              >
                <div
                  :style="{
                    height: '100%',
                    width:
                      Math.min(100, Math.round((debtPaid(d) / (d.principal || 1)) * 100)) + '%',
                    background: c.accent,
                  }"
                ></div>
              </div>
              <span :style="scopeChip">{{ effectiveDebtStatus(d, now) }}</span>
              <div :style="{ display: 'flex', gap: '6px' }">
                <input
                  :style="inp"
                  v-model="payAmount[d.id]"
                  placeholder="Payment ₹"
                  inputmode="decimal"
                />
                <button :style="miniBtn" @click="recordPayment(d)">Pay</button>
                <button :style="ghostBtn" @click="app.settleDebt(d.id)">Settle</button>
              </div>
            </div>
          </div>
          <div :style="{ display: 'flex', flexDirection: 'column', gap: '10px' }">
            <div :style="label">Owed to me</div>
            <div v-if="!owedToMeDebts.length" :style="sub">Nothing owed to you.</div>
            <div v-for="d in owedToMeDebts" :key="d.id" :style="debtCard">
              <div :style="{ display: 'flex', alignItems: 'center', gap: '8px' }">
                <span :style="strong">{{ d.counterparty }}</span>
                <span :style="spacer"></span>
                <span
                  v-if="d.dueDate"
                  :style="{
                    ...typeStep('xs'),
                    fontWeight: 'var(--weight-semibold)',
                    color: isOverdue(d, now) ? RED : c.dim,
                  }"
                >
                  {{ isOverdue(d, now) ? 'overdue' : 'in ' + daysUntil(d.dueDate) + 'd' }}
                </span>
              </div>
              <span :style="big">{{ formatINR(debtOutstanding(d, now)) }}</span>
              <span :style="sub">of {{ formatINR(d.principal) }}</span>
              <div :style="{ display: 'flex', gap: '6px' }">
                <input
                  :style="inp"
                  v-model="payAmount[d.id]"
                  placeholder="Received ₹"
                  inputmode="decimal"
                />
                <button :style="miniBtn" @click="recordPayment(d)">Receive</button>
                <button :style="ghostBtn" @click="app.settleDebt(d.id)">Settle</button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ============ TAGS ============ -->
      <template v-else>
        <div v-if="!tagRows.length" :style="sub">No tagged transactions this month.</div>
        <table v-else :style="table">
          <thead>
            <tr>
              <th :style="th" @click="tagSort = 'name'">Tag</th>
              <th :style="th" @click="tagSort = 'spent'">Spent</th>
              <th :style="th" @click="tagSort = 'earned'">Earned</th>
              <th :style="th" @click="tagSort = 'net'">Net</th>
              <th :style="th" @click="tagSort = 'count'">#</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in sortedTagRows"
              :key="row.name"
              style="cursor: pointer"
              @click="filterByTag(row.name)"
            >
              <td :style="td">
                <span :style="tagChip(row.name)">#{{ row.name }}</span>
              </td>
              <td :style="[td, { color: RED }]">{{ formatINR(row.spent) }}</td>
              <td :style="[td, { color: GOOD }]">{{ formatINR(row.earned) }}</td>
              <td :style="[td, { color: row.net >= 0 ? GOOD : RED }]">{{ fmtSigned(row.net) }}</td>
              <td :style="td">{{ row.count }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>
  </div>
</template>
