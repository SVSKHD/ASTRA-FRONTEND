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

const props = defineProps<{ trades: Trade[]; settings: AstraSettings; now?: number }>()

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
  <section class="ttar">
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
.ttar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--sp-4);
  min-width: 0;
}
.ttar__one {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
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
