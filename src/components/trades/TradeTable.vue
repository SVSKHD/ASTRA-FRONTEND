<script setup lang="ts">
// The month's rows (section 28b).
//
// Not the library's `Table`: that one renders values a column at a time from a
// plain object, and this table needs a rail keyed to each row's sign, a delete
// that appears on approach, a header that stays put while the month scrolls
// under it, and a divider wherever the date changes. It keeps the library's
// shape — a real <table>, the same token borders, the same header treatment —
// so it reads as the same component doing more.
//
// Two rules the layout is built on. Every figure is mono and tabular, because
// the point of a trading log is comparing one row against the one above it and
// proportional digits make that impossible. And every row is grouped under its
// date rather than repeating it: eleven rows that all say 2026-09-04 are eleven
// chances to misread which day you are looking at.
import { computed } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'
import IconDelete from '@/components/icons/IconDelete.vue'
import IconBuy from '@/components/icons/IconBuy.vue'
import IconSell from '@/components/icons/IconSell.vue'
import IconSessionAsia from '@/components/icons/IconSessionAsia.vue'
import IconSessionLondon from '@/components/icons/IconSessionLondon.vue'
import IconSessionNy from '@/components/icons/IconSessionNy.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { fmt2, signOf, signed2 } from '@/utils/tradeMath'
import type { Trade, TradeSession } from '@/types'

const props = defineProps<{ trades: Trade[]; emptyTitle: string; emptyDescription: string }>()
defineEmits<{ delete: [string] }>()

const SESSION_ICON = {
  Asia: IconSessionAsia,
  London: IconSessionLondon,
  NY: IconSessionNy,
} satisfies Record<TradeSession, unknown>

/** The rail colour for a row: its own sign, and nothing else. */
const RAIL = {
  pos: 'var(--theme-success)',
  neg: 'var(--theme-danger)',
  flat: 'var(--text-muted, var(--theme-dim))',
} as const

function railVar(trade: Trade) {
  return { '--row-rail': RAIL[signOf(trade.pl)] }
}

/** The first row of each date, which is where the divider and the date go. */
const firstOfDay = computed(() => {
  const seen = new Set<string>()
  const out = new Set<string>()
  for (const trade of props.trades) {
    if (seen.has(trade.date)) continue
    seen.add(trade.date)
    out.add(trade.id)
  }
  return out
})
</script>

<template>
  <div v-if="trades.length" class="ttable__wrap">
    <table class="ttable">
      <caption class="ui-sr-only">
        Trades, oldest first, grouped by date
      </caption>
      <thead>
        <tr>
          <th scope="col" class="ttable__rail"><span class="ui-sr-only">Result</span></th>
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
      <!-- Enter and leave only: `appear` is off, so a month that loads with
           forty rows in it paints them, it does not perform them. -->
      <TransitionGroup tag="tbody" name="trow">
        <tr
          v-for="t in trades"
          :key="t.id"
          :class="{ 'is-dayStart': firstOfDay.has(t.id) }"
          :style="railVar(t)"
        >
          <td class="ttable__rail" aria-hidden="true"></td>
          <!-- The date is written once per day; the rows under it inherit it
               from the divider above, which is how a person reads a ledger. -->
          <td class="is-mono ttable__date">
            <span v-if="firstOfDay.has(t.id)">{{ t.date }}</span>
            <span v-else class="ui-sr-only">{{ t.date }}</span>
          </td>
          <td>{{ t.symbol }}</td>
          <td>
            <span class="ttable__with">
              <component :is="SESSION_ICON[t.session]" :size="14" />
              {{ t.session }}
            </span>
          </td>
          <!-- Side is a direction, not a result: it takes a glyph and the
               ordinary text colour, never the green or the red, which belong to
               the two columns whose sign is the information. -->
          <td>
            <span class="ttable__with">
              <IconBuy v-if="t.side === 'buy'" :size="14" />
              <IconSell v-else :size="14" />
              {{ t.side === 'buy' ? 'Buy' : 'Sell' }}
            </span>
          </td>
          <td class="is-num is-mono">{{ fmt2(t.lot) }}</td>
          <td class="is-num is-mono">{{ fmt2(t.entry) }}</td>
          <td class="is-num is-mono">{{ fmt2(t.exit) }}</td>
          <td class="is-num is-mono" :class="`is-${signOf(t.move)}`">{{ signed2(t.move) }}</td>
          <td class="is-num is-mono" :class="`is-${signOf(t.pl)}`">{{ signed2(t.pl) }}</td>
          <td class="ttable__act">
            <IconButton
              class="ttable__del"
              :label="`Delete the ${t.symbol} trade on ${t.date}`"
              size="sm"
              @click="$emit('delete', t.id)"
            >
              <IconDelete :size="14" />
            </IconButton>
          </td>
        </tr>
      </TransitionGroup>
    </table>
  </div>

  <EmptyState v-else :title="emptyTitle" :description="emptyDescription" />
</template>

<style scoped>
.ttable__wrap {
  /* The table is wider than a phone and taller than the stage; it scrolls
     inside its own box rather than pushing the page in either direction. */
  overflow: auto;
  max-height: 420px;
  min-width: 0;
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  box-shadow: var(--layer-raised-shadow);
}
.ttable {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.ttable th,
.ttable td {
  padding: var(--sp-2) var(--sp-3);
  white-space: nowrap;
  text-align: left;
}

/* The header stays while the month scrolls under it. Opaque, because a
   translucent header over scrolling figures is unreadable at exactly the moment
   it is needed. */
.ttable thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--layer-overlay-bg);
  border-bottom: 1px solid var(--layer-raised-border);
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary, var(--theme-dim));
}

/* One divider per date, above the day's first row. Hairline rather than a
   heading row: it groups without spending a whole row on saying so. */
.ttable tbody tr.is-dayStart td {
  border-top: 1px solid var(--layer-raised-border);
}
.ttable tbody tr:first-child td {
  border-top: none;
}
.ttable tbody tr:hover td {
  background: color-mix(in oklch, var(--text-primary, currentcolor) 5%, transparent);
}
.ttable__date {
  color: var(--text-secondary, var(--theme-dim));
}

/* The rail: the row's own sign, at full strength, in a channel of its own — a
   colour on a 3px bar rather than on the text, which is the rule the whole
   palette follows. */
/* Specific enough to beat the cell padding rule above: `.ttable td` is two
   classes and would otherwise pad the rail out to a 30px block of colour. */
.ttable th.ttable__rail,
.ttable td.ttable__rail {
  width: 3px;
  min-width: 3px;
  padding: 0;
}
.ttable tbody td.ttable__rail {
  background: var(--row-rail);
}
.ttable tbody tr.is-dayStart td.ttable__rail {
  border-top: none;
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
.ttable__with {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
}
.ttable__act {
  width: 1%;
  text-align: right;
}

/* Delete appears on approach rather than sitting on every row: forty rows with
   a permanent bin in them is forty invitations to click the wrong one.
   Opacity, never `display`, and it comes back for focus as well as hover — the
   keyboard has no pointer to approach with. */
.ttable__del {
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.ttable tbody tr:hover .ttable__del,
.ttable tbody tr:focus-within .ttable__del {
  opacity: 1;
}
@media (hover: none) {
  /* No hover to reveal it with; on touch it is simply always there. */
  .ttable__del {
    opacity: 1;
  }
}

/* A row arriving answers a submit; a row leaving answers a delete. Nothing
   here runs on mount — `appear` is off — so a month that loads with forty rows
   in it paints them rather than performing them.

   The collapse is done on the CELLS, not on the row: a <tr> cannot be given a
   height, and the usual `position: absolute` trick takes the row out of flow
   and loses every column width with it. Padding and line-height on the cells
   are what a row's height actually is, so animating those closes the gap and
   the rows below rise into it. The row keeps its own opacity transition so Vue
   reads the duration from the element it put the class on. */
.trow-enter-active,
.trow-leave-active {
  transition: opacity var(--dur-med) var(--ease-out);
}
.trow-enter-active td {
  transition: transform var(--dur-med) var(--ease-out);
}
.trow-enter-from {
  opacity: 0;
}
.trow-enter-from td {
  transform: translateY(-6px);
}
.trow-leave-active td {
  overflow: hidden;
  transition:
    padding var(--dur-med) var(--ease-out),
    line-height var(--dur-med) var(--ease-out);
}
.trow-leave-to {
  opacity: 0;
}
.trow-leave-to td {
  padding-top: 0;
  padding-bottom: 0;
  line-height: 0;
}
.trow-move {
  transition: transform var(--dur-med) var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .ttable__del,
  .trow-enter-active,
  .trow-leave-active,
  .trow-move {
    transition: none;
  }
}
</style>
