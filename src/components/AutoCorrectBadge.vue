<script setup lang="ts">
// The progress of the app-wide typo fixer (utils/autoCorrectFields), drawn just
// under the field it is working on: "Correcting…" while a check is out, then
// what it changed with an Undo, or a brief tick when there was nothing to fix.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { autoCorrectState as state, undoCorrection } from '@/utils/autoCorrectFields'

const pos = ref({ top: 0, left: 0, width: 0 })

function place() {
  const el = state.el
  if (!el || !el.isConnected) return
  const r = el.getBoundingClientRect()
  // Below the field, or above it when there is no room underneath.
  const below = r.bottom + 4
  const top = below + 28 > window.innerHeight ? Math.max(4, r.top - 28) : below
  pos.value = { top, left: r.left, width: r.width }
}

watch(() => [state.el, state.phase], place)
onMounted(() => {
  window.addEventListener('scroll', place, true)
  window.addEventListener('resize', place)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', place, true)
  window.removeEventListener('resize', place)
})

const MAX_SHOWN = 3
const shown = computed(() => state.changes.slice(0, MAX_SHOWN))
const more = computed(() => Math.max(0, state.changes.length - MAX_SHOWN))
const visible = computed(() => state.phase !== 'idle' && !!state.el)
</script>

<template>
  <div
    v-if="visible"
    class="acb"
    :class="`acb--${state.phase}`"
    data-autocorrect="off"
    role="status"
    aria-live="polite"
    :style="{ top: `${pos.top}px`, left: `${pos.left}px`, maxWidth: `${Math.max(pos.width, 220)}px` }"
    @mousedown.prevent
  >
    <template v-if="state.phase === 'checking'">
      <span class="acb__spin" aria-hidden="true"></span>
      <span>Correcting typos…</span>
    </template>
    <template v-else-if="state.phase === 'fixed'">
      <span class="acb__tick" aria-hidden="true">✓</span>
      <span class="acb__list">
        <template v-if="shown.length">
          <span v-for="(c, i) in shown" :key="i" class="acb__change">
            <s v-if="c.from">{{ c.from }}</s><span v-if="c.from && c.to"> → </span><b v-if="c.to">{{ c.to }}</b>
          </span>
          <span v-if="more">+{{ more }} more</span>
        </template>
        <span v-else>Corrected</span>
      </span>
      <button type="button" class="acb__undo" @click="undoCorrection">Undo</button>
    </template>
    <template v-else-if="state.phase === 'clean'">
      <span class="acb__tick" aria-hidden="true">✓</span>
      <span>No typos</span>
    </template>
  </div>
</template>

<style scoped>
.acb {
  position: fixed;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
  padding: 2px 8px;
  border: 1px solid color-mix(in oklch, var(--theme-accent) 45%, transparent);
  border-radius: var(--radius-sm, 6px);
  background: var(--theme-surface, #111);
  color: var(--theme-text);
  font-size: var(--text-2xs, 11px);
  line-height: 1.3;
  box-shadow: var(--shadow-soft, 0 4px 12px rgba(0, 0, 0, 0.35));
  pointer-events: auto;
  user-select: none;
}
.acb--clean {
  color: var(--theme-dim);
}
.acb__list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  min-width: 0;
}
.acb__change {
  min-width: 0;
  overflow-wrap: anywhere;
}
.acb__change s {
  color: var(--theme-dim);
}
.acb__change b {
  color: var(--theme-accent);
  font-weight: var(--weight-semibold, 600);
}
.acb__tick {
  color: var(--theme-accent);
}
.acb__undo {
  flex-shrink: 0;
  margin-left: auto;
  border: none;
  background: transparent;
  padding: 0 2px;
  color: var(--theme-accent);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.acb__spin {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid color-mix(in oklch, var(--theme-accent) 30%, transparent);
  border-top-color: var(--theme-accent);
  animation: acbSpin 700ms linear infinite;
}
@keyframes acbSpin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .acb__spin {
    animation: none;
  }
}
</style>
