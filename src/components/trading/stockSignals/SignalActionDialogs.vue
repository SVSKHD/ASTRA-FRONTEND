<script setup lang="ts">
// The row actions' dialogs, one at a time:
//   watchlist  add the stock to one of your server watchlists (or a new one),
//              through GET/POST /api/trading/watchlists.
//   alert      subscribe to its crossover / VWAP-confirmation events through the
//              stock-signal monitor; says so plainly when the monitor is absent.
//   impact     its weight, P&L, signal and the risks that follow from them.
//   compare    side by side with another stock from the table.
import { computed, ref, watch } from 'vue'
import { aureon } from '@/api/client'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Alert from '@/components/ui/Alert.vue'
import SignalBadge from './SignalBadge.vue'
import SignalDetail from './SignalDetail.vue'
import { dec, signed } from '@/trading/format'
import { must } from '@/trading/useLoad'
import type { Timeframe } from '@/trading/chartView'
import { strengthWord } from '@/trading/stockSignals/classify'
import {
  AlertsUnavailable,
  EVENT_LABEL,
  SUBSCRIBABLE,
  fetchSubscriptions,
  saveSubscription,
  type StockSignalEventType,
} from '@/trading/stockSignals/alertsApi'
import { CONCENTRATION, type HoldingView } from '@/trading/stockSignals/portfolio'
import type { RowData, UniverseItem } from '@/trading/stockSignals/useStockSignals'

export type ActionKind = 'watchlist' | 'alert' | 'impact' | 'compare'

const props = defineProps<{
  action: { kind: ActionKind; item: UniverseItem } | null
  items: readonly UniverseItem[]
  rows: Readonly<Record<number, RowData>>
  holdings: ReadonlyMap<number, HoldingView>
  tf: Timeframe
  now: number
}>()
const emit = defineEmits<{ close: []; done: [string] }>()

const item = computed(() => props.action?.item ?? null)
const sym = computed(
  () => item.value?.instrument.trading_symbol || item.value?.instrument.symbol || '',
)
const busy = ref(false)
const error = ref('')
const note = ref('')
watch(
  () => props.action,
  (a) => {
    error.value = ''
    note.value = ''
    if (a?.kind === 'watchlist') void loadLists()
    if (a?.kind === 'alert') void loadSub()
    if (a?.kind === 'compare') other.value = ''
  },
)

// --- watchlist ---------------------------------------------------------------------------
const NEW = '__new__'
const lists = ref<{ id: string; name: string; has: boolean }[]>([])
const listId = ref('')
const newName = ref('')
async function loadLists() {
  busy.value = true
  try {
    const all = must(await aureon.GET('/api/trading/watchlists'))
    lists.value = all.map((l) => ({
      id: l.id,
      name: l.name,
      has: l.items.some((i) => i.instrument_id === item.value?.instrument.id),
    }))
    listId.value = lists.value.find((l) => !l.has)?.id ?? NEW
  } catch (e) {
    error.value = `Your watchlists could not be read: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}
const listOptions = computed(() => [
  ...lists.value.map((l) => ({
    value: l.id,
    label: l.has ? `${l.name} (already there)` : l.name,
    disabled: l.has,
  })),
  { value: NEW, label: 'New watchlist…' },
])
async function addToList() {
  if (!item.value) return
  busy.value = true
  error.value = ''
  try {
    let id = listId.value
    let name = lists.value.find((l) => l.id === id)?.name ?? ''
    if (id === NEW) {
      name = newName.value.trim()
      if (!name) {
        error.value = 'Name the new watchlist.'
        return
      }
      const created = must(await aureon.POST('/api/trading/watchlists', { body: { name } }))
      id = created.id
    }
    must(
      await aureon.POST('/api/trading/watchlists/{watchlist_id}/items', {
        params: { path: { watchlist_id: id } },
        body: { instrument_id: item.value.instrument.id },
      }),
    )
    emit('done', `Added ${sym.value} to ${name}.`)
  } catch (e) {
    error.value = (e as Error).message || 'It could not be added.'
  } finally {
    busy.value = false
  }
}

// --- alert subscription ------------------------------------------------------------------
const types = ref<StockSignalEventType[]>([])
const subUnavailable = ref(false)
async function loadSub() {
  busy.value = true
  subUnavailable.value = false
  try {
    const subs = await fetchSubscriptions()
    types.value = subs.find((s) => s.instrument_id === item.value?.instrument.id)?.types ?? [
      ...SUBSCRIBABLE,
    ]
  } catch (e) {
    if (e instanceof AlertsUnavailable) subUnavailable.value = true
    else error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
function toggleType(t: StockSignalEventType, on: boolean) {
  types.value = on ? [...new Set([...types.value, t])] : types.value.filter((x) => x !== t)
}
async function saveSub() {
  if (!item.value) return
  busy.value = true
  error.value = ''
  try {
    await saveSubscription(item.value.instrument.id, types.value)
    emit(
      'done',
      types.value.length ? `Alerts on for ${sym.value}.` : `Alerts off for ${sym.value}.`,
    )
  } catch (e) {
    if (e instanceof AlertsUnavailable) subUnavailable.value = true
    else error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

// --- impact --------------------------------------------------------------------------------
const holding = computed(() =>
  item.value ? (props.holdings.get(item.value.instrument.id) ?? null) : null,
)
const reading = computed(() =>
  item.value ? (props.rows[item.value.instrument.id]?.reading ?? null) : null,
)
const risks = computed(() => {
  const out: string[] = []
  const h = holding.value
  const r = reading.value
  if (h && h.weight > CONCENTRATION)
    out.push(
      `It is ${(h.weight * 100).toFixed(0)}% of your holdings, over the ${CONCENTRATION * 100}% concentration line.`,
    )
  if (r?.cls === 'bearish')
    out.push('Its trend is bearish and confirmed by VWAP while you hold it.')
  if (r?.cls === 'pending' && r.cross?.direction === 'down')
    out.push('EMA 8 just crossed below EMA 32; VWAP has not confirmed yet.')
  if (r?.cls === 'mixed') out.push('EMAs and VWAP disagree: the trend is not settled.')
  if (h?.pnlPct !== null && h?.pnlPct !== undefined && h.pnlPct < -10)
    out.push(`It is ${Math.abs(h.pnlPct).toFixed(1)}% below your average cost.`)
  if (!r || r.cls === 'unavailable')
    out.push('There is no fresh signal data for it, so its trend is unknown.')
  return out
})

// --- compare -------------------------------------------------------------------------------
const other = ref('')
const otherOptions = computed(() =>
  props.items
    .filter((i) => i.instrument.id !== item.value?.instrument.id)
    .map((i) => ({ value: String(i.instrument.id), label: i.instrument.symbol })),
)
const pair = computed(() => {
  const b = props.items.find((i) => String(i.instrument.id) === other.value)
  return item.value && b ? [item.value, b] : null
})
function cell(i: UniverseItem) {
  const r = props.rows[i.instrument.id]?.reading ?? null
  const h = props.holdings.get(i.instrument.id) ?? null
  return { r, h, change: props.rows[i.instrument.id]?.change ?? null }
}
const title = computed(() => {
  switch (props.action?.kind) {
    case 'watchlist':
      return `Add ${sym.value} to a watchlist`
    case 'alert':
      return `Alerts for ${sym.value}`
    case 'impact':
      return `${sym.value} in your portfolio`
    case 'compare':
      return `Compare ${sym.value}`
    default:
      return ''
  }
})
const p = (v: number | null | undefined, dp = 2) =>
  v === null || v === undefined ? '—' : dec(v, dp)
</script>

<template>
  <Modal
    :open="!!action"
    :title="title"
    :size="action?.kind === 'compare' || action?.kind === 'impact' ? 'lg' : 'md'"
    @close="emit('close')"
  >
    <Alert v-if="error" tone="danger">{{ error }}</Alert>

    <!-- watchlist -->
    <form v-if="action?.kind === 'watchlist'" class="ad" @submit.prevent="addToList">
      <Select v-model="listId" :options="listOptions" size="md" aria-label="Watchlist" />
      <TextInput
        v-if="listId === NEW"
        v-model="newName"
        size="md"
        placeholder="Name of the new watchlist"
        aria-label="New watchlist name"
      />
      <p class="ad__note">Saved to your Aureon account, so it shows on every device.</p>
      <div class="ad__row">
        <Button type="submit" variant="primary" :loading="busy">Add</Button>
        <Button variant="ghost" @click="emit('close')">Cancel</Button>
      </div>
    </form>

    <!-- alert -->
    <div v-else-if="action?.kind === 'alert'" class="ad">
      <Alert v-if="subUnavailable" tone="info" title="Not available yet">
        Alerts come from the backend’s stock-signal monitor, which is not deployed on this server
        yet. Nothing has been saved. Once it ships, this dialog subscribes you for real.
      </Alert>
      <template v-else>
        <p class="ad__note">Notify me when {{ sym }}:</p>
        <Checkbox
          v-for="t in SUBSCRIBABLE"
          :key="t"
          :model-value="types.includes(t)"
          :label="EVENT_LABEL[t]"
          @update:model-value="(on: boolean) => toggleType(t, on)"
        />
        <div class="ad__row">
          <Button variant="primary" :loading="busy" @click="saveSub">Save</Button>
          <Button variant="ghost" @click="emit('close')">Cancel</Button>
        </div>
      </template>
    </div>

    <!-- impact -->
    <div v-else-if="action?.kind === 'impact'" class="ad">
      <SignalDetail :reading="reading" :tf="tf" :now="now" :holding="holding" />
      <section class="ad__risks">
        <h4>Risks to watch</h4>
        <ul v-if="risks.length">
          <li v-for="r in risks" :key="r">{{ r }}</li>
        </ul>
        <p v-else class="ad__note">
          Nothing stands out: the trend agrees with holding it and it is not over-weight.
        </p>
      </section>
    </div>

    <!-- compare -->
    <div v-else-if="action?.kind === 'compare'" class="ad">
      <Select
        v-model="other"
        :options="otherOptions"
        size="md"
        placeholder="Pick a stock to compare with"
        aria-label="Compare with"
      />
      <div v-if="pair" class="ad__cmp tp-num">
        <table>
          <thead>
            <tr>
              <th scope="col"></th>
              <th v-for="i in pair" :key="i.instrument.id" scope="col">
                {{ i.instrument.symbol }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Signal</th>
              <td v-for="i in pair" :key="i.instrument.id">
                <SignalBadge :cls="cell(i).r?.cls ?? 'unavailable'" />
              </td>
            </tr>
            <tr>
              <th scope="row">Trend score</th>
              <td v-for="i in pair" :key="i.instrument.id">
                {{ cell(i).r?.strength ?? '—' }} {{ strengthWord(cell(i).r?.strength ?? null) }}
              </td>
            </tr>
            <tr>
              <th scope="row">Change</th>
              <td v-for="i in pair" :key="i.instrument.id">
                {{ cell(i).change === null ? '—' : `${signed(cell(i).change, 2)}%` }}
              </td>
            </tr>
            <tr>
              <th scope="row">EMA 8 / 32</th>
              <td v-for="i in pair" :key="i.instrument.id">
                {{ p(cell(i).r?.ema8) }} / {{ p(cell(i).r?.ema32) }}
              </td>
            </tr>
            <tr>
              <th scope="row">VWAP distance</th>
              <td v-for="i in pair" :key="i.instrument.id">
                {{
                  cell(i).r?.vwapDistPct == null ? 'n/a' : `${signed(cell(i).r!.vwapDistPct, 2)}%`
                }}
              </td>
            </tr>
            <tr>
              <th scope="row">RSI / ADX</th>
              <td v-for="i in pair" :key="i.instrument.id">
                {{ p(cell(i).r?.rsi, 1) }} / {{ p(cell(i).r?.adx, 1) }}
              </td>
            </tr>
            <tr>
              <th scope="row">Portfolio</th>
              <td v-for="i in pair" :key="i.instrument.id">
                {{ cell(i).h ? `${(cell(i).h!.weight * 100).toFixed(1)}% held` : 'Not held' }}
              </td>
            </tr>
            <tr>
              <th scope="row">P&amp;L</th>
              <td v-for="i in pair" :key="i.instrument.id">
                {{ cell(i).h?.pnl == null ? '—' : signed(cell(i).h!.pnl, 0) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="ad__note">Pick a second stock from the table to see them side by side.</p>
    </div>
  </Modal>
</template>

<style scoped>
.ad {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.ad__row {
  display: flex;
  gap: var(--sp-2);
}
.ad__note {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-dim);
}
.ad__risks h4 {
  margin: 0 0 var(--sp-2);
  font-size: var(--text-sm);
  color: var(--theme-text);
}
.ad__risks ul {
  margin: 0;
  padding-left: 1.2em;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--text-sm);
  color: var(--theme-text);
}
.ad__cmp {
  overflow-x: auto;
}
.ad__cmp table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.ad__cmp th,
.ad__cmp td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--theme-border);
  text-align: left;
}
.ad__cmp tbody th {
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: var(--theme-dim);
}
.ad__cmp thead th {
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
</style>
