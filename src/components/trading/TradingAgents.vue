<script setup lang="ts">
// Agent status and logs: every trading agent (Dhan feed, MT5 bot, research
// agents) with its live state; logs are admin-only on the server.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { aureon } from '@/api/client'
import { ago, when } from '@/trading/format'
import { isAdmin } from '@/trading/session'
import { live } from '@/trading/stream'
import { must, useLoad } from '@/trading/useLoad'

const agents = useLoad(async () => must(await aureon.GET('/api/trading/agents')))
const rows = computed(() =>
  (agents.data.value ?? []).map((a) => ({ ...a, state: live.agents[a.id]?.state ?? a.state })),
)
const selected = ref('')
const logs = useLoad(async () => {
  if (!selected.value) return []
  return must(
    await aureon.GET('/api/trading/agents/{agent_id}/logs', {
      params: { path: { agent_id: selected.value }, query: { limit: 100 } },
    }),
  ).items
}, false)
watch(selected, () => void logs.reload())

function tone(s: string) {
  return s === 'idle' || s === 'busy'
    ? 'success'
    : s === 'paused'
      ? 'neutral'
      : s === 'stale'
        ? 'warning'
        : 'danger'
}
function details(d: Record<string, unknown>): string {
  const keys = ['queue', 'processed', 'dropped', 'errors', 'detail', 'connected', 'stale', 'mode']
  return keys
    .filter((k) => d[k] !== undefined && d[k] !== null && d[k] !== '')
    .map((k) => `${k} ${Array.isArray(d[k]) ? (d[k] as unknown[]).length : String(d[k])}`)
    .join(' · ')
}
function levelTone(l: string) {
  return l === 'error' ? 'danger' : l === 'warning' ? 'warning' : 'neutral'
}
</script>

<template>
  <div class="tp-page">
    <div class="tp-grid">
      <Card title="Trading agents">
        <ul v-if="rows.length" class="tp-list">
          <li v-for="a in rows" :key="a.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ a.name }}</span>
              <span class="tp-note">
                {{ a.id }} · heartbeat {{ ago(a.last_heartbeat_at)
                }}{{ a.paused ? ' · paused by admin' : '' }}
              </span>
              <span v-if="details(a.details)" class="tp-note">{{ details(a.details) }}</span>
            </div>
            <div class="tp-row">
              <Badge :tone="tone(a.state)" :label="a.state" />
              <Button v-if="isAdmin()" size="sm" variant="ghost" @click="selected = a.id"
                >Logs</Button
              >
            </div>
          </li>
        </ul>
        <EmptyState
          v-else-if="!agents.loading.value"
          title="No trading agents have reported yet"
          description="Start the Dhan feed, the MT5 sync or the research worker on the server."
        />
      </Card>
      <Card v-if="selected" :title="`Logs · ${selected}`">
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
  </div>
</template>
