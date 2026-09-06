<script setup lang="ts">
// Today and the month, against their targets.
//
// Both derived here from the same `trades` array everything else on the tab
// reads, so there is no accumulated figure to drift and nothing to refresh
// after an edit. The bar fills in answer to a change; it does not animate on
// mount, because a progress bar that performs on arrival is a progress bar
// nobody trusts the second time.
import { computed } from 'vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import IconTargetHit from '@/components/icons/IconTargetHit.vue'
import IconTargetMissed from '@/components/icons/IconTargetMissed.vue'
import { fmt2, signed2 } from '@/utils/format'
import { dayTotals, signOf, targetProgress } from '@/utils/tradeMath'
import { IST, ymdOn } from '@/utils/tradeTime'
import type { AstraSettings, Trade } from '@/types'

const props = defineProps<{
  trades: Trade[]
  settings: AstraSettings
  now?: number
  /** What the month figure is scoped to — "September 2026". */
  period?: string
}>()

/** The trader's own day, on the trader's own clock — not the machine's. */
const today = computed(() => ymdOn(IST, props.now ?? Date.now()))

const rows = computed(() => [
  {
    key: 'day',
    label: 'Today · move',
    progress: targetProgress(dayTotals(props.trades, today.value).move, props.settings.dayTarget),
    remainingText: (n: number) => `${fmt2(n)} to go today`,
    metText: 'Day target met',
  },
  {
    key: 'month',
    label: 'Month to date · move',
    progress: targetProgress(
      props.trades.reduce((sum, t) => sum + t.move, 0),
      props.settings.monthTarget,
    ),
    remainingText: (n: number) => `${fmt2(n)} still needed this month`,
    metText: 'Month target met',
  },
])
</script>

<template>
  <!-- ONE CARD, TWO HORIZONS.
       Today and the month are the same question asked at two ranges, and they
       are read against each other — "I am 4 up on a 10 day target, in a month
       that still owes 30". Two cards side by side made that a comparison across
       a gutter; one card with a rule between them makes it a comparison down a
       column, which is the direction the eye already travels. -->
  <section class="ttar">
    <header class="ttar__card">
      <span class="ui-label">Targets</span>
      <span v-if="period" class="ttar__period">{{ period }}</span>
    </header>
    <div v-for="row in rows" :key="row.key" class="ttar__one">
      <div class="ttar__head">
        <span class="ui-label">
          <IconTargetHit v-if="row.progress.remaining === 0" :size="14" />
          <IconTargetMissed v-else :size="14" />
          {{ row.label }}
        </span>
        <span class="ttar__figure ui-mono" :class="`is-${signOf(row.progress.move)}`">
          {{ signed2(row.progress.move) }} / {{ fmt2(row.progress.target) }}
        </span>
      </div>
      <ProgressBar :value="row.progress.pct" :label="`${row.label} against its target`" />
      <p class="ttar__note">
        {{ row.progress.remaining ? row.remainingText(row.progress.remaining) : row.metText }}
      </p>
    </div>
  </section>
</template>

<style scoped>
/* The raised layer, the same recipe the account card uses — these two sit in
   the same row of the tab and a card beside a bare section reads as one of them
   being unfinished. */
.ttar {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-4);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
}
.ttar__card {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
}
.ttar__period {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-muted, var(--theme-dim));
}
.ttar__one {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
/* A rule between the two, not a gutter: they are one card and the second is
   the same measurement at a longer range. */
.ttar__one + .ttar__one {
  padding-top: var(--sp-3);
  border-top: 1px solid var(--layer-raised-border);
}
.ttar__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
}
.ttar__figure {
  min-width: 0;
  font-variant-numeric: tabular-nums;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
}
/* Sign, not metric: a target that is behind is not an error. */
.ttar__figure.is-pos {
  color: var(--theme-success);
}
.ttar__figure.is-neg {
  color: var(--theme-danger);
}
.ttar__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
</style>
