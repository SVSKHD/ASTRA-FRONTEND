<script setup lang="ts">
// The progress stack of one host deploy (Aureon docs/33-deploy-progress.md), shown next to
// the Deploys and CI timeline (CcActionsMonitor) or in its drawer on narrow screens.
// Presentational: the monitor owns the polling. Every state shown is the server's: a stage
// is pending until the deploy script reported it, and "Deployed" only appears once Aureon
// recorded the deploy as finished with a passed health check.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import LogViewer from './LogViewer.vue'
import { short } from '@/control/api'
import { duration } from '@/control/monitor'
import {
  OUTCOME,
  STAGE_TONE,
  STAGE_WORD,
  commitLine,
  percent,
  type Progress,
} from '@/control/deployProgress'
import { ago } from '@/trading/format'

const props = defineProps<{
  progress: Progress | null
  log: string
  logTruncated?: boolean
  error?: string
  loading?: boolean
}>()

const p = computed(() => props.progress)
const pct = computed(() => (p.value ? percent(p.value) : null))
const outcome = computed(() => (p.value ? OUTCOME[p.value.outcome] : null))
const prUrl = computed(() =>
  p.value?.repo && p.value.pr_number
    ? `https://github.com/${p.value.repo}/pull/${p.value.pr_number}`
    : null,
)
</script>

<template>
  <section class="dp" aria-label="Deploy progress" data-testid="deploy-progress">
    <p v-if="!p && loading" class="tp-note">Loading the deploy…</p>
    <p v-else-if="!p && error" class="tp-note" role="status" data-testid="deploy-error">
      {{ error }}
    </p>
    <p v-else-if="!p" class="tp-note">
      Select a deploy to see its stages. A running deploy is selected automatically.
    </p>
    <template v-else>
      <header class="dp__head">
        <div class="dp__title">
          <span class="tp-strong">{{ p.target ?? 'deploy' }} · {{ p.environment }}</span>
          <Badge :tone="outcome!.tone" :label="outcome!.label" data-testid="deploy-outcome" />
        </div>
        <span class="tp-note dp__meta"
          >{{ p.repo ?? '—' }} · {{ p.branch ?? '—' }} · started {{ ago(p.started_at) }}
          <template v-if="prUrl">
            ·
            <a :href="prUrl" target="_blank" rel="noopener noreferrer">PR #{{ p.pr_number }}</a>
          </template>
        </span>
        <span class="tp-note dp__meta" data-testid="deploy-commit">{{ commitLine(p, short) }}</span>
      </header>

      <p v-if="p.stale" class="tp-note dp__flag" role="status" data-testid="deploy-stale">
        The server has not reported progress since {{ ago(p.updated_at ?? p.started_at) }}. What is
        shown may be out of date; the deploy is not assumed to have finished.
      </p>
      <p
        v-if="p.failure_reason && p.outcome !== 'running'"
        class="tp-note dp__flag dp__err"
        role="alert"
        data-testid="deploy-failure"
      >
        {{ p.failure_reason }}
      </p>
      <div class="dp__bar">
        <ProgressBar
          :value="p.stages_completed"
          :max="p.stages_total || 1"
          size="sm"
          :label="`${p.stages_completed} of ${p.stages_total} stages done`"
        />
        <span class="tp-note" data-testid="deploy-percent"
          >{{ p.stages_completed }} / {{ p.stages_total }} stages{{
            pct !== null ? ` · ${pct}%` : ''
          }}</span
        >
      </div>

      <ol class="dp__stages" aria-label="Stages">
        <li
          v-for="s in p.stages"
          :key="s.name"
          class="dp__stage"
          :class="`is-${s.status}`"
          :data-stage="s.name"
          :data-status="s.status"
          :aria-current="s.status === 'running' ? 'step' : undefined"
        >
          <span class="dp__dot" aria-hidden="true"></span>
          <div class="dp__body">
            <span class="dp__row">
              <span class="tp-strong">{{ s.label }}</span>
              <Badge :tone="STAGE_TONE[s.status]" :label="STAGE_WORD[s.status]" />
            </span>
            <span v-if="s.duration_ms != null" class="tp-note">{{ duration(s.duration_ms) }}</span>
            <span v-if="s.error" class="tp-note dp__err">{{ s.error }}</span>
          </div>
        </li>
      </ol>

      <div class="dp__log">
        <span class="tp-strong">Log</span>
        <p v-if="logTruncated" class="tp-note">Earlier lines are left out on the server.</p>
        <LogViewer :text="log" label="Deploy log" :max="600" />
      </div>
    </template>
  </section>
</template>

<style scoped>
.dp {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.dp__head,
.dp__title,
.dp__body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.dp__title {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}
.dp__meta,
.dp__err {
  min-width: 0;
  overflow-wrap: anywhere;
}
.dp__bar {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.dp__stages {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.dp__stage {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  gap: var(--sp-2);
  align-items: start;
  min-width: 0;
}
.dp__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
/* The dot carries the state's colour; its meaning is also in the badge's word. */
.dp__dot {
  width: 10px;
  height: 10px;
  margin-top: 5px;
  border-radius: 50%;
  border: 2px solid var(--glass-border);
  background: transparent;
}
.is-succeeded .dp__dot {
  background: var(--theme-success);
  border-color: var(--theme-success);
}
.is-running .dp__dot {
  border-color: var(--theme-accent);
  background: var(--theme-accent);
}
.is-failed .dp__dot {
  background: var(--theme-danger);
  border-color: var(--theme-danger);
}
/* A bar on the edge carries the flag; the sentence says what it means. */
.dp__flag {
  min-width: 0;
  padding-left: var(--sp-2);
  border-left: 3px solid var(--theme-warning);
}
.dp__flag.dp__err {
  border-left-color: var(--theme-danger);
}
.dp__log {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
</style>
