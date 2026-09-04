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
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import StatRow from '@/components/ui/StatRow.vue'
import FormField from '@/components/ui/FormField.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import TextInput from '@/components/ui/TextInput.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import IconExport from '@/components/icons/IconExport.vue'
import IconTargetHit from '@/components/icons/IconTargetHit.vue'
import IconTargetMissed from '@/components/icons/IconTargetMissed.vue'
import IconSessionAsia from '@/components/icons/IconSessionAsia.vue'
import IconSessionLondon from '@/components/icons/IconSessionLondon.vue'
import IconSessionNy from '@/components/icons/IconSessionNy.vue'
import AccountBlock from '@/components/trades/AccountBlock.vue'
import TradeCalendar from '@/components/trades/TradeCalendar.vue'
import TradeForm from '@/components/trades/TradeForm.vue'
import TradeTable from '@/components/trades/TradeTable.vue'
import TradeHours from '@/components/trades/TradeHours.vue'
import TradeSkeleton from '@/components/trades/TradeSkeleton.vue'
import SecuredLedger from '@/components/trades/SecuredLedger.vue'
import { useStyles } from '@/composables/useStyles'
import { useUiStore } from '@/stores/ui'
import { useTradeLog, type NewSecured, type NewTrade } from '@/composables/useTradeLog'
import { MAX_ATTEMPTS } from '@/services/outbox'
import { IST, instantFromWall, offsetLabel, offsetAt } from '@/utils/tradeTime'
import { useAppStore } from '@/stores/app'
import { downloadText } from '@/utils/noteExport'
import { currentMonthKey, monthLabel } from '@/utils/budget'
import { signTone } from '@/utils/money'
import {
  TRADE_SESSIONS,
  accountTotals,
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
import type { TradeSession } from '@/types'

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
const { trades, secured, settings, loading, error, outbox, rowState, brokerClock, untimed } = log

// --- the two clocks (section 31) ----------------------------------------------
// The month's first midnight IST, which is what the hour strip reads the broker
// axis at: a month is shown on the offset that month had, not on today's.
const monthStart = computed(
  () => instantFromWall(IST, `${monthKey.value}-01`, '00:00') ?? Date.now(),
)
const brokerLabel = computed(
  () =>
    `${settings.value.brokerTimezone || 'fixed offset'} · GMT${offsetLabel(
      offsetAt(brokerClock.value, monthStart.value),
    )}`,
)
// Off by default: UTC is the column you turn on to settle an argument with a
// broker, not one that earns its width every day.
const showUtc = ref(false)

const backfilled = ref(0)
async function onBackfill() {
  backfilled.value = await log.backfillTimes()
  if (backfilled.value) {
    app.showToastMsg(`Gave ${backfilled.value} row${backfilled.value === 1 ? '' : 's'} a time`)
  }
}

/** One session boundary at a time, saved as it is picked. */
function onBound(field: 'asia' | 'london' | 'ny' | 'nyEnd') {
  return (value: string) => {
    if (!/^\d{2}:\d{2}$/.test(value)) return
    void log.saveSettings({ sessionBounds: { ...settings.value.sessionBounds, [field]: value } })
  }
}

// --- delivery (section 30) ----------------------------------------------------
// A trade is captured the moment it is typed; whether it has reached the server
// is a separate fact, and this is where that fact is shown. A pill in the header
// when anything is unsent, a dot on the rows it belongs to, and — only for the
// entries that have stopped trying — a list with the reason and one button.
// No modal and no toast: nothing here asks the user to retry, because the retry
// is automatic and a prompt would only be a chance to say no to it.
// Flattened here rather than in the template: the payload is the document as
// Firestore will store it, so every field on it is `unknown` until something
// says otherwise, and that something belongs in script.
const blocked = computed(() =>
  outbox.value
    .filter((e) => e.blocked)
    .map((e) => ({
      id: e.id,
      what: String(e.payload.symbol ?? e.collection),
      when: String(e.payload.date ?? ''),
      why: e.lastError,
    })),
)
const outboxPill = computed(() => {
  if (!outbox.value.length) return null
  const held = blocked.value.length
  return held
    ? { tone: 'danger' as const, label: `${held} held` }
    : { tone: 'warning' as const, label: `${outbox.value.length} unsent` }
})

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

// --- the table ---------------------------------------------------------------
const visibleTrades = computed(() =>
  selectedDay.value ? trades.value.filter((t) => t.date === selectedDay.value) : trades.value,
)

// --- stats -------------------------------------------------------------------
const stats = computed(() => tradeStats(trades.value))
const SESSION_ICON = {
  Asia: IconSessionAsia,
  London: IconSessionLondon,
  NY: IconSessionNy,
} satisfies Record<TradeSession, unknown>
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
function onSetting(
  field: 'startingBalance' | 'dayTarget' | 'monthTarget' | 'defaultLot' | 'brokerOffsetMinutes',
) {
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
          <IconExport :size="14" />
          CSV
        </Button>
        <Button variant="ghost" size="sm" @click="showUtc = !showUtc">
          {{ showUtc ? 'Hide UTC' : 'UTC' }}
        </Button>
        <Button variant="ghost" size="sm" @click="showSettings = !showSettings">
          {{ showSettings ? 'Hide account' : 'Account' }}
        </Button>
        <!-- Present only while something is unsent, and gone the moment the
             last one lands. A permanent "all synced" badge is a badge nobody
             reads by the second day. -->
        <Badge v-if="outboxPill" :tone="outboxPill.tone" :label="outboxPill.label" />
      </template>
    </ListToolbar>

    <!-- A rejected write says so here and stays said until it is dismissed;
         a toast about a failed save is gone before it has been read. -->
    <Alert v-if="error" tone="danger" dismissible @dismiss="log.dismissError()">
      {{ error }}
    </Alert>

    <!-- Loading is the whole screen's state, not the table's: the account
         figures and the calendar are as absent as the rows are, and a skeleton
         that stands in for one of the three is a layout that jumps twice. -->
    <!-- Only the entries that have stopped trying. Everything else retries by
         itself and needs no list, no button and no decision. -->
    <section v-if="blocked.length" class="tv__blocked">
      <h3 class="ui-label">Held trades</h3>
      <ul class="tv__blockedList">
        <li v-for="entry in blocked" :key="entry.id" class="tv__blockedRow">
          <span class="tv__blockedWhat">
            {{ entry.what }}
            <span class="tv__blockedWhen">{{ entry.when }}</span>
          </span>
          <span class="tv__blockedWhy ui-mono">{{ entry.why }}</span>
          <Button variant="ghost" size="sm" @click="log.discard(entry.id)">Discard</Button>
        </li>
      </ul>
      <p class="tv__note">
        Refused {{ MAX_ATTEMPTS }} times, so it has stopped asking. Fix the cause and reload to try
        again, or discard it — it will not go anywhere on its own.
      </p>
    </section>

    <TradeSkeleton v-if="loading" class="tv__scroll" />

    <div v-else class="tv__scroll">
      <AccountBlock
        :balance="totals.balance"
        :secured="totals.securedTotal"
        :total-profit="totals.totalProfit"
        :period="monthLabel(monthKey)"
      />

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

        <!-- The broker's clock. A named zone beats a fixed offset every time:
             it resolves per trade date, which is what stops a year of history
             shifting by an hour twice. -->
        <FormField
          label="Broker timezone"
          hint="An IANA name, e.g. Europe/Athens. Blank uses the fixed offset."
          v-slot="f"
        >
          <TextInput
            v-bind="f"
            :model-value="settings.brokerTimezone"
            placeholder="Europe/Athens"
            @update:model-value="log.saveSettings({ brokerTimezone: String($event).trim() })"
          />
        </FormField>
        <FormField
          label="Broker offset (minutes)"
          hint="Used only when no zone is named. 180 is GMT+3."
          v-slot="f"
        >
          <NumberInput
            v-bind="f"
            :model-value="settings.brokerOffsetMinutes"
            :step="15"
            @update:model-value="onSetting('brokerOffsetMinutes')($event)"
          />
        </FormField>

        <!-- What those two fields actually resolve to, for the month on
             screen — so a wrong zone is visible as a wrong number rather than
             as an hour of quiet drift in the session column. -->
        <p class="tv__note tv__brokerNote">Broker clock this month: {{ brokerLabel }}</p>

        <FormField label="Asia opens (broker)" v-slot="f">
          <GlassDatePicker
            :id="f.id"
            :size="f.size"
            :model-value="settings.sessionBounds.asia"
            mode="time"
            :clearable="false"
            @update:model-value="onBound('asia')(String($event))"
          />
        </FormField>
        <FormField label="London opens (broker)" v-slot="f">
          <GlassDatePicker
            :id="f.id"
            :size="f.size"
            :model-value="settings.sessionBounds.london"
            mode="time"
            :clearable="false"
            @update:model-value="onBound('london')(String($event))"
          />
        </FormField>
        <FormField label="New York opens (broker)" v-slot="f">
          <GlassDatePicker
            :id="f.id"
            :size="f.size"
            :model-value="settings.sessionBounds.ny"
            mode="time"
            :clearable="false"
            @update:model-value="onBound('ny')(String($event))"
          />
        </FormField>
        <FormField label="New York closes (broker)" v-slot="f">
          <GlassDatePicker
            :id="f.id"
            :size="f.size"
            :model-value="settings.sessionBounds.nyEnd"
            mode="time"
            :clearable="false"
            @update:model-value="onBound('nyEnd')(String($event))"
          />
        </FormField>
      </section>

      <section class="tv__targets">
        <div class="tv__target">
          <div class="tv__targetHead">
            <span class="ui-label">
              <IconTargetHit v-if="dayProgress.remaining === 0" :size="14" />
              <IconTargetMissed v-else :size="14" />
              Today · move
            </span>
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
            <span class="ui-label">
              <IconTargetHit v-if="monthProgress.remaining === 0" :size="14" />
              <IconTargetMissed v-else :size="14" />
              Month to date · move
            </span>
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
          :day-target="settings.dayTarget"
          :selected="selectedDay"
          :loading="loading"
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

      <!-- The one-time backfill. Offered rather than run automatically: it
           invents a time, and inventing data on somebody's behalf without
           asking is how a log stops being trustworthy. -->
      <section v-if="untimed.length" class="tv__backfill">
        <p class="tv__note">
          {{ untimed.length }} row{{ untimed.length === 1 ? '' : 's' }} in
          {{ monthLabel(monthKey) }} carry no time — they were logged before times were recorded.
          They can be given 00:00 IST and marked estimated, which keeps them out of the hour view
          rather than reporting them as midnight trades.
        </p>
        <Button variant="ghost" size="sm" :loading="log.backfilling.value" @click="onBackfill">
          Mark them 00:00 IST
        </Button>
      </section>

      <TradeTable
        :trades="visibleTrades"
        :empty-title="selectedDay ? `Nothing traded on ${selectedDay}` : 'No trades this month'"
        :empty-description="
          selectedDay
            ? 'Pick the day again on the calendar to see the whole month.'
            : 'Log the first one above — the calendar, the targets and the stats all come from these rows.'
        "
        :state="rowState"
        :broker="brokerClock"
        :show-utc="showUtc"
        @delete="log.deleteTrade($event)"
      />

      <TradeHours
        :trades="trades"
        :broker="brokerClock"
        :day-target="settings.dayTarget"
        :reference="monthStart"
      />

      <section v-if="stats.count" class="tv__stats">
        <StatRow :stats="statRow" />
        <div class="tv__sessions">
          <span class="ui-label">Move by session</span>
          <ul class="tv__sessionList">
            <li v-for="s in TRADE_SESSIONS" :key="s" class="tv__session">
              <span class="tv__sessionName">
                <component :is="SESSION_ICON[s]" :size="14" />
                {{ s }}
              </span>
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
/* Both are panels on the raised layer — same background, same border, same one
   shadow recipe. The base layer is the stage they sit on and casts nothing;
   the overlay recipe belongs to the tooltip and the sticky header. */
.tv__settings,
.tv__stats {
  padding: var(--sp-4);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  box-shadow: var(--layer-raised-shadow);
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
/* Held trades: the one place in the feature that asks for a decision, so it is
   drawn as a panel rather than as an alert. An alert is dismissible and this is
   not — the entries stay until they are dealt with. */
.tv__blocked {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--theme-danger);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
}
.tv__blockedList {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.tv__blockedRow {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.tv__blockedWhat {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.tv__blockedWhen {
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
/* The code, verbatim and in mono, because `permission-denied` and
   `failed-precondition` have two different fixes and a paraphrase sends
   somebody to neither of them. */
.tv__blockedWhy {
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--theme-danger);
}

/* Spans the settings grid: it is a statement about the two fields above it,
   not a field of its own. */
.tv__brokerNote {
  grid-column: 1 / -1;
}
.tv__backfill {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
}
.tv__backfill .tv__note {
  flex: 1;
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
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.tv__targetHead .ui-label {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
}
</style>
