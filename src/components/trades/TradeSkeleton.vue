<script setup lang="ts">
// The loading state (section 28b).
//
// Built from the real layout's own dimensions rather than from a stack of grey
// bars: the account block is the same three-column grid at the same padding,
// the calendar is a six-by-seven grid of the same cells, and the table rows are
// the same height as the rows they become. That is the whole point — a skeleton
// whose shape differs from the content is a layout shift with a shimmer on it.
import Skeleton from '@/components/ui/Skeleton.vue'

// Six weeks and seven days: the largest month the grid ever draws, so the
// calendar never grows a row when the real one arrives.
const CELLS = 42
const ROWS = 6

/**
 * Which piece of the tab is being waited for.
 *
 * The Trades tab no longer loads as one block: the session clock is live from
 * the first frame and sits in the same row as the account, so the placeholder
 * has to be able to stand in for a PART of a layout rather than all of it. The
 * shapes stay in this one file for the reason the file exists — a skeleton
 * whose dimensions differ from the content is a layout shift with a shimmer on
 * it, and that stays true when it is a third of a screen.
 *
 * `all` is what the Expenses tab still uses, unchanged.
 */
withDefaults(defineProps<{ part?: 'all' | 'targets' | 'account' | 'main' }>(), { part: 'all' })
</script>

<template>
  <div class="tskel" aria-busy="true" aria-live="polite">
    <span class="ui-sr-only">Loading this month's trades.</span>

    <!-- The targets card: a header and two rows, each a label, a bar and a
         note — the same three lines TradeTargets draws. -->
    <div v-if="part === 'targets'" class="tskel__targets">
      <Skeleton width="64px" height="10px" />
      <div v-for="n in 2" :key="n" class="tskel__target">
        <Skeleton width="108px" height="10px" />
        <Skeleton height="6px" radius="var(--radius-pill)" />
        <Skeleton width="140px" height="10px" />
      </div>
    </div>

    <div v-if="part === 'all' || part === 'account'" class="tskel__acct">
      <div v-for="n in 3" :key="n" class="tskel__acctCell">
        <Skeleton width="72px" height="10px" />
        <Skeleton width="120px" height="26px" />
        <Skeleton width="88px" height="10px" />
      </div>
    </div>

    <!-- The calendar and the table, side by side and at the real ratio: a
         narrow month grid and a wide table, not two equal halves. -->
    <div v-if="part === 'main'" class="tskel__main">
      <div class="tskel__cal">
        <Skeleton width="140px" height="14px" />
        <div class="tskel__grid">
          <span v-for="n in CELLS" :key="n" class="tskel__cell"></span>
        </div>
      </div>
      <div class="tskel__table">
        <div class="tskel__thead"></div>
        <div v-for="n in ROWS" :key="n" class="tskel__row">
          <Skeleton width="86px" height="12px" />
          <Skeleton width="70px" height="12px" />
          <Skeleton width="60px" height="12px" />
          <Skeleton width="48px" height="12px" />
          <Skeleton width="64px" height="12px" />
        </div>
      </div>
    </div>

    <div v-if="part === 'all'" class="tskel__split">
      <div class="tskel__cal">
        <Skeleton width="140px" height="14px" />
        <div class="tskel__grid">
          <span v-for="n in CELLS" :key="n" class="tskel__cell"></span>
        </div>
      </div>
      <div class="tskel__form">
        <div v-for="n in 8" :key="n" class="tskel__field">
          <Skeleton width="54px" height="10px" />
          <Skeleton height="34px" radius="var(--radius-control)" />
        </div>
      </div>
    </div>

    <div v-if="part === 'all'" class="tskel__table">
      <div class="tskel__thead"></div>
      <div v-for="n in ROWS" :key="n" class="tskel__row">
        <Skeleton width="86px" height="12px" />
        <Skeleton width="70px" height="12px" />
        <Skeleton width="60px" height="12px" />
        <Skeleton width="48px" height="12px" />
        <Skeleton width="64px" height="12px" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tskel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
}

/* Same grid, same padding, same border as AccountBlock. */
.tskel__acct {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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
.tskel__acctCell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

/* Same padding, border and rhythm as TradeTargets. */
.tskel__targets {
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
.tskel__target {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.tskel__target + .tskel__target {
  padding-top: var(--sp-3);
  border-top: 1px solid var(--layer-raised-border);
}

/* The calendar/table ratio, and the breakpoint where they stop sharing a row.
   Kept identical to `.tv__main` in TradesView — the skeleton is a promise about
   where things will be, and a promise at a different breakpoint is a shift. */
.tskel__main {
  display: grid;
  grid-template-columns: minmax(0, 340px) minmax(0, 1fr);
  align-items: start;
  gap: var(--sp-4);
  min-width: 0;
}
@media (max-width: 1180px) {
  .tskel__main {
    grid-template-columns: minmax(0, 1fr);
  }
}

.tskel__split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  align-items: start;
  gap: var(--sp-4);
  min-width: 0;
}
.tskel__cal {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-dialog);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
}
/* The picker's own cell metrics: seven columns, square cells, 32px floor. */
.tskel__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  min-width: 0;
}
.tskel__cell {
  aspect-ratio: 1;
  min-height: 32px;
  border-radius: var(--radius-control);
  background: color-mix(in oklch, var(--glass-border) 35%, transparent);
}
.tskel__form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
}
.tskel__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.tskel__table {
  min-width: 0;
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
  overflow: hidden;
}
/* The sticky header's own height, so nothing jumps when the table arrives. */
.tskel__thead {
  height: 33px;
  border-bottom: 1px solid var(--layer-raised-border);
  /* Opaque, and the one surface in the system that must be (section 43,
     item 3): rows scroll UNDER this, so a translucent header is a header
     with figures moving through it at exactly the moment it is read. */
  background: var(--glass-solid, var(--layer-overlay-bg));
}
.tskel__row {
  display: flex;
  align-items: center;
  gap: var(--sp-5);
  min-width: 0;
  /* var(--sp-2) top and bottom plus a 13px/1.5 line: the real row's height. */
  padding: var(--sp-2) var(--sp-3);
  height: 36px;
}
</style>
