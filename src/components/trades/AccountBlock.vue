<script setup lang="ts">
// The account, always on screen (section 28b).
//
// Three figures, three glyphs, three meanings that are easy to confuse and must
// never be: what is in the account, what has been taken out of it, and what the
// trading earned. They were a `StatRow` before this pass, which is the right
// component for three related numbers and the wrong one for three that need
// their own marks and need to move when they change.
//
// Only the profit is coloured, and only by its own sign. A balance and a total
// withdrawn are amounts — colouring them by which metric they are would say
// "green means balance", which is the mistake the whole palette is built to
// avoid.
import { computed } from 'vue'
import IconBalance from '@/components/icons/IconBalance.vue'
import IconSecured from '@/components/icons/IconSecured.vue'
import IconProfit from '@/components/icons/IconProfit.vue'
import { useCountUp } from '@/composables/useCountUp'
import { fmt2, signOf, signed2 } from '@/utils/tradeMath'

const props = defineProps<{
  balance: number
  secured: number
  totalProfit: number
  /** What the figures are scoped to — "September 2026". */
  period: string
}>()

// Each figure rolls to its new value. The sign colour follows the TARGET rather
// than the rolling number, so a profit crossing zero does not flicker red on
// its way up.
const balance = useCountUp(() => props.balance)
const secured = useCountUp(() => props.secured)
const profit = useCountUp(() => props.totalProfit)
const profitSign = computed(() => signOf(props.totalProfit))
</script>

<template>
  <dl class="acct">
    <div class="acct__cell">
      <dt class="acct__label">
        <IconBalance :size="16" />
        <span>Balance</span>
      </dt>
      <dd class="acct__value ui-tabular">{{ fmt2(balance) }}</dd>
      <dd class="acct__note">{{ period }}</dd>
    </div>

    <div class="acct__cell">
      <dt class="acct__label">
        <IconSecured :size="16" />
        <span>Secured</span>
      </dt>
      <dd class="acct__value ui-tabular">{{ fmt2(secured) }}</dd>
      <dd class="acct__note">taken off the table</dd>
    </div>

    <div class="acct__cell">
      <dt class="acct__label">
        <IconProfit :size="16" />
        <span>Total profit</span>
      </dt>
      <dd class="acct__value ui-tabular" :class="`is-${profitSign}`">{{ signed2(profit) }}</dd>
      <dd class="acct__note">trades only</dd>
    </div>
  </dl>
</template>

<style scoped>
/* The raised layer: its own background, border and shadow, none of them shared
   with the overlay recipe the tooltip and the sticky header use. */
.acct {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--sp-3);
  margin: 0;
  min-width: 0;
  padding: var(--sp-4);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  box-shadow: var(--layer-raised-shadow);
}
.acct__cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.acct__label {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
  /* Secondary, not muted: the label is the half of the pair that says what the
     number means, so it clears the contrast floor. */
  color: var(--text-secondary, var(--theme-dim));
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.acct__value {
  margin: 0;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xl);
  line-height: var(--lh-xl);
  font-weight: var(--weight-semibold);
  color: var(--text-primary, var(--theme-text));
  /* Tabular for the same reason the roll exists: without it every frame of the
     count is a different width and the row jitters while it settles. */
  font-variant-numeric: tabular-nums;
}
.acct__value.is-pos {
  color: var(--theme-success);
}
.acct__value.is-neg {
  color: var(--theme-danger);
}
.acct__note {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-muted, var(--theme-dim));
}
</style>
