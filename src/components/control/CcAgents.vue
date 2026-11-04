<script setup lang="ts">
// The agent registry (GET /api/agents) with heartbeat age, pause / resume, and
// each agent's recent runs and logs; then the scheduler jobs. Agent state is
// kept live from the trading stream's `agent` events, with a 15 s
// visibility-aware poll for everything the stream does not carry.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import AgentTrio from './AgentTrio.vue'
import { aureon } from '@/api/client'
import { must } from '@/control/api'
import { useNow, usePoll } from '@/control/poll'
import { agentTone, runTone } from '@/control/status'
import { ago, when } from '@/trading/format'
import { connect, disconnect, live } from '@/trading/stream'
import { useLoad } from '@/trading/useLoad'

const now = useNow(5_000)
const agents = useLoad(async () => must(await aureon.GET('/api/agents')).agents)
const rows = computed(() =>
  (agents.data.value ?? []).map((a) => {
    const l = live.agents[a.id]
    return l
      ? { ...a, state: l.state, last_heartbeat_at: l.last_heartbeat_at ?? a.last_heartbeat_at }
      : a
  }),
)
const jobs = useLoad(async () => must(await aureon.GET('/api/scheduler/jobs')))

const selected = ref('')
const runs = useLoad(async () => {
  if (!selected.value) return []
  return must(
    await aureon.GET('/api/agents/{agent_id}/runs', {
      params: { path: { agent_id: selected.value }, query: { limit: 20 } },
    }),
  ).items
}, false)
const logs = useLoad(async () => {
  if (!selected.value) return []
  return must(
    await aureon.GET('/api/agents/{agent_id}/logs', {
      params: { path: { agent_id: selected.value }, query: { limit: 100 } },
    }),
  ).items
}, false)
watch(selected, () => {
  void runs.reload()
  void logs.reload()
})

usePoll(() => {
  void agents.reload()
  void jobs.reload()
  if (selected.value) void runs.reload()
}, 15_000)
onMounted(() => connect())
onBeforeUnmount(disconnect)

const busy = ref('')
const error = ref('')
async function toggleAgent(id: string, paused: boolean) {
  busy.value = id
  error.value = ''
  try {
    const path = { agent_id: id }
    must(
      paused
        ? await aureon.POST('/api/agents/{agent_id}/resume', { params: { path } })
        : await aureon.POST('/api/agents/{agent_id}/pause', { params: { path } }),
    )
    await agents.reload()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = ''
  }
}
async function jobAction(id: string, action: 'pause' | 'resume' | 'run') {
  busy.value = id
  error.value = ''
  try {
    const path = { job_id: id }
    must(
      action === 'pause'
        ? await aureon.POST('/api/scheduler/jobs/{job_id}/pause', { params: { path } })
        : action === 'resume'
          ? await aureon.POST('/api/scheduler/jobs/{job_id}/resume', { params: { path } })
          : await aureon.POST('/api/scheduler/jobs/{job_id}/run', { params: { path } }),
    )
    await jobs.reload()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = ''
  }
}
function retryAll() {
  void agents.reload()
  void jobs.reload()
}
function levelTone(l: string) {
  return l === 'error' || l === 'critical' ? 'danger' : l === 'warning' ? 'warning' : 'neutral'
}
const STREAM: Record<string, string> = {
  connecting: 'Live agent state connecting…',
  open: 'Live agent state on',
  reconnecting: 'Live agent state reconnecting…',
  closed: 'Live agent state off; polling every 15 s',
}
</script>

<template>
  <div class="tp-page">
    <p class="tp-note" role="status">{{ STREAM[live.status] }}</p>
    <p v-if="error" class="tp-note" role="alert">{{ error }}</p>
    <AgentTrio
      :agents="agents.data.value ?? null"
      :agents-error="agents.error.value"
      :jobs="jobs.data.value ?? null"
      :jobs-error="jobs.error.value"
      @retry="retryAll"
    />
    <div class="tp-grid">
      <Card title="Agents">
        <ul v-if="rows.length" class="tp-list">
          <li v-for="a in rows" :key="a.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ a.name }}</span>
              <span class="tp-note"
                >{{ a.id }} · {{ a.kind }} · heartbeat {{ ago(a.last_heartbeat_at, now)
                }}{{ a.paused ? ' · paused by admin' : '' }}</span
              >
            </div>
            <div class="tp-row">
              <Badge :tone="agentTone(a.state)" :label="a.state" />
              <Button
                size="sm"
                variant="ghost"
                :disabled="busy === a.id"
                @click="toggleAgent(a.id, a.paused)"
                >{{ a.paused ? 'Resume' : 'Pause' }}</Button
              >
              <Button size="sm" variant="ghost" @click="selected = a.id">Runs</Button>
            </div>
          </li>
        </ul>
        <p v-else-if="agents.error.value" class="tp-note" role="alert">{{ agents.error.value }}</p>
        <EmptyState
          v-else-if="!agents.loading.value"
          title="No agent has registered yet"
          description="Agents register on their first heartbeat; start the worker and the scheduler on the server."
        />
      </Card>

      <Card v-if="selected" :title="`Runs · ${selected}`">
        <ul v-if="runs.data.value?.length" class="tp-list">
          <li v-for="r in runs.data.value" :key="r.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ r.task }}</span>
              <span class="tp-note"
                >{{ when(r.started_at) }}{{ r.duration_ms != null ? ` · ${r.duration_ms} ms` : ''
                }}{{ r.error ? ` · ${r.error}` : '' }}</span
              >
            </div>
            <Badge
              :tone="
                r.status === 'succeeded' || r.status === 'success'
                  ? 'success'
                  : runTone(r.status, r.status)
              "
              :label="r.status"
            />
          </li>
        </ul>
        <p v-else-if="runs.error.value" class="tp-note" role="alert">{{ runs.error.value }}</p>
        <p v-else-if="!runs.loading.value" class="tp-note">No runs recorded for this agent.</p>
        <h3 class="tp-title">Logs</h3>
        <ul v-if="logs.data.value?.length" class="tp-list">
          <li v-for="l in logs.data.value" :key="l.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ l.message }}</span>
              <span class="tp-note">{{ when(l.created_at) }}</span>
            </div>
            <Badge :tone="levelTone(l.level)" :label="l.level" />
          </li>
        </ul>
        <p v-else-if="logs.error.value" class="tp-note" role="alert">{{ logs.error.value }}</p>
        <p v-else-if="!logs.loading.value" class="tp-note">No log lines for this agent.</p>
      </Card>
    </div>

    <Card title="Scheduler jobs">
      <ul v-if="jobs.data.value?.length" class="tp-list">
        <li v-for="j in jobs.data.value" :key="j.id" class="tp-item">
          <div class="tp-main">
            <span class="tp-strong">{{ j.id }}</span>
            <span class="tp-note"
              >{{ j.task }} · {{ j.cron }} · next {{ when(j.next_run_at) }} · last
              {{ j.last_status ?? 'never run'
              }}{{
                j.consecutive_failures ? ` · ${j.consecutive_failures} failures in a row` : ''
              }}</span
            >
            <span v-if="j.last_error" class="tp-note">{{ j.last_error }}</span>
          </div>
          <div class="tp-row">
            <Badge v-if="j.running" tone="info" label="running" />
            <Badge v-else-if="j.paused" label="paused" />
            <Button
              size="sm"
              variant="ghost"
              :disabled="busy === j.id"
              @click="jobAction(j.id, j.paused ? 'resume' : 'pause')"
              >{{ j.paused ? 'Resume' : 'Pause' }}</Button
            >
            <Button
              size="sm"
              variant="ghost"
              :disabled="busy === j.id || j.running"
              @click="jobAction(j.id, 'run')"
              >Run now</Button
            >
          </div>
        </li>
      </ul>
      <p v-else-if="jobs.error.value" class="tp-note" role="alert">{{ jobs.error.value }}</p>
      <p v-else-if="!jobs.loading.value" class="tp-note">The scheduler has no jobs.</p>
    </Card>
  </div>
</template>
