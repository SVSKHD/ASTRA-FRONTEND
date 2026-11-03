<script setup lang="ts">
// Deploys and CI on one timeline: the server's deploy poller runs (the
// `deployer` agent) next to GitHub Actions runs, newest first. Read from
// Aureon's database only (GET /api/v1/github/actions/monitor), so it polls
// every 15 s like the run list, at no GitHub rate-limit cost.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { aureon } from '@/api/client'
import { cc, must, short, type Schemas } from '@/control/api'
import { KIND_LABEL, duration, monitorTone } from '@/control/monitor'
import { usePoll } from '@/control/poll'
import { ago } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

type Item = Schemas['MonitorItemOut']

const kind = ref<'' | 'deploy' | 'ci'>('')
const scope = ref<'all' | 'repo'>('all')
const monitor = useLoad(async () => {
  const repo = scope.value === 'repo' && cc.repo ? cc.repo : undefined
  return must(
    await aureon.GET('/api/v1/github/actions/monitor', {
      params: {
        query: {
          limit: 40,
          ...(kind.value ? { kind: kind.value } : {}),
          ...(repo ? { repo } : {}),
        },
      },
    }),
  )
}, false)
watch([kind, scope, () => cc.repo], () => void monitor.reload(), { immediate: true })
usePoll(() => monitor.reload(), 15_000)

const items = computed<Item[]>(() => monitor.data.value?.items ?? [])
const label = (i: Item) => (i.kind === 'deploy' ? i.name.replace(/^deploy:/, '') : i.name)
const statusLabel = (i: Item) =>
  i.rolled_back ? `${i.status} · rolled back` : (i.conclusion ?? i.status)
</script>

<template>
  <Card title="Deploys and CI">
    <div class="tp-row">
      <SegmentedControl
        v-model="kind"
        size="sm"
        aria-label="Source"
        :options="[
          { value: '', label: 'All' },
          { value: 'deploy', label: 'Deploys' },
          { value: 'ci', label: 'CI' },
        ]"
      />
      <SegmentedControl
        v-if="cc.repo"
        v-model="scope"
        size="sm"
        aria-label="Repositories"
        :options="[
          { value: 'all', label: 'All repos' },
          { value: 'repo', label: 'This repo' },
        ]"
      />
    </div>
    <ul v-if="items.length" class="tp-list" aria-label="Deploys and CI runs">
      <li v-for="i in items" :key="i.id" class="tp-item">
        <div class="tp-main">
          <span class="tp-strong">{{ KIND_LABEL[i.kind] }} · {{ label(i) }}</span>
          <span class="tp-note"
            >{{ i.repo ?? '—' }} · {{ i.branch ?? '—' }} · {{ short(i.sha) }} ·
            {{ ago(i.started_at) }} · {{ duration(i.duration_ms)
            }}{{ i.event ? ` · ${i.event}` : '' }}</span
          >
          <span v-if="i.error" class="tp-note">{{ i.error }}</span>
        </div>
        <div class="tp-row">
          <Badge :tone="monitorTone(i.status)" :label="statusLabel(i)" />
          <a
            v-if="i.url"
            class="tp-note"
            :href="i.url"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Open ${KIND_LABEL[i.kind]} ${label(i)} on GitHub`"
            >GitHub</a
          >
        </div>
      </li>
    </ul>
    <p v-else-if="monitor.error.value" class="tp-note" role="alert">{{ monitor.error.value }}</p>
    <p v-else-if="!monitor.loading.value" class="tp-note">No deploys or CI runs recorded yet.</p>
  </Card>
</template>
