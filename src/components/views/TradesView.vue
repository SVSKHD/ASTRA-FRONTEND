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
//
// THE SHAPE, top to bottom, and why it is this one:
//
//   ┌ targets ────────┬ session clock ──────┐   two questions, side by side:
//   │ today           │ balance / secured   │   "am I on track" on the left,
//   │ month to date   │                     │   "what is it worth" on the right
//   ├ calendar ───────┼ trades ─────────────┤
//   │ the month       │ the rows            │
//   └─────────────────┴─────────────────────┘
//
// The calendar takes a NARROW fixed track and the table takes the rest. A
// half-and-half split would have been the obvious grid and the wrong one: the
// calendar is seven columns of two-digit cells and stops improving past about
// 340px, while the table is thirteen columns of nowrap figures with no
// horizontal scroll on the desktop by design — every pixel not spent on the
// month is spent where it is legible. Below 1180px they stop sharing a row
// entirely, because a table squeezed into a column is a table nobody can read.
//
// THE FORM IS A DIALOG. It used to sit beside the calendar taking half the row
// forever, for a job done a handful of times a session — and the collapse-on-
// blur behaviour it grew was the tell: an element folding itself away is an
// element admitting it should not have been there. Asking for it by name gives
// the table the width instead.
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import ListToolbar from '@/components/ListToolbar.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import Modal from '@/components/ui/Modal.vue'
import Tabs from '@/components/ui/Tabs.vue'
import IconExport from '@/components/icons/IconExport.vue'
import AccountBlock from '@/components/trades/AccountBlock.vue'
import CombinedTimeline from '@/components/trades/CombinedTimeline.vue'
import SessionDesk from '@/components/trades/SessionDesk.vue'
import SignalTable from '@/components/trades/SignalTable.vue'
import TradeCalendar from '@/components/trades/TradeCalendar.vue'
import TradeForm, { type ArmRequest } from '@/components/trades/TradeForm.vue'
import TradeSettingsPanel from '@/components/trades/TradeSettingsPanel.vue'
import TradeSkeleton from '@/components/trades/TradeSkeleton.vue'
import TradeTable, { type RowState } from '@/components/trades/TradeTable.vue'
import TradeTargets from '@/components/trades/TradeTargets.vue'
import CollectionProbe from '@/components/trades/CollectionProbe.vue'
import SecuredLedger from '@/components/trades/SecuredLedger.vue'
import NewsStrip from '@/components/trades/NewsStrip.vue'
import OutboxPanel from '@/components/trades/OutboxPanel.vue'
import { useSaveState } from '@/composables/useSaveState'
import { useStyles } from '@/composables/useStyles'
import { useAppStore } from '@/stores/app'
import { useSettings } from '@/composables/useSettings'
import { useSignals } from '@/composables/useSignals'
import { useNews } from '@/composables/useNews'
import { useTradeRoute, type TradeMode } from '@/composables/useTradeRoute'
import { useTrades } from '@/composables/useTrades'
import { useSecured } from '@/composables/useSecured'
import { useCollectionRename } from '@/composables/useCollectionRename'
import { useOutbox } from '@/composables/useOutbox'
import { linkSignals } from '@/utils/combine'
import { downloadText } from '@/utils/noteExport'
import { monthLabel } from '@/utils/budget'
import { monthName } from '@/utils/format'
import { accountTotals, monthBounds, tradeCsvFilename, tradesToCsv } from '@/utils/tradeMath'
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
const secured = useSecured(() => route.month.value)
// Forex only, for the day strip. The same shared collection the News tab reads,
// filtered to one day and to what the desk trades (section 39).
const news = useNews(() => ['forex'])
const rename = useCollectionRename()
const outbox = useOutbox()

const broker = computed(() => ({
  zone: settings.value.brokerTimezone,
  offsetMinutes: settings.value.brokerOffsetMinutes,
}))
const monthStart = computed(
  () => instantFromWall(IST, `${route.month.value}-01`, '00:00') ?? Date.now(),
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
/**
 * The two rows that are not simply "on the server" (section 42).
 *
 * `pending` comes from Firestore's own `hasPendingWrites`: written locally,
 * durably, and not yet acknowledged — which is the normal state of a trade
 * logged with no network and is not a problem. `queued` is the outbox: a write
 * the rules REFUSED, held with the id it was minted with so a retry overwrites
 * rather than duplicating. Two different facts, so two different marks.
 *
 * This used to be `:state="{}"` — the dots existed and nothing ever set them.
 */
const rowStates = computed<Record<string, RowState>>(() => {
  const out: Record<string, RowState> = {}
  for (const id of log.pendingIds.value) out[id] = 'pending'
  for (const entry of outbox.entries.value) out[entry.id] = 'queued'
  return out
})

/**
 * The month the listener is actually ranging over.
 *
 * Shown to the reader when the month comes back empty, because "no trades" and
 * "the query never matched anything" are the same picture and only one of them
 * is a bug (section 32).
 */
const bounds = computed(() => monthBounds(route.month.value))
/**
 * An empty month, once the fetch has genuinely finished.
 *
 * Not `!trades.length` on its own: during the first load that is true and means
 * nothing. And not while a day is selected either — an empty day inside a month
 * that has rows is an ordinary answer, and the table's own empty state says so.
 */
const monthIsEmpty = computed(
  () => ready.value && !log.loading.value && !log.trades.value.length && !route.day.value,
)

const links = computed(() => linkSignals(log.trades.value, signalLog.signals.value))
const totals = computed(() =>
  accountTotals(log.trades.value, secured.entries.value, settings.value.startingBalance),
)

// --- the desk (section 34) ----------------------------------------------------
// The arming request the form answers. The desk owns the ticking clock and says
// when it is T-5; this view never reads a value that changes every second, which
// is what stopped the whole tab re-rendering once a second (section 42).
const arm = ref<ArmRequest | null>(null)

function onArm(session: ArmRequest['session']) {
  arm.value = armRequest(session, settings.value.lastSymbol)
}

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

/**
 * "Log this" on a signal: the same arming, with the signal's own facts.
 *
 * This one DOES open the dialog, where the T-5 arming above does not. The
 * difference is who asked: pressing "Log this" is a request to log a trade, and
 * a clock reaching T-5 is not. A modal that opens itself three times a day
 * because a session is due is a modal that gets dismissed without being read.
 */
function takeSignal(signal: DacoitSignal) {
  arm.value = armRequest(signal.session, signal.symbol, signal.signalId)
  openForm()
}

// --- writes (section 42) ------------------------------------------------------
//
// CAPTURE IS THE SUCCESS SIGNAL, NOT THE SERVER'S ANSWER. With the persistent
// cache a write does not settle until a server responds, so waiting for that
// would mean a trade logged on a train shows nothing at all until the tunnel
// ends — even though Firestore already has it, durably, on the device.
//
// What is waited for instead is the local snapshot echo: the row appearing in
// the month the app is already listening to. That is the moment the trade
// exists as far as this application is concerned, and it is the moment the
// check belongs. A write that is later refused by the rules does not un-happen
// silently — it comes back through the outbox with a queued marker and the
// alert above, which is a different message at a different time.
const save = useSaveState()
const flashRow = ref('')
const flashDay = ref('')
let flashTimer: ReturnType<typeof setTimeout> | undefined

/** How long the row's rail and the calendar cell stay ringed. */
const FLASH_MS = 1_400
/** A local echo that never arrives is a failure, not a wait forever. */
const ECHO_TIMEOUT_MS = 5_000

function echoOf(id: string): Promise<boolean> {
  if (log.trades.value.some((t) => t.id === id)) return Promise.resolve(true)
  return new Promise((resolve) => {
    const stop = watch(
      () => log.trades.value.some((t) => t.id === id),
      (arrived) => {
        if (!arrived) return
        clearTimeout(timer)
        stop()
        resolve(true)
      },
    )
    const timer = setTimeout(() => {
      stop()
      resolve(false)
    }, ECHO_TIMEOUT_MS)
  })
}

async function onSubmit(draft: TradeDraft, captured: (ok: boolean) => void) {
  const id = await save.run(async () => {
    const minted = await log.create(draft)
    if (!minted) throw new Error('Sign in to log trades.')
    if (!(await echoOf(minted))) throw new Error('That trade did not reach the log.')
    return minted
  })
  // The form clears only on a true — anything else and the typed values stay
  // exactly where they were.
  captured(Boolean(id))
  if (!id) return
  // Closed only on a capture. A failed write keeps the dialog — and the typed
  // values in it — exactly where they were, which is the whole reason `submit`
  // reports back rather than assuming.
  formOpen.value = false

  // The confirmation lands where the data landed: the new row's rail and the
  // calendar cell whose figures just changed, both for the same moment.
  clearTimeout(flashTimer)
  flashRow.value = id
  flashDay.value = draft.istDate
  flashTimer = setTimeout(() => {
    flashRow.value = ''
    flashDay.value = ''
  }, FLASH_MS)
  app.showToastMsg(`Logged ${draft.symbol} ${draft.side}`)
}

onUnmounted(() => clearTimeout(flashTimer))

const showSettings = ref(false)

function exportCsv() {
  downloadText(
    tradesToCsv(visibleTrades.value),
    tradeCsvFilename(route.day.value || route.month.value),
    'text/csv;charset=utf-8',
  )
}

// --- the form, on request (section 44) --------------------------------------
//
// `focus()` is what ⌘K and the toolbar's create button call, and what it means
// on this tab is "let me log a trade" — which is now opening the dialog and
// putting the cursor in the one field that is not already filled in.
const formOpen = ref(false)
const form = ref<{ focus: () => void } | null>(null)

function openForm() {
  formOpen.value = true
  // After the dialog has mounted its contents, not before: the field being
  // focused does not exist until then.
  void nextTick(() => form.value?.focus())
}

defineExpose({ focus: openForm })
</script>

<template>
  <div :style="panelStyle" :data-ready="ready && !log.loading.value ? 'true' : 'false'">
    <ListToolbar title="Trades" new-label="Log trade" @new="openForm()">
      <template #actions>
        <Tabs
          size="sm"
          :model-value="route.mode.value"
          :tabs="MODES"
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

    <Alert
      v-if="log.error.value"
      tone="danger"
      title="Could not save trade"
      dismissible
      @dismiss="log.error.value = ''"
    >
      {{ log.error.value }}
    </Alert>
    <Alert
      v-if="log.listenerError.value"
      tone="danger"
      title="Trade feed interrupted"
      dismissible
      @dismiss="log.listenerError.value = ''"
    >
      {{ log.listenerError.value }}
    </Alert>
    <Alert
      v-if="rename.message.value"
      tone="info"
      title="Collection update"
      dismissible
      @dismiss="rename.dismiss()"
    >
      {{ rename.message.value }}
    </Alert>
    <Alert
      v-if="outbox.message.value"
      tone="warning"
      title="Write queued"
      dismissible
      @dismiss="outbox.message.value = ''"
    >
      {{ outbox.message.value }}
    </Alert>

    <OutboxPanel :entries="outbox.entries.value" @discard="outbox.discard($event)" />

    <div class="tv__scroll">
      <!-- TARGETS | CLOCK + ACCOUNT.
           The desk is outside every loading branch, because it is the one
           element here that is about the next few minutes rather than about the
           month — it has nothing to wait for and is live on the first frame. -->
      <div class="tv__top">
        <div class="tv__col">
          <TradeTargets
            v-if="!log.loading.value"
            :trades="log.trades.value"
            :settings="settings"
            :period="monthLabel(route.month.value)"
          />
          <TradeSkeleton v-else part="targets" />
        </div>

        <div class="tv__col">
          <SessionDesk
            :broker="broker"
            :bounds="settings.sessionBounds"
            :signals="signalLog.signals.value"
            @take="takeSignal"
            @arm="onArm"
          />
          <AccountBlock
            v-if="!log.loading.value"
            :balance="totals.balance"
            :secured="totals.securedTotal"
            :total-profit="totals.totalProfit"
            :period="monthLabel(route.month.value)"
          />
          <TradeSkeleton v-else part="account" />
        </div>
      </div>

      <TradeSettingsPanel
        v-if="showSettings"
        :settings="settings"
        :month-start="monthStart"
        :month-label="monthName(route.month.value)"
        @save="store.save($event)"
        @rename="rename.start($event.key, $event.next)"
      />

      <!-- Collapsed, and only when a day is selected: on a month view it would
           have no day to be about. -->
      <NewsStrip :items="news.items.value" :day="route.day.value" />

      <TradeSkeleton v-if="log.loading.value" part="main" />

      <!-- CALENDAR | TABLE. One switch, one calendar, three tables. -->
      <div v-else class="tv__main">
        <TradeCalendar
          :trades="log.trades.value"
          :day-target="settings.dayTarget"
          :month="route.month.value"
          :selected="route.day.value"
          :flash-day="flashDay"
          :loading="log.loading.value"
          @update:selected="route.set({ day: $event })"
          @month="route.set({ month: $event, day: '' })"
        />

        <div class="tv__rows">
          <TradeTable
            v-if="route.mode.value === 'journal'"
            :trades="visibleTrades"
            :broker="broker"
            :state="rowStates"
            :flash="flashRow"
            :empty-title="
              route.day.value ? `Nothing traded on ${route.day.value}` : 'No trades this month'
            "
            empty-description="Log the first one with the button above — the calendar, the targets and the stats all come from these rows."
            @delete="log.remove($event)"
          />
          <SignalTable
            v-else-if="route.mode.value === 'signals'"
            :signals="visibleSignals"
            :broker="broker"
            :taken="links.signalToTrade"
          />
          <CombinedTimeline
            v-else
            :trades="visibleTrades"
            :signals="visibleSignals"
            :broker="broker"
          />

          <!-- The month came back with nothing. Rather than leave the reader to
               guess whether that is the data or the app, offer to ask the
               database which one it is. -->
          <CollectionProbe
            v-if="monthIsEmpty"
            collection-key="tradesCollection"
            field="istDate"
            label="the trade log"
            :from="bounds.from"
            :to="bounds.to"
          />

          <!-- Six seconds, and it says what it will put back. -->
          <div v-if="log.undoable.value" class="tv__undo" role="status">
            <span>
              Deleted {{ log.undoable.value.trade.symbol }} on
              {{ log.undoable.value.trade.istDate }}
            </span>
            <Button variant="ghost" size="sm" @click="log.undo()">Undo</Button>
          </div>
        </div>
      </div>

      <SecuredLedger
        :entries="secured.entries.value"
        :total="secured.total.value"
        @add="secured.add($event)"
        @delete="secured.remove($event)"
      />
    </div>

    <!-- The form, on request. Kept out of the row above so the table has the
         width; `always-expanded` because the dialog is the disclosure and a
         panel that folds itself up inside a window opened to show it is a
         control arguing with the thing that opened it. -->
    <Modal :open="formOpen" title="Log trade" size="lg" @close="formOpen = false">
      <TradeForm
        ref="form"
        always-expanded
        :settings="settings"
        :saving="save.state.value"
        :arm="arm"
        @submit="onSubmit"
        @size-symbol="
          store.save({
            contractSizes: { ...settings.contractSizes, [$event.symbol]: $event.size },
            lastSymbol: $event.symbol,
          })
        "
      />
    </Modal>
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
/* Targets on the left, the clock and the account on the right. Even halves,
   because the two columns are two questions of equal standing — "am I on
   track" and "what is it worth" — rather than a subject and its aside. */
.tv__top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: var(--sp-4);
  min-width: 0;
}
.tv__col {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
}

/* The month and the rows.
   NOT two equal halves. The calendar is seven columns of two-digit cells and
   stops improving somewhere around 340px; the table is thirteen columns of
   nowrap figures which, on a desktop, has no horizontal scroll of its own — its
   header sticks to the page instead, and that trade was made deliberately. So
   the calendar takes a ceiling and the table takes everything left. */
.tv__main {
  display: grid;
  grid-template-columns: minmax(0, 340px) minmax(0, 1fr);
  /* `start`, not the default `stretch`: a short month must not stretch the
     calendar to the height of a table with forty rows in it. */
  align-items: start;
  gap: var(--sp-4);
  min-width: 0;
}
.tv__rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
/* A CEILING ON THE CALENDAR, in both layouts.
   Its cells are square, so width is height: handed a full-width row it draws a
   month of 150px days and pushes everything under it off the screen. The track
   above caps it while the two share a row; this caps it when they stop, which
   is the case the track cannot reach. */
.tv__main > .tcal {
  width: 100%;
  max-width: 340px;
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
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  font-size: var(--text-sm);
  color: var(--text-primary, var(--theme-text));
}

/* Below this the table cannot hold thirteen columns beside anything, so it
   takes the full width and the calendar sits above it. The same number is in
   TradeSkeleton, so the placeholder promises the layout that arrives. */
@media (max-width: 1180px) {
  .tv__main {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 900px) {
  .tv__top {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
