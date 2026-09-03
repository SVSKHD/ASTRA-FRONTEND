<script setup lang="ts">
// The month's rows (section 28).
//
// Not the library's `Table`: that one renders values a column at a time from a
// plain object, and this table needs a delete on each row and a sign colour on
// two of the cells. It keeps the same shape — a real <table>, the same token
// borders, the same header treatment — so it reads as the same component with
// two cells that do more.
//
// Every figure is mono and tabular. The point of a trading log is comparing one
// row against the one above it, which proportional digits make impossible.
import IconButton from '@/components/ui/IconButton.vue'
import Icon from '@/components/ui/Icon.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { fmt2, signOf, signed2 } from '@/utils/tradeMath'
import type { Trade } from '@/types'

defineProps<{ trades: Trade[]; emptyTitle: string; emptyDescription: string }>()
defineEmits<{ delete: [string] }>()
</script>

<template>
  <div v-if="trades.length" class="ttable__wrap">
    <table class="ttable">
      <caption class="ui-sr-only">
        Trades, oldest first
      </caption>
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Symbol</th>
          <th scope="col">Session</th>
          <th scope="col">Side</th>
          <th scope="col" class="is-num">Lot</th>
          <th scope="col" class="is-num">Entry</th>
          <th scope="col" class="is-num">Exit</th>
          <th scope="col" class="is-num">Move</th>
          <th scope="col" class="is-num">P/L</th>
          <th scope="col"><span class="ui-sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in trades" :key="t.id">
          <td class="is-mono">{{ t.date }}</td>
          <td>{{ t.symbol }}</td>
          <td>{{ t.session }}</td>
          <!-- The side is a word, not a colour: it is not a gain or a loss, and
               colouring it would say "green means good" about a direction. -->
          <td>{{ t.side === 'buy' ? 'Buy' : 'Sell' }}</td>
          <td class="is-num is-mono">{{ fmt2(t.lot) }}</td>
          <td class="is-num is-mono">{{ fmt2(t.entry) }}</td>
          <td class="is-num is-mono">{{ fmt2(t.exit) }}</td>
          <td class="is-num is-mono" :class="`is-${signOf(t.move)}`">{{ signed2(t.move) }}</td>
          <td class="is-num is-mono" :class="`is-${signOf(t.pl)}`">{{ signed2(t.pl) }}</td>
          <td class="ttable__act">
            <IconButton
              :label="`Delete the ${t.symbol} trade on ${t.date}`"
              size="sm"
              @click="$emit('delete', t.id)"
            >
              <Icon name="trash" size="xs" />
            </IconButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <EmptyState v-else :title="emptyTitle" :description="emptyDescription" />
</template>

<style scoped>
.ttable__wrap {
  /* The table is wider than a phone; it scrolls inside its own box rather than
     pushing the page sideways. */
  overflow-x: auto;
  min-width: 0;
  border: 1px solid var(--border-subtle, var(--glass-border));
  border-radius: var(--radius-card);
}
.ttable {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.ttable th,
.ttable td {
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px solid var(--border-subtle, var(--glass-border));
  white-space: nowrap;
  text-align: left;
}
.ttable tbody tr:last-child td {
  border-bottom: none;
}
.ttable th {
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary, var(--theme-dim));
}
.ttable .is-num {
  text-align: right;
}
.ttable .is-mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
/* Sign, not metric. A zero move keeps ordinary text. */
.ttable .is-pos {
  color: var(--theme-success);
}
.ttable .is-neg {
  color: var(--theme-danger);
}
.ttable__act {
  width: 1%;
  text-align: right;
}
</style>
