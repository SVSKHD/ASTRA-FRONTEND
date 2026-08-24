<script setup lang="ts">
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
// Finances — reworked around scopes (Personal / Business / All), a unified
// income+expense transaction list, debts, and first-class tags. Sub-tabs inside
// the stage: Overview · Transactions · Debts · Tags. Everything derives from the
// pure selectors in utils/finance so nothing leaks across scopes and no running
// total is stored. Every figure goes through money() → formatCurrency().
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useDraft } from '@/composables/useDraft'
import { pxify, typeStep } from '@/styles'
import { formatMinor, parseMoney, signTone, valueColor } from '@/utils/money'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Tabs from '@/components/ui/Tabs.vue'
import StatRow from '@/components/ui/StatRow.vue'
import Button from '@/components/ui/Button.vue'
import type { Stat } from '@/components/ui/StatRow.vue'
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
  monthOf,
  isOverdue,
  monthTotals,
  principalMinor,
  tagBreakdown,
  txnMinor,
} from '@/utils/finance'
import MonthPicker from '@/components/MonthPicker.vue'
import QuickAddRow, { type QuickAddDraft } from '@/components/finance/QuickAddRow.vue'
import TransactionList from '@/components/finance/TransactionList.vue'
import TxnFilters from '@/components/finance/TxnFilters.vue'
import { applyFilters, isFiltered, signedMinor } from '@/utils/txnList'
import type { Debt, FinScope, ScopeFilter, Txn } from '@/types'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'

const app = useAppStore()
const { c, panelStyle } = useStyles()
const { transactions, debts, finScope, txnCategories, txnFilters, financeTags } = storeToRefs(app)
const { now } = storeToRefs(useUiStore())
const route = useRoute()
const router = useRouter()

defineExpose({ focus: () => {} })

const GOOD = 'oklch(0.72 0.15 150)'
const AMBER = 'oklch(0.8 0.16 72)'
const RED = 'oklch(0.64 0.22 25)'

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
    .sort((a, b) => txnMinor(b) - txnMinor(a)),
)

// The list is the month, narrowed by the saved filters. The tab's own scope
// switch still wins over the filter's scope — a filter should not be able to
// contradict the control the reader is looking at.
const listTxns = computed(() =>
  applyFilters(filterTxns(transactions.value, { scope: scope.value, monthKey: monthKey.value }), {
    ...txnFilters.value,
    scope: scope.value,
    tags: activeTags.value,
  }),
)

const activeTags = computed(() =>
  tagFilter.value && !txnFilters.value.tags.includes(tagFilter.value)
    ? [...txnFilters.value.tags, tagFilter.value]
    : txnFilters.value.tags,
)

const listIsFiltered = computed(
  () => isFiltered({ ...txnFilters.value, scope: 'all' }) || Boolean(tagFilter.value),
)

/**
 * Everything before this month, netted — so the running balance in a month view
 * continues from where the account actually stood rather than restarting at
 * zero and implying it was empty on the 1st.
 */
const openingBalance = computed(() =>
  filterTxns(transactions.value, { scope: scope.value })
    .filter((t) => monthOf(t.date) < monthKey.value)
    .reduce((sum, t) => sum + signedMinor(t), 0),
)

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
const txnForm = ref<Record<string, string>>({
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
  // Parsed straight to integer paise: the rupee float exists only as the string
  // the user typed, and never as a stored number (acceptance 143).
  const amountMinor = parseMoney(String(txnForm.value.amount ?? ''))
  if (!amountMinor || amountMinor <= 0) return
  const tags = String(txnForm.value.tags ?? '')
    .split(',')
    .map((x) => app.ensureFinTag(x))
    .filter(Boolean)
  app.addTxn({
    kind: txnForm.value.kind as Txn['kind'],
    amountMinor,
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

// --- quick add (section 27b) -------------------------------------------------
// The last category and method are remembered so the common case needs no
// choosing. They live here rather than in the row because the row is
// stateless — it is handed its defaults and hands back a draft.
const lastCategory = ref('')
const lastMethod = ref<Txn['method']>(undefined)

function quickAdd(draft: QuickAddDraft): void {
  if (draft.amountMinor <= 0) return
  app.addTxn({
    kind: draft.kind,
    amountMinor: draft.amountMinor,
    date: draft.date,
    note: draft.note,
    category: draft.category || (draft.kind === 'income' ? 'Income' : 'Other'),
    method: draft.method ?? undefined,
    tags: draft.tags.map((t) => app.ensureFinTag(t)).filter(Boolean),
    scope: scope.value === 'all' ? 'personal' : (scope.value as FinScope),
  })
  if (draft.category) lastCategory.value = draft.category
  if (draft.method) lastMethod.value = draft.method
}

// --- add-debt form ----------------------------------------------------------
const showDebtForm = ref(false)
const debtForm = ref<Record<string, string>>({
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
  const principalMinor = parseMoney(String(debtForm.value.principal ?? ''))
  if (!String(debtForm.value.counterparty ?? '').trim() || !principalMinor) return
  app.addDebt({
    direction: debtForm.value.direction as Debt['direction'],
    counterparty: String(debtForm.value.counterparty),
    principalMinor,
    interestRatePct: Number(debtForm.value.interestRatePct) || undefined,
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
  const amountMinor = parseMoney(payAmount.value[d.id] || '')
  if (!amountMinor || amountMinor <= 0) return
  app.recordDebtPayment(d.id, { amountMinor, date: todayInMonth() })
  payAmount.value = { ...payAmount.value, [d.id]: '' }
}

function daysUntil(due: string): number {
  const d = Date.parse(due + 'T23:59:59')
  if (Number.isNaN(d)) return 0
  return Math.round((d - now.value) / 86_400_000)
}
function fmtSigned(n: number): string {
  return money(n, true)
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
// ---- the stat rows (section 26c) ------------------------------------------
// Values are neutral unless their sign is the information. "In" and "Out" are
// labels, not judgements: an outflow is not a bad number, it is the number the
// label says it is. Only Net gets a tone.
const flowStats = computed<Stat[]>(() => [
  { label: 'In', value: money(totals.value.incomeReceived) },
  { label: 'Out', value: money(totals.value.out) },
  {
    label: 'Net',
    value: money(totals.value.net, true),
    tone: signTone(totals.value.net),
  },
])

const incomeStats = computed<Stat[]>(() => [
  { label: 'Expected', value: money(baseline.value) },
  { label: 'Received', value: money(totals.value.incomeReceived) },
  { label: 'Extra', value: money(extra.value, true), tone: signTone(extra.value) },
])

const debtStats = computed<Stat[]>(() => [
  { label: 'I owe', value: money(debtSum.value.iOwe) },
  { label: 'Owed to me', value: money(debtSum.value.owedToMe) },
  { label: 'Net', value: money(debtSum.value.net, true), tone: signTone(debtSum.value.net) },
])

// Every figure on this tab is an integer count of paise, so there is exactly
// one formatter and it takes minor units. A call site that divided by 100 first
// would be the float back again, just later.
const money = (n: number, signed = false) => formatMinor(n, { signed })

// The hero. Its colour follows the sign of what it shows and nothing else:
// "over budget" is a negative remaining, so the sign already carries it, and
// zero is neither good nor bad.
const heroAmount = computed(() =>
  isBusiness.value
    ? totals.value.net
    : balance.value.over
      ? -balance.value.overBy
      : balance.value.remaining,
)
const heroValue = computed(() =>
  !isBusiness.value && balance.value.over
    ? 'Over by ' + money(balance.value.overBy)
    : money(heroAmount.value),
)
const heroColor = computed(() => valueColor(heroAmount.value))

// A month with nothing in it gets a sentence and a way out, not four rows of
// zeros dressed as data (section 26d, rule 5).
const monthIsEmpty = computed(
  () =>
    filterTxns(transactions.value, { scope: scope.value, monthKey: monthKey.value }).length === 0,
)

const SCOPES = [
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business' },
  { value: 'all', label: 'All' },
]
const SUBTABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'debts', label: 'Debts' },
  { value: 'tags', label: 'Tags' },
]

const heroRow = pxify({
  display: 'flex',
  alignItems: 'baseline',
  gap: 'var(--sp-3)',
  flexWrap: 'wrap',
  minWidth: 0,
})
const marginChip = computed(() =>
  pxify({
    ...typeStep('xs'),
    padding: '2px var(--sp-2)',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + c.value.border,
    color: c.value.text,
    whiteSpace: 'nowrap',
  }),
)
const overdueChip = computed(() =>
  pxify({
    ...typeStep('xs'),
    padding: '2px var(--sp-2)',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid var(--theme-danger)',
    color: c.value.text,
    whiteSpace: 'nowrap',
  }),
)
const emptyLine = computed(() => pxify({ ...typeStep('base'), margin: 0, color: c.value.text }))

const stackBar = pxify({
  display: 'flex',
  height: 10,
  borderRadius: 'var(--radius-pill)',
  overflow: 'hidden',
  gap: 1,
})
const catColors = [
  GOOD,
  AMBER,
  'oklch(0.74 0.13 250)',
  'oklch(0.72 0.16 320)',
  'oklch(0.7 0.13 190)',
  RED,
]

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
      <!-- Two axes, two shapes (section 26c). Identical pills for both made it
           look like one seven-option choice: scope is which money, sub-tab is
           which view of it, and a reader cannot tell that from styling alone. -->
      <SegmentedControl
        :model-value="scope"
        :options="SCOPES"
        size="sm"
        aria-label="Which money"
        @update:model-value="setScope($event as typeof scope)"
      />
      <Tabs
        :model-value="subtab"
        :tabs="SUBTABS"
        @update:model-value="subtab = $event as typeof subtab"
      />
      <span :style="spacer"></span>
      <MonthPicker v-model="monthKey" />
    </div>

    <div :style="body">
      <!-- ============ OVERVIEW ============ -->
      <template v-if="subtab === 'overview'">
        <!-- A month with nothing in it gets a sentence and a way out, not four
             rows of zeros dressed as data (section 26d, rule 5). -->
        <div v-if="monthIsEmpty" :style="card">
          <span :style="label">{{ isBusiness ? 'Net profit' : 'Remaining' }}</span>
          <p :style="emptyLine">Nothing recorded this month yet.</p>
          <div :style="{ display: 'flex', gap: 'var(--sp-2)' }">
            <Button variant="primary" size="sm" @click="openTxnForm('expense')"
              >Add transaction</Button
            >
            <Button variant="ghost" size="sm" @click="openTxnForm('income')">Add income</Button>
          </div>
        </div>

        <template v-else>
          <div :style="card">
            <div :style="{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }">
              <span :style="label">{{ isBusiness ? 'Net profit' : 'Remaining' }}</span>
              <span :style="spacer"></span>
              <button
                :style="ghostBtn"
                @click="basis = basis === 'baseline' ? 'received' : 'baseline'"
              >
                {{ basis === 'baseline' ? 'Against baseline' : 'Against received' }}
              </button>
            </div>

            <!-- Hero and margin share one baseline: the margin was a floating
                 grey line under the figure it qualifies. -->
            <div :style="heroRow">
              <span :style="[big, { color: heroColor }]">{{ heroValue }}</span>
              <span v-if="isBusiness" :style="marginChip">Margin {{ marginPct }}%</span>
            </div>

            <div v-if="segments.length" :style="stackBar">
              <span
                v-for="(seg, i) in segments"
                :key="seg.category"
                :style="{ width: seg.pct + '%', background: catColors[i % catColors.length] }"
                :title="seg.category + ' ' + money(seg.total)"
              ></span>
            </div>

            <StatRow :stats="flowStats" />
          </div>

          <div :style="card">
            <div :style="{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }">
              <span :style="label">{{ isBusiness ? 'Monthly revenue target' : 'Income' }}</span>
              <span :style="spacer"></span>
              <button :style="ghostBtn" @click="openTxnForm('income')">＋ Add income</button>
            </div>
            <StatRow :stats="incomeStats" />
            <div
              v-if="extraIncomeList.length"
              :style="{ display: 'flex', flexDirection: 'column', gap: '4px' }"
            >
              <div
                v-for="t in extraIncomeList"
                :key="t.id"
                :style="{
                  display: 'flex',
                  gap: 'var(--sp-3)',
                  ...typeStep('xs'),
                  alignItems: 'center',
                }"
              >
                <span :style="strong">{{ money(txnMinor(t)) }}</span>
                <span :style="scopeChip">{{ t.source || 'Other' }}</span>
                <span :style="sub">{{ t.note }}</span>
              </div>
            </div>
          </div>

          <!-- Debts get the same card as the two above. A borderless
               full-width bar reads as a row left over from another layout. -->
          <div :style="card">
            <div :style="{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }">
              <span :style="label">Debts</span>
              <span :style="spacer"></span>
              <span v-if="debtSum.overdueCount" :style="overdueChip"
                >{{ debtSum.overdueCount }} overdue</span
              >
            </div>
            <StatRow :stats="debtStats" />
          </div>
        </template>
      </template>

      <!-- ============ TRANSACTIONS ============ -->
      <template v-else-if="subtab === 'transactions'">
        <!-- Always visible, at the top, autofocused (section 27b). The point is
             one number and Enter: the detailed form below is for the row that
             needs a source or a counterparty, not for the ₹40 chai. -->
        <QuickAddRow
          :categories="txnCategories"
          :last-category="lastCategory"
          :last-method="lastMethod"
          @add="quickAdd"
          @create-category="app.ensureTxnCategory($event)"
        />

        <TxnFilters
          :model-value="txnFilters"
          :categories="txnCategories"
          :tags="financeTags.map((t) => t.name)"
          :show-scope="false"
          @update:model-value="app.setTxnFilters($event)"
          @clear="app.clearTxnFilters()"
        />

        <div :style="{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }">
          <button :style="ghostBtn" @click="openTxnForm('expense')">More fields…</button>
        </div>

        <div v-if="showTxnForm" :style="card">
          <div :style="label">New {{ txnForm.kind }}</div>
          <div :style="formGrid">
            <TextInput v-model="txnForm.amount" placeholder="Amount ₹" inputmode="decimal" />
            <GlassDatePicker
              :model-value="String(txnForm.date ?? '')"
              size="sm"
              placeholder="Date"
              @update:model-value="txnForm.date = String($event ?? '')"
            />
            <TextInput
              v-model="txnForm.category"
              :placeholder="txnForm.kind === 'income' ? 'Income' : 'Category'"
            />
            <Select
              v-if="txnForm.kind === 'income'"
              v-model="txnForm.source"
              :options="[...SOURCES.map((src) => ({ value: String(src), label: src }))]"
            />
            <TextInput v-model="txnForm.party" placeholder="Party (optional)" />
            <TextInput v-model="txnForm.tags" placeholder="tags, comma-separated" />
          </div>
          <TextInput v-model="txnForm.note" placeholder="Note" />
          <div :style="{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }">
            <button :style="ghostBtn" @click="showTxnForm = false">Cancel</button>
            <button :style="miniBtn" @click="submitTxn">Add</button>
          </div>
        </div>

        <TransactionList
          :transactions="listTxns"
          :categories="txnCategories"
          :opening-minor="openingBalance"
          :filtered="listIsFiltered"
          :show-scope="scope === 'all'"
          @edit="openTxnForm('expense')"
          @remove="app.deleteTxn($event)"
          @tag="filterByTag"
          @clear-filters="app.clearTxnFilters()"
          @add="openTxnForm('expense')"
        />
      </template>

      <!-- ============ DEBTS ============ -->
      <template v-else-if="subtab === 'debts'">
        <div :style="summaryStrip">
          <span
            >Total I owe <span :style="strong">{{ money(debtSum.iOwe) }}</span></span
          >
          <span
            >Owed to me <span :style="strong">{{ money(debtSum.owedToMe) }}</span></span
          >
          <span
            >Net position
            <span :style="[strong, { color: valueColor(debtSum.net) }]">{{
              fmtSigned(debtSum.net)
            }}</span></span
          >
          <span v-if="debtSum.overdueCount" :style="overdueChip"
            >{{ debtSum.overdueCount }} overdue</span
          >
          <span :style="spacer"></span>
          <button :style="ghostBtn" @click="showDebtForm = !showDebtForm">＋ Add debt</button>
        </div>

        <div v-if="showDebtForm" :style="card">
          <div :style="formGrid">
            <Select
              v-model="debtForm.direction"
              :options="[
                { value: 'owed_by_me', label: 'I owe' },
                { value: 'owed_to_me', label: 'Owed to me' },
              ]"
            />
            <TextInput v-model="debtForm.counterparty" placeholder="Counterparty" />
            <TextInput v-model="debtForm.principal" placeholder="Principal ₹" inputmode="decimal" />
            <TextInput
              v-model="debtForm.interestRatePct"
              placeholder="Interest % (opt)"
              inputmode="decimal"
            />
            <Select
              v-model="debtForm.interestType"
              :options="[
                { value: 'none', label: 'No interest' },
                { value: 'simple', label: 'Simple' },
                { value: 'compound', label: 'Compound' },
              ]"
            />
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
              <span :style="big">{{ money(debtOutstanding(d, now)) }}</span>
              <span :style="sub"
                >of {{ money(principalMinor(d))
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
                <TextInput v-model="payAmount[d.id]" placeholder="Payment ₹" inputmode="decimal" />
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
              <span :style="big">{{ money(debtOutstanding(d, now)) }}</span>
              <span :style="sub">of {{ money(principalMinor(d)) }}</span>
              <div :style="{ display: 'flex', gap: '6px' }">
                <TextInput v-model="payAmount[d.id]" placeholder="Received ₹" inputmode="decimal" />
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
              <td :style="td">{{ money(row.spent) }}</td>
              <td :style="td">{{ money(row.earned) }}</td>
              <td :style="[td, { color: valueColor(row.net) }]">{{ fmtSigned(row.net) }}</td>
              <td :style="td">{{ row.count }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>
  </div>
</template>
