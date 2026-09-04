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
import { signOf } from '@/utils/tradeMath'
import { fmt2, signed2 } from '@/utils/format'
import { clocksFor, type Clock } from '@/utils/tradeTime'
import type { Trade, TradeSession } from '@/types'

/** What Firestore has and has not acknowledged, by row id (section 30). */
export type RowState = 'pending' | 'queued' | 'blocked'

const props = withDefaults(
  defineProps<{
    trades: Trade[]
    emptyTitle: string
    emptyDescription: string
    /** Only the rows that are NOT safely on the server appear here. */
    state?: Record<string, RowState>
    /** The id of a row just written, ringed briefly (section 42). */
    flash?: string
    /** The broker's clock, for the second reading of each row's instant. */
    broker?: Clock
    /** The UTC column is off by default: it is the column you turn on to settle
     *  an argument with a broker, not one you read every day. */
    showUtc?: boolean
  }>(),
  { state: () => ({}), broker: () => ({ zone: '', offsetMinutes: 0 }), showUtc: false },
)
defineEmits<{ delete: [string] }>()

// A dot is a colour, and a colour is not a fact anybody can act on — so each
// one carries its sentence, as a tooltip for a pointer and as text for a
// screen reader. A row the server has is left alone: a green tick on every
// line is forty ticks to scan past for the one row that has not landed.
const STATE_LABEL: Record<RowState, string> = {
  pending: 'Saved here, not yet acknowledged by the server',
  queued: 'The server refused this write — it is queued and being retried',
  blocked: 'The server refused this write repeatedly — it is held below',
}

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

/**
 * Both readings of a row's instant (section 31).
 *
 * Recomputed from `entryAt` on every render rather than read from a stored
 * string, which is what makes a row logged under a +02:00 broker still say
 * +02:00 in July. A row with no instant — logged before section 31 and not yet
 * backfilled — gets a dash rather than a plausible-looking 00:00.
 */
const clocks = computed(() => {
  const out: Record<string, { ist: string; broker: string; utc: string; title: string }> = {}
  for (const trade of props.trades) {
    const c = clocksFor(trade, props.broker)
    if (!c || trade.timeEstimated) continue
    out[trade.id] = {
      ist: c.ist,
      broker: c.broker,
      utc: c.utc,
      title: `IST ${c.ist} · Broker ${c.broker} (GMT${c.brokerOffset}) · UTC ${c.utc}`,
    }
  }
  return out
})

/** The first row of each date, which is where the divider and the date go. */
const firstOfDay = computed(() => {
  const seen = new Set<string>()
  const out = new Set<string>()
  for (const trade of props.trades) {
    if (seen.has(trade.istDate)) continue
    seen.add(trade.istDate)
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
          <th scope="col" class="ttable__state"><span class="ui-sr-only">Sync</span></th>
          <th scope="col">Date</th>
          <!-- Two clocks in one column, named in the header rather than
               repeated on every row: forty rows each saying "IST" is forty
               readings of the word and none of the numbers. -->
          <th scope="col">IST · Broker</th>
          <th v-if="showUtc" scope="col">UTC</th>
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
        <!-- `v-memo` on the three things a row is actually made of: the trade
             itself (recomputed rows are new objects, so identity is the test),
             its pending marker, and whether it carries the day's divider. A
             month of forty rows re-renders the one row that changed. -->
        <tr
          v-for="t in trades"
          :key="t.id"
          v-memo="[t, state[t.id], firstOfDay.has(t.id), flash === t.id]"
          :class="{ 'is-dayStart': firstOfDay.has(t.id), 'is-flashing': flash === t.id }"
          :style="railVar(t)"
        >
          <td class="ttable__rail" aria-hidden="true"></td>
          <!-- Nothing at all for a row that is on the server, which is nearly
               every row nearly all of the time. -->
          <td class="ttable__state">
            <span
              v-if="state[t.id]"
              class="ttable__dot"
              :class="`is-${state[t.id]}`"
              :title="STATE_LABEL[state[t.id]!]"
            >
              <span class="ui-sr-only">{{ STATE_LABEL[state[t.id]!] }}</span>
            </span>
          </td>
          <!-- The date is written once per day; the rows under it inherit it
               from the divider above, which is how a person reads a ledger. -->
          <td class="is-mono ttable__date">
            <span v-if="firstOfDay.has(t.id)">{{ t.istDate }}</span>
            <span v-else class="ui-sr-only">{{ t.istDate }}</span>
          </td>
          <td class="is-mono ttable__time" :title="clocks[t.id]?.title">
            <template v-if="clocks[t.id]">
              {{ clocks[t.id].ist }}
              <span class="ttable__sep" aria-hidden="true">·</span>
              <span class="ttable__broker">{{ clocks[t.id].broker }}</span>
            </template>
            <!-- A time nobody typed. The dash is the honest rendering of a
                 backfilled midnight; printing 00:00 would make a guess look
                 like an observation. -->
            <template v-else>—<span class="ui-sr-only">no time recorded</span></template>
          </td>
          <td v-if="showUtc" class="is-mono ttable__broker">{{ clocks[t.id]?.utc ?? '—' }}</td>
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
              :label="`Delete the ${t.symbol} trade on ${t.istDate}`"
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
/* No overflow at all, on purpose (section 42).
   
   This used to be `overflow: auto; max-height: 420px`, which is what made a
   month of trades a small window onto itself — and, less obviously, it is what
   the sticky header was sticking to: a header sticks to its nearest scrollport,
   and inside a 420px box that is the box, not the screen. With no overflow here
   the scrollport is the document, so the header holds against the top of the
   VIEWPORT while the whole month scrolls under it.
   
   There is no way to have both a horizontally scrolling box and a header that
   sticks to the page — any overflow other than visible makes this element the
   scrollport again — so the phone takes the box and the desktop takes the page.
   Thirteen columns of nowrap figures do not fit in 390px under any layout, and
   a sticky header on a table nobody can see the right-hand half of is not the
   half worth keeping. */
.ttable__wrap {
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
/* A filtered day is scrolled to; without this it lands underneath the sticky
   header, which is the one place it must not land. Two rows of header plus a
   little air. */
.ttable tbody tr.is-dayStart {
  scroll-margin-top: 64px;
}
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
/* The confirmation, on the rail the row already has (section 42). It is the
   channel that already says what the row is worth, so brightening it says "this
   one" without adding anything to the row or moving what is under it. */
.ttable tbody tr.is-flashing td.ttable__rail {
  background: var(--accent, var(--theme-accent));
}
.ttable tbody tr.is-flashing td {
  background: color-mix(in oklch, var(--accent, currentcolor) 10%, transparent);
}
@media (prefers-reduced-motion: no-preference) {
  .ttable tbody tr td {
    transition: background var(--dur-med) var(--ease-out);
  }
}
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

/* The sync dot: 7px, in a column of its own so it never nudges a figure, and
   silent — no pulse, because the one piece of motion on this screen is the
   calendar's sweep and a blinking dot on a row of money is an alarm. */
.ttable th.ttable__state,
.ttable td.ttable__state {
  width: 1%;
  padding-right: 0;
}
.ttable__dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dot-tone);
  vertical-align: middle;
}
.ttable__dot.is-pending {
  /* Accent, not a warning: a write Firestore is holding is on its way. */
  --dot-tone: var(--accent, var(--theme-accent));
}
.ttable__dot.is-queued {
  --dot-tone: var(--theme-warning);
}
.ttable__dot.is-blocked {
  --dot-tone: var(--theme-danger);
}

/* IST at full strength, broker beside it at secondary: they are the same fact
   read twice, and the trader's own clock is the one being scanned. */
.ttable__time {
  color: var(--text-primary, var(--theme-text));
}
.ttable__sep {
  padding: 0 2px;
  color: var(--text-muted, var(--theme-dim));
}
.ttable__broker {
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

/* The phone's bargain: sideways scrolling instead of a page-sticky header. */
@media (max-width: 700px) {
  .ttable__wrap {
    overflow-x: auto;
  }
}
</style>
