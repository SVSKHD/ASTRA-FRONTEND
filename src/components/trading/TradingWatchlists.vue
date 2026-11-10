<script setup lang="ts">
// Watchlists (/trading/watchlists): named lists of instruments, with live or
// snapshot quotes and how fresh each one is.
//
// Storage: on this device only (src/trading/watchlists.ts) until the backend
// watchlist API exists (docs/market-terminal.md §5); the notice is always on
// screen. An item whose instrument cannot be found in the master (delisted, or
// the master is not synced) or that gets no quote is FLAGGED, never dropped.
import { computed, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import TextInput from '@/components/ui/TextInput.vue'
import InstrumentDetail from './InstrumentDetail.vue'
import InstrumentPicker from './InstrumentPicker.vue'
import MarketPanel from './MarketPanel.vue'
import { useNow } from '@/control/poll'
import { useUiStore } from '@/stores/ui'
import { ago, dec, when } from '@/trading/format'
import { describe, type Instrument } from '@/trading/instruments'
import { changeOf, fetchQuotes, NO_CHANGE_REASON, quoteView, type QuoteOut } from '@/trading/quotes'
import { remember, resolveItems, type Resolution } from '@/trading/resolve'
import { chartPath, pathFor } from '@/trading/sections'
import { connect, live } from '@/trading/stream'
import { ApiFailure } from '@/trading/useLoad'
import {
  allInstruments,
  STORAGE_NOTE,
  watchlistStore,
  type WatchlistItem,
} from '@/trading/watchlists'

const { isPhone } = storeToRefs(useUiStore())
const route = useRoute()
const router = useRouter()
const now = useNow(5_000)
const store = watchlistStore()

// --- which list ---------------------------------------------------------------------------------
const selectedId = ref(String(route.query.list ?? '') || store.lists[0]?.id || '')
const current = computed(() => store.lists.find((l) => l.id === selectedId.value) ?? null)
watch(
  () => store.lists.map((l) => l.id).join(),
  () => {
    if (!current.value) selectedId.value = store.lists[0]?.id ?? ''
  },
)
const listOptions = computed(() =>
  store.lists.map((l) => ({ value: l.id, label: `${l.name} (${l.items.length})` })),
)

// --- list CRUD ----------------------------------------------------------------------------------
const newName = ref('')
const formError = ref('')
function createList() {
  formError.value = ''
  try {
    const l = store.create(newName.value)
    newName.value = ''
    selectedId.value = l.id
  } catch (e) {
    formError.value = (e as Error).message
  }
}
const renaming = ref(false)
const renameText = ref('')
function startRename() {
  renameText.value = current.value?.name ?? ''
  renaming.value = true
  formError.value = ''
}
function saveRename() {
  if (!current.value) return
  try {
    store.rename(current.value.id, renameText.value)
    renaming.value = false
    formError.value = ''
  } catch (e) {
    formError.value = (e as Error).message
  }
}
const confirmingDelete = ref(false)
watch(selectedId, () => {
  confirmingDelete.value = false
  renaming.value = false
})
function deleteList() {
  if (!current.value) return
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  store.remove(current.value.id)
  confirmingDelete.value = false
}

function addInstrument(i: Instrument) {
  if (!current.value) return
  formError.value = ''
  try {
    remember([i])
    store.add(current.value.id, { id: i.id, symbol: i.symbol, broker: i.broker })
  } catch (e) {
    formError.value = (e as Error).message
  }
}
function removeItem(id: number) {
  if (current.value) store.removeItem(current.value.id, id)
}

// --- the live stream follows every instrument on every list ---------------------------------------
watch(
  () =>
    allInstruments(store.lists)
      .map((i) => i.id)
      .join(),
  () => connect(allInstruments(store.lists).map((i) => i.id)),
  { immediate: true },
)

// --- resolve items and read snapshot quotes --------------------------------------------------------
const resolution = shallowRef(new Map<number, Resolution>())
const resolving = ref(false)
const snapshots = shallowRef(new Map<string, QuoteOut>())
const quotesError = ref('')
const quotesAt = ref<string | null>(null)
let seq = 0

async function refresh() {
  const items = current.value?.items ?? []
  const mine = ++seq
  quotesError.value = ''
  if (!items.length) {
    resolution.value = new Map()
    snapshots.value = new Map()
    return
  }
  resolving.value = true
  try {
    const res = await resolveItems(items)
    if (mine !== seq) return
    resolution.value = res
    const refs = [...res.values()]
      .map((r) =>
        r.status === 'ok' && r.instrument.broker === 'dhan'
          ? r.instrument.broker_instrument_id
          : '',
      )
      .filter(Boolean)
    if (refs.length) {
      try {
        snapshots.value = await fetchQuotes(refs)
        quotesAt.value = new Date().toISOString()
      } catch (e) {
        if (mine !== seq) return
        snapshots.value = new Map()
        quotesError.value =
          e instanceof ApiFailure
            ? `Quotes could not be read: ${e.message}.`
            : 'Quotes could not be reached.'
      }
    }
  } finally {
    if (mine === seq) resolving.value = false
  }
}
watch(
  () => `${selectedId.value}|${current.value?.items.map((i) => i.id).join() ?? ''}`,
  () => void refresh(),
  { immediate: true },
)

interface Row {
  item: WatchlistItem
  res: Resolution | undefined
  instrument: Instrument | null
  quote: ReturnType<typeof quoteView>
  flag: { tone: 'danger' | 'warning' | 'neutral'; label: string; text: string } | null
}
const rows = computed<Row[]>(() =>
  (current.value?.items ?? []).map((item) => {
    const res = resolution.value.get(item.id)
    const instrument = res?.status === 'ok' ? res.instrument : null
    const quote = quoteView(
      live.quotes[item.id],
      instrument ? snapshots.value.get(instrument.broker_instrument_id) : undefined,
      live.status,
      now.value,
    )
    let flag: Row['flag'] = null
    if (res?.status === 'missing') {
      flag = {
        tone: 'danger',
        label: 'Not in master',
        text: `Instrument ${item.id} (${item.symbol}) is not in the instrument master: delisted, or the master is not synced. It stays on the list until you remove it.`,
      }
    } else if (res?.status === 'error') {
      flag = { tone: 'warning', label: 'Unchecked', text: `Could not look it up: ${res.message}` }
    } else if (res?.status === 'ok' && !quote && !resolving.value && !quotesError.value) {
      flag = {
        tone: 'neutral',
        label: 'No quote',
        text: `The broker returned no quote for ${res.instrument.broker_instrument_id}.`,
      }
    }
    return { item, res, instrument, quote, flag }
  }),
)
const flagged = computed(() => rows.value.filter((r) => r.flag && r.flag.tone !== 'neutral').length)

// --- detail ------------------------------------------------------------------------------------
const openRow = shallowRef<Row | null>(null)
const openQuote = computed(() =>
  openRow.value
    ? (rows.value.find((r) => r.item.id === openRow.value!.item.id)?.quote ?? null)
    : null,
)
function onRowKey(e: KeyboardEvent, r: Row) {
  if (e.target !== e.currentTarget) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    openRow.value = r
  }
}
function removeOpen() {
  if (openRow.value) removeItem(openRow.value.item.id)
  openRow.value = null
}
function openChart(id: number) {
  void router.push(chartPath(id))
}
const screenerLink = computed(() =>
  current.value ? pathFor('screener', { watchlist: current.value.id }) : '',
)
function changeCell(r: Row) {
  const c = r.quote ? changeOf(r.quote.last, r.quote.previousClose) : null
  return c ? { text: `${c.pct}%`, title: c.change } : { text: '—', title: NO_CHANGE_REASON }
}
</script>

<template>
  <div class="tp-page">
    <p class="tp-note wl__storage" role="note">{{ STORAGE_NOTE[store.storage] }}</p>

    <div class="wl" :class="{ 'is-phone': isPhone }">
      <!-- lists -->
      <Card title="Watchlists" class="wl__lists">
        <Select
          v-if="isPhone && store.lists.length"
          v-model="selectedId"
          :options="listOptions"
          size="md"
          aria-label="Watchlist"
        />
        <ul v-else-if="store.lists.length" class="wl__names" aria-label="Your watchlists">
          <li v-for="l in store.lists" :key="l.id">
            <button
              type="button"
              class="wl__name"
              :class="{ 'is-on': l.id === selectedId }"
              :aria-current="l.id === selectedId ? 'true' : undefined"
              @click="selectedId = l.id"
            >
              <span class="wl__name-text">{{ l.name }}</span>
              <span class="wl__count">{{ l.items.length }}</span>
            </button>
          </li>
        </ul>
        <form class="wl__form" @submit.prevent="createList">
          <TextInput
            v-model="newName"
            size="sm"
            placeholder="New list name"
            aria-label="New list name"
            class="wl__grow"
          />
          <Button type="submit" size="sm" variant="secondary">Create</Button>
        </form>
      </Card>

      <!-- the current list -->
      <Card class="wl__main">
        <template #header>
          <div class="tp-head">
            <template v-if="current && renaming">
              <form class="wl__form wl__grow" @submit.prevent="saveRename">
                <TextInput
                  v-model="renameText"
                  size="sm"
                  aria-label="Watchlist name"
                  class="wl__grow"
                />
                <Button type="submit" size="sm" variant="primary">Save</Button>
                <Button size="sm" variant="ghost" @click="renaming = false">Cancel</Button>
              </form>
            </template>
            <template v-else>
              <span class="tp-title">{{ current?.name ?? 'No watchlist' }}</span>
              <div v-if="current" class="tp-row">
                <RouterLink :to="screenerLink" class="wl__link">Screen this list</RouterLink>
                <Button size="sm" variant="ghost" @click="startRename">Rename</Button>
                <Button
                  size="sm"
                  :variant="confirmingDelete ? 'danger' : 'ghost'"
                  @click="deleteList"
                >
                  {{ confirmingDelete ? `Delete “${current.name}”?` : 'Delete' }}
                </Button>
                <Button
                  v-if="confirmingDelete"
                  size="sm"
                  variant="ghost"
                  @click="confirmingDelete = false"
                  >Keep</Button
                >
              </div>
            </template>
          </div>
        </template>

        <p v-if="formError" class="tp-note wl__error" role="alert">{{ formError }}</p>

        <EmptyState
          v-if="!store.lists.length"
          title="No watchlists yet"
          description="Name a list on the left to start one, or add instruments from the Market Explorer."
        />
        <template v-else-if="current">
          <InstrumentPicker
            :key="current.id"
            placeholder="Add an instrument: search the master…"
            size="sm"
            @pick="addInstrument"
          />

          <EmptyState
            v-if="!current.items.length"
            title="This list is empty"
            description="Search above, or add from the Market Explorer's instrument detail."
          />
          <template v-else>
            <div class="tp-row wl__status">
              <span v-if="resolving" class="tp-note">Checking instruments and reading quotes…</span>
              <span v-else-if="quotesError" class="tp-note wl__warn" role="alert">{{
                quotesError
              }}</span>
              <span v-else-if="quotesAt" class="tp-note" :title="when(quotesAt)"
                >Snapshot read {{ ago(quotesAt, now) }}; live where the stream has ticked</span
              >
              <span v-if="flagged" class="tp-note wl__warn">{{ flagged }} flagged</span>
              <Button size="sm" variant="ghost" :loading="resolving" @click="refresh"
                >Refresh</Button
              >
            </div>
            <div v-if="resolving && !resolution.size" class="wl__skeleton">
              <Skeleton :lines="Math.min(current.items.length, 6)" height="24px" />
            </div>
            <ul class="wl__items" aria-label="Instruments on this list">
              <li
                v-for="r in rows"
                :key="r.item.id"
                class="wl__item"
                :class="{ 'is-flagged': r.flag && r.flag.tone !== 'neutral' }"
                tabindex="0"
                :aria-label="`${r.item.symbol}${r.flag ? `, ${r.flag.label}` : ''}`"
                @click="openRow = r"
                @keydown="onRowKey($event, r)"
              >
                <div class="wl__item-main">
                  <span class="tp-strong">{{ r.item.symbol }}</span>
                  <span class="tp-note">{{
                    r.instrument
                      ? describe(r.instrument)
                      : r.res
                        ? `Instrument ${r.item.id}`
                        : 'Checking…'
                  }}</span>
                </div>
                <div class="wl__item-quote tp-num">
                  <span class="wl__price">{{ dec(r.quote?.last) }}</span>
                  <span class="tp-note" :title="changeCell(r).title">{{ changeCell(r).text }}</span>
                  <span class="tp-note" :title="r.quote ? when(r.quote.at) : 'No quote'">{{
                    r.quote ? ago(r.quote.at, now) : '—'
                  }}</span>
                </div>
                <div class="wl__item-badges">
                  <Badge
                    v-if="r.flag"
                    :tone="r.flag.tone"
                    :label="r.flag.label"
                    :title="r.flag.text"
                  />
                  <Badge
                    v-if="r.quote"
                    :tone="r.quote.freshness.tone"
                    :label="r.quote.freshness.label"
                    :title="r.quote.freshness.text"
                  />
                </div>
                <div class="tp-row wl__item-actions" @click.stop>
                  <Button size="sm" variant="ghost" @click="openChart(r.item.id)">Chart</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    :aria-label="`Remove ${r.item.symbol}`"
                    @click="removeItem(r.item.id)"
                  >
                    Remove
                  </Button>
                </div>
              </li>
            </ul>
          </template>
        </template>
      </Card>
    </div>

    <MarketPanel :open="!!openRow" :title="openRow?.item.symbol ?? ''" @close="openRow = null">
      <template v-if="openRow">
        <InstrumentDetail
          v-if="openRow.instrument"
          :instrument="openRow.instrument"
          :quote="openQuote"
        />
        <div v-else class="tp-page">
          <p class="tp-note wl__warn">{{ openRow.flag?.text ?? 'Not checked yet.' }}</p>
          <div class="tp-row">
            <Button size="sm" variant="secondary" @click="openChart(openRow.item.id)"
              >Open chart</Button
            >
            <Button size="sm" variant="ghost" @click="removeOpen"> Remove from list </Button>
          </div>
        </div>
      </template>
    </MarketPanel>
  </div>
</template>

<style scoped>
.wl {
  display: grid;
  grid-template-columns: minmax(200px, 260px) minmax(0, 1fr);
  gap: var(--sp-4);
  align-items: start;
  min-width: 0;
}
.wl.is-phone {
  grid-template-columns: minmax(0, 1fr);
}
@media (max-width: 900px) {
  .wl {
    grid-template-columns: minmax(0, 1fr);
  }
}
.wl__lists,
.wl__main {
  min-width: 0;
}
.wl__storage {
  padding: var(--sp-2) var(--sp-3);
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-md);
}
.wl__names {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 0 var(--sp-2);
  padding: 0;
  list-style: none;
  min-width: 0;
}
.wl__name {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  min-width: 0;
  min-height: 36px;
  padding: var(--sp-1) var(--sp-2);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
}
.wl__name:hover {
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
  color: var(--theme-text);
}
.wl__name:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 1px;
}
.wl__name.is-on {
  background: color-mix(in srgb, var(--theme-accent) 16%, transparent);
  border-color: color-mix(in srgb, var(--theme-accent) 35%, transparent);
  color: var(--theme-text);
}
.wl__name-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wl__count {
  flex-shrink: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.wl__form {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
}
.wl__grow {
  flex: 1 1 140px;
  min-width: 0;
}
.wl__link {
  font-size: var(--text-sm);
  color: var(--theme-accent);
  text-decoration: none;
}
.wl__link:hover,
.wl__link:focus-visible {
  text-decoration: underline;
}
.wl__error {
  color: var(--theme-danger);
}
.wl__warn {
  color: var(--theme-warning);
}
.wl__status {
  justify-content: space-between;
  padding: var(--sp-2) 0;
}
.wl__skeleton {
  padding-bottom: var(--sp-2);
}
.wl__items {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.wl__item {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-2);
  min-height: 48px;
  padding: var(--sp-2);
  border-bottom: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  min-width: 0;
}
.wl__item:last-child {
  border-bottom: 0;
}
.wl__item:hover {
  background: color-mix(in srgb, var(--theme-text) 5%, transparent);
}
.wl__item:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: -2px;
}
.wl__item.is-flagged {
  background: color-mix(in srgb, var(--theme-danger) 6%, transparent);
}
.wl__item-main,
.wl__item-quote {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.wl__item-quote {
  align-items: flex-end;
}
.wl__price {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.wl__item-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
  justify-content: flex-end;
  min-width: 0;
}
.wl.is-phone .wl__item {
  grid-template-columns: minmax(0, 1fr) auto;
}
.wl.is-phone .wl__item-badges {
  justify-content: flex-start;
}
@media (pointer: coarse) {
  .wl__name {
    min-height: 44px;
  }
}
</style>
