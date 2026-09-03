<script setup lang="ts">
// The Trades tab (section 28) — the trade logger.
//
// Everything on this screen is derived. The only stored numbers are the ones
// somebody typed (date, symbol, session, side, lot, entry, exit, note) plus the
// `move` and `pl` Firestore needs to be able to order by; the balance, the
// targets, the calendar's colours and every statistic are computed here from
// the month's rows and recomputed whenever they change. Nothing is accumulated,
// so nothing can drift.
//
// The month is driven by the calendar's own ‹ › navigation rather than by a
// second month control beside it, and the composable re-scopes its listener to
// whatever month is on screen.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import ListToolbar from '@/components/ListToolbar.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import StatRow from '@/components/ui/StatRow.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import FormField from '@/components/ui/FormField.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import TradeCalendar from '@/components/trades/TradeCalendar.vue'
import TradeForm from '@/components/trades/TradeForm.vue'
import TradeTable from '@/components/trades/TradeTable.vue'
import SecuredLedger from '@/components/trades/SecuredLedger.vue'
import { useStyles } from '@/composables/useStyles'
import { useUiStore } from '@/stores/ui'
import { useTradeLog, type NewSecured, type NewTrade } from '@/composables/useTradeLog'
import { useAppStore } from '@/stores/app'
import { downloadText } from '@/utils/noteExport'
import { currentMonthKey, monthLabel } from '@/utils/budget'
import { signTone } from '@/utils/money'
import {
  TRADE_SESSIONS,
  accountTotals,
  dayMetaFor,
  dayTotals,
  fmt2,
  signOf,
  signed2,
  targetProgress,
  todayYmd,
  tradeCsvFilename,
  tradeStats,
  tradesToCsv,
} from '@/utils/tradeMath'
import type { Stat } from '@/components/ui/StatRow.vue'

const app = useAppStore()
const ui = useUiStore()
const { now } = storeToRefs(ui)
const { panelStyle } = useStyles()

// The month on screen and the day the table is filtered to ('' = whole month).
const monthKey = ref(currentMonthKey())
const selectedDay = ref('')
// The symbol the form is on, so the composable can report the contract size in
// force. The form owns the field; this mirrors it for the log, and an empty
// value there falls back to the stored `lastSymbol`.
const symbol = ref('')

const log = useTradeLog(symbol, monthKey)
const { trades, secured, settings, loading, error } = log

// Changing month drops a day filter that belongs to the month we just left.
function onMonth(next: string) {
  if (next === monthKey.value) return
  monthKey.value = next
  selectedDay.value = ''
}

// --- the account -------------------------------------------------------------
const totals = computed(() =>
  accountTotals(trades.value, secured.value, settings.value.startingBalance),
)

// The three labels the spec fixes, in the order it fixes them. Only the profit
// is coloured: a balance and a total withdrawn are amounts, not results.
const accountStats = computed<Stat[]>(() => [
  { label: 'Balance', value: fmt2(totals.value.balance), note: monthLabel(monthKey.value) },
  { label: 'Secured', value: fmt2(totals.value.securedTotal), note: 'taken off the table' },
  {
    label: 'Total profit',
    value: signed2(totals.value.totalProfit),
    tone: signTone(totals.value.totalProfit),
    note: 'trades only',
  },
])

// --- targets -----------------------------------------------------------------
// Off the shared clock rather than a value read at setup: a session left open
// across midnight otherwise reports yesterday as today for the rest of the day.
const today = computed(() => todayYmd(new Date(now.value)))
const todayTotals = computed(() => dayTotals(trades.value, today.value))
const dayProgress = computed(() => targetProgress(todayTotals.value.move, settings.value.dayTarget))
const monthProgress = computed(() =>
  targetProgress(
    trades.value.reduce((sum, t) => sum + t.move, 0),
    settings.value.monthTarget,
  ),
)

// --- the calendar ------------------------------------------------------------
const dayMeta = computed(() => dayMetaFor(trades.value, settings.value.dayTarget))

// --- the table ---------------------------------------------------------------
const visibleTrades = computed(() =>
  selectedDay.value ? trades.value.filter((t) => t.date === selectedDay.value) : trades.value,
)

// --- stats -------------------------------------------------------------------
const stats = computed(() => tradeStats(trades.value))
const statRow = computed<Stat[]>(() => [
  { label: 'Hit rate', value: `${fmt2(stats.value.hitRate)}%`, note: `${stats.value.wins} up` },
  {
    label: 'Avg move',
    value: signed2(stats.value.avgMove),
    tone: signTone(stats.value.avgMove),
    note: `${stats.value.count} trade${stats.value.count === 1 ? '' : 's'}`,
  },
  {
    label: 'Best day',
    value: stats.value.bestDay ? signed2(stats.value.bestDay.pl) : '—',
    tone: stats.value.bestDay ? signTone(stats.value.bestDay.pl) : 'neutral',
    note: stats.value.bestDay?.date ?? 'nothing traded',
  },
  {
    label: 'Worst day',
    value: stats.value.worstDay ? signed2(stats.value.worstDay.pl) : '—',
    tone: stats.value.worstDay ? signTone(stats.value.worstDay.pl) : 'neutral',
    note: stats.value.worstDay?.date ?? 'nothing traded',
  },
  { label: 'Days traded', value: String(stats.value.daysTraded), note: 'this month' },
])

// --- writes ------------------------------------------------------------------
const busy = ref(false)

async function onSubmit(trade: NewTrade) {
  symbol.value = trade.symbol
  busy.value = true
  const ok = await log.addTrade(trade)
  busy.value = false
  if (ok) app.showToastMsg(`Logged ${trade.symbol} ${trade.side === 'buy' ? 'buy' : 'sell'}`)
}

async function onSizeSymbol(payload: { symbol: string; size: number }) {
  symbol.value = payload.symbol
  await log.setContractSize(payload.symbol, payload.size)
}

function onAddSecured(entry: NewSecured) {
  void log.addSecured(entry)
}

/** One setting at a time, saved on blur — there is no Save button to forget. */
function onSetting(field: 'startingBalance' | 'dayTarget' | 'monthTarget' | 'defaultLot') {
  return (value: number | null) => {
    if (value == null || !Number.isFinite(value)) return
    void log.saveSettings({ [field]: value })
  }
}

const showSettings = ref(false)

// --- export ------------------------------------------------------------------
// The same anchor-and-revoke helper the notes and the ledger use; the columns
// are the spec's nine, in its order.
function exportCsv() {
  downloadText(
    tradesToCsv(visibleTrades.value),
    tradeCsvFilename(selectedDay.value || monthKey.value),
    'text/csv;charset=utf-8',
  )
}

// ⌘K and the toolbar's button both land on the entry price.
const form = ref<{ focus: () => void } | null>(null)
defineExpose({ focus: () => form.value?.focus() })
</script>

<template>
  <div :style="panelStyle">
    <ListToolbar title="Trades" new-label="Log trade" @new="form?.focus()">
      <template #actions>
        <Button variant="ghost" size="sm" :disabled="!visibleTrades.length" @click="exportCsv">
          <Icon name="download" size="xs" />
          CSV
        </Button>
        <Button variant="ghost" size="sm" @click="showSettings = !showSettings">
          {{ showSettings ? 'Hide account' : 'Account' }}
        </Button>
      </template>
    </ListToolbar>

    <!-- A rejected write says so here and stays said until it is dismissed;
         a toast about a failed save is gone before it has been read. -->
    <Alert v-if="error" tone="danger" dismissible @dismiss="log.dismissError()">
      {{ error }}
    </Alert>

    <div class="tv__scroll">
      <StatRow :stats="accountStats" size="lg" />

      <section v-if="showSettings" class="tv__settings">
        <FormField label="Starting balance" v-slot="f">
          <NumberInput
            v-bind="f"
            :model-value="settings.startingBalance"
            :step="100"
            @update:model-value="onSetting('startingBalance')($event)"
          />
        </FormField>
        <FormField label="Day target (move)" v-slot="f">
          <NumberInput
            v-bind="f"
            :model-value="settings.dayTarget"
            :step="1"
            :min="0"
            @update:model-value="onSetting('dayTarget')($event)"
          />
        </FormField>
        <FormField label="Month target (move)" v-slot="f">
          <NumberInput
            v-bind="f"
            :model-value="settings.monthTarget"
            :step="1"
            :min="0"
            @update:model-value="onSetting('monthTarget')($event)"
          />
        </FormField>
        <FormField label="Default lot" v-slot="f">
          <NumberInput
            v-bind="f"
            :model-value="settings.defaultLot"
            :step="0.01"
            :min="0"
            @update:model-value="onSetting('defaultLot')($event)"
          />
        </FormField>
      </section>

      <section class="tv__targets">
        <div class="tv__target">
          <div class="tv__targetHead">
            <span class="ui-label">Today · move</span>
            <span class="tv__figure ui-mono" :class="`is-${signOf(dayProgress.move)}`">
              {{ signed2(dayProgress.move) }} / {{ fmt2(dayProgress.target) }}
            </span>
          </div>
          <ProgressBar :value="dayProgress.pct" :label="`Today's move against the day target`" />
          <p class="tv__note">
            {{
              dayProgress.remaining
                ? `${fmt2(dayProgress.remaining)} to go today`
                : 'Day target met'
            }}
          </p>
        </div>
        <div class="tv__target">
          <div class="tv__targetHead">
            <span class="ui-label">Month to date · move</span>
            <span class="tv__figure ui-mono" :class="`is-${signOf(monthProgress.move)}`">
              {{ signed2(monthProgress.move) }} / {{ fmt2(monthProgress.target) }}
            </span>
          </div>
          <ProgressBar
            :value="monthProgress.pct"
            :label="`Month-to-date move against the month target`"
          />
          <p class="tv__note">
            {{
              monthProgress.remaining
                ? `${fmt2(monthProgress.remaining)} still needed this month`
                : 'Month target met'
            }}
          </p>
        </div>
      </section>

      <div class="tv__split">
        <TradeCalendar
          :trades="trades"
          :day-meta="dayMeta"
          :selected="selectedDay"
          @update:selected="selectedDay = $event"
          @month="onMonth"
        />
        <TradeForm
          ref="form"
          :settings="settings"
          :busy="busy"
          @submit="onSubmit"
          @size-symbol="onSizeSymbol"
        />
      </div>

      <Skeleton v-if="loading" :lines="4" />
      <TradeTable
        v-else
        :trades="visibleTrades"
        :empty-title="selectedDay ? `Nothing traded on ${selectedDay}` : 'No trades this month'"
        :empty-description="
          selectedDay
            ? 'Pick the day again on the calendar to see the whole month.'
            : 'Log the first one above — the calendar, the targets and the stats all come from these rows.'
        "
        @delete="log.deleteTrade($event)"
      />

      <section v-if="stats.count" class="tv__stats">
        <StatRow :stats="statRow" />
        <div class="tv__sessions">
          <span class="ui-label">Move by session</span>
          <ul class="tv__sessionList">
            <li v-for="s in TRADE_SESSIONS" :key="s" class="tv__session">
              <span class="tv__sessionName">{{ s }}</span>
              <span class="tv__figure ui-mono" :class="`is-${signOf(stats.bySession[s])}`">
                {{ signed2(stats.bySession[s]) }}
              </span>
            </li>
          </ul>
        </div>
      </section>

      <SecuredLedger
        :entries="secured"
        :total="totals.securedTotal"
        @add="onAddSecured"
        @delete="log.deleteSecured($event)"
      />
    </div>
  </div>
</template>

<style scoped>
/* The stage has a fixed height, so this tab scrolls inside it like every other
   list tab rather than growing the card. */
.tv__scroll {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  padding-right: var(--sp-1);
}
.tv__settings,
.tv__targets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sp-4);
  min-width: 0;
}
.tv__target {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.tv__targetHead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
}
.tv__figure {
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.tv__figure.is-pos {
  color: var(--theme-success);
}
.tv__figure.is-neg {
  color: var(--theme-danger);
}
.tv__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.tv__split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  align-items: start;
  gap: var(--sp-4);
  min-width: 0;
}
.tv__stats {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.tv__sessions {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.tv__sessionList {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.tv__session {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-2);
  border: 1px solid var(--border-subtle, var(--glass-border));
  border-radius: var(--radius-control);
}
.tv__sessionName {
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
</style>
