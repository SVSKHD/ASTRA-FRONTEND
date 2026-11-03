<script setup lang="ts">
// The server's local clones (GET /api/code/git/repos, GET /api/code/git/ops,
// POST /api/code/git/clone, POST /api/code/git/pull). Only allowlisted repos
// appear, and the coding worker runs every op: the page queues one and follows
// it. Pull is a fetch + fast-forward of the default branch.
//
// Pushing is not offered here on purpose. A branch is pushed (with a PR) when a
// coding task is approved on the Code page, behind its approval; merging stays
// behind the approval inbox.
import { computed, ref, shallowRef } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Modal from '@/components/ui/Modal.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { aureon, errorMessage, type components } from '@/api/client'
import { must, short } from '@/control/api'
import { useNow, usePoll } from '@/control/poll'
import type { Tone } from '@/control/status'
import { ago } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

type Repo = components['schemas']['GitRepoStateOut']
type Op = components['schemas']['GitOpOut']

const now = useNow(5_000)
const repos = useLoad(async () => must(await aureon.GET('/api/code/git/repos')))
const ops = useLoad(async () =>
  must(await aureon.GET('/api/code/git/ops', { params: { query: { limit: 30 } } })),
)
const live = computed(() =>
  (ops.data.value?.items ?? []).some((o) => o.status === 'queued' || o.status === 'running'),
)
// Quick while an op is in flight, slow otherwise.
usePoll(() => {
  if (live.value) void ops.reload()
}, 3_000)
usePoll(() => {
  void ops.reload()
  void repos.reload()
}, 30_000)

function opTone(s: string): Tone {
  if (s === 'done' || s === 'succeeded') return 'success'
  if (s === 'failed') return 'danger'
  if (s === 'queued' || s === 'running') return 'info'
  return 'neutral'
}
function busyFor(repo: string): boolean {
  return (ops.data.value?.items ?? []).some(
    (o) => o.repo === repo.toLowerCase() && (o.status === 'queued' || o.status === 'running'),
  )
}

const asking = shallowRef<{ repo: Repo; op: 'clone' | 'pull' } | null>(null)
const sending = ref(false)
const error = ref('')

async function queue() {
  const a = asking.value
  if (!a) return
  sending.value = true
  error.value = ''
  try {
    const body = { repo: a.repo.repo }
    const r =
      a.op === 'clone'
        ? await aureon.POST('/api/code/git/clone', { body })
        : await aureon.POST('/api/code/git/pull', { body })
    if (!r.response.ok) {
      error.value = errorMessage(r.error, `Aureon answered ${r.response.status}`)
      return
    }
    asking.value = null
    await ops.reload()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    sending.value = false
  }
}

function opDetail(o: Op): string {
  const parts = [o.branch, o.head_sha ? short(o.head_sha) : null, o.title].filter(Boolean)
  return parts.join(' · ')
}
</script>

<template>
  <div class="tp-page">
    <Card title="Clones on the server">
      <ul v-if="repos.data.value?.length" class="tp-list">
        <li v-for="r in repos.data.value" :key="r.repo" class="tp-item">
          <div class="tp-main">
            <span class="tp-strong cc-mono">{{ r.repo }}</span>
            <span class="tp-note"
              >{{
                r.cloned ? `cloned · on ${r.default_branch ?? 'unknown branch'}` : 'not cloned'
              }}
              · pushes allowed to {{ r.push_prefixes.join(', ') || 'no branch' }}</span
            >
          </div>
          <div class="tp-row">
            <Badge
              :tone="r.cloned ? 'success' : 'neutral'"
              :label="r.cloned ? 'cloned' : 'absent'"
            />
            <Button
              v-if="r.cloned"
              size="sm"
              variant="ghost"
              :disabled="busyFor(r.repo)"
              @click="asking = { repo: r, op: 'pull' }"
              >Pull…</Button
            >
            <Button
              v-else
              size="sm"
              variant="ghost"
              :disabled="busyFor(r.repo)"
              @click="asking = { repo: r, op: 'clone' }"
              >Clone…</Button
            >
          </div>
        </li>
      </ul>
      <p v-else-if="repos.error.value" class="tp-note" role="alert">{{ repos.error.value }}</p>
      <Skeleton v-else-if="repos.loading.value" :lines="3" />
      <EmptyState
        v-else
        title="No repository is allowlisted"
        description="Add one to GITHUB_CODING_REPO_ALLOWLIST on the server."
      />
    </Card>

    <Card title="Git operations">
      <ul v-if="ops.data.value?.items.length" class="tp-list">
        <li v-for="o in ops.data.value.items" :key="o.id" class="tp-item">
          <div class="tp-main">
            <span class="tp-strong">{{ o.op }} · {{ o.repo }}</span>
            <span class="tp-note"
              >{{ opDetail(o) || '—' }} · {{ ago(o.created_at, now)
              }}{{ o.task_id ? ' · from a coding task' : '' }}</span
            >
            <a v-if="o.pr_url" class="tp-note" :href="o.pr_url" target="_blank" rel="noopener"
              >Pull request #{{ o.pr_number }}</a
            >
            <span v-if="o.error" class="tp-note" role="alert">{{ o.error }}</span>
          </div>
          <Badge :tone="opTone(o.status)" :label="o.status" />
        </li>
      </ul>
      <p v-else-if="ops.error.value" class="tp-note" role="alert">{{ ops.error.value }}</p>
      <Skeleton v-else-if="ops.loading.value" :lines="3" />
      <p v-else class="tp-note">No git operation has run yet.</p>
    </Card>

    <Modal
      :open="!!asking"
      :title="asking?.op === 'clone' ? 'Clone this repository?' : 'Pull the default branch?'"
      size="sm"
      @close="asking = null"
    >
      <div v-if="asking" class="cc-form">
        <p class="tp-note">
          <template v-if="asking.op === 'clone'"
            >The coding worker clones {{ asking.repo.repo }} onto the server.</template
          >
          <template v-else
            >The coding worker fetches {{ asking.repo.repo }} and fast-forwards
            {{ asking.repo.default_branch ?? 'its default branch' }}. Nothing is pushed.</template
          >
        </p>
        <p v-if="error" class="cc-notice cc-notice--danger" role="alert">{{ error }}</p>
        <div class="tp-row">
          <Button variant="primary" :loading="sending" @click="queue">{{
            asking.op === 'clone' ? 'Clone' : 'Pull'
          }}</Button>
          <Button variant="ghost" @click="asking = null">Cancel</Button>
        </div>
      </div>
    </Modal>
  </div>
</template>
