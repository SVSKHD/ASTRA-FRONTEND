<script setup lang="ts">
// Progress for a burst of todos/tasks ticked to done (or back). Ticks are
// held locally and written once the ticking pauses (stores/app statusSync), so
// this shows where the burst is: queued with a countdown to the write, saving,
// saved, or failed and retrying, with how many of the items the server has.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const { statusSync } = storeToRefs(app)

const visible = computed(() => statusSync.value.phase !== 'idle' && statusSync.value.total > 0)

const what = computed(() => {
  const { done, reopened } = statusSync.value
  const parts: string[] = []
  if (done) parts.push(done + ' to Done')
  if (reopened) parts.push(reopened + ' reopened')
  return parts.join(' · ')
})

const state = computed(() => {
  switch (statusSync.value.phase) {
    case 'queued':
      return 'Syncing when you pause'
    case 'saving':
      return 'Saving…'
    case 'saved':
      return 'Saved'
    case 'error':
      return 'Couldn’t save — retrying'
    default:
      return ''
  }
})

const pct = computed(() => {
  const { phase, saved, total } = statusSync.value
  if (phase === 'saved') return 100
  return total ? Math.round((saved / total) * 100) : 0
})

// The countdown to the write, restarted by every tick (keyed on syncAt).
const countdownMs = computed(() => Math.max(0, statusSync.value.syncAt - Date.now()))
</script>

<template>
  <Transition name="ssm">
    <div
      v-if="visible"
      class="ssm"
      :class="`ssm--${statusSync.phase}`"
      role="status"
      aria-live="polite"
    >
      <div class="ssm__row">
        <span class="ssm__dot" aria-hidden="true">{{
          statusSync.phase === 'saved' ? '✓' : statusSync.phase === 'error' ? '!' : ''
        }}</span>
        <span class="ssm__what">{{ what }}</span>
        <span class="ssm__count">{{ statusSync.saved }}/{{ statusSync.total }}</span>
      </div>
      <div
        class="ssm__track"
        role="progressbar"
        aria-label="Saved to the cloud"
        :aria-valuenow="pct"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="ssm__fill" :style="{ width: pct + '%' }" />
        <div
          v-if="statusSync.phase === 'queued'"
          :key="statusSync.syncAt"
          class="ssm__countdown"
          :style="{ animationDuration: countdownMs + 'ms' }"
        />
        <div v-else-if="statusSync.phase === 'saving'" class="ssm__busy" />
      </div>
      <span class="ssm__state">{{ state }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.ssm {
  position: fixed;
  right: var(--sp-5);
  bottom: calc(var(--sp-6) * 2 + var(--sp-4));
  z-index: 61;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  width: 240px;
  max-width: calc(100vw - 2 * var(--sp-5));
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md, 12px);
  border: 1px solid var(--layer-overlay-border, var(--glass-border));
  background: var(--surface-overlay, var(--glass-solid));
  box-shadow: var(--layer-overlay-shadow, var(--elev-1));
  color: var(--theme-text);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
}
.ssm__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.ssm__dot {
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  flex: none;
  border-radius: 50%;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  color: var(--theme-bg, #fff);
  background: var(--accent, var(--theme-accent));
}
.ssm--queued .ssm__dot,
.ssm--saving .ssm__dot {
  animation: ssm-pulse 1s ease-in-out infinite;
}
.ssm--saved .ssm__dot {
  background: var(--theme-success);
}
.ssm--error .ssm__dot {
  background: var(--theme-danger);
}
.ssm__what {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--weight-semibold);
}
.ssm__count {
  color: var(--theme-dim);
  font-variant-numeric: tabular-nums;
}
.ssm__track {
  position: relative;
  height: 6px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--theme-dim) 22%, transparent);
}
.ssm__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: var(--accent, var(--theme-accent));
  transition: width 0.3s ease;
}
.ssm--saved .ssm__fill {
  background: var(--theme-success);
}
.ssm--error .ssm__fill {
  background: var(--theme-danger);
}
/* Time left until the burst is written. */
.ssm__countdown {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0;
  background: color-mix(in srgb, var(--accent, var(--theme-accent)) 45%, transparent);
  animation: ssm-count linear forwards;
}
.ssm__busy {
  position: absolute;
  inset: 0;
  width: 40%;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--accent, var(--theme-accent)) 70%, transparent),
    transparent
  );
  animation: ssm-busy 0.9s ease-in-out infinite;
}
.ssm__state {
  color: var(--theme-dim);
  font-size: var(--text-xs);
}
@keyframes ssm-count {
  to {
    width: 100%;
  }
}
@keyframes ssm-busy {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(250%);
  }
}
@keyframes ssm-pulse {
  50% {
    opacity: 0.45;
  }
}
.ssm-enter-active,
.ssm-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.ssm-enter-from,
.ssm-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
@media (prefers-reduced-motion: reduce) {
  .ssm__busy,
  .ssm__dot {
    animation: none !important;
  }
  .ssm-enter-from,
  .ssm-leave-to {
    transform: none;
  }
}
</style>
