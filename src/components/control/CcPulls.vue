<script setup lang="ts">
// Pull requests on the selected repo: list, detail, changed files, the unified
// diff, comments and reviews, and create. Merge is never direct: it files an
// approval request (202) and shows "Approval required" with a link into the
// inbox, where an admin approves it with their password.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Modal from '@/components/ui/Modal.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import TextArea from '@/components/ui/TextArea.vue'
import TextInput from '@/components/ui/TextInput.vue'
import ApprovalRequired from '@/components/control/ApprovalRequired.vue'
import DiffViewer from '@/components/control/DiffViewer.vue'
import { aureon } from '@/api/client'
import { cc, must, repoParams, short, type Gated } from '@/control/api'
import { repos } from '@/control/repos'
import { ago, when } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

const route = useRoute()
const router = useRouter()
/** The answer to the last merge request on this PR: an approval waiting. */
const gated = ref<Gated | null>(null)
const number = computed(() => Number(route.query.n) || 0)
function openPull(n: number) {
  void router.push({ query: { ...route.query, n: String(n) } })
}
function back() {
  const q = { ...route.query }
  delete q.n
  void router.push({ query: q })
}

// ── list ────────────────────────────────────────────────────────────────────
const state = ref<'open' | 'closed' | 'all'>('open')
const page = ref(1)
const list = useLoad(async () => {
  const p = repoParams()
  if (!p) return null
  return must(
    await aureon.GET('/api/v1/github/repositories/{owner}/{repo}/pulls', {
      params: { path: p, query: { state: state.value, page: page.value, per_page: 30 } },
    }),
  )
}, false)
watch([() => cc.repo, state, page], () => void list.reload(), { immediate: true })
watch([() => cc.repo, state], () => (page.value = 1))

// ── detail ──────────────────────────────────────────────────────────────────
const path = () => ({ ...repoParams()!, n: number.value })
const detail = useLoad(async () => {
  if (!repoParams() || !number.value) return null
  return must(
    await aureon.GET('/api/v1/github/repositories/{owner}/{repo}/pulls/{n}', {
      params: { path: path() },
    }),
  )
}, false)

type Pane = 'conversation' | 'files' | 'diff' | 'reviews'
const pane = ref<Pane>('conversation')
const conversation = useLoad(async () => {
  const [issue, review] = await Promise.all([
    aureon.GET('/api/v1/github/repositories/{owner}/{repo}/pulls/{n}/issue-comments', {
      params: { path: path() },
    }),
    aureon.GET('/api/v1/github/repositories/{owner}/{repo}/pulls/{n}/comments', {
      params: { path: path() },
    }),
  ])
  return { issue: must(issue), review: must(review) }
}, false)
const files = useLoad(
  async () =>
    must(
      await aureon.GET('/api/v1/github/repositories/{owner}/{repo}/pulls/{n}/files', {
        params: { path: path() },
      }),
    ),
  false,
)
const diff = useLoad(
  async () =>
    must(
      await aureon.GET('/api/v1/github/repositories/{owner}/{repo}/pulls/{n}/diff', {
        params: { path: path() },
      }),
    ),
  false,
)
const reviews = useLoad(
  async () =>
    must(
      await aureon.GET('/api/v1/github/repositories/{owner}/{repo}/pulls/{n}/reviews', {
        params: { path: path() },
      }),
    ),
  false,
)
const LOADERS = { conversation, files, diff, reviews }

watch(
  [() => cc.repo, number],
  () => {
    gated.value = null
    if (!number.value) return
    void detail.reload()
    for (const l of Object.values(LOADERS)) l.data.value = null
    void LOADERS[pane.value].reload()
  },
  { immediate: true },
)
watch(pane, (p) => {
  if (number.value && !LOADERS[p].data.value) void LOADERS[p].reload()
})

const openFile = ref('')
const busy = ref(false)
const actionError = ref('')

const comment = ref('')
async function postComment() {
  if (!comment.value.trim()) return
  busy.value = true
  actionError.value = ''
  try {
    must(
      await aureon.POST('/api/v1/github/repositories/{owner}/{repo}/pulls/{n}/issue-comments', {
        params: { path: path() },
        body: { body: comment.value },
      }),
    )
    comment.value = ''
    await conversation.reload()
  } catch (e) {
    actionError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

const reviewEvent = ref<'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES'>('COMMENT')
const reviewBody = ref('')
async function submitReview() {
  if (reviewEvent.value !== 'APPROVE' && !reviewBody.value.trim()) {
    actionError.value = 'A comment or a change request needs a message.'
    return
  }
  busy.value = true
  actionError.value = ''
  try {
    must(
      await aureon.POST('/api/v1/github/repositories/{owner}/{repo}/pulls/{n}/reviews', {
        params: { path: path() },
        body: { event: reviewEvent.value, body: reviewBody.value || null },
      }),
    )
    reviewBody.value = ''
    await reviews.reload()
  } catch (e) {
    actionError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

// ── gated merge ─────────────────────────────────────────────────────────────
const merging = ref(false)
const mergeMethod = ref<'merge' | 'squash' | 'rebase'>('squash')
async function requestMerge() {
  const pr = detail.data.value
  if (!pr?.head.sha) return
  busy.value = true
  actionError.value = ''
  try {
    // The only merge call there is: Aureon files an approval request and
    // answers 202. Nothing merges until an admin approves it with a password.
    gated.value = must(
      await aureon.POST('/api/v1/github/repositories/{owner}/{repo}/pulls/{n}/merge', {
        params: { path: path() },
        body: { merge_method: mergeMethod.value, expected_head_sha: pr.head.sha },
      }),
    )
    merging.value = false
  } catch (e) {
    actionError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

// ── create ──────────────────────────────────────────────────────────────────
const creating = ref(false)
const form = ref({ head: '', base: '', title: '', body: '', draft: false })
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
function startCreate() {
  const def = repos.items.find((r) => r.full_name === cc.repo)?.default_branch ?? ''
  form.value = { head: '', base: def, title: '', body: '', draft: false }
  actionError.value = ''
  creating.value = true
  void branches.reload()
}
async function saveCreate() {
  const p = repoParams()
  if (!p || !form.value.head || !form.value.base || !form.value.title.trim()) return
  busy.value = true
  actionError.value = ''
  try {
    const made = must(
      await aureon.POST('/api/v1/github/repositories/{owner}/{repo}/pulls', {
        params: { path: p },
        body: {
          head: form.value.head,
          base: form.value.base,
          title: form.value.title.trim(),
          body: form.value.body || null,
          draft: form.value.draft,
        },
      }),
    )
    creating.value = false
    void list.reload()
    openPull(made.number)
  } catch (e) {
    actionError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

function stateLabel(p: { state: string; merged?: boolean; draft: boolean }) {
  return p.merged ? 'merged' : p.draft && p.state === 'open' ? 'draft' : p.state
}
</script>

<template>
  <div class="tp-page">
    <EmptyState
      v-if="!cc.repo"
      title="No repository selected"
      description="Pick an allowlisted repository in the header."
    />

    <!-- detail -->
    <template v-else-if="number">
      <div class="tp-row">
        <Button size="sm" variant="ghost" @click="back">All pull requests</Button>
        <Button
          size="sm"
          variant="ghost"
          @click="router.push({ path: '/dev/reviews', query: { pr: String(number) } })"
          >Claude reviews</Button
        >
      </div>
      <Card
        v-if="detail.data.value"
        :title="`#${detail.data.value.number} ${detail.data.value.title}`"
      >
        <div class="tp-row">
          <Badge
            :tone="
              detail.data.value.merged
                ? 'info'
                : detail.data.value.state === 'open'
                  ? 'success'
                  : 'neutral'
            "
            :label="stateLabel(detail.data.value)"
          />
          <span class="tp-note"
            >{{ detail.data.value.head.ref }} → {{ detail.data.value.base.ref }} · head
            {{ short(detail.data.value.head.sha) }}</span
          >
        </div>
        <p class="tp-note tp-num">
          {{ detail.data.value.commits ?? '?' }} commits ·
          {{ detail.data.value.changed_files ?? '?' }} files · +{{
            detail.data.value.additions ?? 0
          }}
          −{{ detail.data.value.deletions ?? 0 }} · mergeable:
          {{ detail.data.value.mergeable_state ?? detail.data.value.mergeable ?? 'unknown' }}
        </p>
        <p v-if="detail.data.value.body" class="cc-body">{{ detail.data.value.body }}</p>
        <ApprovalRequired v-if="gated" :gated="gated" />
        <div
          v-else-if="detail.data.value.state === 'open' && !detail.data.value.merged"
          class="tp-row"
        >
          <Button size="sm" variant="secondary" @click="merging = true">Request merge</Button>
          <span class="tp-note">Merging needs an approval with your password.</span>
        </div>
        <p v-if="actionError" class="tp-note" role="alert">{{ actionError }}</p>
      </Card>
      <p v-else-if="detail.error.value" class="tp-note" role="alert">{{ detail.error.value }}</p>

      <SegmentedControl
        v-model="pane"
        as="tablist"
        size="sm"
        aria-label="Pull request view"
        :options="[
          { value: 'conversation', label: 'Conversation' },
          { value: 'files', label: 'Files' },
          { value: 'diff', label: 'Diff' },
          { value: 'reviews', label: 'Reviews' },
        ]"
      />

      <Card v-if="pane === 'conversation'" title="Conversation">
        <template v-if="conversation.data.value">
          <ul v-if="conversation.data.value.issue.length" class="tp-list">
            <li v-for="c in conversation.data.value.issue" :key="c.id" class="tp-item">
              <div class="tp-main">
                <span class="tp-note">{{ c.user ?? '—' }} · {{ when(c.created_at) }}</span>
                <p class="cc-body">{{ c.body }}</p>
              </div>
            </li>
          </ul>
          <p v-else class="tp-note">No comments yet.</p>
          <template v-if="conversation.data.value.review.length">
            <h3 class="tp-title">Review comments</h3>
            <ul class="tp-list">
              <li v-for="c in conversation.data.value.review" :key="c.id" class="tp-item">
                <div class="tp-main">
                  <span class="tp-note"
                    >{{ c.user ?? '—' }} · {{ c.path }}{{ c.line ? `:${c.line}` : '' }} ·
                    {{ when(c.created_at) }}</span
                  >
                  <p class="cc-body">{{ c.body }}</p>
                </div>
              </li>
            </ul>
          </template>
        </template>
        <p v-else-if="conversation.error.value" class="tp-note" role="alert">
          {{ conversation.error.value }}
        </p>
        <form class="cc-form" @submit.prevent="postComment">
          <TextArea
            v-model="comment"
            :rows="3"
            placeholder="Write a comment"
            aria-label="Comment"
          />
          <div class="tp-row">
            <Button size="sm" type="submit" variant="primary" :disabled="busy || !comment.trim()"
              >Comment</Button
            >
          </div>
        </form>
      </Card>

      <Card v-else-if="pane === 'files'" title="Changed files">
        <ul v-if="files.data.value?.length" class="tp-list">
          <li v-for="f in files.data.value" :key="f.filename" class="cc-stack">
            <div class="tp-item">
              <div class="tp-main">
                <span class="tp-strong">{{ f.filename }}</span>
                <span class="tp-note tp-num"
                  >{{ f.status }} · +{{ f.additions }} −{{ f.deletions }}</span
                >
              </div>
              <Button
                v-if="f.patch"
                size="sm"
                variant="ghost"
                @click="openFile = openFile === f.filename ? '' : f.filename"
                >{{ openFile === f.filename ? 'Hide' : 'Patch' }}</Button
              >
            </div>
            <DiffViewer
              v-if="openFile === f.filename && f.patch"
              :text="f.patch"
              :truncated="f.patch_truncated"
              :label="`Patch for ${f.filename}`"
            />
          </li>
        </ul>
        <p v-else-if="files.error.value" class="tp-note" role="alert">{{ files.error.value }}</p>
        <p v-else-if="!files.loading.value" class="tp-note">No files changed.</p>
      </Card>

      <Card v-else-if="pane === 'diff'" title="Diff">
        <template v-if="diff.data.value">
          <p v-if="diff.data.value.too_large_upstream" class="tp-note">
            GitHub refused this diff as too large. Read it on GitHub.
          </p>
          <DiffViewer
            v-else
            :text="diff.data.value.diff"
            :truncated="diff.data.value.truncated"
            label="Pull request diff"
          />
        </template>
        <p v-else-if="diff.error.value" class="tp-note" role="alert">{{ diff.error.value }}</p>
      </Card>

      <Card v-else title="Reviews">
        <ul v-if="reviews.data.value?.length" class="tp-list">
          <li v-for="r in reviews.data.value" :key="r.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-note">{{ r.user ?? '—' }} · {{ when(r.submitted_at) }}</span>
              <p v-if="r.body" class="cc-body">{{ r.body }}</p>
            </div>
            <Badge :label="r.state ?? '—'" />
          </li>
        </ul>
        <p v-else-if="reviews.error.value" class="tp-note" role="alert">
          {{ reviews.error.value }}
        </p>
        <p v-else-if="!reviews.loading.value" class="tp-note">No reviews yet.</p>
        <form class="cc-form" @submit.prevent="submitReview">
          <SegmentedControl
            v-model="reviewEvent"
            size="sm"
            aria-label="Review type"
            :options="[
              { value: 'COMMENT', label: 'Comment' },
              { value: 'APPROVE', label: 'Approve' },
              { value: 'REQUEST_CHANGES', label: 'Request changes' },
            ]"
          />
          <TextArea
            v-model="reviewBody"
            :rows="3"
            placeholder="Review message"
            aria-label="Review message"
          />
          <div class="tp-row">
            <Button size="sm" type="submit" variant="primary" :disabled="busy"
              >Submit review</Button
            >
          </div>
        </form>
      </Card>
    </template>

    <!-- list -->
    <template v-else>
      <div class="tp-head">
        <SegmentedControl
          v-model="state"
          size="sm"
          aria-label="Pull request state"
          :options="[
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
            { value: 'all', label: 'All' },
          ]"
        />
        <Button size="sm" variant="primary" @click="startCreate">New pull request</Button>
      </div>
      <Card>
        <ul v-if="list.data.value?.items.length" class="tp-list">
          <li v-for="p in list.data.value.items" :key="p.number" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">#{{ p.number }} {{ p.title }}</span>
              <span class="tp-note"
                >{{ stateLabel(p) }} · {{ p.head.ref }} → {{ p.base.ref }} · {{ p.user ?? '—' }} ·
                updated {{ ago(p.updated_at) }}</span
              >
            </div>
            <Button size="sm" variant="ghost" @click="openPull(p.number)">Open</Button>
          </li>
        </ul>
        <p v-else-if="list.error.value" class="tp-note" role="alert">{{ list.error.value }}</p>
        <p v-else-if="!list.loading.value" class="tp-note">
          No {{ state === 'all' ? '' : state }} pull requests.
        </p>
      </Card>
      <div v-if="list.data.value && (page > 1 || list.data.value.has_next)" class="tp-row">
        <Button size="sm" variant="ghost" :disabled="page <= 1" @click="page--">Previous</Button>
        <span class="tp-note">Page {{ page }}</span>
        <Button size="sm" variant="ghost" :disabled="!list.data.value.has_next" @click="page++"
          >Next</Button
        >
      </div>
    </template>

    <Modal :open="merging" title="Request merge" @close="merging = false">
      <div class="cc-form">
        <p class="tp-note">
          This files an approval request; nothing merges yet. An admin approves it in the inbox with
          their password, and only if the head is still {{ short(detail.data.value?.head.sha) }}.
        </p>
        <SegmentedControl
          v-model="mergeMethod"
          aria-label="Merge method"
          :options="[
            { value: 'squash', label: 'Squash' },
            { value: 'merge', label: 'Merge commit' },
            { value: 'rebase', label: 'Rebase' },
          ]"
        />
        <p v-if="actionError" class="tp-note" role="alert">{{ actionError }}</p>
        <div class="tp-row">
          <Button variant="primary" :loading="busy" @click="requestMerge">Request approval</Button>
        </div>
      </div>
    </Modal>

    <Modal :open="creating" title="New pull request" @close="creating = false">
      <form class="cc-form" @submit.prevent="saveCreate">
        <Select
          v-model="form.head"
          :options="branchOptions"
          placeholder="From branch"
          aria-label="Head branch"
        />
        <Select
          v-model="form.base"
          :options="branchOptions"
          placeholder="Into branch"
          aria-label="Base branch"
        />
        <TextInput v-model="form.title" placeholder="Title" aria-label="Title" />
        <TextArea
          v-model="form.body"
          :rows="5"
          placeholder="Description"
          aria-label="Description"
        />
        <Switch v-model="form.draft" label="Open as a draft" />
        <p v-if="actionError" class="tp-note" role="alert">{{ actionError }}</p>
        <div class="tp-row">
          <Button
            type="submit"
            variant="primary"
            :loading="busy"
            :disabled="!form.head || !form.base || !form.title.trim()"
            >Create pull request</Button
          >
        </div>
      </form>
    </Modal>
  </div>
</template>
