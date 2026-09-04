<script setup lang="ts">
// The three states of a save, in a box that never changes size (section 41).
//
// THE BOX IS RESERVED. It is the same square in all four states — empty while
// idle, a ring while working, a check when done, the alert when it failed — so
// a button carrying one does not grow by fourteen pixels the moment it is
// pressed and shrink again when it finishes. A control that resizes under the
// cursor is a control that gets mis-clicked, and it moves everything beside it
// twice per save.
//
// One treatment at a time, which is the other half of the rule: this element is
// never a skeleton and never shimmers. It is the save, and the save is a ring.
import { computed } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import { ICON_SIZES, type IconSize } from '@/components/ui/icons'
import type { SaveState } from '@/composables/useSaveState'

// The box takes an icon size rather than a number, so it is the same square as
// every other glyph beside it rather than a second scale nobody can predict.
const props = withDefaults(defineProps<{ state: SaveState; size?: IconSize }>(), { size: 'xs' })
const px = computed(() => ICON_SIZES[props.size])
</script>

<template>
  <span
    class="ui-save"
    :class="`is-${state}`"
    :style="{ width: `${px}px`, height: `${px}px` }"
    aria-hidden="true"
  >
    <span v-if="state === 'working'" class="ui-save__ring"></span>
    <Icon v-else-if="state === 'done'" name="check" :size="size" />
    <Icon v-else-if="state === 'failed'" name="alert-circle" :size="size" />
  </span>
</template>

<style scoped>
.ui-save {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  min-width: 0;
  /* The box is what is reserved; nothing inside it may exceed it. */
  line-height: 0;
}
.ui-save__ring {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid currentcolor;
  border-top-color: transparent;
  animation: uiSaveSpin 700ms linear infinite;
}
@keyframes uiSaveSpin {
  to {
    transform: rotate(360deg);
  }
}
/* Under reduced motion the ring stays — it is the only thing saying work is in
   flight — but it stops racing. The check and the alert never moved. */
@media (prefers-reduced-motion: reduce) {
  .ui-save__ring {
    animation-duration: 2.4s;
  }
}
</style>
