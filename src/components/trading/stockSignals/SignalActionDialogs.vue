<script setup lang="ts">
// The row actions' dialogs, one at a time:
//   watchlist  add the stock to one of your server watchlists (or a new one).
//   alert      whether this stock's crossovers reach you: the engine notifies
//              watchers of an instrument, its holders, and users with "all
//              market" on, within their preferences (docs/37 §5). From here:
//              watch it, and the preference switches that matter.
//   impact     a held stock's weight, P&L, advisory class, reasons and signal.
//   compare    side by side with another stock from the table.
import { computed, ref, watch } from 'vue'
import { aureon } from '@/api/client'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import SignalNotice from './SignalNotice.vue'
import SignalBadge from './SignalBadge.vue'
import SignalDetail from './SignalDetail.vue'
import { dec, signed } from '@/trading/format'
import { must } from '@/trading/useLoad'
import {
  CLASS_LABEL,
  KIND_LABEL,
  fetchPrefs,
  num,
  savePrefs,
  type NotificationKind,
  type PortfolioHolding,
  type Prefs,
  type SignalEvent,
  type StateRow,
} from '@/trading/stockSignals/api'
import type { Target } from '@/trading/stockSignals/useStockSignals'

export type ActionKind = 'watchlist' | 'alert' | 'impact' | 'compare'

const props = defineProps<{
  action: { kind: ActionKind; target: Target } | null
  rows: readonly StateRow[]
  events: ReadonlyMap<number, SignalEvent>
  holdingOf: (id: number) => PortfolioHolding | null
  now: number
}>()
const emit = defineEmits<{ close: []; done: [string] }>()

const target = computed(() => props.action?.target ?? null)
const row = computed(() => props.rows.find((r) => r.instrument_id === target.value?.id) ?? null)
const busy = ref(false)
const error = ref('')
watch(
  () => props.action,
  (a) => {
    error.value = ''
    if (a?.kind === 'watchlist' || a?.kind === 'alert') void loadLists()
    if (a?.kind === 'alert') void loadPrefs()
    if (a?.kind === 'compare') other.value = ''
  },
)

// --- watchlists ----------------------------------------------------------------------------
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
      has: l.items.some((i) => i.instrument_id === target.value?.id),
    }))
    listId.value = lists.value.find((l) => !l.has)?.id ?? NEW
  } catch (e) {
    error.value = `Your watchlists could not be read: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}
const watched = computed(() => lists.value.filter((l) => l.has).map((l) => l.name))
const listOptions = computed(() => [
  ...lists.value.map((l) => ({
    value: l.id,
    label: l.has ? `${l.name} (already there)` : l.name,
    disabled: l.has,
  })),
  { value: NEW, label: 'New watchlist…' },
])
async function addToList(): Promise<boolean> {
  if (!target.value) return false
  busy.value = true
  error.value = ''
  try {
    let id = listId.value
    let name = lists.value.find((l) => l.id === id)?.name ?? ''
    if (id === NEW) {
      name = newName.value.trim()
      if (!name) {
        error.value = 'Name the new watchlist.'
        return false
      }
      id = must(await aureon.POST('/api/trading/watchlists', { body: { name } })).id
    }
    must(
      await aureon.POST('/api/trading/watchlists/{watchlist_id}/items', {
        params: { path: { watchlist_id: id } },
        body: { instrument_id: target.value.id },
      }),
    )
    lists.value = lists.value.map((l) => (l.id === id ? { ...l, has: true } : l))
    if (!lists.value.some((l) => l.id === id))
      lists.value = [...lists.value, { id, name, has: true }]
    emit('done', `Added ${target.value.symbol} to ${name}.`)
    return true
  } catch (e) {
    error.value = (e as Error).message || 'It could not be added.'
    return false
  } finally {
    busy.value = false
  }
}

// --- alerts ------------------------------------------------------------------------------------
const prefs = ref<Prefs | null>(null)
async function loadPrefs() {
  try {
    prefs.value = await fetchPrefs()
  } catch (e) {
    error.value = `Your alert preferences could not be read: ${(e as Error).message}`
  }
}
const held = computed(
  () => !!row.value?.in_holdings || !!(target.value && props.holdingOf(target.value.id)),
)
const covered = computed(
  () =>
    !!prefs.value?.enabled && (held.value || watched.value.length > 0 || !!prefs.value?.all_market),
)
const CROSS_KINDS: NotificationKind[] = ['bullish_cross', 'bearish_cross', 'vwap_confirmed']
function kindOn(k: NotificationKind) {
  const kinds = prefs.value?.kinds ?? []
  return !kinds.length || kinds.includes(k)
}
function setKind(k: NotificationKind, on: boolean) {
  if (!prefs.value) return
  const all = Object.keys(KIND_LABEL) as NotificationKind[]
  const cur = prefs.value.kinds?.length ? prefs.value.kinds : all
  const next = on ? [...new Set([...cur, k])] : cur.filter((x) => x !== k)
  prefs.value = { ...prefs.value, kinds: next.length === all.length ? [] : next }
}
async function saveAlerts() {
  if (!prefs.value) return
  busy.value = true
  error.value = ''
  try {
    prefs.value = await savePrefs({ ...prefs.value, enabled: true })
    emit('done', 'Alert preferences saved.')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

// --- impact / compare ----------------------------------------------------------------------------
const holding = computed(() => (target.value ? props.holdingOf(target.value.id) : null))
const other = ref('')
const otherOptions = computed(() =>
  props.rows
    .filter((r) => r.instrument_id !== target.value?.id)
    .map((r) => ({ value: String(r.instrument_id), label: r.symbol })),
)
const pair = computed(() => {
  const a = row.value
  const b = props.rows.find((r) => String(r.instrument_id) === other.value)
  return a && b ? [a, b] : null
})
const title = computed(() => {
  const s = target.value?.symbol ?? ''
  switch (props.action?.kind) {
    case 'watchlist':
      return `Add ${s} to a watchlist`
    case 'alert':
      return `Alerts for ${s}`
    case 'impact':
      return `${s} in your portfolio`
    case 'compare':
      return `Compare ${s}`
    default:
      return ''
  }
})
const p = (v: string | number | null | undefined, dp = 2) => {
  const n = num(v)
  return n === null ? '—' : dec(n, dp)
}
</script>

<template>
  <Modal
    :open="!!action"
    :title="title"
    :size="action?.kind === 'compare' || action?.kind === 'impact' ? 'lg' : 'md'"
    @close="emit('close')"
  >
    <SignalNotice v-if="error" tone="danger">{{ error }}</SignalNotice>

    <form v-if="action?.kind === 'watchlist'" class="ad" @submit.prevent="addToList">
      <Select v-model="listId" :options="listOptions" size="md" aria-label="Watchlist" />
      <TextInput
        v-if="listId === NEW"
        v-model="newName"
        size="md"
        placeholder="Name of the new watchlist"
        aria-label="New watchlist name"
      />
      <p class="ad__note">
        Saved to your Aureon account. Stocks you watch also send you signal alerts.
      </p>
      <div class="ad__row">
        <Button type="submit" variant="primary" :loading="busy">Add</Button>
        <Button variant="ghost" @click="emit('close')">Cancel</Button>
      </div>
    </form>

    <div v-else-if="action?.kind === 'alert'" class="ad">
      <p class="ad__note">
        Signal alerts come for the stocks you hold or watch (or every stock, if you turn that on),
        filtered by your preferences.
      </p>
      <SignalNotice v-if="prefs && covered" tone="success" title="This stock reaches you">
        {{
          held
            ? 'You hold it'
            : watched.length
              ? `It is on ${watched.join(', ')}`
              : 'Alerts are on for every stock'
        }}.
      </SignalNotice>
      <SignalNotice v-else-if="prefs && !prefs.enabled" tone="warning" title="Alerts are off">
        Saving below turns them back on.
      </SignalNotice>
      <template v-else-if="prefs">
        <SignalNotice tone="info" title="Not watched yet"
          >Add it to a watchlist so its crossovers reach you.</SignalNotice
        >
        <form class="ad__inline" @submit.prevent="addToList">
          <Select v-model="listId" :options="listOptions" size="sm" aria-label="Watchlist" />
          <TextInput
            v-if="listId === NEW"
            v-model="newName"
            size="sm"
            placeholder="New watchlist name"
            aria-label="New watchlist name"
          />
          <Button type="submit" size="sm" variant="secondary" :loading="busy">Watch it</Button>
        </form>
      </template>
      <template v-if="prefs">
        <span class="ad__label">Send me</span>
        <Checkbox
          v-for="k in CROSS_KINDS"
          :key="k"
          :model-value="kindOn(k)"
          :label="KIND_LABEL[k]"
          @update:model-value="(on: boolean) => setKind(k, on)"
        />
        <Checkbox
          :model-value="prefs.confirmed_only"
          label="Only VWAP-confirmed crossovers"
          @update:model-value="(on: boolean) => (prefs = { ...prefs!, confirmed_only: on })"
        />
        <p class="ad__note">These apply to every stock. All preferences are on the Alerts tab.</p>
        <div class="ad__row">
          <Button variant="primary" :loading="busy" @click="saveAlerts">Save</Button>
          <Button variant="ghost" @click="emit('close')">Close</Button>
        </div>
      </template>
    </div>

    <div v-else-if="action?.kind === 'impact'" class="ad">
      <SignalDetail
        :state="row"
        :event="target ? (events.get(target.id) ?? null) : null"
        :holding="holding"
        :now="now"
      />
      <p v-if="!holding" class="ad__note">The portfolio map has no entry for this holding yet.</p>
    </div>

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
              <th v-for="r in pair" :key="r.instrument_id" scope="col">{{ r.symbol }}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Signal</th>
              <td v-for="r in pair" :key="r.instrument_id"><SignalBadge :state="r.state" /></td>
            </tr>
            <tr>
              <th scope="row">Trend score</th>
              <td v-for="r in pair" :key="r.instrument_id">{{ p(r.trend_score, 0) }}</td>
            </tr>
            <tr>
              <th scope="row">Change</th>
              <td v-for="r in pair" :key="r.instrument_id">
                {{ num(r.change_pct) === null ? '—' : `${signed(r.change_pct, 2)}%` }}
              </td>
            </tr>
            <tr>
              <th scope="row">EMA 8 / 32</th>
              <td v-for="r in pair" :key="r.instrument_id">
                {{ p(r.ema_fast) }} / {{ p(r.ema_slow) }}
              </td>
            </tr>
            <tr>
              <th scope="row">VWAP distance</th>
              <td v-for="r in pair" :key="r.instrument_id">
                {{ num(r.vwap_distance_pct) === null ? '—' : `${signed(r.vwap_distance_pct, 2)}%` }}
              </td>
            </tr>
            <tr>
              <th scope="row">RSI / ADX</th>
              <td v-for="r in pair" :key="r.instrument_id">
                {{ p(r.rsi, 1) }} / {{ p(r.adx, 1) }}
              </td>
            </tr>
            <tr>
              <th scope="row">Rel. volume</th>
              <td v-for="r in pair" :key="r.instrument_id">
                {{ num(r.rvol) === null ? '—' : `${p(r.rvol)}×` }}
              </td>
            </tr>
            <tr>
              <th scope="row">vs Nifty 50</th>
              <td v-for="r in pair" :key="r.instrument_id">
                {{ num(r.relative_pct) === null ? '—' : `${signed(r.relative_pct, 2)}%` }}
              </td>
            </tr>
            <tr>
              <th scope="row">Portfolio</th>
              <td v-for="r in pair" :key="r.instrument_id">
                <template v-if="holdingOf(r.instrument_id)">
                  {{ p(holdingOf(r.instrument_id)!.allocation_pct, 1) }}% ·
                  {{ CLASS_LABEL[holdingOf(r.instrument_id)!.classification] }}
                </template>
                <template v-else>{{ r.in_holdings ? 'Held' : 'Not held' }}</template>
              </td>
            </tr>
            <tr>
              <th scope="row">P&amp;L</th>
              <td v-for="r in pair" :key="r.instrument_id">
                {{
                  holdingOf(r.instrument_id)?.unrealized_pnl == null
                    ? '—'
                    : signed(holdingOf(r.instrument_id)!.unrealized_pnl, 0)
                }}
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
.ad__row,
.ad__inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}
.ad__note {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-dim);
}
.ad__label {
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
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
