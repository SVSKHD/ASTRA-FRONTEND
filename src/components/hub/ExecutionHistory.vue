<script setup lang="ts">
// Agent execution history and invocation status: each agent's state and its recent runs
// (running, succeeded, failed, with how long they took). Polled every 15 seconds while
// anything is running.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import Select from '@/components/ui/Select.vue'
import { aureon } from '@/api/client'
import { must, useLoad } from '@/trading/useLoad'
import { ago } from '@/trading/format'

const agents = useLoad(async () => must(await aureon.GET('/api/agents')).agents)
const agentId = ref('')
const agentOptions = computed(() =>
  (agents.data.value ?? []).map((a) => ({
    value: a.id,
    label: `${a.name} · ${a.state}${a.paused ? ' (paused)' : ''}`,
  })),
)
watch(
  () => agents.data.value,
  (list) => {
    if (list?.length && !list.some((a) => a.id === agentId.value)) agentId.value = list[0].id
  },
)
const runs = useLoad(
  async () =>
    must(
      await aureon.GET('/api/agents/{agent_id}/runs', {
        params: { path: { agent_id: agentId.value }, query: { limit: 20 } },
      }),
    ).items,
  false,
)
watch(agentId, (id) => {
  if (id) void runs.reload()
})
const running = computed(() => (runs.data.value ?? []).some((r) => r.status === 'running'))
let poll: ReturnType<typeof setInterval> | undefined
watch(
  running,
  (on) => {
    clearInterval(poll)
    poll = on ? setInterval(() => void runs.reload(), 15_000) : undefined
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(poll))

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  running: 'info',
  succeeded: 'success',
  success: 'success',
  failed: 'danger',
  retrying: 'warning',
  cancelled: 'neutral',
}
const took = (ms: number | null | undefined) =>
  ms == null ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
</script>

<template>
  <Card title="Execution history" data-testid="history">
    <p v-if="agents.error.value" class="tp-note" role="alert">{{ agents.error.value }}</p>
    <template v-else-if="agentOptions.length">
      <Select v-model="agentId" :options="agentOptions" size="sm" aria-label="Agent" />
      <p v-if="runs.error.value" class="tp-note" role="alert">{{ runs.error.value }}</p>
      <ul v-else-if="runs.data.value?.length" class="tp-list">
        <li v-for="r in runs.data.value" :key="r.id" class="tp-item">
          <div class="tp-main">
            <span class="tp-strong">{{ r.task }}</span>
            <span class="tp-note">
              started {{ ago(r.started_at)
              }}<template v-if="r.duration_ms != null"> · took {{ took(r.duration_ms) }}</template>
              <template v-if="r.attempt > 1"> · attempt {{ r.attempt }}</template>
            </span>
            <span v-if="r.error" class="tp-note" role="alert">{{ r.error }}</span>
          </div>
          <Badge :tone="TONE[r.status] ?? 'neutral'" :label="r.status" />
        </li>
      </ul>
      <p v-else-if="!runs.loading.value" class="tp-note">No runs recorded for this agent yet.</p>
    </template>
    <p v-else-if="!agents.loading.value" class="tp-note">
      No agent has registered with the server.
    </p>
  </Card>
</template>
