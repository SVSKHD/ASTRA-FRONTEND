<script setup lang="ts">
// The Trades tab (sections 32–34).
//
// One switch over one calendar. Journal, Signals and Combined are three
// readings of the same month, not three screens: the calendar, the desk, the
// account block and the targets are identical in all three, and only the table
// and what the day cells are keyed to change. A second calendar for signals
// would be a second thing to keep in step, and it would drift.
//
// Nothing on this screen is stored twice. Every figure is a `computed` over the
// month's rows, so an edit that changes a price moves the table, the calendar
// cell, the targets and the account block in the same tick.
import { computed, ref, watch } from 'vue'
import ListToolbar from '@/components/ListToolbar.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import IconExport from '@/components/icons/IconExport.vue'
import AccountBlock from '@/components/trades/AccountBlock.vue'
import CombinedTimeline from '@/components/trades/CombinedTimeline.vue'
import SessionDesk from '@/components/trades/SessionDesk.vue'
import SignalTable from '@/components/trades/SignalTable.vue'
import TradeCalendar from '@/components/trades/TradeCalendar.vue'
import TradeForm, { type ArmRequest } from '@/components/trades/TradeForm.vue'
import TradeSettingsPanel from '@/components/trades/TradeSettingsPanel.vue'
import TradeSkeleton from '@/components/trades/TradeSkeleton.vue'
import TradeTable from '@/components/trades/TradeTable.vue'
import TradeTargets from '@/components/trades/TradeTargets.vue'
import { useStyles } from '@/composables/useStyles'
import { useAppStore } from '@/stores/app'
import { useSessionClock } from '@/composables/useSessionClock'
import { useSettings } from '@/composables/useSettings'
import { useSignals, freshGo } from '@/composables/useSignals'
import { useTradeRoute, type TradeMode } from '@/composables/useTradeRoute'
import { useTrades } from '@/composables/useTrades'
import { useCollectionRename } from '@/composables/useCollectionRename'
import { linkSignals } from '@/utils/combine'
import { downloadText } from '@/utils/noteExport'
import { monthLabel } from '@/utils/budget'
import { monthName } from '@/utils/format'
import { accountTotals, tradeCsvFilename, tradesToCsv } from '@/utils/tradeMath'
import { IST, hhmmOn, instantFromWall, ymdOn } from '@/utils/tradeTime'
import type { TradeDraft } from '@/services/tradeDoc'
import type { DacoitSignal } from '@/types'

const app = useAppStore()
const { panelStyle } = useStyles()
const route = useTradeRoute()
const store = useSettings()
const { settings, ready } = store

const log = useTrades(() => route.month.value)
const signalLog = useSignals(() => route.month.value)
const rename = useCollectionRename()

const broker = computed(() => ({
  zone: settings.value.brokerTimezone,
  offsetMinutes: settings.value.brokerOffsetMinutes,
}))
const monthStart = computed(
  () => instantFromWall(IST, `${route.month.value}-01`, '00:00') ?? Date.now(),
)

const clock = useSessionClock(
  () => broker.value,
  () => settings.value.sessionBounds,
)

const MODES = [
  { value: 'journal', label: 'Journal' },
  { value: 'signals', label: 'Signals' },
  { value: 'combined', label: 'Combined' },
]

const visibleTrades = computed(() =>
  route.day.value
    ? log.trades.value.filter((t) => t.istDate === route.day.value)
    : log.trades.value,
)
const visibleSignals = computed(() =>
  route.day.value
    ? signalLog.signals.value.filter((s) => s.istDate === route.day.value)
    : signalLog.signals.value,
)
const links = computed(() => linkSignals(log.trades.value, signalLog.signals.value))
const totals = computed(() => accountTotals(log.trades.value, [], settings.value.startingBalance))

// --- the desk (section 34) ----------------------------------------------------
// A GO that has landed and is still worth acting on, and the arming request the
// form answers. Both derived from the clock rather than pushed at the form, so
// nothing has to be undone when the minute passes.
const go = computed(() => freshGo(signalLog.signals.value, clock.now.value))
const arm = ref<ArmRequest | null>(null)

watch(
  () => clock.armed.value,
  (armed) => {
    if (!armed || !clock.next.value) return
    arm.value = armRequest(clock.next.value.session, settings.value.lastSymbol)
  },
)

function armRequest(session: ArmRequest['session'], symbol: string, signalId = ''): ArmRequest {
  const now = Date.now()
  return {
    at: now,
    session,
    symbol,
    istDate: ymdOn(IST, now),
    istTime: hhmmOn(IST, now),
    signalId,
  }
}

/** "Log this" on a signal: the same arming, with the signal's own facts. */
function takeSignal(signal: DacoitSignal) {
  arm.value = armRequest(signal.session, signal.symbol, signal.signalId)
}

// --- writes -------------------------------------------------------------------
const busy = ref(false)

async function onSubmit(draft: TradeDraft) {
  busy.value = true
  const id = await log.create(draft)
  busy.value = false
  if (id) app.showToastMsg(`Logged ${draft.symbol} ${draft.side}`)
}

const showSettings = ref(false)

function exportCsv() {
  downloadText(
    tradesToCsv(visibleTrades.value),
    tradeCsvFilename(route.day.value || route.month.value),
    'text/csv;charset=utf-8',
  )
}

const form = ref<{ focus: () => void } | null>(null)
defineExpose({ focus: () => form.value?.focus() })
</script>

<template>
  <div :style="panelStyle" :data-ready="ready && !log.loading.value ? 'true' : 'false'">
    <ListToolbar title="Trades" new-label="Log trade" @new="form?.focus()">
      <template #actions>
        <SegmentedControl
          size="sm"
          :model-value="route.mode.value"
          :options="MODES"
          aria-label="What this month is shown as"
          @update:model-value="route.set({ mode: $event as TradeMode })"
        />
        <Button variant="ghost" size="sm" :disabled="!visibleTrades.length" @click="exportCsv">
          <IconExport :size="14" />
          CSV
        </Button>
        <Button variant="ghost" size="sm" @click="showSettings = !showSettings">
          {{ showSettings ? 'Hide account' : 'Account' }}
        </Button>
      </template>
    </ListToolbar>

    <Alert v-if="log.error.value" tone="danger" dismissible @dismiss="log.error.value = ''">
      {{ log.error.value }}
    </Alert>
    <Alert v-if="rename.message.value" tone="info" dismissible @dismiss="rename.dismiss()">
      {{ rename.message.value }}
    </Alert>

    <!-- The one always-visible element, above everything the month is about. -->
    <SessionDesk
      :next="clock.next.value"
      :countdown="clock.countdown.value"
      :armed="clock.armed.value"
      :go="go"
      :broker="broker"
      @take="takeSignal"
    />

    <TradeSkeleton v-if="log.loading.value" class="tv__scroll" />

    <div v-else class="tv__scroll">
      <AccountBlock
        :balance="totals.balance"
        :secured="totals.securedTotal"
        :total-profit="totals.totalProfit"
        :period="monthLabel(route.month.value)"
      />

      <TradeSettingsPanel
        v-if="showSettings"
        :settings="settings"
        :month-start="monthStart"
        :month-label="monthName(route.month.value)"
        @save="store.save($event)"
        @rename="rename.start($event.key, $event.next)"
      />

      <TradeTargets :trades="log.trades.value" :settings="settings" />

      <div class="tv__split">
        <TradeCalendar
          :trades="log.trades.value"
          :day-target="settings.dayTarget"
          :selected="route.day.value"
          :loading="log.loading.value"
          @update:selected="route.set({ day: $event })"
          @month="route.set({ month: $event, day: '' })"
        />
        <TradeForm
          ref="form"
          :settings="settings"
          :busy="busy"
          :arm="arm"
          @submit="onSubmit"
          @size-symbol="
            store.save({
              contractSizes: { ...settings.contractSizes, [$event.symbol]: $event.size },
              lastSymbol: $event.symbol,
            })
          "
        />
      </div>

      <!-- One switch, one calendar, three tables. -->
      <TradeTable
        v-if="route.mode.value === 'journal'"
        :trades="visibleTrades"
        :broker="broker"
        :state="{}"
        :empty-title="
          route.day.value ? `Nothing traded on ${route.day.value}` : 'No trades this month'
        "
        empty-description="Log the first one above — the calendar, the targets and the stats all come from these rows."
        @delete="log.remove($event)"
      />
      <SignalTable
        v-else-if="route.mode.value === 'signals'"
        :signals="visibleSignals"
        :broker="broker"
        :taken="links.signalToTrade"
      />
      <CombinedTimeline v-else :trades="visibleTrades" :signals="visibleSignals" :broker="broker" />

      <!-- Six seconds, and it says what it will put back. -->
      <div v-if="log.undoable.value" class="tv__undo" role="status">
        <span>
          Deleted {{ log.undoable.value.trade.symbol }} on {{ log.undoable.value.trade.istDate }}
        </span>
        <Button variant="ghost" size="sm" @click="log.undo()">Undo</Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tv__scroll {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
  padding-bottom: var(--sp-4);
}
.tv__split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--sp-4);
  min-width: 0;
}
.tv__undo {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  font-size: var(--text-sm);
  color: var(--text-primary, var(--theme-text));
}

@media (max-width: 900px) {
  .tv__split {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
