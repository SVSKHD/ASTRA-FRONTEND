<script setup lang="ts">
// GitHub Actions on the selected repo: workflows, runs, jobs with steps and the
// job log (text/plain, tail first). Dispatch is offered only for workflows on
// the server's allowlist; a production workflow's dispatch or re-run is filed
// for approval instead of sent, and says so. Cancel is always direct. On top,
// the Deploys and CI monitor (all repos, no repo selection needed).
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Modal from '@/components/ui/Modal.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import ApprovalRequired from '@/components/control/ApprovalRequired.vue'
import CcActionsMonitor from '@/components/control/CcActionsMonitor.vue'
import LogViewer from '@/components/control/LogViewer.vue'
import { aureon } from '@/api/client'
import { cc, must, repoParams, short, type Gated, type Schemas } from '@/control/api'
import { usePoll } from '@/control/poll'
import { repos } from '@/control/repos'
import { runTone } from '@/control/status'
import { ago } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

type Workflow = Schemas['WorkflowOut']
type Run = Schemas['app__schemas__github_actions__RunOut']
type Action = Schemas['ActionOut']

const workflows = useLoad(async () => {
  const p = repoParams()
  if (!p) return []
  return must(
    await aureon.GET('/api/v1/github/repositories/{owner}/{repo}/actions/workflows', {
      params: { path: p },
    }),
  )
}, false)

const status = ref<'' | 'in_progress' | 'completed' | 'failure'>('')
const page = ref(1)
const runs = useLoad(async () => {
  const p = repoParams()
  if (!p) return null
  return must(
    await aureon.GET('/api/v1/github/repositories/{owner}/{repo}/actions/runs', {
      params: {
        path: p,
        query: {
          per_page: 20,
          page: page.value,
          ...(status.value ? { status: status.value } : {}),
        },
      },
    }),
  )
}, false)

const run = ref<Run | null>(null)
const jobs = useLoad(async () => {
  const p = repoParams()
  if (!p || !run.value) return []
  return must(
    await aureon.GET('/api/v1/github/repositories/{owner}/{repo}/actions/runs/{run_id}/jobs', {
      params: { path: { ...p, run_id: run.value.id } },
    }),
  )
}, false)

const logJob = ref<{ id: number; name: string } | null>(null)
const log = useLoad(async () => {
  const p = repoParams()
  if (!p || !logJob.value) return ''
  return must(
    await aureon.GET('/api/v1/github/repositories/{owner}/{repo}/actions/jobs/{job_id}/logs', {
      params: { path: { ...p, job_id: logJob.value.id } },
      parseAs: 'text',
    }),
  ) as string
}, false)

watch(
  () => cc.repo,
  () => {
    run.value = null
    logJob.value = null
    page.value = 1
    void workflows.reload()
  },
  { immediate: true },
)
watch([() => cc.repo, status, page], () => void runs.reload(), { immediate: true })
watch(run, () => {
  logJob.value = null
  void jobs.reload()
})
watch(logJob, () => void log.reload())
usePoll(() => {
  void runs.reload()
  if (run.value) void jobs.reload()
}, 15_000)

// ── writes ──────────────────────────────────────────────────────────────────
const busy = ref(false)
const result = ref('')
const gated = ref<Gated | null>(null)
function answer(a: Action, what: string) {
  if (a.status === 'pending_approval' && a.approval) {
    gated.value = a.approval
    result.value = ''
  } else {
    gated.value = null
    result.value = `${what}: sent to GitHub.`
  }
}
async function write(what: string, fn: () => Promise<Action>) {
  busy.value = true
  result.value = ''
  gated.value = null
  try {
    answer(await fn(), what)
    void runs.reload()
  } catch (e) {
    result.value = `${what}: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}
function runAction(r: Run, action: 'rerun' | 'rerun-failed' | 'cancel') {
  const p = repoParams()
  if (!p) return
  const path = { ...p, run_id: r.id }
  const label = { rerun: 'Re-run', 'rerun-failed': 'Re-run failed jobs', cancel: 'Cancel' }[action]
  void write(label, async () =>
    must(
      action === 'rerun'
        ? await aureon.POST(
            '/api/v1/github/repositories/{owner}/{repo}/actions/runs/{run_id}/rerun',
            { params: { path } },
          )
        : action === 'rerun-failed'
          ? await aureon.POST(
              '/api/v1/github/repositories/{owner}/{repo}/actions/runs/{run_id}/rerun-failed',
              { params: { path } },
            )
          : await aureon.POST(
              '/api/v1/github/repositories/{owner}/{repo}/actions/runs/{run_id}/cancel',
              { params: { path } },
            ),
    ),
  )
}

const dispatching = ref<Workflow | null>(null)
const dispatchRef = ref('')
const branches = useLoad(async () => {
  const p = repoParams()
  if (!p) return []
  return must(
    await aureon.GET('/api/v1/github/repositories/{owner}/{repo}/branches', {
      params: { path: p },
    }),
  )
}, false)
const branchOptions = computed(() =>
  (branches.data.value ?? []).map((b) => ({ value: b.name, label: b.name })),
)
function startDispatch(w: Workflow) {
  dispatching.value = w
  dispatchRef.value = repos.items.find((r) => r.full_name === cc.repo)?.default_branch ?? ''
  void branches.reload()
}
function dispatch() {
  const p = repoParams()
  const w = dispatching.value
  if (!p || !w || !dispatchRef.value) return
  dispatching.value = null
  void write(`Dispatch ${w.name}`, async () =>
    must(
      await aureon.POST(
        '/api/v1/github/repositories/{owner}/{repo}/actions/workflows/{workflow}/dispatch',
        {
          params: { path: { ...p, workflow: w.file } },
          body: { ref: dispatchRef.value, inputs: {} },
        },
      ),
    ),
  )
}

const isActive = (r: Run) =>
  r.status === 'in_progress' || r.status === 'queued' || r.status === 'waiting'
</script>

<template>
  <div class="tp-page">
    <CcActionsMonitor />
    <EmptyState
      v-if="!cc.repo"
      title="No repository selected"
      description="Pick an allowlisted repository in the header."
    />
    <template v-else>
      <ApprovalRequired v-if="gated" :gated="gated" />
      <p v-if="result" class="tp-note" role="status">{{ result }}</p>

      <Card title="Workflows">
        <ul v-if="workflows.data.value?.length" class="tp-list">
          <li v-for="w in workflows.data.value" :key="w.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ w.name }}</span>
              <span class="tp-note">{{ w.file }}{{ w.state ? ` · ${w.state}` : '' }}</span>
            </div>
            <div class="tp-row">
              <Badge v-if="w.production" tone="warning" label="Production" />
              <Button
                v-if="w.dispatch_allowed"
                size="sm"
                variant="secondary"
                :disabled="busy"
                @click="startDispatch(w)"
                >{{ w.production ? 'Run (approval required)' : 'Run' }}</Button
              >
              <span v-else class="tp-note">Not on the dispatch allowlist</span>
            </div>
          </li>
        </ul>
        <p v-else-if="workflows.error.value" class="tp-note" role="alert">
          {{ workflows.error.value }}
        </p>
        <p v-else-if="!workflows.loading.value" class="tp-note">
          This repository has no workflows.
        </p>
      </Card>

      <Card title="Runs">
        <SegmentedControl
          v-model="status"
          size="sm"
          aria-label="Run status"
          :options="[
            { value: '', label: 'All' },
            { value: 'in_progress', label: 'Running' },
            { value: 'completed', label: 'Completed' },
            { value: 'failure', label: 'Failed' },
          ]"
        />
        <ul v-if="runs.data.value?.items.length" class="tp-list">
          <li v-for="r in runs.data.value.items" :key="r.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong"
                >{{ r.name ?? r.path ?? `run ${r.id}` }} #{{ r.run_number ?? r.id }}</span
              >
              <span class="tp-note"
                >{{ r.branch ?? '—' }} · {{ short(r.head_sha) }} · {{ r.event }} ·
                {{ ago(r.created_at)
                }}{{ (r.run_attempt ?? 1) > 1 ? ` · attempt ${r.run_attempt}` : '' }}</span
              >
            </div>
            <div class="tp-row">
              <Badge
                :tone="runTone(r.status, r.conclusion)"
                :label="r.conclusion ?? r.status ?? '—'"
              />
              <Button size="sm" variant="ghost" @click="run = r">Jobs</Button>
            </div>
          </li>
        </ul>
        <p v-else-if="runs.error.value" class="tp-note" role="alert">{{ runs.error.value }}</p>
        <p v-else-if="!runs.loading.value" class="tp-note">No runs match.</p>
        <div v-if="runs.data.value && (page > 1 || runs.data.value.has_next)" class="tp-row">
          <Button size="sm" variant="ghost" :disabled="page <= 1" @click="page--">Previous</Button>
          <span class="tp-note">Page {{ page }}</span>
          <Button size="sm" variant="ghost" :disabled="!runs.data.value.has_next" @click="page++"
            >Next</Button
          >
        </div>
      </Card>

      <Card v-if="run" :title="`Run ${run.name ?? run.id} #${run.run_number ?? run.id}`">
        <div class="tp-row">
          <Button
            v-if="isActive(run)"
            size="sm"
            variant="danger"
            :disabled="busy"
            @click="runAction(run, 'cancel')"
            >Cancel run</Button
          >
          <template v-else>
            <Button size="sm" variant="secondary" :disabled="busy" @click="runAction(run, 'rerun')"
              >Re-run</Button
            >
            <Button
              v-if="run.conclusion === 'failure'"
              size="sm"
              variant="secondary"
              :disabled="busy"
              @click="runAction(run, 'rerun-failed')"
              >Re-run failed jobs</Button
            >
          </template>
          <Button size="sm" variant="ghost" @click="run = null">Close</Button>
        </div>
        <ul v-if="jobs.data.value?.length" class="tp-list">
          <li v-for="j in jobs.data.value" :key="j.id" class="cc-stack">
            <div class="tp-item">
              <div class="tp-main">
                <span class="tp-strong">{{ j.name ?? `job ${j.id}` }}</span>
                <span class="tp-note">{{
                  j.steps
                    .filter(
                      (s) =>
                        s.conclusion && s.conclusion !== 'success' && s.conclusion !== 'skipped',
                    )
                    .map((s) => `step ${s.number} ${s.name}: ${s.conclusion}`)
                    .join(' · ') || `${j.steps.length} steps`
                }}</span>
              </div>
              <div class="tp-row">
                <Badge
                  :tone="runTone(j.status, j.conclusion)"
                  :label="j.conclusion ?? j.status ?? '—'"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  @click="logJob = { id: j.id, name: j.name ?? String(j.id) }"
                  >Log</Button
                >
              </div>
            </div>
          </li>
        </ul>
        <p v-else-if="jobs.error.value" class="tp-note" role="alert">{{ jobs.error.value }}</p>
        <p v-else-if="!jobs.loading.value" class="tp-note">This run has no jobs yet.</p>
      </Card>

      <Card v-if="logJob" :title="`Log · ${logJob.name}`">
        <LogViewer
          v-if="log.data.value !== null"
          :text="log.data.value"
          :label="`Log of ${logJob.name}`"
        />
        <p v-else-if="log.error.value" class="tp-note" role="alert">{{ log.error.value }}</p>
        <div class="tp-row">
          <Button size="sm" variant="ghost" :loading="log.loading.value" @click="log.reload()"
            >Refresh log</Button
          >
        </div>
      </Card>
    </template>

    <Modal
      :open="!!dispatching"
      :title="`Run ${dispatching?.name ?? ''}`"
      @close="dispatching = null"
    >
      <div class="cc-form">
        <p class="tp-note">
          {{
            dispatching?.production
              ? 'This is a production workflow: it is filed for approval and runs only after an admin approves it with their password.'
              : 'This sends a workflow_dispatch to GitHub now.'
          }}
        </p>
        <Select
          v-model="dispatchRef"
          :options="branchOptions"
          placeholder="Branch"
          aria-label="Branch to run on"
        />
        <div class="tp-row">
          <Button variant="primary" :disabled="!dispatchRef" @click="dispatch">{{
            dispatching?.production ? 'Request approval' : 'Run workflow'
          }}</Button>
        </div>
      </div>
    </Modal>
  </div>
</template>
