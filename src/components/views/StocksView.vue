<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
// Three views.
// - "Watchlists": the named instrument watchlists (src/trading/watchlists.ts) with
//   quotes. This is what "Add to watchlist" in an instrument's detail writes to,
//   so it is the default: before it was here, an instrument added from "All
//   instruments" went to a list this tab never showed.
// - "My stocks": tracked stocks, a flat, filterable list of symbols with a thesis,
//   price targets, tags and attached notes (create/edit live in ItemDialog).
// - "All instruments": every instrument the server has from a broker (Dhan's full
//   master), searched and filtered on the server, with a chart a click away.
// All are read-only towards the broker: nothing here places orders.
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { useLongList } from '@/composables/useLongList'
import { SUCCESS, pxify, rowBase, tagChip, typeStep } from '@/styles'
import ListToolbar from '@/components/ListToolbar.vue'
import { allInstruments, watchlistStore } from '@/trading/watchlists'
import type { Stock } from '@/types'
// The explorer and the watchlists are laid out with the trading panel's shared
// classes (tp-page, tp-head, tp-note…); without this the Stocks tab rendered
// them unstyled unless the trading page had been opened first.
import '@/components/trading/trading.css'

const TradingExplorer = defineAsyncComponent(
  () => import('@/components/trading/TradingExplorer.vue'),
)
const TradingWatchlists = defineAsyncComponent(
  () => import('@/components/trading/TradingWatchlists.vue'),
)

type Mode = 'watchlists' | 'mine' | 'market'
const MODES: { value: Mode; label: string }[] = [
  { value: 'watchlists', label: 'Watchlists' },
  { value: 'mine', label: 'My stocks' },
  { value: 'market', label: 'All instruments' },
]
const MODE_KEY = 'aureon.stocks.mode.v1'
function savedMode(): Mode {
  try {
    const m = localStorage.getItem(MODE_KEY)
    return MODES.some((o) => o.value === m) ? (m as Mode) : 'watchlists'
  } catch {
    return 'watchlists'
  }
}
const mode = ref<Mode>(savedMode())
watch(mode, (m) => {
  try {
    localStorage.setItem(MODE_KEY, m)
  } catch {
    // private window or blocked storage: the choice just is not remembered
  }
})

const app = useAppStore()
const { c, dark, s, panelStyle } = useStyles()
const { stocks, tags } = storeToRefs(app)
const watchlists = watchlistStore()
const watchedCount = computed(() => allInstruments(watchlists.lists).length)

defineExpose({ focus: () => app.openCreate('stock') })

const tagFilter = ref<string>('all')
const sortKey = ref<'symbol' | 'target' | 'updated'>('symbol')

const view = computed<Stock[]>(() => {
  let list = stocks.value.slice()
  if (tagFilter.value !== 'all') list = list.filter((st) => st.tag === tagFilter.value)
  list.sort((a, b) => {
    if (sortKey.value === 'updated') return b.updatedAt - a.updatedAt
    if (sortKey.value === 'target') return (a.targetPrice || Infinity) - (b.targetPrice || Infinity)
    return a.symbol.localeCompare(b.symbol)
  })
  return list
})
// A long list renders in windows (section 16e) instead of every row in one tick.
const stockWindow = useLongList(view)

const row = computed(() => pxify(rowBase(c.value)))
function chipStyle(tag: string) {
  return pxify(tagChip(c.value, tag, dark.value))
}
const symBadge = computed(() =>
  pxify({
    flexShrink: 0,
    minWidth: 46,
    textAlign: 'center',
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.03em',
    padding: '6px 9px',
    borderRadius: 'var(--radius-card)',
    color: c.value.accent,
    border: '1px solid ' + c.value.border,
    background: c.value.input,
  }),
)
function priceChip(kind: 'target' | 'watch') {
  const col = kind === 'target' ? SUCCESS : c.value.dim
  return pxify({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-1)',
    ...typeStep('2xs'),
    padding: '3px 8px',
    borderRadius: 'var(--radius-control)',
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color: col,
  })
}
const metaStyle = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    flexWrap: 'wrap',
    marginTop: 3,
  }),
)
const filterBar = pxify({
  display: 'flex',
  gap: 'var(--sp-2)',
  flexWrap: 'wrap',
  padding: '0 2px 10px',
})
</script>

<template>
  <div :style="panelStyle">
    <ListToolbar title="Stocks" new-label="Track stock" @new="app.openCreate('stock')" />

    <div :style="filterBar">
      <SegmentedControl v-model="mode" :options="MODES" size="sm" aria-label="Stocks view" />
    </div>

    <TradingWatchlists v-if="mode === 'watchlists'" />
    <TradingExplorer v-else-if="mode === 'market'" />

    <template v-else>
      <div v-if="stocks.length" :style="filterBar">
        <Select
          :model-value="tagFilter"
          @update:model-value="tagFilter = $event"
          :options="[
            { value: 'all', label: 'All tags' },
            ...tags.map((t) => ({ value: String(t), label: t })),
          ]"
        />
        <Select
          :model-value="sortKey"
          @update:model-value="sortKey = $event as typeof sortKey"
          :options="[
            { value: 'symbol', label: 'By symbol' },
            { value: 'target', label: 'By target price' },
            { value: 'updated', label: 'Recently updated' },
          ]"
        />
      </div>

      <div v-if="stocks.length === 0" :style="s.empty">
        <div>No tracked stocks yet. Use “Track stock” to add one with a thesis and targets.</div>
        <div v-if="watchedCount">
          {{ watchedCount }} instrument{{ watchedCount === 1 ? ' is' : 's are' }} on your
          watchlists.
          <Button size="sm" variant="ghost" @click="mode = 'watchlists'">Open watchlists</Button>
        </div>
      </div>
      <div v-else-if="view.length === 0" :style="s.empty">No stocks match this filter.</div>
      <div :style="s.list">
        <!-- Same as Ideas: the memo covers everything the row draws, plus the
           theme the styles are derived from. -->
        <div
          v-for="t in stockWindow.visible.value"
          :key="t.id"
          v-memo="[t.symbol, t.name, t.targetPrice, t.watchPrice, t.tag, t.noteIds.length, c]"
          :style="row"
          v-hover-style="s.rowHover"
        >
          <span :style="symBadge">{{ t.symbol }}</span>
          <div :style="s.taskMain" @click="app.openEdit('stock', t.id)">
            <span :style="s.dlTitle">{{ t.name || t.symbol }}</span>
            <div :style="metaStyle">
              <span v-if="t.targetPrice" :style="priceChip('target')">🎯 {{ t.targetPrice }}</span>
              <span v-if="t.watchPrice" :style="priceChip('watch')">👁 {{ t.watchPrice }}</span>
              <span v-if="t.tag" :style="chipStyle(t.tag)">{{ t.tag }}</span>
              <span v-if="t.noteIds.length" :style="s.dlDate">
                {{ t.noteIds.length }} note{{ t.noteIds.length === 1 ? '' : 's' }}
              </span>
            </div>
          </div>
          <button :style="s.shareBtn" @click="app.share('stock', t)">↗</button>
          <button :style="s.del" @click="app.deleteWithUndo('stocks', 'stock', t.id)">×</button>
        </div>
        <Button
          v-if="stockWindow.remaining.value > 0"
          size="sm"
          variant="ghost"
          @click="stockWindow.more()"
        >
          Show {{ Math.min(100, stockWindow.remaining.value) }} more ({{
            stockWindow.remaining.value
          }}
          left)
        </Button>
      </div>
    </template>
  </div>
</template>
