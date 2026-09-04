<script setup lang="ts">
// One IST timeline per day, signals and trades interleaved (section 34).
//
// Not a third table: a table puts the two records in separate columns and the
// question here is what followed what. So it is a timeline — one column, in the
// order things happened, with a bracket drawn from a GO to the trade that
// answered it and the gap in minutes on the bracket.
//
// An untaken GO is the finding. It gets a marker of its own rather than an
// absence, because "nothing here" is indistinguishable from "nothing happened",
// and those are opposite readings of the same day.
import { computed } from 'vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconBuy from '@/components/icons/IconBuy.vue'
import IconSell from '@/components/icons/IconSell.vue'
import { countOf, signed2 } from '@/utils/format'
import { signOf } from '@/utils/tradeMath'
import { dayTimeline, linkSignals, takeRate } from '@/utils/combine'
import { IST, hhmmOn, type Clock } from '@/utils/tradeTime'
import type { DacoitSignal, Trade } from '@/types'

const props = defineProps<{
  trades: Trade[]
  signals: DacoitSignal[]
  broker: Clock
}>()

const links = computed(() => linkSignals(props.trades, props.signals))

/** One group per day, newest day last — the order the month reads in. */
const days = computed(() => {
  const keys = new Set<string>([
    ...props.trades.map((t) => t.istDate),
    ...props.signals.map((s) => s.istDate),
  ])
  return [...keys]
    .filter(Boolean)
    .sort()
    .map((date) => ({
      date,
      rows: dayTimeline(
        props.trades.filter((t) => t.istDate === date),
        props.signals.filter((s) => s.istDate === date),
        links.value,
      ),
    }))
})

const summary = computed(() => {
  const gos = props.signals.filter((s) => s.verdict === 'GO').length
  return {
    gos,
    taken: Object.keys(links.value.signalToTrade).length,
    untaken: links.value.untaken.length,
    rate: takeRate(links.value, props.signals),
  }
})

function time(at: number): string {
  return at ? `${hhmmOn(IST, at)} · ${hhmmOn(props.broker, at)}` : '—'
}
</script>

<template>
  <section v-if="days.length" class="ctl">
    <header class="ctl__head">
      <h3 class="ui-label">Signals and trades · IST</h3>
      <p class="ctl__note">
        {{ countOf(summary.gos, 'GO') }} · {{ summary.taken }} taken ·
        <span :class="{ 'is-missed': summary.untaken > 0 }">{{ summary.untaken }} not taken</span>
        · {{ summary.rate }}%
      </p>
    </header>

    <div v-for="day in days" :key="day.date" class="ctl__day">
      <h4 class="ctl__date is-mono">{{ day.date }}</h4>
      <ol class="ctl__rows">
        <li
          v-for="row in day.rows"
          :key="row.id"
          class="ctl__row"
          :class="[
            `is-${row.kind}`,
            {
              'is-linked': !!row.linkedId,
              'is-missed': row.kind === 'signal' && row.signal?.verdict === 'GO' && !row.linkedId,
            },
          ]"
        >
          <span class="ctl__at is-mono">{{ time(row.at) }}</span>
          <!-- The bracket. Drawn on the row rather than between rows so it
               survives a day with anything else interleaved in the middle. -->
          <span class="ctl__link" aria-hidden="true"></span>

          <template v-if="row.kind === 'signal' && row.signal">
            <span class="ctl__what">
              <span class="ctl__verdict">{{ row.signal.verdict === 'GO' ? 'GO' : 'NO GO' }}</span>
              {{ row.signal.symbol }}
            </span>
            <span v-if="row.linkedId" class="ctl__gap"
              >taken {{ countOf(row.gapMinutes ?? 0, 'minute') }} later</span
            >
            <span v-else-if="row.signal.verdict === 'GO'" class="ctl__gap">not taken</span>
          </template>

          <template v-else-if="row.trade">
            <span class="ctl__what">
              <IconBuy v-if="row.trade.side === 'buy'" :size="14" />
              <IconSell v-else :size="14" />
              {{ row.trade.symbol }}
              <span class="ctl__pl is-mono" :class="`is-${signOf(row.trade.pl)}`">
                {{ signed2(row.trade.pl) }}
              </span>
            </span>
            <span v-if="row.linkedId" class="ctl__gap">on the signal above</span>
          </template>
        </li>
      </ol>
    </div>
  </section>

  <EmptyState
    v-else
    title="Nothing this month"
    description="Combined shows signals and trades on one timeline — log a trade or wait for Dacoit to post."
  />
</template>

<style scoped>
.ctl {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
  /* No cap and no overflow (section 42): the timeline is as tall as the month
     and the page scrolls it, rather than a 480px window onto thirty days. */
}
.ctl__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
.ctl__note,
.ctl__gap {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.ctl__note .is-missed,
.ctl__row.is-missed .ctl__gap {
  color: var(--theme-warning);
}
.ctl__day {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.ctl__date {
  margin: 0;
  min-width: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  color: var(--text-secondary, var(--theme-dim));
}
.ctl__rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.ctl__row {
  display: grid;
  grid-template-columns: auto 12px 1fr auto;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-1) 0;
}
.ctl__at {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
}
/* The bracket: a stub on every row, a full stem on the two that are linked, so
   the pair reads as one gesture rather than as two dots. */
.ctl__link {
  position: relative;
  align-self: stretch;
  width: 12px;
}
.ctl__link::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 50%;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: var(--text-muted, var(--theme-dim));
}
.ctl__row.is-linked.is-signal .ctl__link::after,
.ctl__row.is-linked.is-trade .ctl__link::after {
  content: '';
  position: absolute;
  left: 5px;
  width: 2px;
  background: var(--accent, var(--theme-accent));
}
.ctl__row.is-linked.is-signal .ctl__link::after {
  top: 50%;
  bottom: -6px;
}
.ctl__row.is-linked.is-trade .ctl__link::after {
  top: -6px;
  bottom: 50%;
}
.ctl__row.is-missed .ctl__link::before {
  background: var(--theme-warning);
  width: 6px;
  height: 6px;
  left: 3px;
  margin-top: -2px;
}
.ctl__what {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.ctl__verdict {
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
}
.ctl__pl {
  font-variant-numeric: tabular-nums;
}
.ctl__pl.is-pos {
  color: var(--theme-success);
}
.ctl__pl.is-neg {
  color: var(--theme-danger);
}
.is-mono {
  font-family: var(--font-mono);
}

@media (max-width: 480px) {
  .ctl__row {
    grid-template-columns: auto 12px 1fr;
  }
  .ctl__gap {
    grid-column: 3;
  }
}
</style>
