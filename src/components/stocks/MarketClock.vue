<script setup lang="ts">
// The corner of the Stocks tab: is the Indian market open, and when does that
// change. Green while open (with how much of the session has gone), amber in
// pre-open, grey when closed with the next open. Hours are NSE / BSE cash.
import { computed } from 'vue'
import { marketClock } from '@/trading/marketClock'

const props = withDefaults(defineProps<{ now: number; compact?: boolean }>(), {
  compact: false,
})
const clock = computed(() => marketClock(props.now))
const HOURS =
  'NSE and BSE equity: pre-open 09:00 to 09:15, trading 09:15 to 15:30 IST, Monday to Friday. Exchange holidays are not shown here.'
</script>

<template>
  <div
    class="mc"
    :class="[`is-${clock.phase}`, { 'is-compact': compact }]"
    :title="HOURS"
    :aria-label="`${clock.title}. ${clock.detail}. ${HOURS}`"
    role="group"
  >
    <span class="mc__dot" aria-hidden="true"></span>
    <span class="mc__text" aria-hidden="true">
      <span class="mc__title">{{ clock.title }}</span>
      <span class="mc__detail tp-num">{{ clock.detail }}</span>
    </span>
    <span
      v-if="clock.phase === 'open'"
      class="mc__bar"
      aria-hidden="true"
      :style="{ '--done': `${Math.round(clock.progress * 100)}%` }"
    ></span>
  </div>
</template>

<style scoped>
.mc {
  --mc: var(--theme-dim);
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  padding: 5px 12px 6px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid color-mix(in oklch, var(--mc) 40%, var(--theme-border));
  background: color-mix(in oklch, var(--mc) 9%, transparent);
  overflow: hidden;
}
.mc.is-open {
  --mc: var(--theme-success);
}
.mc.is-pre {
  --mc: var(--theme-warning);
}
.mc__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--mc);
}
.mc.is-open .mc__dot,
.mc.is-pre .mc__dot {
  animation: mc-pulse 1.8s ease-in-out infinite;
}
@keyframes mc-pulse {
  50% {
    opacity: 0.35;
  }
}
.mc__text {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  white-space: nowrap;
}
.mc__title {
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.mc__detail {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
/* How much of today's session has gone, along the bottom edge. */
.mc__bar {
  position: absolute;
  inset: auto 0 0 0;
  height: 2px;
  background: linear-gradient(
    to right,
    var(--mc) var(--done),
    color-mix(in oklch, var(--mc) 15%, transparent) var(--done)
  );
}
.mc.is-compact {
  display: flex;
  width: 100%;
  border-radius: var(--radius-md);
}
.mc.is-compact .mc__text {
  flex: 1;
  justify-content: space-between;
}
@media (prefers-reduced-motion: reduce) {
  .mc__dot {
    animation: none !important;
  }
}
</style>
