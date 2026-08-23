<script setup lang="ts">
// A transient message with an optional action. role="status" rather than
// "alert": a toast is an announcement, not an interruption.
withDefaults(
  defineProps<{ message: string; actionLabel?: string; tone?: 'neutral' | 'danger' }>(),
  {
    tone: 'neutral',
  },
)
defineEmits<{ action: []; dismiss: [] }>()
</script>

<template>
  <div class="ui-toast" :class="`ui-toast--${tone}`" role="status" aria-live="polite">
    <span class="ui-toast__text">{{ message }}</span>
    <button v-if="actionLabel" class="ui-toast__action" type="button" @click="$emit('action')">
      {{ actionLabel }}
    </button>
    <button class="ui-toast__x" type="button" aria-label="Dismiss" @click="$emit('dismiss')">
      ×
    </button>
  </div>
</template>

<style scoped>
.ui-toast {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  box-shadow: var(--elev-1);
  color: var(--theme-text);
  font-size: var(--text-sm);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .ui-toast {
    background: var(--glass-solid);
  }
}
.ui-toast--danger {
  border-color: var(--theme-danger, var(--theme-text));
}
.ui-toast__action {
  border: none;
  background: transparent;
  color: var(--theme-accent);
  font-weight: var(--weight-semibold);
  font-size: var(--text-xs);
  cursor: pointer;
}
.ui-toast__x {
  border: none;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  line-height: 1;
}
</style>
