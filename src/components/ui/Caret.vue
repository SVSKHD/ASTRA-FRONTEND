<script setup lang="ts">
// The disclosure arrow, once.
//
// Before this there were four of them. Three components drew a 14px
// `chevron-right` in `--theme-dim` inside boxes of 16px and 18px and rotated it
// by hand; the library's own Accordion, the note table of contents and the
// goals empty state each typed a literal `▸`/`▾` — characters whose size and
// weight are whatever the reader's font decides, which is why they came out
// smaller and fainter than the icon set beside them and why the same control
// looked like three different controls on three tabs.
//
// So: one arrow, one size, one rotation, one rule about colour. It points right
// when closed and down when open — the direction is derived from `open` and
// cannot be set independently, because "the arrow disagrees with the panel" is
// the only way a disclosure arrow can be WRONG rather than merely ugly.
//
// Colour is `currentColor` through the icon, brightened on open, so the arrow
// belongs to the header it sits in rather than to a hard-coded grey. The 22px
// box is bigger than the 16px glyph on purpose: an arrow that touches the label
// beside it reads as part of the word.
import Icon from '@/components/ui/Icon.vue'

// Medium by default: one size for every disclosure in the app, so a list row's
// arrow and a detail section's arrow line up and read as the same control.
// `sm`/`xs` remain for the rare dense header that genuinely needs them.
withDefaults(defineProps<{ open?: boolean; size?: 'xs' | 'sm' | 'md' }>(), {
  open: false,
  size: 'md',
})
</script>

<template>
  <span class="ui-caret" :class="[{ 'is-open': open }, `ui-caret--${size}`]" aria-hidden="true">
    <Icon name="chevron-right" :size="size" />
  </span>
</template>

<style scoped>
.ui-caret {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-control);
  color: var(--theme-dim);
  /* A spring on the turn, so opening reads as a flick rather than a slide. */
  transition:
    transform 360ms var(--spring),
    color var(--dur-fast) ease,
    background var(--dur-fast) ease;
}
.ui-caret--sm,
.ui-caret--xs {
  width: 22px;
  height: 22px;
}
/* Open, the arrow takes the accent and a faint accent disc: the open section
   is findable in a column of closed ones at a glance. */
.ui-caret.is-open {
  transform: rotate(90deg);
  color: var(--theme-accent);
  background: color-mix(in oklch, var(--theme-accent) 12%, transparent);
}
/* The header is the hit target, so the hover cue is inherited from it rather
   than owned here — the arrow lights up with the row it belongs to, and a
   closed arrow leans a few degrees toward opening, hinting what a click does. */
:where(button, [role='button']):hover > .ui-caret,
:where(button, [role='button']):focus-visible > .ui-caret {
  color: var(--theme-text);
  background: var(--theme-card);
}
:where(button, [role='button']):hover > .ui-caret:not(.is-open) {
  transform: rotate(18deg);
}
:where(button, [role='button']):hover > .ui-caret.is-open {
  color: var(--theme-accent);
  background: color-mix(in oklch, var(--theme-accent) 18%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  .ui-caret {
    transition: none;
  }
}
</style>
