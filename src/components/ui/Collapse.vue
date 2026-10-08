<script setup lang="ts">
// A disclosure body that mounts only while open and grows out of its header
// instead of appearing: <Collapse :open="open">…</Collapse>. The motion is
// CollapseTransition's; this is the shorthand for when there is no existing
// body element to wrap — typically a `<template v-if>` of several siblings.
//
// `group` lays those siblings out the way their parent did: a column, with the
// parent's own gap (inherited), so turning a template into a Collapse does not
// squash the spacing between them.
import CollapseTransition from '@/components/ui/CollapseTransition.vue'

withDefaults(defineProps<{ open: boolean; tag?: string; group?: boolean }>(), {
  tag: 'div',
  group: false,
})
</script>

<template>
  <CollapseTransition>
    <component :is="tag" v-if="open" class="ui-collapse" :class="{ 'ui-collapse--group': group }">
      <slot />
    </component>
  </CollapseTransition>
</template>

<style scoped>
.ui-collapse--group {
  display: flex;
  flex-direction: column;
  gap: inherit;
}
</style>
