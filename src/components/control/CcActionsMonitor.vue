<script setup lang="ts">
// Deploys and CI on one timeline: the server's deploy poller runs (the
// `deployer` agent) next to GitHub Actions runs, newest first. Read from
// Aureon's database only (GET /api/v1/github/actions/monitor), at no GitHub
// rate-limit cost.
//
// Live deploy progress (Aureon docs/33-deploy-progress.md): a deploy row can be
// selected; a running deploy is selected automatically. Its stage stack sits on
// the right on wide screens and opens in a bottom sheet on phones and tablets.
// Polling is every 4 s while anything deploys and every 30 s when idle. When a
// deploy that was running finishes, a notice says how (deployed, failed, rolled
// back), from the server's recorded outcome only.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Toast from '@/components/ui/Toast.vue'
import CcDeployProgress from './CcDeployProgress.vue'
import { aureon } from '@/api/client'
import { cc, must, short, type Schemas } from '@/control/api'
import {
  finishedSince,
  pickDeploy,
  pollInterval,
  runIdOf,
  statusMap,
  type Notice,
  type Progress,
} from '@/control/deployProgress'
import { KIND_LABEL, duration, monitorTone } from '@/control/monitor'
import { useAdaptivePoll } from '@/control/poll'
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

const items = computed<Item[]>(() => monitor.data.value?.items ?? [])
const label = (i: Item) => (i.kind === 'deploy' ? i.name.replace(/^deploy:/, '') : i.name)
const statusLabel = (i: Item) => {
  if (i.kind === 'deploy' && i.status === 'running' && i.stage) {
    return `running · ${i.stage.replace(/_/g, ' ')}${i.stale ? ' · no update' : ''}`
  }
  return i.rolled_back ? `${i.status} · rolled back` : (i.conclusion ?? i.status)
}

// --- the selected deploy and its progress -------------------------------------------------
const chosen = ref<string | null>(null)
// The deploy last selected automatically: it stays selected after it finishes.
const followed = ref<string | null>(null)
const selectedId = computed(() => pickDeploy(items.value, chosen.value, followed.value))
const selected = computed(() => items.value.find((i) => i.id === selectedId.value) ?? null)
const progress = ref<Progress | null>(null)
const log = ref('')
const logTruncated = ref(false)
const progressError = ref('')
const progressLoading = ref(false)

async function loadProgress() {
  const run = selected.value ? runIdOf(selected.value) : null
  if (run === null) {
    progress.value = null
    log.value = ''
    progressError.value = ''
    return
  }
  progressLoading.value = !progress.value
  try {
    const r = await aureon.GET('/api/v1/github/actions/monitor/deploys/{run_id}/progress', {
      params: { path: { run_id: run } },
    })
    if (r.response.status === 404) {
      progress.value = null
      progressError.value =
        'No stage-by-stage progress was recorded for this deploy (it ran before progress reporting, or was not started by the deploy poller).'
      return
    }
    progress.value = must(r)
    progressError.value = ''
    if (progress.value.log_available) {
      const l = await aureon.GET('/api/v1/github/actions/monitor/deploys/{run_id}/logs', {
        params: { path: { run_id: run } },
      })
      if (l.data) {
        log.value = l.data.text
        logTruncated.value = l.data.truncated
      }
    } else log.value = ''
  } catch (e) {
    progressError.value = (e as Error).message || 'The deploy progress could not be loaded.'
  } finally {
    progressLoading.value = false
  }
}

function select(i: Item) {
  if (i.kind !== 'deploy') return
  chosen.value = i.id
  if (!wide.value) sheetOpen.value = true
}

// --- notices when a deploy finishes ---------------------------------------------------------
const notices = ref<Notice[]>([])
let seen: Map<string, string> | null = null
const hide = new Map<string, ReturnType<typeof setTimeout>>()
function notify(list: Notice[]) {
  for (const n of list) {
    notices.value = [n, ...notices.value.filter((x) => x.key !== n.key)].slice(0, 3)
    clearTimeout(hide.get(n.key))
    hide.set(
      n.key,
      setTimeout(() => dismiss(n.key), 15_000),
    )
  }
}
function dismiss(key: string) {
  notices.value = notices.value.filter((n) => n.key !== key)
}
onBeforeUnmount(() => hide.forEach((t) => clearTimeout(t)))

async function refresh() {
  await monitor.reload()
  if (monitor.data.value) {
    const now = statusMap(items.value)
    if (seen) notify(finishedSince(seen, items.value, (i) => `Deploy ${label(i)}`))
    seen = now
  }
  await loadProgress()
}

watch([kind, scope, () => cc.repo], () => void refresh(), { immediate: true })
watch(selectedId, (now, before) => {
  if (now && !chosen.value) followed.value = now
  if (now !== before) {
    progress.value = null
    log.value = ''
    void loadProgress()
  }
})
useAdaptivePoll(refresh, () => pollInterval(items.value, progress.value))

// --- layout: side by side when wide, a bottom sheet otherwise -------------------------------
const query = globalThis.window?.matchMedia?.('(min-width: 1024px)')
const wide = ref(query ? query.matches : true)
const onWide = (e: MediaQueryListEvent) => (wide.value = e.matches)
query?.addEventListener?.('change', onWide)
onBeforeUnmount(() => query?.removeEventListener?.('change', onWide))
const sheetOpen = ref(false)
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

    <div class="am__notices">
      <Toast
        v-for="n in notices"
        :key="n.key"
        :message="n.text"
        :tone="n.tone === 'danger' ? 'danger' : 'neutral'"
        data-testid="deploy-notice"
        @dismiss="dismiss(n.key)"
      />
    </div>

    <div v-if="!wide && selected && progress" class="tp-row am__peek" data-testid="deploy-peek">
      <span class="tp-note"
        >Deploy {{ label(selected) }} · {{ progress.stages_completed }}/{{
          progress.stages_total
        }}
        stages</span
      >
      <Button size="sm" variant="tinted" @click="sheetOpen = true">View progress</Button>
    </div>

    <div class="am" :class="{ 'am--split': wide }">
      <div class="am__timeline">
        <ul v-if="items.length" class="tp-list" aria-label="Deploys and CI runs">
          <li
            v-for="i in items"
            :key="i.id"
            class="tp-item am__item"
            :class="{ 'is-selected': i.id === selectedId }"
            :data-id="i.id"
          >
            <div class="tp-main">
              <button
                v-if="i.kind === 'deploy'"
                type="button"
                class="am__pick tp-strong"
                :aria-pressed="i.id === selectedId"
                :aria-label="`Show the progress of deploy ${label(i)}`"
                @click="select(i)"
              >
                {{ KIND_LABEL[i.kind] }} · {{ label(i) }}
              </button>
              <span v-else class="tp-strong">{{ KIND_LABEL[i.kind] }} · {{ label(i) }}</span>
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
        <p v-else-if="monitor.error.value" class="tp-note" role="alert">
          {{ monitor.error.value }}
        </p>
        <p v-else-if="!monitor.loading.value" class="tp-note">
          No deploys or CI runs recorded yet.
        </p>
      </div>

      <aside v-if="wide" class="am__stack" aria-label="Deploy progress stack">
        <CcDeployProgress
          :progress="progress"
          :log="log"
          :log-truncated="logTruncated"
          :error="progressError"
          :loading="progressLoading"
        />
      </aside>
    </div>

    <BottomSheet
      v-if="!wide"
      :open="sheetOpen"
      :title="selected ? `Deploy ${label(selected)}` : 'Deploy progress'"
      @close="sheetOpen = false"
    >
      <CcDeployProgress
        :progress="progress"
        :log="log"
        :log-truncated="logTruncated"
        :error="progressError"
        :loading="progressLoading"
      />
    </BottomSheet>
  </Card>
</template>

<style scoped>
.am {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.am--split {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  align-items: start;
}
.am__timeline,
.am__stack {
  min-width: 0;
}
.am__stack {
  position: sticky;
  top: var(--sp-3);
  padding-left: var(--sp-3);
  border-left: 1px solid var(--glass-border);
}
.am__item.is-selected {
  border-left: 3px solid var(--theme-accent);
  padding-left: var(--sp-2);
}
.am__pick {
  all: unset;
  cursor: pointer;
  min-width: 0;
  overflow-wrap: anywhere;
}
.am__pick:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.am__notices {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.am__peek {
  justify-content: space-between;
  min-width: 0;
}
</style>
