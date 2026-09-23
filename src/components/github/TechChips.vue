<script setup lang="ts">
// What a repository is built with, as a row of chips.
//
// One component so the Code tab's browse list and the GitHub tab's repo list
// cannot drift into two different ways of saying "TypeScript". The symbol and
// the colour come from `utils/techBadge` — a monogram in the language's own
// colour rather than a brand logo, for the reasons written there.
import type { TechBadge } from '@/utils/techBadge'

withDefaults(defineProps<{ items: TechBadge[]; compact?: boolean }>(), { compact: false })
</script>

<template>
  <span v-if="items.length" class="tc" :class="{ 'is-compact': compact }">
    <span
      v-for="t in items"
      :key="t.name"
      class="tc__chip"
      :style="{ '--tech': t.color }"
      :title="t.name"
    >
      <span class="tc__sym" aria-hidden="true">{{ t.symbol }}</span>
      <span class="tc__lang">{{ t.name }}</span>
    </span>
  </span>
</template>

<style scoped>
.tc {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--sp-1);
}
/* The app's own chip shape in the language's colour — a tinted fill and a
   matching edge — so a row of them reads as one list rather than as borrowed
   brand marks. */
.tc__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px 1px 2px;
  border: 1px solid color-mix(in oklch, var(--tech) 45%, transparent);
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--tech) 14%, transparent);
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  color: var(--text-secondary, var(--theme-dim));
  white-space: nowrap;
}
.tc__sym {
  display: grid;
  place-items: center;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: 50%;
  background: var(--tech);
  /* Derived from the language's colour, which is as likely to be GitHub's pale
     JavaScript yellow as its dark C# green, so a fixed ink would fail on one. */
  color: color-mix(in oklch, var(--tech) 18%, #000 82%);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  line-height: 1;
  letter-spacing: -0.02em;
}
/* Compact, and below the widest layouts: the symbol carries it alone and the
   `title` still says which language it is. */
.tc.is-compact .tc__lang {
  display: none;
}
@media (max-width: 900px) {
  .tc__lang {
    display: none;
  }
}
</style>
