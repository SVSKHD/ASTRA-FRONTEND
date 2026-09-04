<script setup lang="ts">
// The day, twenty-four hours wide (section 31).
//
// The calendar answers "which days went well". This answers the question a
// trader asks second and cannot get from a calendar at all: which HOURS. Two
// things make that answerable rather than merely drawable:
//
//   1. It is coloured by the same five-step P/L scale the calendar uses, so a
//      deep green here and a deep green there mean the same size of day.
//   2. An hour with fewer than three trades is muted. One 40-point winner at
//      04:00 is not a discovery about 04:00, and drawing it at full strength
//      beside a genuine twelve-trade hour is how a log talks somebody into a
//      habit it has no evidence for.
//
// The second axis is the broker's clock, at half-hour offsets because IST is
// not a whole number of hours from anywhere — which is the whole reason the two
// readings are worth showing side by side.
import { computed } from 'vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconTargetHit from '@/components/icons/IconTargetHit.vue'
import IconTargetMissed from '@/components/icons/IconTargetMissed.vue'
import { plInkVar, plWashVar } from '@/themes/plScale'
import { signOf } from '@/utils/tradeMath'
import { fmt2, signed2 } from '@/utils/format'
import {
  THIN_HOURS_BELOW,
  hourExtremes,
  hourlyStats,
  peakCount,
  timed,
  type Clock,
} from '@/utils/tradeTime'
import type { Trade } from '@/types'

const props = defineProps<{
  trades: Trade[]
  broker: Clock
  dayTarget: number
  /** The month on screen, so the broker axis is read on the offset that month
   *  actually had rather than on today's. */
  reference: number
}>()

const cells = computed(() => hourlyStats(props.trades, props.broker, props.reference))
const extremes = computed(() => hourExtremes(cells.value))
const peak = computed(() => peakCount(cells.value))
const counted = computed(() => timed(props.trades).length)
const estimated = computed(() => props.trades.length - counted.value)

/**
 * A cell's wash and ink, from the same scale as the calendar — with the hour's
 * own target being the day target: an hour that made the day's number is as
 * deep as a day that did.
 */
function cellStyle(hour: number) {
  const cell = cells.value[hour]
  const tone = cell.count ? signOf(cell.move) : 'flat'
  return {
    '--hour-wash': plWashVar(tone, cell.move, props.dayTarget),
    '--hour-ink': plInkVar(tone, cell.move, props.dayTarget),
    // The bar is the count, not the money: two different quantities, and a
    // busy losing hour is worth seeing as busy.
    '--hour-bar': peak.value ? `${Math.round((cell.count / peak.value) * 100)}%` : '0%',
  }
}

function title(hour: number): string {
  const cell = cells.value[hour]
  if (!cell.count) return `${label(hour)} IST · broker ${cell.broker} · nothing traded`
  const thin = cell.thin ? ` · under ${THIN_HOURS_BELOW} trades, read it lightly` : ''
  return `${label(hour)} IST · broker ${cell.broker} · ${cell.count} trade${
    cell.count === 1 ? '' : 's'
  } · move ${signed2(cell.move)} · ${fmt2(cell.hitRate)}% up${thin}`
}

function label(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

/** Every third hour, so the axis is readable at 360px. */
function ticked(hour: number): boolean {
  return hour % 3 === 0
}
</script>

<template>
  <section class="thours">
    <header class="thours__head">
      <h3 class="ui-label">Hour of day · IST</h3>
      <p class="thours__note">
        <template v-if="counted">
          {{ counted }} timed trade{{ counted === 1 ? '' : 's' }}
          <template v-if="estimated"> · {{ estimated }} without a time, left out </template>
        </template>
      </p>
    </header>

    <EmptyState
      v-if="!counted"
      title="No trade carries a time yet"
      description="Log one with its IST entry time, or backfill the older rows, and the day fills in here."
    />

    <template v-else>
      <ol class="thours__strip">
        <li
          v-for="cell in cells"
          :key="cell.hour"
          class="thours__cell"
          :class="{
            'is-thin': cell.thin,
            'is-empty': !cell.count,
            'is-best': extremes.best === cell.hour,
            'is-worst': extremes.worst === cell.hour,
          }"
          :style="cellStyle(cell.hour)"
          :title="title(cell.hour)"
        >
          <span class="thours__bar" aria-hidden="true"></span>
          <span class="thours__mark">
            <IconTargetHit v-if="extremes.best === cell.hour" :size="12" />
            <IconTargetMissed v-else-if="extremes.worst === cell.hour" :size="12" />
          </span>
          <span class="ui-sr-only">{{ title(cell.hour) }}</span>
        </li>
      </ol>

      <!-- Two axes for one strip: the trader's clock and the broker's, aligned
           to the same cells. This is the picture the whole section exists for. -->
      <ol class="thours__axis" aria-hidden="true">
        <li v-for="cell in cells" :key="cell.hour" class="thours__tick">
          <span v-if="ticked(cell.hour)" class="thours__tickIst">{{ label(cell.hour) }}</span>
        </li>
      </ol>
      <ol class="thours__axis is-broker" aria-hidden="true">
        <li v-for="cell in cells" :key="cell.hour" class="thours__tick">
          <span v-if="ticked(cell.hour)" class="thours__tickBroker">{{ cell.broker }}</span>
        </li>
      </ol>

      <dl class="thours__legend ui-tabular">
        <div class="thours__stat">
          <dt class="ui-label">Best hour</dt>
          <dd class="thours__value is-pos">
            {{ extremes.best == null ? '—' : label(extremes.best) }}
            <span v-if="extremes.best != null" class="thours__sub">
              {{ signed2(cells[extremes.best].move) }} · {{ fmt2(cells[extremes.best].hitRate) }}%
            </span>
          </dd>
        </div>
        <div class="thours__stat">
          <dt class="ui-label">Worst hour</dt>
          <dd class="thours__value is-neg">
            {{ extremes.worst == null ? '—' : label(extremes.worst) }}
            <span v-if="extremes.worst != null" class="thours__sub">
              {{ signed2(cells[extremes.worst].move) }} · {{ fmt2(cells[extremes.worst].hitRate) }}%
            </span>
          </dd>
        </div>
      </dl>
      <p class="thours__note">
        Hours with fewer than {{ THIN_HOURS_BELOW }} trades are drawn faintly and are never named
        best or worst — at that count the hit rate is one trade wide.
      </p>
    </template>
  </section>
</template>

<style scoped>
.thours {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  box-shadow: var(--layer-raised-shadow);
}
.thours__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
}
.thours__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}

/* Twenty-four equal columns. `minmax(0, 1fr)` rather than `1fr` so a long
   broker label cannot push the grid wider than its container. */
.thours__strip,
.thours__axis {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.thours__cell {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-width: 0;
  height: 44px;
  border-radius: var(--radius-sm);
  background: var(--hour-wash);
  color: var(--hour-ink);
}
.thours__cell.is-empty {
  background: var(--pl-flat);
}
/* Not enough trades to mean anything. Faint rather than absent: the hour was
   traded, and hiding that would be a different lie from overstating it. */
.thours__cell.is-thin {
  opacity: 0.45;
}
.thours__cell.is-best,
.thours__cell.is-worst {
  outline: 2px solid var(--accent, var(--theme-accent));
  outline-offset: -2px;
}
/* The count, as a bar rising from the floor of the cell. */
.thours__bar {
  position: absolute;
  inset: auto 0 0 0;
  height: var(--hour-bar);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  background: color-mix(in oklch, var(--hour-ink) 22%, transparent);
}
.thours__mark {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-bottom: 2px;
  color: var(--hour-ink);
}

.thours__tick {
  min-width: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-family: var(--font-mono);
  color: var(--text-secondary, var(--theme-dim));
  /* The label belongs to its own column and is allowed to spill sideways into
     the two unlabelled ones on either side of it. */
  overflow: visible;
  white-space: nowrap;
}
.thours__axis.is-broker .thours__tick {
  color: var(--text-muted, var(--theme-dim));
}

.thours__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-4);
  margin: 0;
  min-width: 0;
}
.thours__stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.thours__value {
  margin: 0;
  min-width: 0;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
}
.thours__value.is-pos {
  color: var(--theme-success);
}
.thours__value.is-neg {
  color: var(--theme-danger);
}
.thours__sub {
  padding-left: var(--sp-2);
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
}

@media (max-width: 480px) {
  /* Twenty-four cells at 360px is 12px each — still readable as a shape, which
     is what the strip is for; the numbers are in the legend and the tooltip. */
  .thours__cell {
    height: 32px;
  }
}
</style>
