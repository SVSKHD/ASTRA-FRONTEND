<script setup lang="ts">
// A message that stays on the page (section 25c).
//
// The distinction from Toast is the whole reason this exists. A toast is for
// something that happened and is over — "Copied". An alert is for something
// that is still true, and a server rejection is still true: it explains why the
// form in front of you did not save. Putting that in a toast means it fades
// while the reader is still looking at the form trying to work out what to fix.
//
// So it sits above the actions, in the flow, and does not go away on its own.
import Icon from '@/components/ui/Icon.vue'

withDefaults(
  defineProps<{
    tone?: 'danger' | 'warning' | 'success' | 'info'
    title?: string
    /** Renders a dismiss button. Off by default — most alerts are not noise. */
    dismissible?: boolean
  }>(),
  { tone: 'info' },
)
defineEmits<{ dismiss: [] }>()

const GLYPH = { danger: 'x', warning: 'bell', success: 'check', info: 'help' } as const
</script>

<template>
  <div class="ui-alert" :class="`ui-alert--${tone}`" :role="tone === 'danger' ? 'alert' : 'status'">
    <Icon :name="GLYPH[tone]" size="sm" class="ui-alert__glyph" />
    <div class="ui-alert__body">
      <p v-if="title" class="ui-alert__title">{{ title }}</p>
      <p class="ui-alert__text"><slot /></p>
    </div>
    <button
      v-if="dismissible"
      type="button"
      class="ui-alert__x"
      aria-label="Dismiss"
      @click="$emit('dismiss')"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
/* A tinted surface, so it names both halves of its pair (section 24b): the tone
   carries the bar and the glyph, the text stays at --text-primary. Tone as the
   text colour is how an info alert measured 2.4:1 on the pale themes. */
.ui-alert {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border-radius: var(--radius-card);
  border: 1px solid var(--alert-tone);
  border-left-width: 3px;
  background: color-mix(in oklch, var(--alert-tone) 12%, var(--bg-base, transparent));
  color: var(--text-primary, var(--theme-text));
}
.ui-alert--danger {
  --alert-tone: var(--theme-danger);
}
.ui-alert--warning {
  --alert-tone: var(--theme-warning);
}
.ui-alert--success {
  --alert-tone: var(--theme-success);
}
.ui-alert--info {
  --alert-tone: var(--theme-accent);
}
.ui-alert__glyph {
  color: var(--alert-tone);
}
.ui-alert__body {
  min-width: 0;
}
.ui-alert__title {
  margin: 0;
  font-size: var(--text-base);
  line-height: var(--lh-base);
  font-weight: var(--weight-semibold);
}
.ui-alert__text {
  margin: 0;
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  overflow-wrap: anywhere;
}
.ui-alert__x {
  border: none;
  background: transparent;
  color: var(--text-muted, var(--theme-dim));
  font: inherit;
  cursor: pointer;
}
.ui-alert__x:hover {
  color: var(--text-primary, var(--theme-text));
}
</style>
