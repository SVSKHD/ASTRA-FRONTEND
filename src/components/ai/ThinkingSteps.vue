<script setup lang="ts">
// A reply's thinking steps (src/ai/steps.ts), folded into one line while it runs —
// "Thinking… 3.2 s", "Writing…", "Done in 4.1 s" — and opening to every step the server
// reported plus the model's own reasoning when it was asked to think.
//
// Open by itself while the model is reasoning (that is the moment worth watching), then
// folds away when the answer starts, unless it was opened by hand.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import { phaseText, type AiTrace } from '@/ai/steps'

const props = defineProps<{ trace: AiTrace }>()

const opened = ref<boolean | null>(null)
const open = computed(() => opened.value ?? props.trace.phase === 'thinking')
function toggle() {
  opened.value = !open.value
}

// A clock for the running timer, only while something runs.
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | undefined
const running = computed(() => ['sending', 'thinking', 'writing'].includes(props.trace.phase))
watch(
  running,
  (r) => {
    clearInterval(tick)
    tick = r ? setInterval(() => (now.value = Date.now()), 250) : undefined
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(tick))

const headline = computed(() => phaseText(props.trace, now.value))
const ICON = { running: 'refresh-cw', done: 'check', warn: 'alert-circle', error: 'x' } as const
</script>

<template>
  <div class="aits" :class="`is-${trace.phase}`" data-testid="thinking-steps">
    <button
      type="button"
      class="aits__head"
      :aria-expanded="open"
      data-testid="thinking-toggle"
      @click="toggle"
    >
      <span class="aits__pulse" :class="{ 'is-on': running }" aria-hidden="true" />
      <span class="aits__headline" aria-live="polite">{{ headline }}</span>
      <Icon name="chevron-down" size="xs" class="aits__caret" :class="{ 'is-open': open }" />
    </button>
    <div v-if="open" class="aits__body">
      <ol class="aits__steps">
        <li v-for="s in trace.steps" :key="s.key" class="aits__step" :class="`is-${s.state}`">
          <Icon
            :name="ICON[s.state]"
            size="xs"
            class="aits__icon"
            :class="{ 'is-spin': s.state === 'running' }"
          />
          <span class="aits__label">{{ s.label }}</span>
          <span v-if="s.detail" class="aits__detail">{{ s.detail }}</span>
        </li>
      </ol>
      <pre v-if="trace.thinking" class="aits__thinking" data-testid="thinking-text">{{
        trace.thinking
      }}</pre>
    </div>
  </div>
</template>

<style scoped>
.aits {
  min-width: 0;
  margin: 0 0 var(--sp-2);
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.aits__head {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  max-width: 100%;
  min-width: 0;
  padding: 4px var(--sp-2);
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-pill);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.aits__headline {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}
.aits__pulse {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--theme-success, var(--theme-accent));
}
.aits__pulse.is-on {
  background: var(--theme-accent);
  animation: aits-pulse 1.2s ease-in-out infinite;
}
.is-error .aits__pulse {
  background: var(--theme-danger);
}
.aits__caret {
  flex: none;
  transition: transform 0.15s ease;
}
.aits__caret.is-open {
  transform: rotate(180deg);
}
.aits__body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  margin-top: var(--sp-2);
  padding-left: var(--sp-3);
  border-left: 2px solid var(--theme-border);
}
.aits__steps {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.aits__step {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px var(--sp-2);
  min-width: 0;
}
.aits__icon {
  flex: none;
  align-self: center;
}
.aits__icon.is-spin {
  animation: aits-spin 1s linear infinite;
}
.aits__step.is-done .aits__icon {
  color: var(--theme-success, var(--theme-accent));
}
.aits__step.is-warn .aits__icon {
  color: var(--theme-warning, var(--theme-accent));
}
.aits__step.is-error .aits__icon {
  color: var(--theme-danger);
}
.aits__label {
  color: var(--text-primary, var(--theme-text));
}
.aits__detail {
  min-width: 0;
  overflow-wrap: anywhere;
}
.aits__thinking {
  max-height: 240px;
  min-width: 0;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: inherit;
  font-style: italic;
  line-height: 1.5;
}
@keyframes aits-pulse {
  50% {
    opacity: 0.35;
  }
}
@keyframes aits-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .aits__pulse.is-on,
  .aits__icon.is-spin {
    animation: none;
  }
}
</style>
