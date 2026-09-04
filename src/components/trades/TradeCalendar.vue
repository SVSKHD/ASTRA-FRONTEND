<script setup lang="ts">
// The month as a picture (section 28b).
//
// This is the app's own GlassDatePicker rendered inline, not a second calendar:
// the grid, the keyboard model, the weekday labels and the theming are the ones
// every date field in the app already uses. What this file adds is the two
// things the picker cannot know — what a day means, and what clicking it does.
//
// Three signals per day, and no one of them is colour alone:
//
//   the wash    which way the day went, and how far, on the five-step OKLCH
//               ramp in themes/plScale — every step measured to carry the day
//               number at 4.5:1
//   the bar     the day's move against the daily target, as a length
//   the mark    ▲ / ▼ / · , which is the whole reading again for a mono theme,
//               a colour-blind reader and a printout
//
// The tooltip is drawn here rather than left to `title`: the native one appears
// after a second, in the corner of the pointer, in the OS's own styling, and it
// cannot show three figures as three rows. It is duplicated into a screen-reader
// span so the cell announces the same thing it shows.
import { computed } from 'vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import Button from '@/components/ui/Button.vue'
import IconFilter from '@/components/icons/IconFilter.vue'
import IconTargetHit from '@/components/icons/IconTargetHit.vue'
import IconTargetMissed from '@/components/icons/IconTargetMissed.vue'
import { plInkVar, plWashVar } from '@/themes/plScale'
import { byDay, dayTotals, fmt2, signOf, signed2 } from '@/utils/tradeMath'
import type { DayMeta } from '@/components/ui/GlassDatePicker.vue'
import type { Trade } from '@/types'

const props = defineProps<{
  trades: Trade[]
  dayTarget: number
  /** '' means the whole month; a date filters the table to that day. */
  selected: string
  loading?: boolean
}>()
const emit = defineEmits<{ 'update:selected': [string]; month: [string] }>()

const days = computed(() => byDay(props.trades))

/** What each day is worth, in the picker's own vocabulary. */
const dayMeta = computed<Record<string, DayMeta>>(() => {
  const target = props.dayTarget > 0 ? props.dayTarget : 1
  const out: Record<string, DayMeta> = {}
  for (const cell of days.value.values()) {
    const tone = signOf(cell.pl)
    out[cell.date] = {
      tone,
      intensity: Math.min(1, Math.abs(cell.move) / target),
      // The exact step, not a mix: the picker paints what it is given — and the
      // ink comes with it, because a wash without the colour its number has to
      // be drawn in is half a decision (section 29).
      wash: plWashVar(tone, cell.move, target),
      ink: plInkVar(tone, cell.move, target),
    }
  }
  return out
})

const summary = computed(() => (props.selected ? dayTotals(props.trades, props.selected) : null))
const empty = computed(() => days.value.size === 0)

// The bar is the day's move against the target, as a fraction — a length, which
// is the one channel that survives every theme and every kind of colour vision.
function barPct(ymd: string): number {
  const cell = days.value.get(ymd)
  if (!cell) return 0
  const target = props.dayTarget > 0 ? props.dayTarget : 1
  return Math.min(100, Math.round((Math.abs(cell.move) / target) * 100))
}

function tooltip(ymd: string) {
  return days.value.get(ymd) ?? null
}

// Clicking the selected day again clears the filter. Without it the only way
// back to the whole month is a button, and the obvious gesture does nothing.
function onPick(value: unknown) {
  const ymd = typeof value === 'string' ? value : ''
  emit('update:selected', ymd === props.selected ? '' : ymd)
}

const MARK: Record<string, string> = { pos: '▲', neg: '▼', flat: '·' }
</script>

<template>
  <section class="tcal">
    <GlassDatePicker
      :model-value="selected"
      inline
      mode="date"
      :quick-entry="false"
      :day-meta="dayMeta"
      label="Trading month"
      @update:model-value="onPick"
      @month="emit('month', $event)"
    >
      <template #day="{ cell, meta }">
        <span class="tcal__day">
          <span class="tcal__num">{{ cell.day }}</span>
          <span v-if="meta?.tone" class="tcal__mark" :class="`is-${meta.tone}`" aria-hidden="true">
            {{ MARK[meta.tone] }}
          </span>
          <!-- The micro bar: the day's move against the daily target. Present
               only on a traded day, so an empty square stays empty. -->
          <span v-if="meta?.tone" class="tcal__bar" :class="`is-${meta.tone}`" aria-hidden="true">
            <span class="tcal__barFill" :style="{ width: `${barPct(cell.ymd)}%` }"></span>
          </span>

          <template v-if="tooltip(cell.ymd)">
            <!-- Absolutely positioned and pointer-transparent: it appears over
                 the grid without moving a single cell. -->
            <span class="tcal__tip" aria-hidden="true">
              <span class="tcal__tipDate">{{ cell.ymd }}</span>
              <span class="tcal__tipRow">
                <span>Net move</span>
                <span class="ui-mono" :class="`is-${signOf(tooltip(cell.ymd)!.move)}`">
                  {{ signed2(tooltip(cell.ymd)!.move) }}
                </span>
              </span>
              <span class="tcal__tipRow">
                <span>Net P/L</span>
                <span class="ui-mono" :class="`is-${signOf(tooltip(cell.ymd)!.pl)}`">
                  {{ signed2(tooltip(cell.ymd)!.pl) }}
                </span>
              </span>
              <span class="tcal__tipRow">
                <span>Trades</span>
                <span class="ui-mono">{{ tooltip(cell.ymd)!.count }}</span>
              </span>
            </span>
            <span class="ui-sr-only">
              {{ tooltip(cell.ymd)!.count }} trades, net move
              {{ signed2(tooltip(cell.ymd)!.move) }}, net P/L
              {{ signed2(tooltip(cell.ymd)!.pl) }}
            </span>
          </template>
        </span>
      </template>
    </GlassDatePicker>

    <div class="tcal__foot">
      <template v-if="summary">
        <dl class="tcal__summary ui-tabular">
          <div class="tcal__cell">
            <dt class="ui-label">
              <IconFilter :size="12" />
              {{ selected }}
            </dt>
            <dd class="tcal__value">
              {{ summary.count }} trade{{ summary.count === 1 ? '' : 's' }}
            </dd>
          </div>
          <div class="tcal__cell">
            <dt class="ui-label">Net move</dt>
            <dd class="tcal__value" :class="`is-${signOf(summary.move)}`">
              {{ signed2(summary.move) }}
            </dd>
          </div>
          <div class="tcal__cell">
            <dt class="ui-label">Net P/L</dt>
            <dd class="tcal__value" :class="`is-${signOf(summary.pl)}`">
              {{ signed2(summary.pl) }}
            </dd>
          </div>
          <div class="tcal__cell">
            <dt class="ui-label">Day target</dt>
            <dd class="tcal__value tcal__target">
              <IconTargetHit v-if="Math.abs(summary.move) >= dayTarget" :size="16" />
              <IconTargetMissed v-else :size="16" />
              {{ fmt2(dayTarget) }}
            </dd>
          </div>
        </dl>
        <Button variant="ghost" size="sm" @click="emit('update:selected', '')">
          Show whole month
        </Button>
      </template>

      <!-- Three states, said in words. A reader looking at thirty untouched
           squares cannot tell "nothing traded" from "nothing loaded yet", and
           an unexplained heat grid is a puzzle rather than a chart. -->
      <p v-else-if="loading" class="tcal__hint">Loading this month's trades.</p>
      <p v-else-if="empty" class="tcal__hint">
        No trades this month yet. Once there are, each day is washed by its profit or loss and
        barred by how far it moved against the {{ fmt2(dayTarget) }} target — click one to filter
        the log to it.
      </p>
      <p v-else class="tcal__hint">
        Click a day to filter the log to it. The wash is the day's profit or loss, the bar is how
        far it moved against the {{ fmt2(dayTarget) }} target.
      </p>
    </div>
  </section>
</template>

<style scoped>
.tcal {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}

/* --- the cell ------------------------------------------------------------- */
.tcal__day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
  min-width: 0;
  line-height: 1;
}
.tcal__num {
  font-variant-numeric: tabular-nums;
}
/* The direction, in shape as well as in colour — and coloured rather than left
   white, so a cell is not three white elements stacked on a wash. */
.tcal__mark {
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
}
.tcal__mark.is-pos {
  color: var(--theme-success);
}
.tcal__mark.is-neg {
  color: var(--theme-danger);
}
.tcal__mark.is-flat {
  color: var(--text-muted, var(--theme-dim));
}
/* A measure, not an underline: the track is barely there and the fill is the
   day's own sign, so the bar adds a length to the reading without competing
   with the wash it sits on. */
.tcal__bar {
  display: block;
  width: 58%;
  height: 3px;
  min-width: 0;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, currentcolor 16%, transparent);
  overflow: hidden;
}
.tcal__bar.is-pos {
  color: var(--theme-success);
}
.tcal__bar.is-neg {
  color: var(--theme-danger);
}
.tcal__bar.is-flat {
  color: var(--text-muted, var(--theme-dim));
}
.tcal__barFill {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: currentcolor;
  /* Answers a data change, not a mount: a width transition has no previous
     value on first paint, so this is inert until a trade is logged. */
  transition: width var(--dur-med) var(--ease-out);
}

/* --- the tooltip ---------------------------------------------------------- */
/* The overlay layer: its own background, border and shadow recipe, none of them
   shared with the raised panels underneath (section 28b). */
.tcal__tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  z-index: 4;
  display: none;
  flex-direction: column;
  gap: 3px;
  width: max-content;
  min-width: 132px;
  padding: var(--sp-2);
  transform: translateX(-50%);
  border-radius: var(--radius-card);
  border: 1px solid var(--layer-overlay-border);
  background: var(--layer-overlay-bg);
  box-shadow: var(--layer-overlay-shadow);
  color: var(--text-primary, var(--theme-text));
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  text-align: left;
  pointer-events: none;
}
/* Shown by display rather than opacity so it costs nothing until it is needed,
   and anchored to the cell so nothing on the page moves when it appears. */
.gdp__day:hover .tcal__tip,
.gdp__day:focus-visible .tcal__tip {
  display: flex;
}
/* The top row has nothing above it to cover, so its tooltip drops below the
   cell instead of over the weekday labels. */
.gdp__week:first-child .tcal__tip {
  top: calc(100% + 6px);
  bottom: auto;
}
.tcal__tipDate {
  font-family: var(--font-mono);
  color: var(--text-secondary, var(--theme-dim));
}
.tcal__tipRow {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
  min-width: 0;
}
.tcal__tipRow .is-pos {
  color: var(--theme-success);
}
.tcal__tipRow .is-neg {
  color: var(--theme-danger);
}

/* --- the day summary ------------------------------------------------------ */
.tcal__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  min-width: 0;
}
.tcal__summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-5);
  margin: 0;
  min-width: 0;
}
.tcal__cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.tcal__cell .ui-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.tcal__value {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-base);
  line-height: var(--lh-base);
  color: var(--text-primary, var(--theme-text));
}
.tcal__target {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
}
.tcal__value.is-pos {
  color: var(--theme-success);
}
.tcal__value.is-neg {
  color: var(--theme-danger);
}
.tcal__hint {
  margin: 0;
  min-width: 0;
  max-width: 46ch;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}

@media (prefers-reduced-motion: reduce) {
  .tcal__barFill {
    transition: none;
  }
}
</style>
