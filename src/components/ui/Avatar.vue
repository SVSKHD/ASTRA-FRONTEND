<script setup lang="ts">
// An avatar that degrades to an initial. The initial is derived here so every
// caller gets the same one rather than each slicing the name differently.
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ name: string; src?: string; size?: 'sm' | 'md' | 'lg'; color?: string }>(),
  { size: 'md' },
)
const initial = computed(() => (props.name || '?').trim().charAt(0).toUpperCase())
</script>

<template>
  <span
    class="ui-avatar"
    :class="`ui-avatar--${size}`"
    :style="color ? { '--avatar-color': color } : undefined"
    :title="name"
  >
    <img v-if="src" :src="src" :alt="name" class="ui-avatar__img" width="40" height="40" />
    <span v-else aria-hidden="true">{{ initial }}</span>
    <span v-if="!src" class="ui-sr-only">{{ name }}</span>
  </span>
</template>

<style scoped>
.ui-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  font-weight: 700;
  color: var(--theme-on-accent);
  background: var(--avatar-color, var(--theme-accent));
}
.ui-avatar--sm {
  width: 22px;
  height: 22px;
  font-size: var(--text-xs);
}
.ui-avatar--md {
  width: 32px;
  height: 32px;
  font-size: var(--text-sm);
}
.ui-avatar--lg {
  width: 44px;
  height: 44px;
  font-size: var(--text-lg);
}
.ui-avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
