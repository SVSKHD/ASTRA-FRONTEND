<script setup lang="ts">
// Issues on the selected repo: list and filter, a detail with comments, create,
// edit, close / reopen, comment, labels, and links to Spasta tasks. Every write
// goes to Aureon, which sends it to GitHub and records it as a tracked
// operation; none of these is gated.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Chip from '@/components/ui/Chip.vue'
import Combobox from '@/components/ui/Combobox.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Modal from '@/components/ui/Modal.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import TextArea from '@/components/ui/TextArea.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { aureon } from '@/api/client'
import { cc, must, repoParams } from '@/control/api'
import { loadTasks, type TaskOption } from '@/control/tasks'
import { ago, when } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

const route = useRoute()
const router = useRouter()
const number = computed(() => Number(route.query.n) || 0)
function openIssue(n: number) {
  void router.push({ query: { ...route.query, n: String(n) } })
}
function back() {
  const q = { ...route.query }
  delete q.n
  void router.push({ query: q })
}

// ── list ────────────────────────────────────────────────────────────────────
const state = ref<'open' | 'closed' | 'all'>('open')
const labelFilter = ref('')
const page = ref(1)
const list = useLoad(async () => {
  const p = repoParams()
  if (!p) return null
  return must(
    await aureon.GET('/api/v1/github/repositories/{owner}/{repo}/issues', {
      params: {
        path: p,
        query: {
          state: state.value,
          page: page.value,
          per_page: 30,
          ...(labelFilter.value.trim() ? { labels: labelFilter.value.trim() } : {}),
        },
      },
    }),
  )
}, false)
watch([() => cc.repo, state, page], () => void list.reload(), { immediate: true })
watch([() => cc.repo, state], () => (page.value = 1))

// ── detail ──────────────────────────────────────────────────────────────────
const detail = useLoad(async () => {
  const p = repoParams()
  if (!p || !number.value) return null
  return must(
    await aureon.GET('/api/v1/github/repositories/{owner}/{repo}/issues/{n}', {
      params: { path: { ...p, n: number.value } },
    }),
  )
}, false)
watch([() => cc.repo, number], () => void detail.reload(), { immediate: true })

const busy = ref(false)
const actionError = ref('')
async function act(fn: () => Promise<unknown>) {
  busy.value = true
  actionError.value = ''
  try {
    await fn()
    await detail.reload()
  } catch (e) {
    actionError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
const path = () => ({ ...repoParams()!, n: number.value })

const comment = ref('')
function postComment() {
  if (!comment.value.trim()) return
  void act(async () => {
    must(
      await aureon.POST('/api/v1/github/repositories/{owner}/{repo}/issues/{n}/comments', {
        params: { path: path() },
        body: { body: comment.value },
      }),
    )
    comment.value = ''
  })
}

const closeReason = ref<'completed' | 'not_planned'>('completed')
function closeIssue() {
  void act(async () =>
    must(
      await aureon.POST('/api/v1/github/repositories/{owner}/{repo}/issues/{n}/close', {
        params: { path: path() },
        body: { state_reason: closeReason.value },
      }),
    ),
  )
}
function reopenIssue() {
  void act(async () =>
    must(
      await aureon.POST('/api/v1/github/repositories/{owner}/{repo}/issues/{n}/reopen', {
        params: { path: path() },
      }),
    ),
  )
}

const newLabel = ref('')
function addLabel() {
  const labels = newLabel.value
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean)
  if (!labels.length) return
  void act(async () => {
    must(
      await aureon.POST('/api/v1/github/repositories/{owner}/{repo}/issues/{n}/labels', {
        params: { path: path() },
        body: { labels },
      }),
    )
    newLabel.value = ''
  })
}
function removeLabel(name: string) {
  void act(async () =>
    must(
      await aureon.DELETE('/api/v1/github/repositories/{owner}/{repo}/issues/{n}/labels/{name}', {
        params: { path: { ...path(), name } },
      }),
    ),
  )
}

// ── edit / create ───────────────────────────────────────────────────────────
const editing = ref(false)
const creating = ref(false)
const form = ref({ title: '', body: '', labels: '' })
function startEdit() {
  const d = detail.data.value
  if (!d) return
  form.value = { title: d.title, body: d.body ?? '', labels: '' }
  editing.value = true
}
function saveEdit() {
  void act(async () => {
    must(
      await aureon.PATCH('/api/v1/github/repositories/{owner}/{repo}/issues/{n}', {
        params: { path: path() },
        body: { title: form.value.title, body: form.value.body },
      }),
    )
    editing.value = false
  })
}
function startCreate() {
  form.value = { title: '', body: '', labels: '' }
  actionError.value = ''
  creating.value = true
}
async function saveCreate() {
  const p = repoParams()
  if (!p || !form.value.title.trim()) return
  busy.value = true
  actionError.value = ''
  try {
    const labels = form.value.labels
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean)
    const made = must(
      await aureon.POST('/api/v1/github/repositories/{owner}/{repo}/issues', {
        params: { path: p },
        body: {
          title: form.value.title.trim(),
          body: form.value.body || null,
          ...(labels.length ? { labels } : {}),
        },
      }),
    )
    creating.value = false
    void list.reload()
    openIssue(made.number)
  } catch (e) {
    actionError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

// ── task links ──────────────────────────────────────────────────────────────
const tasks = ref<TaskOption[]>([])
const tasksError = ref('')
const taskPick = ref('')
const taskOptions = computed(() =>
  tasks.value.map((t) => ({ value: t.ref, label: t.done ? `${t.title} (done)` : t.title })),
)
const taskTitle = (ref_: string) => tasks.value.find((t) => t.ref === ref_)?.title
watch(
  number,
  async (n) => {
    if (!n || tasks.value.length) return
    try {
      tasks.value = await loadTasks()
    } catch (e) {
      tasksError.value = (e as Error).message
    }
  },
  { immediate: true },
)
function linkTask() {
  const pick = taskPick.value.trim()
  const ref_ = tasks.value.some((t) => t.ref === pick) ? pick : /^\d+$/.test(pick) ? pick : ''
  if (!ref_) {
    actionError.value = 'Pick a task from the list, or type its id.'
    return
  }
  void act(async () => {
    must(
      await aureon.POST('/api/v1/github/repositories/{owner}/{repo}/issues/{n}/links', {
        params: { path: path() },
        body: { task_ref: ref_, task_kind: 'spasta_task' },
      }),
    )
    taskPick.value = ''
  })
}
function unlink(taskRef: string) {
  void act(async () => {
    const r = await aureon.DELETE('/api/v1/github/repositories/{owner}/{repo}/issues/{n}/links', {
      params: { path: path(), query: { task_ref: taskRef } },
    })
    if (!r.response.ok && r.response.status !== 404) must(r)
  })
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
        <Button size="sm" variant="ghost" @click="back">All issues</Button>
      </div>
      <Card
        v-if="detail.data.value"
        :title="`#${detail.data.value.number} ${detail.data.value.title}`"
      >
        <div class="tp-row">
          <Badge
            :tone="detail.data.value.state === 'open' ? 'success' : 'neutral'"
            :label="
              detail.data.value.state_reason
                ? `${detail.data.value.state} · ${detail.data.value.state_reason}`
                : detail.data.value.state
            "
          />
          <span class="tp-note"
            >{{ detail.data.value.user ?? '—' }} · opened
            {{ ago(detail.data.value.created_at) }}</span
          >
        </div>
        <p v-if="detail.data.value.body" class="cc-body">{{ detail.data.value.body }}</p>
        <p v-else class="tp-note">No description.</p>

        <div class="tp-row" aria-label="Labels">
          <Chip
            v-for="l in detail.data.value.labels"
            :key="l"
            :label="l"
            size="sm"
            removable
            @remove="removeLabel(l)"
          />
          <span v-if="!detail.data.value.labels.length" class="tp-note">No labels.</span>
        </div>
        <form class="tp-row" @submit.prevent="addLabel">
          <TextInput v-model="newLabel" size="sm" placeholder="bug, ui" aria-label="Add labels" />
          <Button size="sm" type="submit" variant="secondary" :disabled="busy">Add label</Button>
        </form>

        <div class="tp-row">
          <Button size="sm" variant="secondary" :disabled="busy" @click="startEdit">Edit</Button>
          <template v-if="detail.data.value.state === 'open'">
            <SegmentedControl
              v-model="closeReason"
              size="sm"
              aria-label="Close reason"
              :options="[
                { value: 'completed', label: 'Completed' },
                { value: 'not_planned', label: 'Not planned' },
              ]"
            />
            <Button size="sm" variant="danger" :disabled="busy" @click="closeIssue"
              >Close issue</Button
            >
          </template>
          <Button v-else size="sm" variant="secondary" :disabled="busy" @click="reopenIssue"
            >Reopen</Button
          >
        </div>
        <p v-if="actionError" class="tp-note" role="alert">{{ actionError }}</p>
      </Card>
      <p v-else-if="detail.error.value" class="tp-note" role="alert">{{ detail.error.value }}</p>

      <Card v-if="detail.data.value" title="Linked Spasta tasks">
        <ul v-if="detail.data.value.links.length" class="tp-list">
          <li v-for="l in detail.data.value.links" :key="l.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ taskTitle(l.task_ref) ?? `Task ${l.task_ref}` }}</span>
              <span class="tp-note">task {{ l.task_ref }} · linked {{ ago(l.created_at) }}</span>
            </div>
            <Button size="sm" variant="ghost" :disabled="busy" @click="unlink(l.task_ref)"
              >Unlink</Button
            >
          </li>
        </ul>
        <p v-else class="tp-note">This issue is not linked to a task yet.</p>
        <form class="cc-form" @submit.prevent="linkTask">
          <Combobox
            v-model="taskPick"
            :options="taskOptions"
            size="sm"
            placeholder="Find a task by title"
            empty-text="No task matches"
            aria-label="Task to link"
          />
          <div class="tp-row">
            <Button size="sm" type="submit" variant="secondary" :disabled="busy">Link task</Button>
            <span v-if="tasksError" class="tp-note" role="alert">{{ tasksError }}</span>
            <span v-else-if="!tasks.length" class="tp-note"
              >No workspace tasks were found; type a task id instead.</span
            >
          </div>
        </form>
      </Card>

      <Card v-if="detail.data.value" title="Comments">
        <ul v-if="detail.data.value.comment_list.length" class="tp-list">
          <li v-for="c in detail.data.value.comment_list" :key="c.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-note">{{ c.user ?? '—' }} · {{ when(c.created_at) }}</span>
              <p class="cc-body">{{ c.body }}</p>
            </div>
          </li>
        </ul>
        <p v-else class="tp-note">No comments yet.</p>
        <p v-if="detail.data.value.comments_truncated" class="tp-note">
          Only the first 300 comments are shown.
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
    </template>

    <!-- list -->
    <template v-else>
      <div class="tp-head">
        <SegmentedControl
          v-model="state"
          size="sm"
          aria-label="Issue state"
          :options="[
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
            { value: 'all', label: 'All' },
          ]"
        />
        <Button size="sm" variant="primary" @click="startCreate">New issue</Button>
      </div>
      <form class="tp-row" @submit.prevent="list.reload()">
        <TextInput
          v-model="labelFilter"
          size="sm"
          placeholder="Labels, comma-separated"
          aria-label="Filter by labels"
        />
        <Button size="sm" type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        <ul v-if="list.data.value?.items.length" class="tp-list">
          <li v-for="i in list.data.value.items" :key="i.number" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">#{{ i.number }} {{ i.title }}</span>
              <span class="tp-note"
                >{{ i.state }} · {{ i.user ?? '—' }} · {{ i.comments }} comments · updated
                {{ ago(i.updated_at)
                }}{{ i.labels.length ? ` · ${i.labels.join(', ')}` : '' }}</span
              >
            </div>
            <Button size="sm" variant="ghost" @click="openIssue(i.number)">Open</Button>
          </li>
        </ul>
        <p v-else-if="list.error.value" class="tp-note" role="alert">{{ list.error.value }}</p>
        <p v-else-if="!list.loading.value" class="tp-note">
          No {{ state === 'all' ? '' : state }} issues match.
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

    <Modal
      :open="creating || editing"
      :title="creating ? 'New issue' : 'Edit issue'"
      @close="creating = editing = false"
    >
      <form class="cc-form" @submit.prevent="creating ? saveCreate() : saveEdit()">
        <TextInput v-model="form.title" placeholder="Title" aria-label="Title" />
        <TextArea
          v-model="form.body"
          :rows="6"
          placeholder="Description"
          aria-label="Description"
        />
        <TextInput
          v-if="creating"
          v-model="form.labels"
          placeholder="Labels, comma-separated"
          aria-label="Labels"
        />
        <p v-if="actionError" class="tp-note" role="alert">{{ actionError }}</p>
        <div class="tp-row">
          <Button type="submit" variant="primary" :loading="busy" :disabled="!form.title.trim()">{{
            creating ? 'Create issue' : 'Save'
          }}</Button>
        </div>
      </form>
    </Modal>
  </div>
</template>
