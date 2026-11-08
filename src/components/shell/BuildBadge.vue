<script setup lang="ts">
// The version beside the brand, and what it now also answers: which build this
// tab is running, which one the server has, and — when they differ — a reload
// to pick the new one up (services/buildStatus).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ago,
  buildStatus,
  checkServerBuild,
  reloadToLatest,
  runningBuild,
  startBuildStatusPolling,
  updateAvailable,
} from '@/services/buildStatus'

const version = 'v' + __APP_VERSION__
const open = ref(false)
const root = ref<HTMLElement | null>(null)
// Re-renders the "x ago" labels while the popover is open.
const now = ref(Date.now())
let tick = 0

const short = (c: string) => (c && c !== 'unknown' ? c.slice(0, 7) : '—')
const serverLine = computed(() => buildStatus.server)

function toggle() {
  open.value = !open.value
  now.value = Date.now()
  if (open.value) void checkServerBuild()
}
function onDocPointer(e: PointerEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

onMounted(() => {
  startBuildStatusPolling()
  document.addEventListener('pointerdown', onDocPointer)
  document.addEventListener('keydown', onKey)
  tick = window.setInterval(() => {
    if (open.value) now.value = Date.now()
  }, 30_000)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer)
  document.removeEventListener('keydown', onKey)
  window.clearInterval(tick)
})
</script>

<template>
  <span ref="root" class="bb">
    <button
      type="button"
      class="bb__chip"
      :class="{ 'is-stale': updateAvailable }"
      :aria-expanded="open"
      aria-haspopup="dialog"
      :title="updateAvailable ? 'A newer build is on the server' : 'Build status'"
      @click="toggle"
    >
      <span class="shell-strip__version">{{ version }}</span>
      <span v-if="updateAvailable" class="bb__dot" aria-label="Update available"></span>
    </button>

    <div v-if="open" class="bb__pop" role="dialog" aria-label="Build status">
      <div class="bb__head">
        <span class="bb__title">Build status</span>
        <span v-if="updateAvailable" class="bb__tag is-stale">Update available</span>
        <span v-else-if="buildStatus.server" class="bb__tag is-ok">Up to date</span>
      </div>

      <dl class="bb__rows">
        <dt>Running</dt>
        <dd>
          <code>{{ short(runningBuild.commit) }}</code>
          <span v-if="runningBuild.branch" class="bb__dim">{{ runningBuild.branch }}</span>
          <span class="bb__dim">· built {{ ago(runningBuild.builtAt, now) }}</span>
        </dd>

        <dt>Server</dt>
        <dd v-if="serverLine">
          <code>{{ short(serverLine.commit) }}</code>
          <span v-if="serverLine.branch" class="bb__dim">{{ serverLine.branch }}</span>
          <span class="bb__dim">· built {{ ago(serverLine.builtAt, now) }}</span>
        </dd>
        <dd v-else class="bb__dim">{{ buildStatus.error || 'Checking…' }}</dd>
      </dl>

      <div class="bb__foot">
        <span class="bb__dim">
          {{
            buildStatus.checking
              ? 'Checking…'
              : buildStatus.checkedAt
                ? 'Checked ' + ago(buildStatus.checkedAt, now)
                : ''
          }}
        </span>
        <button
          v-if="updateAvailable"
          type="button"
          class="bb__btn is-primary"
          @click="reloadToLatest"
        >
          Reload to update
        </button>
        <button
          v-else
          type="button"
          class="bb__btn"
          :disabled="buildStatus.checking"
          @click="checkServerBuild"
        >
          Check now
        </button>
      </div>
    </div>
  </span>
</template>

<style scoped>
.bb {
  position: relative;
  display: inline-flex;
}
.bb__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 7px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-dim);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: pointer;
}
.bb__chip:hover,
.bb__chip[aria-expanded='true'] {
  color: var(--theme-text);
}
.bb__chip.is-stale {
  border-color: color-mix(in srgb, var(--theme-warning, var(--accent)) 60%, transparent);
}
.bb__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--theme-warning, var(--accent));
}
.bb__pop {
  position: absolute;
  top: calc(100% + var(--sp-2));
  left: 0;
  z-index: 200;
  width: 300px;
  max-width: calc(100vw - 2 * var(--sp-4));
  padding: var(--sp-3);
  border-radius: var(--radius-md, 12px);
  border: 1px solid var(--layer-overlay-border, var(--glass-border));
  background: var(--surface-overlay, var(--glass-solid));
  box-shadow: var(--layer-overlay-shadow, var(--elev-1));
  color: var(--theme-text);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
}
.bb__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
}
.bb__title {
  font-weight: var(--weight-semibold);
}
.bb__tag {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  font-size: var(--text-2xs);
}
.bb__tag.is-ok {
  color: var(--theme-success);
  background: color-mix(in srgb, var(--theme-success) 14%, transparent);
}
.bb__tag.is-stale {
  color: var(--theme-warning, var(--accent));
  background: color-mix(in srgb, var(--theme-warning, var(--accent)) 14%, transparent);
}
.bb__rows {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--sp-1) var(--sp-3);
  margin: 0;
}
.bb__rows dt {
  color: var(--theme-dim);
}
.bb__rows dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0 6px;
  min-width: 0;
}
.bb__rows code {
  font-family: var(--font-mono);
}
.bb__dim {
  color: var(--theme-dim);
  font-size: var(--text-xs);
}
.bb__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  margin-top: var(--sp-3);
}
.bb__btn {
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-xs);
  cursor: pointer;
}
.bb__btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.bb__btn.is-primary {
  border-color: transparent;
  background: var(--accent, var(--theme-accent));
  color: var(--theme-bg, #fff);
}
</style>
