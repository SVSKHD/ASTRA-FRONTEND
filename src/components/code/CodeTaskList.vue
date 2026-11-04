<script setup lang="ts">
// A repository's code tasks on the Aureon server, and the human decision on each.
//
// A change runs in its own worktree and branch with the repo's tests; an admin reads the
// diff here and approves or rejects it. Approving queues a git op on the coding worker
// (keep the branch; for a clone of an allowlisted GitHub repo, push it and open a PR),
// followed here until it ends. Nothing is merged or deployed: merging stays behind the
// approval gate. Shared by /code-aureon and the GitHub AI workspace.
import { computed, onBeforeUnmount, reactive, watch } from 'vue'
import Alert from '@/components/ui/Alert.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'
import DiffViewer from '@/components/control/DiffViewer.vue'
import { aureon, type components } from '@/api/client'
import { must, useLoad } from '@/trading/useLoad'
import { when } from '@/trading/format'

type Task = components['schemas']['CodeTaskOut']
type GitOp = components['schemas']['GitOpOut']

const props = defineProps<{ repo: string; title?: string }>()
const emit = defineEmits<{ answer: [task: Task] }>()

const tasks = useLoad(
  async () =>
    must(
      await aureon.GET('/api/code/tasks', { params: { query: { repo: props.repo, limit: 20 } } }),
    ).items,
  false,
)
watch(
  () => props.repo,
  (r) => {
    if (r) void tasks.reload()
  },
  { immediate: true },
)

// Follow queued and running tasks until they settle.
const active = computed(() =>
  (tasks.data.value ?? []).some((t) => t.status === 'queued' || t.status === 'running'),
)
let poll: ReturnType<typeof setInterval> | undefined
watch(
  active,
  (on) => {
    clearInterval(poll)
    poll = on ? setInterval(() => void tasks.reload(), 5000) : undefined
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(poll))
// An analysis that finished is an answer the parent may want to show.
watch(
  () => tasks.data.value,
  (now, before) => {
    for (const t of now ?? []) {
      const was = before?.find((b) => b.id === t.id)
      if (was && was.status !== t.status && t.kind === 'analyze' && t.status === 'done') {
        emit('answer', t)
      }
    }
  },
)

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  queued: 'info',
  running: 'info',
  ready: 'warning',
  done: 'success',
  approved: 'success',
  rejected: 'neutral',
  failed: 'danger',
}

const diffs = reactive<Record<string, string>>({})
const busy = reactive<Record<string, boolean>>({})
const taskMsg = reactive<Record<string, string>>({})
const featureBranch = reactive<Record<string, string>>({})

async function showDiff(t: Task) {
  if (diffs[t.id] !== undefined) {
    delete diffs[t.id]
    return
  }
  try {
    const d = must(
      await aureon.GET('/api/code/tasks/{task_id}/diff', { params: { path: { task_id: t.id } } }),
    )
    diffs[t.id] = d.diff || ''
  } catch (e) {
    taskMsg[t.id] = (e as Error).message
  }
}

function opLine(op: GitOp): string {
  const b = op.branch ?? ''
  if (op.status === 'queued' || op.status === 'running')
    return `Approved. The coding worker is ${op.status === 'queued' ? 'about to keep' : 'keeping'} ${b}…`
  if (op.status === 'failed')
    return `Approved, but the git step failed: ${op.error ?? 'unknown error'}`
  if (op.pr_url)
    return `Approved: ${b} pushed, pull request #${op.pr_number ?? ''} opened (${op.pr_url}).`
  return `Approved on the local branch ${b}. Nothing was pushed.`
}

/** Follow the queued git op until it is done or failed (about 10 minutes at most). */
async function follow(taskId: string, op: GitOp) {
  taskMsg[taskId] = opLine(op)
  for (let i = 0; i < 200 && (op.status === 'queued' || op.status === 'running'); i++) {
    await new Promise((r) => setTimeout(r, i === 0 ? 1500 : 3000))
    try {
      op = must(
        await aureon.GET('/api/code/git/ops/{op_id}', { params: { path: { op_id: op.id } } }),
      )
    } catch {
      continue
    }
    taskMsg[taskId] = opLine(op)
  }
}

async function decide(t: Task, verdict: 'approve' | 'reject') {
  busy[t.id] = true
  taskMsg[t.id] = ''
  try {
    const path = { params: { path: { task_id: t.id } } }
    const feature = featureBranch[t.id]?.trim()
    if (verdict === 'approve') {
      const out = must(
        await aureon.POST('/api/code/tasks/{task_id}/approve', {
          ...path,
          body: feature ? { feature_branch: feature } : null,
        }),
      )
      void follow(t.id, out.git_op)
    } else {
      must(await aureon.POST('/api/code/tasks/{task_id}/reject', path))
      taskMsg[t.id] = 'Rejected; the agent branch was removed.'
    }
    void tasks.reload()
  } catch (e) {
    taskMsg[t.id] = (e as Error).message
  } finally {
    busy[t.id] = false
  }
}

function testLine(test: unknown): string {
  const r = (test ?? {}) as Record<string, unknown>
  return `Test ${r.ok ? 'passed' : 'failed'}: ${String(r.cmd ?? r.command ?? '')}`
}

function answerOf(t: Task): string {
  const r = t.result as Record<string, unknown> | null
  const a = r?.answer ?? r?.summary
  return typeof a === 'string' ? a : ''
}

defineExpose({ reload: () => tasks.reload() })
</script>

<template>
  <div class="ctl">
    <div class="tp-head">
      <span class="tp-title">{{ title ?? 'Tasks' }}</span>
      <Button size="sm" variant="ghost" :loading="tasks.loading.value" @click="tasks.reload()">
        Refresh
      </Button>
    </div>
    <Alert v-if="tasks.error.value" tone="warning">{{ tasks.error.value }}</Alert>
    <ul v-else-if="tasks.data.value?.length" class="tp-list" data-testid="code-tasks">
      <li v-for="t in tasks.data.value" :key="t.id" class="tp-item ctl__task">
        <div class="tp-main">
          <span class="tp-strong">{{ t.title }}</span>
          <span class="tp-note">
            {{ t.kind === 'change' ? 'change' : 'analysis' }} · {{ when(t.created_at) }}
            <template v-if="t.paths.length"> · {{ t.paths.join(', ') }}</template>
          </span>
          <span v-if="answerOf(t)" class="tp-note ctl__answer">{{ answerOf(t) }}</span>
          <span v-if="t.error" class="tp-note" role="alert">{{ t.error }}</span>
          <span v-for="(test, n) in t.tests" :key="n" class="tp-note">{{ testLine(test) }}</span>
          <DiffViewer
            v-if="diffs[t.id] !== undefined"
            :text="diffs[t.id] || 'The change is empty.'"
            :label="`Diff of ${t.title}`"
          />
          <span v-if="taskMsg[t.id]" class="tp-note" role="status">{{ taskMsg[t.id] }}</span>
          <div v-if="t.kind === 'change' && t.status === 'ready'" class="tp-row">
            <TextInput
              v-model="featureBranch[t.id]"
              size="sm"
              placeholder="feature/name (optional)"
              aria-label="Feature branch"
            />
          </div>
        </div>
        <div class="tp-row">
          <Badge :tone="STATUS_TONE[t.status] ?? 'neutral'" :label="t.status" />
          <Button
            v-if="t.kind === 'change' && t.branch"
            size="sm"
            variant="ghost"
            :data-testid="`diff-${t.id}`"
            @click="showDiff(t)"
          >
            {{ diffs[t.id] !== undefined ? 'Hide diff' : 'Review diff' }}
          </Button>
          <Button
            v-if="t.kind === 'change' && t.status === 'ready'"
            size="sm"
            variant="primary"
            :loading="busy[t.id]"
            :data-testid="`approve-${t.id}`"
            @click="decide(t, 'approve')"
          >
            Approve
          </Button>
          <Button
            v-if="t.status === 'ready' || t.status === 'failed'"
            size="sm"
            variant="secondary"
            :loading="busy[t.id]"
            :data-testid="`reject-${t.id}`"
            @click="decide(t, 'reject')"
          >
            Reject
          </Button>
        </div>
      </li>
    </ul>
    <p v-else-if="!tasks.loading.value" class="tp-note">No code tasks for this repository yet.</p>
  </div>
</template>

<style scoped>
.ctl {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.ctl__task {
  align-items: flex-start;
}
.ctl__answer {
  white-space: pre-wrap;
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
