<script setup lang="ts">
// The server (GET /api/health, /api/health/ready, /api/system/status): is the
// API up, can it reach its dependencies, and what is the host doing. Every
// figure is what the server returned; a section it could not read says so
// instead of showing a number. Polled every 30 s while the page is visible,
// each read on its own so one slow probe never blanks the rest.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { aureon } from '@/api/client'
import { ApiFailure, must } from '@/control/api'
import { useNow, usePoll } from '@/control/poll'
import {
  READY_LABEL,
  bytes,
  healthTone,
  overallHealth,
  pct,
  sectionHealth,
  uptime,
  type Health,
  type Readiness,
  type Section,
  type SystemStatus,
} from '@/control/system'
import { ago } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

const now = useNow(5_000)

const live = useLoad(async () => {
  const r = await aureon.GET('/api/health')
  return r.response.ok
})
// 503 is readiness's answer for "not ready", with the checks in the body.
const ready = useLoad(async () => {
  const r = await aureon.GET('/api/health/ready')
  const body = (r.data ?? r.error) as Readiness | undefined
  if (body && typeof body === 'object' && 'checks' in body) return body
  throw new ApiFailure(`Aureon answered ${r.response.status}`, r.response.status)
})
const status = useLoad(
  async () => must(await aureon.GET('/api/system/status')) as unknown as SystemStatus,
)

usePoll(() => {
  void live.reload()
  void ready.reload()
  void status.reload()
}, 30_000)

function refresh() {
  void live.reload()
  void ready.reload()
  void status.reload()
}

const s = computed(() => status.data.value)
const overall = computed<Health>(() =>
  live.error.value
    ? 'unavailable'
    : overallHealth(live.data.value, ready.data.value, status.data.value),
)
const LABEL: Record<Health, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  unavailable: 'Unavailable',
  unknown: 'Unknown',
}
const checks = computed(() =>
  Object.entries(ready.data.value?.checks ?? {}).map(([name, c]) => ({
    name,
    label: READY_LABEL[name] ?? name,
    ...c,
  })),
)
const services = computed(() => {
  const x = s.value
  if (!x) return []
  const rows: Array<{ key: string; label: string; section?: Section; detail: string }> = [
    {
      key: 'postgres',
      label: 'PostgreSQL',
      section: x.postgres,
      detail: x.postgres?.version
        ? `v${x.postgres.version} · ${bytes(x.postgres.database_bytes)} · ${x.postgres.connections ?? '—'} connections`
        : '',
    },
    {
      key: 'redis',
      label: 'Redis',
      section: x.redis,
      detail:
        x.redis?.used_memory_bytes != null ? `${bytes(x.redis.used_memory_bytes)} in memory` : '',
    },
    {
      key: 'ollama',
      label: 'Ollama',
      section: x.ollama,
      detail:
        x.ollama?.installed_models != null
          ? `${x.ollama.installed_models} installed · ${x.ollama.loaded_models?.length ? `loaded: ${x.ollama.loaded_models.join(', ')}` : 'none loaded'}`
          : '',
    },
    {
      key: 'imaging',
      label: 'Image worker',
      section: x.imaging,
      detail: x.imaging?.worker
        ? `${x.imaging.worker} · ${x.imaging.queued ?? 0} queued · ${x.imaging.running ?? 0} running`
        : '',
    },
  ]
  return rows
})
const disks = computed(() =>
  Object.entries(s.value?.host?.disks ?? {}).map(([key, d]) => ({
    key,
    label: key === 'ssd' ? 'System disk (SSD)' : key === 'hdd' ? 'Data disk (HDD)' : key,
    ...d,
  })),
)
const units = computed(() => Object.entries(s.value?.host_services?.units ?? {}))
</script>

<template>
  <div class="tp-page">
    <div class="tp-head">
      <div class="tp-row">
        <Badge :tone="healthTone(overall)" :label="LABEL[overall]" />
        <span class="tp-note">
          {{
            s?.generated_at
              ? `Server report ${ago(s.generated_at, now)}`
              : 'Waiting for the first report'
          }}
          · refreshes every 30 s
        </span>
      </div>
      <Button size="sm" variant="ghost" :loading="status.loading.value" @click="refresh"
        >Refresh</Button
      >
    </div>

    <div class="tp-grid">
      <Card title="API">
        <ul class="tp-list">
          <li class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">Process</span>
              <span class="tp-note">GET /api/health</span>
            </div>
            <Badge
              v-if="live.data.value !== null || live.error.value"
              :tone="live.data.value ? 'success' : 'danger'"
              :label="live.data.value ? 'up' : 'unreachable'"
            />
            <Skeleton v-else width="64px" />
          </li>
          <li v-for="c in checks" :key="c.name" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ c.label }}</span>
              <span class="tp-note"
                >{{ c.latency_ms != null ? `${c.latency_ms} ms` : ''
                }}{{ c.detail ? ` · ${c.detail}` : '' }}</span
              >
            </div>
            <Badge
              :tone="c.ok ? 'success' : 'danger'"
              :label="c.ok ? 'reachable' : 'not reachable'"
            />
          </li>
        </ul>
        <p v-if="ready.error.value" class="tp-note" role="alert">
          Readiness: {{ ready.error.value }}
        </p>
      </Card>

      <Card title="Host">
        <template v-if="s?.host && sectionHealth(s.host) !== 'unavailable'">
          <div class="sys-meter">
            <span class="tp-note"
              >CPU · {{ s.host.cpu?.count ?? '—' }} cores · load
              {{ s.host.cpu?.load_avg?.map((n) => n.toFixed(2)).join(' / ') ?? '—' }}</span
            >
            <ProgressBar
              v-if="s.host.cpu?.percent != null"
              :value="s.host.cpu.percent"
              :label="`CPU ${pct(s.host.cpu.percent)}`"
              size="sm"
            />
          </div>
          <div class="sys-meter">
            <span class="tp-note"
              >Memory · {{ bytes(s.host.memory?.available_bytes) }} free of
              {{ bytes(s.host.memory?.total_bytes) }} · swap
              {{ pct(s.host.memory?.swap_percent) }}</span
            >
            <ProgressBar
              v-if="s.host.memory?.percent != null"
              :value="s.host.memory.percent"
              :label="`Memory ${pct(s.host.memory.percent)}`"
              size="sm"
            />
          </div>
          <div v-for="d in disks" :key="d.key" class="sys-meter">
            <span class="tp-note"
              >{{ d.label }}
              <template v-if="d.error"> · could not read ({{ d.error }})</template>
              <template v-else>
                · {{ bytes(d.free_bytes) }} free of {{ bytes(d.total_bytes) }}</template
              ></span
            >
            <ProgressBar
              v-if="d.percent != null"
              :value="d.percent"
              :label="`${d.label} ${pct(d.percent)}`"
              size="sm"
            />
          </div>
          <p class="tp-note">Up {{ uptime(s.host.uptime_seconds) }}</p>
        </template>
        <p v-else-if="s?.host" class="tp-note" role="alert">
          Host figures unavailable: {{ s.host.error }}
        </p>
        <Skeleton v-else-if="status.loading.value" :lines="4" />
        <p v-if="status.error.value" class="tp-note" role="alert">{{ status.error.value }}</p>
      </Card>
    </div>

    <Card title="Services">
      <ul v-if="services.length" class="tp-list">
        <li v-for="row in services" :key="row.key" class="tp-item">
          <div class="tp-main">
            <span class="tp-strong">{{ row.label }}</span>
            <span class="tp-note">{{
              row.section?.error ? `Could not read: ${row.section.error}` : row.detail || '—'
            }}</span>
          </div>
          <Badge
            :tone="healthTone(sectionHealth(row.section))"
            :label="sectionHealth(row.section)"
          />
        </li>
      </ul>
      <Skeleton v-else-if="status.loading.value" :lines="4" />
    </Card>

    <div class="tp-grid">
      <Card title="Containers">
        <template v-if="s?.docker">
          <p v-if="s.docker.error" class="tp-note" role="alert">
            Docker unavailable: {{ s.docker.error }}
          </p>
          <ul v-else-if="s.docker.containers?.length" class="tp-list">
            <li v-for="c in s.docker.containers" :key="c.name" class="tp-item">
              <div class="tp-main">
                <span class="tp-strong">{{ c.name }}</span>
                <span class="tp-note">{{ c.image }} · {{ c.status }}</span>
              </div>
              <Badge
                :tone="
                  s.docker.not_running_or_unhealthy?.includes(c.name ?? '') ? 'danger' : 'success'
                "
                :label="c.state ?? 'unknown'"
              />
            </li>
          </ul>
          <p v-else class="tp-note">Docker reports no containers.</p>
        </template>
        <Skeleton v-else-if="status.loading.value" :lines="3" />
      </Card>

      <Card title="Host services">
        <template v-if="s?.host_services">
          <p v-if="s.host_services.error" class="tp-note" role="alert">
            {{ s.host_services.error }}
          </p>
          <template v-else>
            <p v-if="s.host_services.stale" class="tp-note" role="alert">
              The host status file is {{ uptime(s.host_services.age_seconds) }} old; these states
              may be out of date.
            </p>
            <ul v-if="units.length" class="tp-list">
              <li v-for="[unit, state] in units" :key="unit" class="tp-item">
                <span class="tp-strong">{{ unit }}</span>
                <Badge :tone="state === 'active' ? 'success' : 'danger'" :label="state" />
              </li>
            </ul>
            <p v-else class="tp-note">The host reports no watched services.</p>
          </template>
        </template>
        <Skeleton v-else-if="status.loading.value" :lines="3" />
      </Card>
    </div>
  </div>
</template>

<style scoped>
.sys-meter {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
  margin-bottom: var(--sp-3);
}
</style>
