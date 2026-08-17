<script setup lang="ts">
// The stock watchlist: a flat, filterable list of symbols with a thesis, price
// targets, tags and attached notes. Create/edit both live in ItemDialog.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, rowBase, tagChip } from '@/styles'
import ListToolbar from '@/components/ListToolbar.vue'
import type { Stock } from '@/types'

const app = useAppStore()
const { c, dark, s, panelStyle } = useStyles()
const { stocks, tags } = storeToRefs(app)

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

const row = computed(() => pxify(rowBase(c.value)))
function chipStyle(tag: string) {
  return pxify(tagChip(c.value, tag, dark.value))
}
const symBadge = computed(() =>
  pxify({
    flexShrink: 0,
    minWidth: 46,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.03em',
    padding: '6px 9px',
    borderRadius: 10,
    color: c.value.accent,
    border: '1px solid ' + c.value.border,
    background: c.value.input,
  }),
)
function priceChip(kind: 'target' | 'watch') {
  const col = kind === 'target' ? 'oklch(0.72 0.15 150)' : c.value.dim
  return pxify({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    padding: '3px 8px',
    borderRadius: 8,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color: col,
  })
}
const metaStyle = computed(() =>
  pxify({ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3 }),
)
const filterBar = pxify({ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 2px 10px' })
</script>

<template>
  <div :style="panelStyle">
    <ListToolbar title="Stocks" new-label="Track stock" @new="app.openCreate('stock')" />

    <div v-if="stocks.length" :style="filterBar">
      <select
        :style="s.select"
        :value="tagFilter"
        @change="tagFilter = ($event.target as HTMLSelectElement).value"
      >
        <option value="all">All tags</option>
        <option v-for="t in tags" :key="t" :value="t">{{ t }}</option>
      </select>
      <select
        :style="s.select"
        :value="sortKey"
        @change="sortKey = ($event.target as HTMLSelectElement).value as typeof sortKey"
      >
        <option value="symbol">By symbol</option>
        <option value="target">By target price</option>
        <option value="updated">Recently updated</option>
      </select>
    </div>

    <div v-if="stocks.length === 0" :style="s.empty">Your watchlist is empty.</div>
    <div v-else-if="view.length === 0" :style="s.empty">No stocks match this filter.</div>
    <div :style="s.list">
      <!-- Same as Ideas: the memo covers everything the row draws, plus the
           theme the styles are derived from. -->
      <div
        v-for="t in view"
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
    </div>
  </div>
</template>
