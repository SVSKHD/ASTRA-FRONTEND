<script setup lang="ts">
// The stock page's chart: Live (today's candles, the newest one moving with each
// streamed tick) while NSE is open, the historic ranges beside it, a timeframe
// to draw them on, and indicators with the periods the person picks.
//
// Steady by design: it reloads only when the stock, range or timeframe changes
// (not on every price tick), keeps the last chart on screen while a new one
// loads, and draws a range it has already read at once from memory.
//
// Indicators run on every candle on screen: older candles are read behind the
// range (the warm-up) so an EMA 50 is already running at the first one, instead
// of starting part-way across. Scrolling back shows them too.
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { aureon } from '@/api/client'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Select from '@/components/ui/Select.vue'
import MultiSelect from '@/components/ui/MultiSelect.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import CandleChart, { type ChartGroup } from '@/components/trading/CandleChart.vue'
import { explainHistory, forgetHistory, historyStatus, requestHistory } from '@/trading/history'
import { isUnconfirmed, type Timeframe } from '@/trading/chartView'
import { marketOpen } from '@/trading/dhanHealth'
import { chartPath } from '@/trading/sections'
import {
  EMA_PRESETS,
  PALETTE,
  cleanParams,
  colorCss,
  computeStudy,
  kindInfo,
  toNumbers,
  type ColorKey,
} from '@/trading/studies'
import { must } from '@/trading/useLoad'
import { ago } from '@/trading/format'
import {
  HISTORIC,
  INDICATORS_KEY,
  INDICATORS_V1_KEY,
  RANGES,
  TF_LABEL,
  barsFor,
  cacheCandles,
  cachedCandles,
  fetchLimit,
  indicatorLabel,
  intradayOnly,
  mergeTick,
  applyPicks,
  indicatorOptions,
  indicatorSig,
  parseIndicators,
  resolveTf,
  sameCandles,
  sessionStart,
  stableCandles,
  studyOf,
  tfsFor,
  warmupFor,
  type Candle,
  type IndicatorDef,
  type RangeKey,
  type TfChoice,
} from '@/trading/stockChart'

const props = defineProps<{
  instrumentId: number
  symbol: string
  /** The newest price and when it arrived; `streaming` when it came from the live feed. */
  ltp: string | null
  ltpAt: string | null
  streaming: boolean
  now: number
}>()
const router = useRouter()

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* not remembered */
  }
}

// --- range ------------------------------------------------------------------------
const RANGE_KEY = 'aureon.stocks.range.v1'
const isOpen = computed(() => marketOpen(props.now))
function savedRange(): RangeKey {
  const saved = readLocal(RANGE_KEY)
  if (saved === 'live') return marketOpen(Date.now()) ? 'live' : '1d'
  if (saved && saved in RANGES) return saved as RangeKey
  return marketOpen(Date.now()) ? 'live' : '6m'
}
const range = ref<RangeKey>(savedRange())
watch(range, (r) => writeLocal(RANGE_KEY, r))
// The bell rang: Live has nothing new to show, so fall back to the day's chart.
watch(isOpen, (open) => {
  if (!open && range.value === 'live') range.value = '1d'
})
const options = computed(() => [
  ...(isOpen.value ? [{ value: 'live', label: '● Live' }] : []),
  ...HISTORIC.map((k) => ({ value: k, label: RANGES[k].label })),
])

// --- timeframe (chosen per range; "Auto" is the range's own) --------------------------
const TF_KEY = 'aureon.stocks.tf.v1'
function savedTfs(): Partial<Record<RangeKey, TfChoice>> {
  try {
    const v: unknown = JSON.parse(readLocal(TF_KEY) ?? '{}')
    return v && typeof v === 'object' ? (v as Partial<Record<RangeKey, TfChoice>>) : {}
  } catch {
    return {}
  }
}
const tfChoices = ref(savedTfs())
const tfModel = computed({
  get: () => {
    const c = tfChoices.value[range.value]
    return c && c !== 'auto' && tfsFor(range.value).includes(c) ? c : 'auto'
  },
  set: (v: string) => {
    tfChoices.value = { ...tfChoices.value, [range.value]: v as TfChoice }
    writeLocal(TF_KEY, JSON.stringify(tfChoices.value))
  },
})
const tfOptions = computed(() => [
  { value: 'auto', label: `Auto · ${TF_LABEL[RANGES[range.value].tf]}` },
  ...tfsFor(range.value).map((t) => ({ value: t, label: TF_LABEL[t] ?? t })),
])
const tf = computed<Timeframe>(() => resolveTf(range.value, tfChoices.value[range.value]))

// --- indicators (what the person set up) ------------------------------------------------
const defs = ref<IndicatorDef[]>(
  parseIndicators(readLocal(INDICATORS_KEY), readLocal(INDICATORS_V1_KEY)),
)
watch(defs, (d) => writeLocal(INDICATORS_KEY, JSON.stringify(d)), { deep: true })
const editing = ref<string | null>(null)
const edited = computed(() => defs.value.find((d) => d.id === editing.value) ?? null)

// The picker (a MultiSelect): the usual indicators by group; any other period is
// set by clicking its chip.
const pickOptions = computed(() => indicatorOptions(defs.value))
const picks = computed({
  get: () => defs.value.map(indicatorSig),
  set: (next: string[]) => {
    defs.value = applyPicks(defs.value, next)
    if (editing.value && !defs.value.some((d) => d.id === editing.value)) editing.value = null
  },
})
function removeIndicator(id: string) {
  defs.value = defs.value.filter((d) => d.id !== id)
  if (editing.value === id) editing.value = null
}
function setParam(id: string, i: number, raw: string) {
  defs.value = defs.value.map((d) => {
    if (d.id !== id) return d
    const next = [...d.params]
    next[i] = Number(raw)
    return { ...d, params: cleanParams(d.kind, next) }
  })
}
// A period is held as a draft while it is typed ("2" on its way to "200") and
// applied, clamped, when the field is left or Enter is pressed.
const drafts = ref<Record<string, number | null>>({})
const draftKey = (id: string, i: number) => `${id}:${i}`
function draftOf(d: IndicatorDef, i: number): number | null {
  const k = draftKey(d.id, i)
  return k in drafts.value ? drafts.value[k] : d.params[i]
}
function setDraft(id: string, i: number, v: number | null) {
  drafts.value = { ...drafts.value, [draftKey(id, i)]: v }
}
function clearDrafts(id: string) {
  drafts.value = Object.fromEntries(
    Object.entries(drafts.value).filter(([k]) => !k.startsWith(`${id}:`)),
  )
}
function commitDraft(id: string, i: number) {
  const k = draftKey(id, i)
  if (!(k in drafts.value)) return
  const v = drafts.value[k]
  clearDrafts(id)
  if (v !== null) setParam(id, i, String(v))
  // The field clamps its own value just after it blurs; that echo is not a new draft.
  void nextTick(() => clearDrafts(id))
}
function setPreset(id: string, period: number) {
  clearDrafts(id)
  setParam(id, 0, String(period))
}
function setColor(id: string, color: ColorKey) {
  defs.value = defs.value.map((d) => (d.id === id ? { ...d, color } : d))
}
function toggleEdit(id: string) {
  editing.value = editing.value === id ? null : id
}

// --- how much to read ---------------------------------------------------------------
/** Candles the range shows; the warm-up is read behind them for the indicators. */
const bars = computed(() => barsFor(range.value, tf.value))
const warmup = computed(() => warmupFor(defs.value))
const limit = computed(() => fetchLimit(bars.value, warmup.value))

// --- candles ------------------------------------------------------------------------
const candles = shallowRef<readonly Candle[]>([])
/** The range and timeframe the drawn candles belong to (the previous ones while new ones load). */
const shownRange = ref<RangeKey>(range.value)
const shownTf = ref<Timeframe>(tf.value)
const shownId = ref<number | null>(null)
const state = ref<'loading' | 'ready' | 'fetching' | 'empty' | 'error'>('loading')
const busy = ref(false)
const note = ref('')
const loadedAt = ref(0)

// While the server says the request is queued or running, keep looking: 5 s,
// easing to 15 s, for about four minutes (it may wait behind other requests).
const POLLS = 20
const pollDelay = (attempt: number) => Math.min(15_000, 5_000 + attempt * 1_000)
let seq = 0
let inflight = false
let pollTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => {
  seq++
  clearTimeout(pollTimer)
})

async function load(attempt = 0, quiet = false) {
  const id = props.instrumentId
  const r = range.value
  const t = tf.value
  const n = limit.value
  const key = `${id}:${t}:${n}`
  const mine = ++seq
  clearTimeout(pollTimer)
  /** The same chart, read deeper (an indicator needs more warm-up): no spinner. */
  const sameSeries = shownId.value === id && shownTf.value === t && candles.value.length > 0

  if (attempt === 0 && !quiet) {
    const hit = cachedCandles(key)
    if (hit) {
      candles.value = hit.candles
      shownRange.value = r
      shownTf.value = t
      shownId.value = id
      loadedAt.value = hit.at
      state.value = 'ready'
    } else if (shownId.value !== id) {
      // Another stock's chart must not stand in for this one.
      candles.value = []
      shownId.value = id
      state.value = 'loading'
    } else if (!candles.value.length) {
      state.value = 'loading'
    }
    // Drawn from memory, or the same candles read deeper: check the server
    // silently and only redraw if it has something new. The spinner is for a
    // chart with nothing of its own to show yet.
    busy.value = !hit && !sameSeries
    note.value = ''
  }

  inflight = true
  try {
    const rows = must(
      await aureon.GET('/api/trading/candles', {
        params: { query: { instrument_id: id, timeframe: t, limit: n } },
      }),
    )
    if (mine !== seq) return
    const got: Candle[] = rows
      .filter((c) => !c.is_gap)
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    if (got.length) {
      // A refresh that brought nothing new keeps the same array: no redraw.
      const same = shownTf.value === t && shownId.value === id && sameCandles(candles.value, got)
      if (!same) candles.value = got
      shownRange.value = r
      shownTf.value = t
      shownId.value = id
      loadedAt.value = Date.now()
      cacheCandles(key, got)
      state.value = 'ready'
      busy.value = false
      note.value = ''
      return
    }
    // A quiet refresh that found nothing new leaves the chart as it is.
    if (quiet) return
    // Nothing on this timeframe: the old one's candles must not pose as this one.
    if (shownTf.value !== t) candles.value = []
    shownRange.value = r
    shownTf.value = t

    // Nothing stored: ask the server to fetch it, then look again while it does.
    const asked = await requestHistory(id, t)
    if (mine !== seq) return
    if (asked.state !== 'queued') {
      state.value = 'empty'
      busy.value = false
      note.value = `No history for this range: ${asked.reason}`
      return
    }
    const status = attempt > 0 ? await historyStatus(id, t) : null
    if (mine !== seq) return
    const said = status ? explainHistory(status) : null
    if ((said ? said.waiting : true) && attempt < POLLS) {
      state.value = 'fetching'
      note.value = said?.text || 'Asking the broker for this range…'
      pollTimer = setTimeout(() => void load(attempt + 1), pollDelay(attempt))
      return
    }
    state.value = 'empty'
    busy.value = false
    note.value =
      said?.text ||
      'The broker has not sent this history yet, and the server did not say why. Try again in a minute.'
  } catch (e) {
    if (mine !== seq || quiet) return
    state.value = 'error'
    busy.value = false
    note.value = `The chart could not be loaded${(e as Error).message ? `: ${(e as Error).message}` : ''}.`
  } finally {
    if (mine === seq) inflight = false
  }
}

function retry() {
  forgetHistory(props.instrumentId, tf.value)
  void load()
}

// Separate sources: a new `row` object from the parent (every price tick) does
// NOT reload the chart; only a different stock, range, timeframe or depth does.
watch([() => props.instrumentId, range, tf, limit], () => void load(), { immediate: true })

// Keep intraday charts current while the market is open, without a spinner.
watch(
  () => props.now,
  (now) => {
    if (!isOpen.value || tf.value === '1d' || inflight || state.value !== 'ready') return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    const every = range.value === 'live' ? 30_000 : 60_000
    if (now - loadedAt.value >= every) void load(0, true)
  },
)

const isLive = computed(() => shownRange.value === 'live' && range.value === 'live')
/**
 * What is drawn: the stored candles with the live price folded into the newest
 * one, on every range, while the market is open and the feed is live. When the
 * price has not changed, the same array comes back and nothing redraws.
 */
const keep = stableCandles()
const drawn = computed(() =>
  keep(
    isOpen.value && props.streaming
      ? mergeTick(candles.value, props.ltp, props.ltpAt, shownTf.value, props.now)
      : candles.value,
  ),
)
const unconfirmedLast = computed(() => {
  const last = drawn.value[drawn.value.length - 1]
  return !!last && isOpen.value && isUnconfirmed(last.ts, shownTf.value, props.now)
})
/** The view opens on the range itself (Live: today since 09:15); the warm-up sits off to the left. */
const initialBars = computed(() => {
  const n = barsFor(shownRange.value, shownTf.value)
  if (shownRange.value !== 'live') return n + 2
  const open = sessionStart(props.now)
  const today = drawn.value.filter((c) => Date.parse(c.ts) >= open).length
  return Math.max(30, today + 2)
})

// --- indicator series ------------------------------------------------------------------
const intraday = computed(() => shownTf.value !== '1d')
const numbers = computed(() => toNumbers(drawn.value))
const results = computed(() =>
  defs.value
    .filter((d) => !intradayOnly(d.kind) || intraday.value)
    .map((d) => computeStudy(studyOf(d), numbers.value)),
)
const overlays = computed<ChartGroup[]>(() =>
  results.value
    .filter((r) => r.pane === 'price')
    .map((r) => ({ id: r.study.id, label: r.label, source: r.source, lines: r.lines })),
)
const panes = computed<ChartGroup[]>(() =>
  results.value
    .filter((r) => r.pane === 'sub')
    .map((r) => ({
      id: r.study.id,
      label: r.label,
      source: r.source,
      lines: r.lines,
      range: r.range,
      guides: r.guides,
    })),
)

const footer = computed(() => {
  if (state.value === 'fetching' && drawn.value.length) return note.value
  const tfText = TF_LABEL[shownTf.value] ?? shownTf.value
  if (isLive.value)
    return props.streaming
      ? `Live · ${tfText} candles, moving with each tick`
      : `Today · ${tfText} candles · waiting for the live feed`
  if (!drawn.value.length) return ''
  return `${tfText} candles · read ${ago(new Date(loadedAt.value).toISOString(), props.now)} · scroll back for older`
})
</script>

<template>
  <section class="sc" aria-label="Chart">
    <div class="sc__bar">
      <SegmentedControl
        v-model="range"
        size="sm"
        aria-label="Chart range"
        :options="options"
        :class="{ 'is-liveOn': range === 'live' }"
      />
      <Select
        v-model="tfModel"
        class="sc__tf"
        size="sm"
        aria-label="Timeframe"
        :options="tfOptions"
      />

      <!-- The indicators on the chart, in the bar's spare room: click to set periods. -->
      <span class="sc__ind" role="group" aria-label="Indicators on the chart">
        <span
          v-for="d in defs"
          :key="d.id"
          class="sc__chip"
          :class="{ 'is-editing': editing === d.id, 'is-off': intradayOnly(d.kind) && !intraday }"
          :title="
            intradayOnly(d.kind) && !intraday ? 'VWAP is drawn on intraday timeframes only' : ''
          "
        >
          <button
            type="button"
            class="sc__chipLabel"
            :aria-expanded="editing === d.id"
            :aria-label="`Edit ${indicatorLabel(d)}`"
            @click="toggleEdit(d.id)"
          >
            <span class="sc__dot" :style="{ background: colorCss(d.color) }" />
            {{ indicatorLabel(d) }}
          </button>
          <button
            type="button"
            class="sc__chipX"
            :aria-label="`Remove ${indicatorLabel(d)}`"
            @click="removeIndicator(d.id)"
          >
            ×
          </button>
        </span>
      </span>

      <span class="sc__barEnd">
        <MultiSelect
          v-model="picks"
          class="sc__picker"
          size="sm"
          display="count"
          label="Indicators"
          icon="chart-line"
          :options="pickOptions"
        />
        <span v-if="isOpen && streaming" class="sc__live" aria-hidden="true">LIVE</span>
        <IconButton
          label="Open the full chart: every indicator, drawing room, full screen"
          size="sm"
          tone="default"
          @click="router.push(chartPath(instrumentId, shownTf))"
        >
          <Icon name="maximize" size="sm" />
        </IconButton>
      </span>
    </div>

    <div v-if="edited" class="sc__edit" :aria-label="`${indicatorLabel(edited)} settings`">
      <label v-for="(p, i) in kindInfo(edited.kind).params" :key="p.label" class="sc__field">
        <span>{{ p.label }}</span>
        <NumberInput
          class="sc__num"
          size="sm"
          :min="p.min"
          :max="p.max"
          :step="p.step ?? 1"
          :model-value="draftOf(edited, i)"
          @update:model-value="setDraft(edited.id, i, $event)"
          @blur="commitDraft(edited.id, i)"
          @keydown.enter="commitDraft(edited.id, i)"
        />
      </label>
      <span v-if="edited.kind === 'ema' || edited.kind === 'sma'" class="sc__presets">
        <button
          v-for="p in EMA_PRESETS"
          :key="p"
          type="button"
          class="sc__preset"
          :aria-pressed="edited.params[0] === p"
          @click="setPreset(edited.id, p)"
        >
          {{ p }}
        </button>
      </span>
      <span class="sc__colors" role="group" aria-label="Colour">
        <button
          v-for="c in PALETTE"
          :key="c.key"
          type="button"
          class="sc__swatch"
          :style="{ background: c.css }"
          :aria-label="c.label"
          :aria-pressed="edited.color === c.key"
          @click="setColor(edited.id, c.key)"
        />
      </span>
      <Button size="sm" variant="ghost" @click="editing = null">Done</Button>
    </div>

    <div class="sc__frame" :class="{ 'is-busy': busy && drawn.length }">
      <CandleChart
        v-if="drawn.length"
        :candles="drawn as Candle[]"
        :timeframe="shownTf"
        :height="220"
        :overlays="overlays"
        :panes="panes"
        :unconfirmed-last="unconfirmedLast"
        :series-key="`${shownId}:${shownRange}:${shownTf}`"
        :initial-bars="initialBars"
        :label="`${symbol} price chart`"
      />
      <div v-else-if="state === 'loading' || state === 'fetching'" class="sc__wait">
        <Skeleton height="100%" radius="var(--radius-md)" />
        <span v-if="state === 'fetching'" class="sc__waitNote">{{ note }}</span>
      </div>
      <div v-else class="sc__empty">
        <Icon name="chart-candlestick" size="lg" />
        <span class="sc__muted">{{ note }}</span>
        <div class="sc__actions">
          <Button size="sm" variant="secondary" @click="retry()">
            <Icon name="refresh-cw" size="sm" />Try again
          </Button>
          <Button size="sm" variant="ghost" @click="router.push(chartPath(instrumentId, tf))">
            Open in Charts
          </Button>
        </div>
      </div>
      <span v-if="busy && drawn.length" class="sc__spinner" aria-label="Loading">
        <Icon name="refresh-cw" size="sm" />
      </span>
    </div>
    <p class="sc__foot" aria-live="polite">{{ footer }}</p>
  </section>
</template>

<style scoped>
.sc {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-radius: var(--radius-card);
  border: 1px solid var(--theme-border);
  background: var(--theme-card);
  min-width: 0;
}
.sc__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}
.sc__tf {
  flex: 0 1 150px;
  min-width: 0;
}
.sc__barEnd {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  margin-left: auto;
}
.sc__live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.14em;
  color: var(--theme-success);
}
.sc__live::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--theme-success);
  animation: sc-pulse 1.6s ease-in-out infinite;
}
@keyframes sc-pulse {
  50% {
    opacity: 0.35;
  }
}
.sc__ind {
  display: flex;
  flex: 1 1 160px;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.sc__picker {
  width: 150px;
}
.sc__chip {
  display: inline-flex;
  align-items: center;
  height: 26px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-border);
  background: transparent;
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  transition:
    background var(--dur-fast) ease,
    color var(--dur-fast) ease,
    border-color var(--dur-fast) ease;
}
.sc__ind .sc__chip {
  background: color-mix(in oklch, var(--theme-accent) 10%, transparent);
  color: var(--theme-text);
}
.sc__chip.is-editing {
  border-color: color-mix(in oklch, var(--theme-accent) 60%, var(--theme-border));
}
.sc__chip.is-off {
  opacity: 0.5;
}
.sc__chipLabel,
.sc__chipX {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.sc__chipLabel {
  padding: 0 4px 0 10px;
}
.sc__chipX {
  padding: 0 9px 0 4px;
  color: var(--theme-dim);
  font-size: var(--text-sm);
}
.sc__chipX:hover {
  color: var(--theme-danger);
}
.sc__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.sc__chipLabel:focus-visible,
.sc__chipX:focus-visible,
.sc__preset:focus-visible,
.sc__swatch:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.sc__edit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--theme-border);
}
.sc__field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.sc__num {
  width: 96px;
}
.sc__presets,
.sc__colors {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sc__preset {
  height: 26px;
  min-width: 30px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-border);
  background: transparent;
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-xs);
  cursor: pointer;
}
.sc__preset[aria-pressed='true'] {
  color: var(--theme-text);
  border-color: var(--theme-accent);
}
.sc__swatch {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}
.sc__swatch[aria-pressed='true'] {
  border-color: var(--theme-text);
}
/* A fixed floor, so loading, fetching and the chart all take the same room. */
.sc__frame {
  position: relative;
  min-height: 300px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.sc__frame > :first-child {
  transition: opacity var(--dur-fast) ease;
}
.sc__frame.is-busy > :first-child {
  opacity: 0.55;
}
.sc__wait {
  position: relative;
  flex: 1;
  display: flex;
  min-height: 300px;
}
.sc__wait > :first-child {
  flex: 1;
}
.sc__waitNote {
  position: absolute;
  inset: auto 12px 12px;
  font-size: var(--text-sm);
  color: var(--theme-dim);
  text-align: center;
}
.sc__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  padding: var(--sp-4);
  text-align: center;
  color: var(--theme-dim);
}
.sc__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--sp-2);
}
.sc__actions :deep(.ui-icon) {
  margin-right: 6px;
}
.sc__muted {
  font-size: var(--text-sm);
  color: var(--theme-dim);
  max-width: 46ch;
}
.sc__spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--theme-card);
  border: 1px solid var(--theme-border);
  color: var(--theme-accent);
}
.sc__spinner :deep(.ui-icon) {
  animation: sc-spin 0.9s linear infinite;
}
@keyframes sc-spin {
  to {
    transform: rotate(360deg);
  }
}
.sc__foot {
  margin: 0;
  min-height: 1.4em;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
@media (prefers-reduced-motion: reduce) {
  .sc__live::before,
  .sc__spinner :deep(.ui-icon) {
    animation: none;
  }
}
</style>
