<script setup lang="ts">
// A message that belongs where it is shown: an error under the table it is
// about, a result inside the dialog that produced it, with its own buttons.
// The library's Alert sends its text to the app's warnings tray instead, which
// suits app-wide warnings but drops the context and any action.
import Icon from '@/components/ui/Icon.vue'

withDefaults(defineProps<{ tone?: 'danger' | 'warning' | 'success' | 'info'; title?: string }>(), {
  tone: 'info',
  title: '',
})
const ICON = {
  danger: 'triangle-alert',
  warning: 'triangle-alert',
  success: 'circle-check',
  info: 'info',
} as const
</script>

<template>
  <div class="sn" :class="`is-${tone}`" :role="tone === 'danger' ? 'alert' : 'status'">
    <Icon :name="ICON[tone]" size="sm" class="sn__icon" />
    <div class="sn__body">
      <strong v-if="title" class="sn__title">{{ title }}</strong>
      <span class="sn__text"><slot /></span>
      <span v-if="$slots.action" class="sn__action"><slot name="action" /></span>
    </div>
  </div>
</template>

<style scoped>
.sn {
  --sn: var(--theme-accent);
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid color-mix(in oklch, var(--sn) 40%, var(--theme-border));
  border-radius: var(--radius-md);
  background: color-mix(in oklch, var(--sn) 9%, var(--theme-card));
  color: var(--theme-text);
  min-width: 0;
}
.sn.is-danger {
  --sn: var(--theme-danger);
}
.sn.is-warning {
  --sn: var(--theme-warning);
}
.sn.is-success {
  --sn: var(--theme-success);
}
.sn__icon {
  margin-top: 2px;
  color: var(--sn);
}
.sn__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.sn__title {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}
.sn__text {
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--theme-text);
}
.sn__action {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-top: var(--sp-1);
}
</style>
