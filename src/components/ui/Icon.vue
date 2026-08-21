<script setup lang="ts">
// Every icon in the app (section 21e).
//
// The rules it enforces by being the only way in: one set, one stroke weight,
// one of five sizes, and a square box that does not shrink. A flex row that
// squashes its icon into an oval is the failure this exists to prevent, and it
// is why the box is set here rather than left to the call site.
//
// Colour comes from `currentColor`, so an icon is coloured by the text around
// it — there is no colour prop, because "the icon is a different colour from
// its label" is a decision nobody should be making per call site.
import { computed } from 'vue'
import { ICON_SIZES, ICON_VIEWBOX, type IconName, type IconSize } from '@/components/ui/icons'

const props = withDefaults(
  defineProps<{
    name: IconName
    size?: IconSize
    // An icon that carries meaning of its own needs a name. Left empty, the
    // icon is decorative and is hidden from assistive tech — which is right
    // whenever the label beside it already says what it is.
    label?: string
  }>(),
  { size: 'sm', label: '' },
)

const px = computed(() => ICON_SIZES[props.size])
</script>

<template>
  <svg
    class="ui-icon"
    :width="px"
    :height="px"
    :viewBox="ICON_VIEWBOX"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
    focusable="false"
  >
    <use :href="`#i-${name}`" />
  </svg>
</template>

<style scoped>
/* A fixed square that a flex or grid parent cannot squash. Sized by the
   attributes above, never by CSS at the call site and never by font-size. */
.ui-icon {
  display: block;
  flex-shrink: 0;
}
</style>
