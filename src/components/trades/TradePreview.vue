<script setup lang="ts">
// What the row will say, before it is a row (section 28b).
//
// Its own component because it is the form's OUTPUT rather than part of its
// input: the two clock readings and the two figures are all derived from what
// has been typed, none of them is editable, and none of them is stored. Keeping
// them here means the form's file is fields and nothing else.
//
// `aria-live` on both, because the whole point is that they change while
// somebody is typing — and a figure that only sighted users get told about is
// half a feature.
import { signed2 } from '@/utils/format'
import { signOf } from '@/utils/tradeMath'
import IconBuy from '@/components/icons/IconBuy.vue'
import IconSell from '@/components/icons/IconSell.vue'
import IconSymbol from '@/components/icons/IconSymbol.vue'

defineProps<{
  /** Both readings of the instant, or null before a time is complete. */
  clocks: { ist: string; broker: string; offset: string } | null
  /** Null until both prices and a lot are typed — never a zero standing in. */
  preview: { move: number; pl: number } | null
  side: 'buy' | 'sell'
  contractSize: number
}>()

/** A figure's class suffix: its own sign, never which figure it is. */
function sign(value: number | null | undefined): 'pos' | 'neg' | 'flat' {
  return value == null ? 'flat' : signOf(value)
}
</script>

<template>
  <div class="tprev">
    <!-- The broker time is computed from the instant every time it is shown; it
         is never the IST string with an offset added to it. -->
    <p v-if="clocks" class="tprev__clocks ui-mono" aria-live="polite">
      IST {{ clocks.ist }} <span class="tprev__dot" aria-hidden="true">·</span> Broker
      {{ clocks.broker }}
      <span class="tprev__offset">GMT{{ clocks.offset }}</span>
    </p>

    <dl class="tprev__figures ui-tabular" aria-live="polite">
      <div class="tprev__cell">
        <dt class="ui-label">
          <IconBuy v-if="side === 'buy'" :size="12" />
          <IconSell v-else :size="12" />
          Move
        </dt>
        <!-- A dash, not a zero: "0.00" before a price has been typed is a
             number the form invented. -->
        <dd class="tprev__value" :class="`is-${sign(preview?.move)}`">
          {{ preview ? signed2(preview.move) : '—' }}
        </dd>
      </div>
      <div class="tprev__cell">
        <dt class="ui-label">P/L</dt>
        <dd class="tprev__value" :class="`is-${sign(preview?.pl)}`">
          {{ preview ? signed2(preview.pl) : '—' }}
        </dd>
      </div>
      <div class="tprev__cell">
        <dt class="ui-label">
          <IconSymbol :size="12" />
          Contract
        </dt>
        <dd class="tprev__value">×{{ contractSize }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.tprev {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  flex: 1;
  min-width: 0;
}
/* Mono and secondary: a confirmation of what was typed, read against itself. */
.tprev__clocks {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.tprev__dot {
  padding: 0 var(--sp-1);
  color: var(--text-muted, var(--theme-dim));
}
.tprev__offset {
  padding-left: var(--sp-2);
  color: var(--text-muted, var(--theme-dim));
}
.tprev__figures {
  display: flex;
  gap: var(--sp-4);
  margin: 0;
  min-width: 0;
}
.tprev__cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.tprev__value {
  margin: 0;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--text-base);
  line-height: var(--lh-base);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary, var(--theme-text));
}
.tprev__value.is-pos {
  color: var(--theme-success);
}
.tprev__value.is-neg {
  color: var(--theme-danger);
}
</style>
