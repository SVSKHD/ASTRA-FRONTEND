<script setup lang="ts">
// A transient message with an optional action. role="status" rather than
// "alert": a toast is an announcement, not an interruption.
//
// The Todo v2 sheet's undo toast: a centred pill on an overlay surface, the
// message at 13px and the action as a tinted accent button. The host owns the
// entrance (a 400ms spring from 16px below) and the five-second hide.
import Button from '@/components/ui/Button.vue'

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
    <Button v-if="actionLabel" variant="tinted" size="sm" @click="$emit('action')">
      {{ actionLabel }}
    </Button>
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
  padding: var(--sp-2) var(--sp-3) var(--sp-2) var(--sp-5);
  border-radius: var(--radius-pill);
  border: 1px solid var(--layer-overlay-border, var(--glass-border));
  background: var(--surface-overlay, var(--glass-solid));
  box-shadow: var(--layer-overlay-shadow, var(--elev-1));
  color: var(--theme-text);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
}
.ui-toast__text {
  min-width: 0;
}
.ui-toast--danger {
  border-color: var(--theme-danger, var(--theme-text));
}
.ui-toast__x {
  border: none;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  font-size: var(--text-md);
  line-height: 1;
  padding: 0 2px;
}
.ui-toast__x:hover {
  color: var(--theme-text);
}
</style>
