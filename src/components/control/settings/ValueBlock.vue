<script setup lang="ts">
// One setting's value as a code block: exactly what the server holds, so what it is
// "taking" can be read and copied. JSON settings are pretty-printed; a secret that
// has not been revealed shows its mask, muted, and nothing is copyable.
import { computed, ref } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import { pretty } from '@/control/settingsDiagnostics'

const props = withDefaults(
  defineProps<{
    /** The full value; null when unset or (for a secret) not revealed. */
    value: string | null | undefined
    /** Shown instead when there is no full value: a secret's mask. */
    masked?: string | null
    kind?: string
    /** What an empty layer says. */
    empty?: string
    /** Visible caption above the block. */
    label?: string
    tone?: 'neutral' | 'warning' | 'danger'
  }>(),
  { masked: null, kind: 'str', empty: 'Not set', label: '', tone: 'neutral' },
)

const shown = computed(() => (props.value == null ? null : pretty(props.value, props.kind)))
const copied = ref(false)
async function copy() {
  if (shown.value == null) return
  try {
    await navigator.clipboard?.writeText(props.value ?? '')
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* no clipboard: the value is on screen to select */
  }
}
</script>

<template>
  <figure class="vb" :class="`is-${tone}`">
    <figcaption v-if="label" class="vb__label">{{ label }}</figcaption>
    <div class="vb__box">
      <pre
        v-if="shown !== null"
        class="vb__code"
        data-testid="value-code"
      ><code>{{ shown }}</code></pre>
      <pre
        v-else-if="masked"
        class="vb__code is-masked"
        data-testid="value-mask"
      ><code>{{ masked }}</code></pre>
      <p v-else class="vb__empty" data-testid="value-empty">{{ empty }}</p>
      <button
        v-if="shown !== null && shown !== ''"
        type="button"
        class="vb__copy"
        :aria-label="copied ? 'Copied' : label ? `Copy ${label} value` : 'Copy value'"
        :title="copied ? 'Copied' : 'Copy'"
        @click="copy"
      >
        <Icon :name="copied ? 'check' : 'copy'" size="xs" />
      </button>
    </div>
  </figure>
</template>

<style scoped>
.vb {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  margin: 0;
}
.vb__label {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.vb__box {
  position: relative;
  min-width: 0;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: color-mix(in oklch, var(--text-primary) 4%, transparent);
}
.vb.is-warning .vb__box {
  border-color: var(--theme-warning, var(--glass-border));
}
.vb.is-danger .vb__box {
  border-color: var(--theme-danger);
}
.vb__code {
  min-width: 0;
  max-height: 16rem;
  margin: 0;
  padding: var(--sp-2) var(--sp-6) var(--sp-2) var(--sp-3);
  overflow: auto;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-primary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.vb__code.is-masked {
  color: var(--text-secondary);
}
.vb__empty {
  min-width: 0;
  margin: 0;
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.vb__copy {
  position: absolute;
  top: var(--sp-1);
  right: var(--sp-1);
  display: inline-flex;
  padding: var(--sp-1);
  border: 0;
  border-radius: var(--radius-sm, 6px);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.vb__copy:hover,
.vb__copy:focus-visible {
  outline: none;
  color: var(--text-primary);
  background: color-mix(in oklch, var(--theme-accent) 12%, transparent);
}
</style>
