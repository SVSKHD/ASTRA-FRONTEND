<script setup lang="ts">
// One stock on a watchlist: who it is, where it has been (a month's trend),
// where it is, and how far it moved today. Your target, when you have one, is
// a chip under the name.
import { computed } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Sparkline from '@/components/stocks/Sparkline.vue'
import { dec } from '@/trading/format'
import type { StockRowData } from '@/trading/useWatchlistRows'
import type { Stock } from '@/types'

const props = defineProps<{
  row: StockRowData
  tracked: Stock | null
  selected?: boolean
  compact?: boolean
}>()
const emit = defineEmits<{ open: []; remove: [] }>()

const name = computed(() => props.row.instrument?.display_name || props.row.instrument?.name || '')
const sub = computed(
  () =>
    [name.value, props.row.instrument?.exchange].filter(Boolean).join(' · ') ||
    (props.row.flag ? props.row.flag.label : 'Looking it up…'),
)
const last = computed(() => props.row.quote?.last ?? null)
</script>

<template>
  <div
    class="sr"
    :class="{ 'is-selected': selected, 'is-flagged': row.flag && row.flag.tone !== 'neutral' }"
    data-stock-row
    role="button"
    tabindex="0"
    :aria-label="`${row.item.symbol}${last ? `, ₹${dec(last, 2)}` : ''}${row.change ? `, ${row.change.pct}% today` : ''}`"
    @click="emit('open')"
    @keydown.enter.prevent="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <span class="sr__tile" aria-hidden="true">{{ row.item.symbol.slice(0, 2) }}</span>
    <div class="sr__id">
      <span class="sr__symbol">{{ row.item.symbol }}</span>
      <span class="sr__sub">{{ sub }}</span>
      <span v-if="tracked?.targetPrice" class="sr__target">
        <Icon name="flag" size="xs" />Target ₹{{ dec(tracked.targetPrice, 2) }}
      </span>
    </div>
    <Sparkline
      v-if="!compact"
      class="sr__spark"
      :values="row.history?.closes ?? []"
      :label="`${row.item.symbol}, last 30 days`"
    />
    <div class="sr__quote">
      <span class="sr__price">{{ last ? dec(last, 2) : '—' }}</span>
      <span
        v-if="row.change"
        class="sr__chg"
        :class="row.change.up ? 'is-up' : 'is-down'"
        :title="`${row.change.up ? '+' : ''}${dec(row.change.change, 2)} since the last close`"
        >{{ row.change.up ? '+' : '' }}{{ row.change.pct }}%</span
      >
      <span v-else class="sr__chg is-flat">—</span>
    </div>
    <IconButton
      v-if="!compact"
      class="sr__remove"
      :label="`Remove ${row.item.symbol}`"
      size="sm"
      tone="danger"
      @click.stop="emit('remove')"
    >
      <Icon name="x" size="sm" />
    </IconButton>
  </div>
</template>

<style scoped>
.sr {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 10px 12px;
  border-radius: var(--radius-card);
  border: 1px solid var(--theme-border);
  background: var(--theme-card);
  cursor: pointer;
  transition:
    border-color var(--dur-fast) ease,
    box-shadow var(--dur-fast) ease;
}
.sr:hover {
  border-color: color-mix(in oklch, var(--theme-accent) 35%, var(--theme-border));
}
.sr:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.sr.is-selected {
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--theme-accent) 14%, transparent);
}
.sr.is-flagged {
  border-color: color-mix(in oklch, var(--theme-warning) 50%, var(--theme-border));
}
.sr__tile {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 11px;
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
  color: var(--theme-accent);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}
.sr__id {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sr__symbol {
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.sr__sub {
  font-size: var(--text-xs);
  color: var(--theme-dim);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sr__target {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-2xs);
  font-weight: var(--weight-medium);
  color: var(--theme-accent);
}
.sr__quote {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  min-width: 84px;
  flex-shrink: 0;
}
.sr__price {
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--theme-text);
}
.sr__chg {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.sr__chg.is-up {
  color: var(--theme-success);
  background: color-mix(in oklch, var(--theme-success) 14%, transparent);
}
.sr__chg.is-down {
  color: var(--theme-danger);
  background: color-mix(in oklch, var(--theme-danger) 14%, transparent);
}
.sr__chg.is-flat {
  color: var(--theme-dim);
}
.sr__remove {
  opacity: 0;
  transition: opacity var(--dur-fast) ease;
}
.sr:hover .sr__remove,
.sr:focus-within .sr__remove {
  opacity: 1;
}
@media (hover: none) {
  .sr__remove {
    opacity: 1;
  }
}
</style>
