<script setup lang="ts">
// The card's placeholder (section 19d, acceptance 95).
//
// It matches GoalCard's box model exactly — same padding, same border, same
// header grid, same full-height column with the meta row pinned — so the swap
// to the real card moves nothing. A skeleton that is merely "about the right
// size" is worse than none: it guarantees a shift at the moment the reader has
// started reading.
</script>

<template>
  <div class="gskel" aria-hidden="true">
    <div class="gskel__head">
      <span class="gskel__grip"></span>
      <span class="gskel__ring"></span>
      <div class="gskel__titleblock"><span class="gskel__bar gskel__bar--title"></span></div>
      <span class="gskel__actions"></span>
    </div>
    <span class="gskel__bar"></span>
    <span class="gskel__bar gskel__bar--short"></span>
    <div class="gskel__meta">
      <span class="gskel__chip"></span>
      <span class="gskel__chip"></span>
    </div>
  </div>
</template>

<style scoped>
/* Mirrors .gcard. Any change there belongs here too, or the swap shifts. */
.gskel {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
}
.gskel__head {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: start;
  gap: var(--sp-2);
}
.gskel__grip {
  width: 9px;
  height: 21px;
}
.gskel__ring {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 3px solid color-mix(in oklch, var(--theme-dim) 22%, transparent);
}
.gskel__titleblock {
  min-width: 0;
  padding-top: 2px;
}
.gskel__actions {
  width: 44px;
  height: 24px;
}
.gskel__bar,
.gskel__chip {
  display: block;
  border-radius: var(--radius-sm);
  background: color-mix(in oklch, var(--theme-dim) 16%, transparent);
}
.gskel__bar {
  height: 10px;
}
.gskel__bar--title {
  height: 14px;
  width: 70%;
}
.gskel__bar--short {
  width: 55%;
}
.gskel__meta {
  margin-top: auto;
  display: flex;
  gap: var(--sp-2);
}
.gskel__chip {
  height: 16px;
  width: 64px;
  border-radius: var(--radius-pill);
}
@media (prefers-reduced-motion: no-preference) {
  .gskel__bar,
  .gskel__chip {
    animation: gskelPulse 1.4s ease-in-out infinite;
  }
}
@keyframes gskelPulse {
  50% {
    opacity: 0.5;
  }
}
</style>
