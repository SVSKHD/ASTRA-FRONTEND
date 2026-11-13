<script setup lang="ts">
// The Stocks tab: your watchlists, the way a markets app shows them.
//
// - Watchlist: pill tabs for your lists, one search that adds a stock to the
//   open list, and a row per stock with its month's trend, its price and how far
//   it moved today (against the last session's close, from the daily candles).
//   Pick one and its page opens beside the list (a sheet on a phone): price,
//   chart, YOUR thesis and targets, and the facts worth knowing.
// - Explore: every instrument the server has, searched on the server, drawn as
//   the same rows with a "+" to put one on the open list, and the same page.
//
// A tracked stock (a thesis with a target and a price to act at) belongs to the
// stock, so it shows on that stock's row and page wherever it is listed. The
// ones not on any list are listed under the rows, so none is out of sight.
//
// Lists are kept on this device until the backend has a watchlist API
// (src/trading/watchlists.ts); a line at the foot says so.
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { usePaneInset } from '@/composables/usePaneInset'
import { useNow } from '@/control/poll'
import { pxify } from '@/styles'
import PanelHeader from '@/components/PanelHeader.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Icon from '@/components/ui/Icon.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import DetailPane from '@/components/ui/DetailPane.vue'
import InstrumentPicker from '@/components/trading/InstrumentPicker.vue'
import MarketPanel from '@/components/trading/MarketPanel.vue'
import StockRow from '@/components/stocks/StockRow.vue'
import StockDetail from '@/components/stocks/StockDetail.vue'
import StocksExplore from '@/components/stocks/StocksExplore.vue'
import { remember } from '@/trading/resolve'
import { connect } from '@/trading/stream'
import { allInstruments, watchlistStore } from '@/trading/watchlists'
import { useWatchlistRows, type StockRowData } from '@/trading/useWatchlistRows'
import { vScrollFade } from '@/directives/scrollFade'
import type { Instrument } from '@/trading/instruments'
import type { Stock } from '@/types'

const app = useAppStore()
const { stocks } = storeToRefs(app)
const { panelStyle, isMobile } = useStyles()
const now = useNow(5_000)
const store = watchlistStore()

// --- which view -------------------------------------------------------------------
type Mode = 'list' | 'explore'
const MODES: { value: Mode; label: string }[] = [
  { value: 'list', label: 'Watchlist' },
  { value: 'explore', label: 'Explore' },
]
const MODE_KEY = 'aureon.stocks.mode.v2'
function savedMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'explore' ? 'explore' : 'list'
  } catch {
    return 'list'
  }
}
const mode = ref<Mode>(savedMode())
watch(mode, (m) => {
  try {
    localStorage.setItem(MODE_KEY, m)
  } catch {
    /* private window: the choice just is not remembered */
  }
})

// --- which list -------------------------------------------------------------------
const LIST_KEY = 'aureon.stocks.list.v1'
function savedList(): string {
  try {
    return localStorage.getItem(LIST_KEY) ?? ''
  } catch {
    return ''
  }
}
const listId = ref(savedList())
const current = computed(
  () => store.lists.find((l) => l.id === listId.value) ?? store.lists[0] ?? null,
)
watch(
  () => current.value?.id,
  (id) => {
    try {
      if (id) localStorage.setItem(LIST_KEY, id)
    } catch {
      /* not remembered */
    }
  },
)
function pickList(id: string) {
  listId.value = id
  selectedId.value = null
}

// New list: the "+" pill turns into a field.
const naming = ref<'new' | 'rename' | null>(null)
const nameText = ref('')
const nameError = ref('')
const nameField = ref<HTMLElement | null>(null)
async function startNaming(kind: 'new' | 'rename') {
  naming.value = kind
  nameText.value = kind === 'rename' ? (current.value?.name ?? '') : ''
  nameError.value = ''
  await nextTick()
  nameField.value?.querySelector('input')?.focus()
}
function saveName() {
  try {
    if (naming.value === 'new') listId.value = store.create(nameText.value).id
    else if (current.value) store.rename(current.value.id, nameText.value)
    naming.value = null
  } catch (e) {
    nameError.value = (e as Error).message
  }
}
const confirmingDelete = ref(false)
const LIST_MENU = computed(() => [
  { value: 'rename', label: 'Rename list', icon: 'pencil' as const },
  { value: 'delete', label: 'Delete list', icon: 'trash' as const, danger: true },
])
function onListMenu(v: string) {
  if (v === 'rename') void startNaming('rename')
  if (v === 'delete') confirmingDelete.value = true
}
function deleteList() {
  if (current.value) store.remove(current.value.id)
  confirmingDelete.value = false
  selectedId.value = null
}

// --- adding -------------------------------------------------------------------------
const searchBox = ref<HTMLElement | null>(null)
const addError = ref('')
function add(i: Instrument, select = true) {
  addError.value = ''
  try {
    // The first stock starts the first list.
    const list = current.value ?? store.create('My watchlist')
    listId.value = list.id
    remember([i])
    store.add(list.id, { id: i.id, symbol: i.symbol, broker: i.broker })
    if (select) selectedId.value = i.id
  } catch (e) {
    addError.value = (e as Error).message
  }
}
function focusSearch() {
  mode.value = 'list'
  void nextTick(() => searchBox.value?.querySelector('input')?.focus())
}
defineExpose({ focus: focusSearch })

// --- the rows -------------------------------------------------------------------------
// The live stream follows every stock on every list, as before.
watch(
  () =>
    allInstruments(store.lists)
      .map((i) => i.id)
      .join(),
  () => connect(allInstruments(store.lists).map((i) => i.id)),
  { immediate: true },
)
const { rows, loading, error, refresh } = useWatchlistRows(() => current.value?.items ?? [], now)

type Sort = 'added' | 'change' | 'name'
const sort = ref<Sort>('added')
const SORTS = [
  { value: 'added', label: 'Added' },
  { value: 'change', label: 'Change' },
  { value: 'name', label: 'A–Z' },
]
const sorted = computed(() => {
  const list = [...rows.value]
  if (sort.value === 'name') list.sort((a, b) => a.item.symbol.localeCompare(b.item.symbol))
  if (sort.value === 'change')
    list.sort((a, b) => Number(b.change?.pct ?? -Infinity) - Number(a.change?.pct ?? -Infinity))
  return list
})
const ups = computed(() => rows.value.filter((r) => r.change?.up).length)
const downs = computed(() => rows.value.filter((r) => r.change && !r.change.up).length)

// Your thesis for a stock, by symbol.
const bySymbol = computed(() => {
  const m = new Map<string, Stock>()
  for (const s of stocks.value) if (s.symbol) m.set(s.symbol.trim().toUpperCase(), s)
  return m
})
const trackedOf = (symbol: string) => bySymbol.value.get(symbol.toUpperCase()) ?? null
const listedSymbols = computed(
  () => new Set(allInstruments(store.lists).map((i) => i.symbol.toUpperCase())),
)
const trackedElsewhere = computed(() =>
  stocks.value.filter((s) => !listedSymbols.value.has(s.symbol.trim().toUpperCase())),
)

function removeRow(id: number) {
  if (!current.value) return
  store.removeItem(current.value.id, id)
  if (selectedId.value === id) selectedId.value = null
}

// --- the stock's page ---------------------------------------------------------------------
const selectedId = ref<number | null>(null)
const listRow = computed(() => rows.value.find((r) => r.item.id === selectedId.value) ?? null)
// Explore keeps its own pick, so switching views does not lose either.
const exploreId = ref<number | null>(null)
const exploreRow = shallowRef<StockRowData | null>(null)
const selectedRow = computed(() => (mode.value === 'explore' ? exploreRow.value : listRow.value))
const listedIds = computed(() => new Set(current.value?.items.map((i) => i.id) ?? []))
const selectedListed = computed(
  () => !!selectedRow.value && listedIds.value.has(selectedRow.value.item.id),
)
function closeDetail() {
  if (mode.value === 'explore') exploreId.value = null
  else selectedId.value = null
}
function addSelected() {
  const i = selectedRow.value?.instrument
  if (i) add(i, false)
}
function pickExplore(id: number | null) {
  exploreId.value = !isMobile.value && exploreId.value === id ? null : id
}
const splitView = computed(() => !isMobile.value && app.paneMode === 'inline')
const paneOpen = computed(() => !isMobile.value && !splitView.value && !!selectedRow.value)
const paneWidth = ref(0)
const { host: paneHost, style: paneInset } = usePaneInset(paneOpen, paneWidth)
function open(id: number) {
  selectedId.value = !isMobile.value && selectedId.value === id ? null : id
}

const splitLayout = pxify({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: 'var(--sp-4)',
  flex: 1,
  minHeight: 0,
})
</script>

<template>
  <div ref="paneHost" :style="[panelStyle, paneInset]">
    <PanelHeader title="Stocks" new-label="Add stock" @new="focusSearch">
      <template v-if="!isMobile" #left>
        <SegmentedControl v-model="mode" :options="MODES" size="sm" aria-label="Stocks view" />
      </template>
    </PanelHeader>
    <!-- On a phone the header has no room beside the title: the switch sits under it. -->
    <SegmentedControl
      v-if="isMobile"
      v-model="mode"
      class="sv__modes"
      :options="MODES"
      size="sm"
      aria-label="Stocks view"
    />

    <div :style="splitView ? splitLayout : undefined" class="sv" data-own-keys>
      <StocksExplore
        v-if="mode === 'explore'"
        :now="now"
        :list-name="current?.name ?? 'My watchlist'"
        :listed-ids="listedIds"
        :selected-id="exploreId"
        :compact="isMobile"
        :tracked-of="trackedOf"
        @add="add($event, false)"
        @select="pickExplore"
        @row="exploreRow = $event"
      />
      <div v-else class="sv__col">
        <!-- The lists, as tabs. -->
        <div class="sv__lists" role="tablist" aria-label="Watchlists">
          <template v-if="naming">
            <form ref="nameField" class="sv__nameForm" @submit.prevent="saveName">
              <TextInput
                v-model="nameText"
                size="sm"
                :placeholder="naming === 'new' ? 'Name the new list' : 'List name'"
                :aria-label="naming === 'new' ? 'New list name' : 'List name'"
                :error="nameError"
                @keydown.esc="naming = null"
              />
              <Button type="submit" size="sm">{{ naming === 'new' ? 'Create' : 'Save' }}</Button>
              <Button size="sm" variant="ghost" @click="naming = null">Cancel</Button>
            </form>
          </template>
          <template v-else>
            <button
              v-for="l in store.lists"
              :key="l.id"
              type="button"
              role="tab"
              class="sv__list"
              :class="{ 'is-on': l.id === current?.id }"
              :aria-selected="l.id === current?.id"
              @click="pickList(l.id)"
            >
              {{ l.name }}<span class="sv__count">{{ l.items.length }}</span>
            </button>
            <button type="button" class="sv__list sv__list--new" @click="startNaming('new')">
              <Icon name="plus" size="xs" />New list
            </button>
            <Dropdown
              v-if="current"
              class="sv__menu"
              :items="LIST_MENU"
              label="List options"
              variant="icon"
              @select="onListMenu"
            />
          </template>
        </div>
        <div v-if="confirmingDelete && current" class="sv__confirm" role="alert">
          <span>Delete “{{ current.name }}” and its {{ current.items.length }} stocks?</span>
          <Button size="sm" variant="danger" @click="deleteList">Delete</Button>
          <Button size="sm" variant="ghost" @click="confirmingDelete = false">Keep</Button>
        </div>

        <!-- One search: what you pick goes on the open list. -->
        <div ref="searchBox" class="sv__search">
          <InstrumentPicker
            :key="current?.id ?? 'none'"
            size="md"
            :placeholder="
              isMobile
                ? 'Add a stock: name or symbol'
                : `Add a stock${current ? ' to ' + current.name : ''}: search name or symbol`
            "
            @pick="add"
          />
          <p v-if="addError" class="sv__error" role="alert">{{ addError }}</p>
        </div>

        <div v-scroll-fade class="sv__scroll">
          <template v-if="current && current.items.length">
            <div class="sv__summary">
              <span class="sv__stat">
                <strong>{{ current.items.length }}</strong>
                {{ current.items.length === 1 ? 'stock' : 'stocks' }}
              </span>
              <span v-if="ups" class="sv__stat is-up"
                ><Icon name="trending-up" size="xs" />{{ ups }} up</span
              >
              <span v-if="downs" class="sv__stat is-down"
                ><Icon name="trending-down" size="xs" />{{ downs }} down</span
              >
              <span class="sv__spacer" />
              <SegmentedControl v-model="sort" :options="SORTS" size="sm" aria-label="Sort by" />
              <IconButton label="Refresh prices" size="sm" tone="default" @click="refresh">
                <Icon name="refresh-cw" size="sm" :class="{ sv__spin: loading }" />
              </IconButton>
            </div>
            <p v-if="error" class="sv__error" role="alert">{{ error }}</p>
            <Skeleton
              v-if="loading && !rows.some((r) => r.quote)"
              :lines="Math.min(current.items.length, 5)"
              height="56px"
              radius="var(--radius-card)"
            />
            <TransitionGroup v-else name="subtask-row" tag="div" class="sv__rows">
              <StockRow
                v-for="r in sorted"
                :key="r.item.id"
                :row="r"
                :tracked="trackedOf(r.item.symbol)"
                :selected="!isMobile && selectedId === r.item.id"
                :compact="isMobile"
                @open="open(r.item.id)"
                @remove="removeRow(r.item.id)"
              />
            </TransitionGroup>
          </template>
          <EmptyState
            v-else
            glyph="📈"
            :title="current ? `${current.name} is empty` : 'Start a watchlist'"
            description="Search above for a stock or index by name or symbol. It goes on this list with its price, today's move and a month's trend."
          />

          <!-- Theses for stocks that are on no list, so none is out of sight. -->
          <section v-if="trackedElsewhere.length" class="sv__tracked" aria-label="Tracked stocks">
            <h3 class="sv__h">Tracked, not on a list</h3>
            <button
              v-for="s in trackedElsewhere"
              :key="s.id"
              type="button"
              class="sv__trackedRow"
              @click="app.openEdit('stock', s.id)"
            >
              <span class="sv__trackedSym">{{ s.symbol }}</span>
              <span class="sv__trackedWhy">{{ s.why || s.name }}</span>
              <span v-if="s.targetPrice" class="sv__trackedTarget"
                >Target ₹{{ s.targetPrice }}</span
              >
            </button>
          </section>

          <p v-if="store.storage === 'device'" class="sv__note">
            Your lists are saved on this device.
          </p>
        </div>
      </div>

      <DetailPane
        v-if="!isMobile"
        :open="!!selectedRow"
        title="Stock"
        :subtitle="selectedRow ? '' : 'Pick a stock to see its chart and your thesis'"
        @width="paneWidth = $event"
        @close="closeDetail()"
      >
        <StockDetail
          v-if="selectedRow"
          :key="selectedRow.item.id"
          :row="selectedRow"
          :tracked="trackedOf(selectedRow.item.symbol)"
          :now="now"
          :listed="selectedListed"
          :list-name="current?.name ?? 'My watchlist'"
          @remove="removeRow(selectedRow.item.id)"
          @add="addSelected"
        />
        <EmptyState
          v-else
          glyph="🔎"
          title="Nothing selected"
          description="Choose a stock on the left: its price, chart, your thesis and its facts open here."
        />
      </DetailPane>
    </div>

    <!-- A phone: the stock's page as a sheet. -->
    <MarketPanel v-if="isMobile" :open="!!selectedRow" title="Stock" @close="closeDetail()">
      <StockDetail
        v-if="selectedRow"
        :row="selectedRow"
        :tracked="trackedOf(selectedRow.item.symbol)"
        :now="now"
        :listed="selectedListed"
        :list-name="current?.name ?? 'My watchlist'"
        @remove="removeRow(selectedRow.item.id)"
        @add="addSelected"
      />
    </MarketPanel>
  </div>
</template>

<style scoped>
.sv__modes {
  margin: 0 10px var(--sp-3);
  width: calc(100% - 20px);
}
.sv__modes :deep(.ui-seg__opt) {
  flex: 1 1 0;
}
.sv {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.sv__col {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.sv__lists {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  overflow-x: auto;
  padding: 2px 10px;
}
.sv__list {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  height: 34px;
  padding: 0 14px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-border);
  background: var(--theme-card);
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition:
    background var(--dur-fast) ease,
    color var(--dur-fast) ease;
}
.sv__list:hover {
  border-color: color-mix(in oklch, var(--theme-accent) 40%, var(--theme-border));
}
.sv__list.is-on {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
  color: var(--theme-on-accent);
}
.sv__list:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.sv__count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, currentColor 14%, transparent);
  font-size: var(--text-2xs);
  text-align: center;
}
.sv__list--new {
  border-style: dashed;
  background: transparent;
  color: var(--theme-dim);
}
.sv__menu {
  margin-left: auto;
  flex-shrink: 0;
}
.sv__nameForm {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  flex: 1;
  min-width: 0;
}
.sv__nameForm > :first-child {
  flex: 1;
  min-width: 0;
}
.sv__confirm {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: 0 10px;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  background: color-mix(in oklch, var(--theme-danger) 10%, transparent);
  font-size: var(--text-sm);
  color: var(--theme-text);
}
.sv__search {
  padding: 0 10px;
}
.sv__scroll {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 10px 18px;
}
.sv__summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2) var(--sp-3);
}
.sv__stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-sm);
  color: var(--theme-dim);
}
.sv__stat strong {
  color: var(--theme-text);
  font-weight: var(--weight-semibold);
}
.sv__stat.is-up {
  color: var(--theme-success);
}
.sv__stat.is-down {
  color: var(--theme-danger);
}
.sv__spacer {
  flex: 1;
}
.sv__spin {
  animation: sv-spin 0.9s linear infinite;
}
@keyframes sv-spin {
  to {
    transform: rotate(360deg);
  }
}
.sv__rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.sv__error {
  margin: var(--sp-1) 0 0;
  font-size: var(--text-xs);
  color: var(--theme-danger);
}
.sv__tracked {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin-top: var(--sp-2);
}
.sv__h {
  margin: 0;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.sv__trackedRow {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px dashed var(--theme-border);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.sv__trackedSym {
  font-weight: var(--weight-semibold);
  font-size: var(--text-sm);
  flex-shrink: 0;
}
.sv__trackedWhy {
  flex: 1;
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sv__trackedTarget {
  font-size: var(--text-xs);
  color: var(--theme-accent);
  flex-shrink: 0;
}
.sv__note {
  margin: var(--sp-2) 0 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
  text-align: center;
}
</style>
