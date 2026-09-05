<script setup lang="ts">
// The session countdown, on the home screen (section 44, item 6).
//
// ITS OWN COMPONENT BECAUSE IT TICKS. `useSessionClock` updates once a second,
// and a once-a-second value read in the Dashboard's own setup would re-render
// every block on the home screen once a second, forever — the calendar figures,
// the headline list, the trade rows, all of them, for four characters of text.
// That is precisely the bug section 42 fixed by moving the clock out of
// `TradesView` and into `SessionDesk`, and a home screen is the easiest place
// in the app to reintroduce it.
//
// So the clock lives here, at the leaf, and the re-render stops here too.
import { computed } from 'vue'
import { useSessionClock } from '@/composables/useSessionClock'
import { useSettings } from '@/composables/useSettings'
import type { TradeSession } from '@/types'

const { settings } = useSettings()

const clock = useSessionClock(
  () => ({
    zone: settings.value.brokerTimezone,
    offsetMinutes: settings.value.brokerOffsetMinutes,
  }),
  () => settings.value.sessionBounds,
)
const next = computed(() => clock.next.value)

/** `2h 41m`, or `4m 08s` in the last hour — seconds only when they matter. */
const label = computed(() => {
  const n = next.value
  if (!n) return ''
  if (n.minutes >= 60)
    return `${Math.floor(n.minutes / 60)}h ${String(n.minutes % 60).padStart(2, '0')}m`
  return `${n.minutes}m ${String(n.seconds).padStart(2, '0')}s`
})

const SESSION_LABEL: Record<TradeSession, string> = {
  Asia: 'Asia',
  London: 'London',
  NY: 'New York',
}
</script>

<template>
  <div v-if="next" class="dcd" :class="{ 'is-armed': next.armed }">
    <span class="dcd__label ui-label">{{ SESSION_LABEL[next.session] ?? next.session }} opens</span>
    <span class="dcd__time ui-mono">{{ label }}</span>
    <span class="dcd__clocks">{{ next.broker }} broker · {{ next.ist }} IST</span>
  </div>
  <p v-else class="dcd__none">No session boundaries set.</p>
</template>

<style scoped>
.dcd {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dcd__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dcd__time {
  min-width: 0;
  font-size: var(--text-xl);
  line-height: 1.05;
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary, var(--theme-text));
}
/* T-5. The accent is the app's one "act now" colour and it lands on the
   number's own weight, not on a background the text then has to survive. */
.dcd.is-armed .dcd__time {
  color: var(--accent, var(--theme-accent));
}
.dcd__clocks {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary, var(--theme-dim));
}
.dcd__none {
  margin: 0;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary, var(--theme-dim));
}
</style>
