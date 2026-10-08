<script setup lang="ts">
// Work in flight, as cards in the bottom-right corner (services/progress).
//
// One job is one card: what is happening, how far it has got (a filling bar and
// a percentage when the work has a measure, a sweeping one when it has not),
// and a tick when it is done. Several at once CASCADE — a deck, the newest at
// the front and the rest peeking out behind it, offset and a little smaller —
// and spread into a plain column while the pointer (or focus) is on them, so
// each can be read. Finished cards leave one at a time; a failed one waits to
// be closed.
//
// It also carries what the two-pixel top bar used to: a route change and a
// background sync, now as named cards ("Opening page", "Syncing 3 changes").
import { computed, onBeforeUnmount, watch } from 'vue'
import { useBackgroundWorkKinds } from '@/composables/useBackgroundWork'
import {
  dismissProgress,
  progressJobs,
  startProgress,
  type ProgressHandle,
} from '@/services/progress'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import Icon from '@/components/ui/Icon.vue'

// ---- the shell's own work ------------------------------------------------------
const { navigating, isSyncing, pendingCount } = useBackgroundWorkKinds()
let routeJob: ProgressHandle | null = null
watch(navigating, (on) => {
  if (on) routeJob = startProgress({ id: 'route', title: 'Opening page' })
  else routeJob?.finish('Ready')
})
const changes = (n: number) => `${n} change${n === 1 ? '' : 's'}`
let syncJob: ProgressHandle | null = null
// The most writes queued at once in this sync, so the bar fills as they drain.
let syncPeak = 0
watch(
  [isSyncing, pendingCount],
  ([on, count]) => {
    if (on) {
      if (!syncJob) {
        syncPeak = count
        syncJob = startProgress({
          id: 'sync',
          title: 'Syncing',
          detail: changes(count) + ' to save',
          total: count,
        })
      }
      syncPeak = Math.max(syncPeak, count)
      syncJob.update({
        total: syncPeak,
        done: syncPeak - count,
        detail: changes(count) + ' to save',
      })
    } else if (syncJob) {
      syncJob.finish('All changes saved')
      syncJob = null
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  routeJob?.finish()
  syncJob?.finish()
})

// ---- the deck --------------------------------------------------------------------
// Newest first: the front card is the latest thing to start.
const cards = computed(() =>
  progressJobs
    .filter((j) => j.visible)
    .slice()
    .reverse(),
)
const DEPTH = 3
function pct(j: { done: number | null; total: number | null }) {
  if (j.done == null || !j.total) return null
  return Math.max(0, Math.min(100, Math.round((j.done / j.total) * 100)))
}
function cardStyle(i: number) {
  return {
    '--i': i,
    zIndex: 100 - i,
  }
}
</script>

<template>
  <section
    v-if="cards.length"
    class="pstack"
    :class="{ 'is-deck': cards.length > 1 }"
    :style="{ '--n': Math.min(cards.length, DEPTH) }"
    aria-label="Work in progress"
    aria-live="polite"
  >
    <TransitionGroup name="pcard">
      <article
        v-for="(j, i) in cards"
        :key="j.id"
        class="pcard"
        :class="['is-' + j.state, { 'is-buried': i >= DEPTH }]"
        :style="cardStyle(i)"
        :aria-hidden="i >= DEPTH ? 'true' : undefined"
      >
        <span class="pcard__icon" aria-hidden="true">
          <ProgressRing
            v-if="j.state === 'running'"
            :size="22"
            :stroke="2.5"
            :ratio="pct(j) == null ? undefined : pct(j)! / 100"
            :indeterminate="pct(j) == null"
            hide-value
          />
          <span v-else-if="j.state === 'done'" class="pcard__badge is-done">
            <Icon name="check" size="xs" />
          </span>
          <span v-else class="pcard__badge is-failed">
            <Icon name="alert-circle" size="xs" />
          </span>
        </span>

        <div class="pcard__body">
          <div class="pcard__line">
            <span class="pcard__title">{{ j.title }}</span>
            <span v-if="j.state === 'running' && pct(j) != null" class="pcard__pct">
              {{ pct(j) }}%
            </span>
          </div>
          <span v-if="j.detail" class="pcard__detail">{{ j.detail }}</span>
          <span
            class="pcard__bar"
            :class="{ 'is-indeterminate': j.state === 'running' && pct(j) == null }"
            role="progressbar"
            :aria-label="j.title"
            :aria-valuenow="pct(j) ?? undefined"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span
              class="pcard__fill"
              :style="{ width: (j.state === 'running' ? (pct(j) ?? 0) : 100) + '%' }"
            ></span>
          </span>
        </div>

        <button
          v-if="j.state !== 'running'"
          type="button"
          class="pcard__close"
          :aria-label="'Dismiss ' + j.title"
          @click="dismissProgress(j.id)"
        >
          <Icon name="x" size="xs" />
        </button>
        <!-- How many more are stacked behind, on the front card of a deck. -->
        <span v-if="i === 0 && cards.length > 1" class="pcard__more">+{{ cards.length - 1 }}</span>
      </article>
    </TransitionGroup>
  </section>
</template>

<style scoped>
.pstack {
  --card-h: 74px;
  --gap: 8px;
  --peek: 9px;
  /* Placed by the bottom-right column in App.vue, above the alert tray. */
  position: relative;
  width: min(340px, calc(100vw - 32px));
  /* The deck's height: the front card plus a peek of each one behind it. */
  height: calc(var(--card-h) + (var(--n) - 1) * var(--peek));
  transition: height 0.32s var(--ease-out);
  pointer-events: none;
}
/* Spread: on hover or focus the deck opens into a column, each card in full. */
.pstack.is-deck:hover,
.pstack.is-deck:focus-within {
  height: calc(var(--n) * var(--card-h) + (var(--n) - 1) * var(--gap));
}

.pcard {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--card-h);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 18px;
  color: var(--theme-text);
  background: color-mix(in oklch, var(--theme-card) 92%, var(--glass-solid));
  border: 1px solid color-mix(in oklch, var(--theme-text) 8%, transparent);
  box-shadow: var(--shadow-float);
  pointer-events: auto;
  transform-origin: bottom center;
  /* The cascade, rising from the corner: each card behind the front one sits
     a peek higher, a little smaller and dimmer. */
  transform: translateY(calc(var(--i) * var(--peek) * -1)) scale(calc(1 - var(--i) * 0.05));
  opacity: calc(1 - var(--i) * 0.22);
  transition:
    transform 0.38s cubic-bezier(0.34, 1.3, 0.64, 1),
    opacity 0.3s ease,
    border-color 0.3s ease;
}
.pcard.is-buried {
  opacity: 0;
  pointer-events: none;
}
.pstack.is-deck:hover .pcard,
.pstack.is-deck:focus-within .pcard {
  transform: translateY(calc(var(--i) * (var(--card-h) + var(--gap)) * -1));
  opacity: 1;
}
.pstack.is-deck:hover .pcard.is-buried,
.pstack.is-deck:focus-within .pcard.is-buried {
  opacity: 0;
}
.pcard.is-done {
  border-color: color-mix(in oklch, var(--theme-success) 40%, transparent);
}
.pcard.is-failed {
  border-color: color-mix(in oklch, var(--theme-danger) 50%, transparent);
}

.pcard__icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: var(--theme-accent);
}
.pcard__badge {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  animation: pcard-pop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.pcard__badge.is-done {
  background: var(--theme-success);
  color: var(--theme-card);
}
.pcard__badge.is-failed {
  background: color-mix(in oklch, var(--theme-danger) 18%, transparent);
  color: var(--theme-danger);
}
@keyframes pcard-pop {
  from {
    transform: scale(0.4);
    opacity: 0;
  }
}

.pcard__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pcard__line {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.pcard__title {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  font-weight: var(--weight-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pcard__pct {
  flex-shrink: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--theme-dim);
}
.pcard__detail {
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--theme-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pcard__bar {
  position: relative;
  display: block;
  height: 4px;
  margin-top: 3px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in oklch, var(--theme-text) 10%, transparent);
}
.pcard__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--theme-accent);
  transition:
    width 0.45s var(--ease-out),
    background 0.3s ease;
}
.pcard.is-done .pcard__fill {
  background: var(--theme-success);
}
.pcard.is-failed .pcard__fill {
  background: var(--theme-danger);
}
/* No measure: a segment sweeps across instead of pretending to a percentage. */
.pcard__bar.is-indeterminate .pcard__fill {
  width: 38% !important;
  animation: pcard-sweep 1.1s ease-in-out infinite;
}
@keyframes pcard-sweep {
  from {
    transform: translateX(-110%);
  }
  to {
    transform: translateX(270%);
  }
}

.pcard__close {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  transition:
    background var(--dur-fast) ease,
    color var(--dur-fast) ease;
}
.pcard__close:hover,
.pcard__close:focus-visible {
  background: color-mix(in oklch, var(--theme-text) 8%, transparent);
  color: var(--theme-text);
  outline: none;
}
.pcard__more {
  position: absolute;
  top: -7px;
  right: 10px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--theme-on-accent);
  background: var(--theme-accent);
  transition: opacity 0.2s ease;
}
.pstack.is-deck:hover .pcard__more,
.pstack.is-deck:focus-within .pcard__more {
  opacity: 0;
}

/* Arriving: slides in from the right edge. Leaving: slides back out and
   fades — one card at a time, paced by the service's dismissal queue. */
.pcard-enter-from {
  opacity: 0;
  transform: translateX(40px) scale(0.96);
}
.pcard-leave-active {
  transition:
    transform 0.3s ease-in,
    opacity 0.26s ease-in;
}
.pcard-leave-to {
  opacity: 0;
  transform: translateX(60px) scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .pstack,
  .pcard,
  .pcard__fill,
  .pcard-leave-active {
    transition: none;
  }
  .pcard__badge {
    animation: none;
  }
  .pcard__bar.is-indeterminate .pcard__fill {
    animation: none;
    width: 100% !important;
    opacity: 0.5;
  }
}
</style>
