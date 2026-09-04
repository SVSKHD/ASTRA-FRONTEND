<script setup lang="ts">
// The desk (section 34).
//
// The only element on this tab that is always visible, and the only one that is
// about the next few minutes rather than about the month. Everything else here
// answers "how did it go"; this answers "it is about to start".
//
// Two clocks, because the session opens on the broker's and the trader is
// sitting on IST — the countdown is computed from the instant, and both
// readings are taken of that same instant rather than one being derived from
// the other by adding hours.
//
// At T-5 it says so and the form is armed by the parent. That is the whole
// point of the component: at the open, the difference between logging a trade
// and not logging it is how much typing stands in the way, and five minutes
// before is when that can still be fixed.
import { computed } from 'vue'
import IconSessionAsia from '@/components/icons/IconSessionAsia.vue'
import IconSessionLondon from '@/components/icons/IconSessionLondon.vue'
import IconSessionNy from '@/components/icons/IconSessionNy.vue'
import Button from '@/components/ui/Button.vue'
import { clockPair, countOf } from '@/utils/format'
import { IST, hhmmOn } from '@/utils/tradeTime'
import type { NextOpen } from '@/composables/useSessionClock'
import type { Clock } from '@/utils/tradeTime'
import type { DacoitSignal, TradeSession } from '@/types'

const props = defineProps<{
  next: NextOpen | null
  countdown: string
  armed: boolean
  /** The most recent GO still inside its window, if there is one. */
  go: DacoitSignal | null
  broker: Clock
}>()

defineEmits<{ take: [DacoitSignal] }>()

const SESSION_ICON = {
  Asia: IconSessionAsia,
  London: IconSessionLondon,
  NY: IconSessionNy,
} satisfies Record<TradeSession, unknown>

/** The signal's own instant, read on both clocks — never a stored second copy. */
const goClocks = computed(() =>
  props.go
    ? clockPair(hhmmOn(IST, props.go.signalAt), hhmmOn(props.broker, props.go.signalAt))
    : '',
)
</script>

<template>
  <section class="desk" :class="{ 'is-armed': armed }" data-desk>
    <div class="desk__clock">
      <span class="ui-label desk__label">
        <component :is="next ? SESSION_ICON[next.session] : SESSION_ICON.London" :size="14" />
        {{ next ? `${next.session} opens` : 'No session configured' }}
      </span>
      <!-- The countdown is the number being read, so it is the largest thing
           here and it is tabular: digits that change width jitter every tick. -->
      <p class="desk__countdown ui-mono" aria-live="off">{{ countdown }}</p>
      <p v-if="next" class="desk__at ui-mono">{{ clockPair(next.ist, next.broker) }}</p>
    </div>

    <!-- Said once, when it becomes true. `aria-live` polite rather than
         assertive: it is worth knowing, it is not an alarm. -->
    <p v-if="armed" class="desk__armed" aria-live="polite">
      Form armed — symbol, session and time are filled. Type the entry price.
    </p>

    <!-- A GO that has landed, inline. Not a toast: a toast about a signal is
         gone by the time the chart has been looked at. -->
    <div v-if="go" class="desk__go">
      <span class="desk__verdict">GO</span>
      <span class="desk__goWhat">
        {{ go.symbol }}
        <span class="desk__goWhen ui-mono">{{ goClocks }}</span>
      </span>
      <span v-if="Object.keys(go.raw).length" class="desk__goExtra">
        {{ countOf(Object.keys(go.raw).length, 'field') }} from Dacoit
      </span>
      <Button variant="ghost" size="sm" @click="$emit('take', go)">Log this</Button>
    </div>
  </section>
</template>

<style scoped>
.desk {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  box-shadow: var(--layer-raised-shadow);
}
/* Armed is a state, and it is drawn as a border rather than as a colour on the
   text: the numbers are being read, and a hue on them says something about the
   figure rather than about the clock. */
.desk.is-armed {
  border-color: var(--accent, var(--theme-accent));
}
.desk__clock {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.desk__label {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
}
.desk__countdown {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xl);
  line-height: var(--lh-xl);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary, var(--theme-text));
}
.desk__at,
.desk__armed,
.desk__goExtra {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.desk__armed {
  flex: 1;
  color: var(--accent, var(--theme-accent));
}
.desk__go {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
  margin-left: auto;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--theme-success);
  border-radius: var(--radius-sm);
  background: color-mix(in oklch, var(--theme-success) 12%, transparent);
}
/* The verdict is a word, not only a colour — the palette goes achromatic on
   some themes and a green pill would then say nothing at all. */
.desk__verdict {
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  color: var(--text-primary, var(--theme-text));
}
.desk__goWhat {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.desk__goWhen {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
}

@media (max-width: 480px) {
  .desk__go {
    margin-left: 0;
  }
}
</style>
