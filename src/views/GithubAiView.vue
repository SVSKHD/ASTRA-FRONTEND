<script setup lang="ts">
// /github-ai — the GitHub AI workspace (admins; GitHub on Aureon is admin-only).
//
// Pick a repository and branch from Aureon's allowlist, browse its files, and ask:
//   - explain a file, find bugs and TODOs, map the architecture, summarize commits,
//     review a pull request — streamed from Claude through /api/ai/chat in the answer
//     panel (AiAnswer), every bit of quoted material read from GitHub via Aureon;
//   - a Claude review of a pull request, run by the server (POST …/claude-review);
//   - a change: a code task on the server's clone, tested on its own branch, and kept
//     only when an admin reads the diff and approves it (CodeTaskList). Nothing here
//     writes to GitHub directly.
//
// Query: ?repo=owner/name&ref=branch&path=file&tab=files|pulls|changes&do=explain|change
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AureonPage from '@/components/AureonPage.vue'
import AiAnswer from '@/components/github/AiAnswer.vue'
import CodeTaskList from '@/components/code/CodeTaskList.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SearchField from '@/components/ui/SearchField.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import TextArea from '@/components/ui/TextArea.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { aureon } from '@/api/client'
import { must } from '@/trading/useLoad'
import { ago } from '@/trading/format'
import { ghApi, type GhPullOut, type GhPullFile, type GhRepositoryOut } from '@/github/aureon'
import { searchPaths, type GhTreeEntry } from '@/utils/ghCode'
import {
  architectureAsk,
  bugsAsk,
  codingRepoFor,
  commitsAsk,
  explainAsk,
  findTodos,
  reviewAsk,
  type Ask,
  type GitRepoState,
} from '@/github/workspace'
import { tradingSession, isAdmin } from '@/trading/session'

const route = useRoute()
const router = useRouter()
const q = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')
function setQuery(patch: Record<string, string | undefined>) {
  const next = { ...route.query, ...patch }
  for (const k of Object.keys(next)) if (!next[k]) delete next[k]
  void router.replace({ query: next })
}

// ---- repository and branch -----------------------------------------------------------
const repos = ref<GhRepositoryOut[]>([])
const reposError = ref('')
const repo = computed(() => q('repo') || repos.value[0]?.full_name || '')
const current = computed(() => repos.value.find((r) => r.full_name === repo.value) ?? null)
const owner = computed(() => current.value?.owner ?? repo.value.split('/')[0] ?? '')
const name = computed(() => current.value?.name ?? repo.value.split('/')[1] ?? '')
const branches = ref<string[]>([])
const branch = computed(() => q('ref') || current.value?.default_branch || branches.value[0] || '')

async function loadRepos() {
  reposError.value = ''
  try {
    repos.value = (await ghApi.repositories({ limit: 200 })).items.filter((r) => !r.archived)
  } catch (e) {
    reposError.value = (e as Error).message
  }
}

const repoOptions = computed(() =>
  repos.value.map((r) => ({ value: r.full_name, label: r.full_name })),
)
const branchOptions = computed(() => branches.value.map((b) => ({ value: b, label: b })))

// ---- files ------------------------------------------------------------------------
const entries = ref<GhTreeEntry[]>([])
const truncated = ref(false)
const treeError = ref('')
const loadingTree = ref(false)
const find = ref('')
const dir = ref('')
let treeCtl: AbortController | null = null

async function loadTree() {
  if (!owner.value || !name.value || !branch.value) return
  treeCtl?.abort()
  const ctl = (treeCtl = new AbortController())
  loadingTree.value = true
  treeError.value = ''
  try {
    const t = await ghApi.tree(
      owner.value,
      name.value,
      { ref: branch.value, recursive: true },
      { signal: ctl.signal },
    )
    entries.value = t.entries as GhTreeEntry[]
    truncated.value = t.truncated
  } catch (e) {
    if (!ctl.signal.aborted) treeError.value = (e as Error).message
  } finally {
    if (treeCtl === ctl) loadingTree.value = false
  }
}

const listing = computed(() => {
  if (find.value.trim()) {
    return searchPaths(entries.value, find.value).map((p) => ({ path: p, type: 'blob', name: p }))
  }
  const prefix = dir.value ? `${dir.value}/` : ''
  const seen = new Map<string, { path: string; type: string; name: string }>()
  for (const e of entries.value) {
    if (!e.path.startsWith(prefix)) continue
    const rest = e.path.slice(prefix.length)
    const [head, ...more] = rest.split('/')
    if (!head) continue
    const isDir = more.length > 0 || e.type === 'tree'
    const key = `${prefix}${head}`
    if (!seen.has(key)) seen.set(key, { path: key, type: isDir ? 'tree' : 'blob', name: head })
  }
  return [...seen.values()].sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'tree' ? -1 : 1,
  )
})
function openEntry(e: { path: string; type: string }) {
  if (e.type === 'tree') {
    dir.value = e.path
    find.value = ''
  } else setQuery({ path: e.path })
}
function up() {
  dir.value = dir.value.split('/').slice(0, -1).join('/')
}

const filePath = computed(() => q('path'))
const fileText = ref<string | null>(null)
const fileNote = ref('')
const loadingFile = ref(false)
let fileCtl: AbortController | null = null
async function loadFile() {
  fileText.value = null
  fileNote.value = ''
  if (!filePath.value || !owner.value) return
  fileCtl?.abort()
  const ctl = (fileCtl = new AbortController())
  loadingFile.value = true
  try {
    const c = await ghApi.contents(owner.value, name.value, filePath.value, branch.value, {
      signal: ctl.signal,
    })
    if (c.type !== 'file') fileNote.value = `That is a ${c.type}, not a file.`
    else if (c.content_kind !== 'text') {
      fileNote.value = c.content_kind === 'too_large' ? 'Too large to read here.' : 'A binary file.'
    } else fileText.value = c.text ?? ''
  } catch (e) {
    if (!ctl.signal.aborted) fileNote.value = (e as Error).message
  } finally {
    if (fileCtl === ctl) loadingFile.value = false
  }
}
const todos = computed(() => (fileText.value ? findTodos(fileText.value) : []))
const PREVIEW_LINES = 400
const previewLines = computed(() => (fileText.value ?? '').split(/\r?\n/).slice(0, PREVIEW_LINES))

// ---- the AI actions ----------------------------------------------------------------
const ask = ref<Ask | null>(null)
const actionError = ref('')
function explain() {
  if (fileText.value != null)
    ask.value = explainAsk(repo.value, branch.value, filePath.value, fileText.value)
}
function bugs() {
  if (fileText.value != null)
    ask.value = bugsAsk(repo.value, branch.value, filePath.value, fileText.value, todos.value)
}
async function architecture() {
  actionError.value = ''
  const readme = entries.value.find((e) => e.type === 'blob' && /^readme(\.md)?$/i.test(e.path))
  let text: string | null = null
  if (readme) {
    try {
      const c = await ghApi.contents(owner.value, name.value, readme.path, branch.value)
      text = c.content_kind === 'text' ? (c.text ?? null) : null
    } catch {
      text = null
    }
  }
  const files = entries.value.filter((e) => e.type === 'blob').map((e) => e.path)
  ask.value = architectureAsk(repo.value, branch.value, files, text)
}
async function summarizeCommits() {
  actionError.value = ''
  try {
    const list = await ghApi.commits(owner.value, name.value, { sha: branch.value, per_page: 30 })
    if (!list.length) {
      actionError.value = 'No commits on this branch.'
      return
    }
    ask.value = commitsAsk(
      repo.value,
      branch.value,
      list.map((c) => ({
        sha: c.sha,
        message: c.message.split('\n')[0],
        author: c.author_login ?? c.author_name ?? '',
        date: c.authored_at ?? c.committed_at ?? '',
      })),
    )
  } catch (e) {
    actionError.value = (e as Error).message
  }
}

// ---- pull requests -----------------------------------------------------------------
const pulls = ref<GhPullOut[]>([])
const pullsError = ref('')
const openPull = ref<GhPullOut | null>(null)
const pullFiles = ref<GhPullFile[]>([])
async function loadPulls() {
  pullsError.value = ''
  try {
    pulls.value = (
      await ghApi.pulls(owner.value, name.value, { state: 'open', per_page: 50 })
    ).items
  } catch (e) {
    pullsError.value = (e as Error).message
  }
}
async function choosePull(p: GhPullOut) {
  openPull.value = p
  pullFiles.value = []
  review.value = null
  try {
    pullFiles.value = await ghApi.pullFiles(owner.value, name.value, p.number)
  } catch (e) {
    pullsError.value = (e as Error).message
  }
}
async function aiReview() {
  const p = openPull.value
  if (!p) return
  const detail = await ghApi.pull(owner.value, name.value, p.number).catch(() => null)
  ask.value = reviewAsk(
    repo.value,
    {
      number: p.number,
      title: p.title,
      body: detail?.body ?? p.body,
      head: p.head.ref ?? '',
      base: p.base.ref ?? '',
    },
    pullFiles.value,
  )
}

// The server's own Claude review: queued, then followed until it finishes.
interface ReviewView {
  id: string
  status: string
  verdict: string | null
  summary: string | null
  findings: number
  error: string
}
const review = ref<ReviewView | null>(null)
let reviewTimer: ReturnType<typeof setTimeout> | undefined
async function claudeReview() {
  const p = openPull.value
  if (!p) return
  clearTimeout(reviewTimer)
  try {
    const queued = must(
      await aureon.POST('/api/v1/github/repositories/{owner}/{repo}/pulls/{n}/claude-review', {
        params: { path: { owner: owner.value, repo: name.value, n: p.number } },
        body: { force: false },
      }),
    )
    review.value = {
      id: queued.id,
      status: queued.status,
      verdict: null,
      summary: null,
      findings: 0,
      error: '',
    }
    void followReview(queued.id, 0)
  } catch (e) {
    review.value = {
      id: '',
      status: 'failed',
      verdict: null,
      summary: null,
      findings: 0,
      error: (e as Error).message,
    }
  }
}
async function followReview(id: string, n: number) {
  try {
    const r = must(
      await aureon.GET('/api/v1/reviews/{review_id}', { params: { path: { review_id: id } } }),
    )
    if (review.value?.id !== id) return
    review.value = {
      id,
      status: r.status,
      verdict: r.verdict,
      summary: r.summary,
      findings: (r.findings ?? []).length,
      error: r.reason ?? '',
    }
    if ((r.status === 'queued' || r.status === 'running') && n < 120) {
      reviewTimer = setTimeout(() => void followReview(id, n + 1), 5000)
    }
  } catch (e) {
    if (review.value?.id === id) review.value.error = (e as Error).message
  }
}

// ---- changes (code tasks) ------------------------------------------------------------
const gitRepos = ref<GitRepoState[] | null>(null)
const coding = computed(() => (gitRepos.value ? codingRepoFor(repo.value, gitRepos.value) : null))
async function loadGitRepos() {
  try {
    gitRepos.value = must(await aureon.GET('/api/code/git/repos'))
  } catch {
    gitRepos.value = []
  }
}
const change = ref({ title: '', instruction: '', paths: '' })
const changeMsg = ref('')
const sending = ref(false)
const taskList = ref<InstanceType<typeof CodeTaskList> | null>(null)
function requestChange(path = filePath.value) {
  change.value = {
    title: path ? `Change ${path.split('/').pop()}` : '',
    instruction: '',
    paths: path,
  }
  setQuery({ tab: 'changes' })
}
async function sendChange() {
  if (!coding.value || !change.value.title.trim() || !change.value.instruction.trim()) return
  sending.value = true
  changeMsg.value = ''
  try {
    const t = must(
      await aureon.POST('/api/code/tasks', {
        body: {
          repo: coding.value,
          title: change.value.title.trim(),
          instruction: change.value.instruction.trim(),
          paths: change.value.paths
            .split(/[\s,]+/)
            .map((p) => p.trim())
            .filter(Boolean),
        },
      }),
    )
    changeMsg.value = `Queued: ${t.title}. It runs on its own branch with the tests; review its diff below.`
    change.value = { title: '', instruction: '', paths: '' }
    void taskList.value?.reload()
  } catch (e) {
    changeMsg.value = (e as Error).message
  } finally {
    sending.value = false
  }
}

// ---- tabs and loading ----------------------------------------------------------------
const TABS = [
  { value: 'files', label: 'Files' },
  { value: 'pulls', label: 'Pull requests' },
  { value: 'changes', label: 'Changes' },
]
const tab = computed(() => (['files', 'pulls', 'changes'].includes(q('tab')) ? q('tab') : 'files'))

watch(
  () => tradingSession.user?.uid,
  (u) => {
    if (u && isAdmin()) {
      void loadRepos()
      void loadGitRepos()
    }
  },
  { immediate: true },
)
watch(repo, async (r) => {
  if (!r || !owner.value) return
  dir.value = ''
  find.value = ''
  openPull.value = null
  try {
    branches.value = (await ghApi.branches(owner.value, name.value)).map((b) => b.name)
  } catch {
    branches.value = current.value?.default_branch ? [current.value.default_branch] : []
  }
  void loadPulls()
})
watch([repo, branch], () => void loadTree())
watch([repo, branch, filePath], () => void loadFile())
// A deep link (?do=explain|change) runs once the file has loaded.
watch(fileText, (t) => {
  const d = q('do')
  if (t == null || !d) return
  setQuery({ do: undefined })
  if (d === 'explain') explain()
  else if (d === 'change') requestChange()
})
onBeforeUnmount(() => {
  treeCtl?.abort()
  fileCtl?.abort()
  clearTimeout(reviewTimer)
})
</script>

<template>
  <AureonPage
    title="GitHub AI workspace"
    subtitle="Repositories through Aureon · AI answers stream from the provider you pick · changes need your approval"
    gate-text="GitHub and the coding agents run on the Aureon server. Sign in as an admin to use them."
    admin
  >
    <p v-if="reposError" class="tp-note" role="alert">{{ reposError }}</p>
    <EmptyState
      v-else-if="!repos.length"
      title="No repositories"
      description="Aureon lists only allowlisted repositories. Sync them from the Code tab's connection card."
    />
    <template v-else>
      <div class="gw__bar">
        <Select
          :model-value="repo"
          :options="repoOptions"
          size="sm"
          aria-label="Repository"
          @update:model-value="setQuery({ repo: String($event), ref: undefined, path: undefined })"
        />
        <Select
          v-if="branchOptions.length"
          :model-value="branch"
          :options="branchOptions"
          size="sm"
          aria-label="Branch"
          @update:model-value="setQuery({ ref: String($event), path: undefined })"
        />
        <Button
          size="sm"
          variant="secondary"
          :disabled="!entries.length"
          data-testid="act-architecture"
          @click="architecture"
        >
          Analyze architecture
        </Button>
        <Button size="sm" variant="secondary" data-testid="act-commits" @click="summarizeCommits">
          Summarize commits
        </Button>
      </div>
      <p v-if="actionError" class="tp-note" role="alert">{{ actionError }}</p>

      <div class="gw__grid">
        <div class="gw__main">
          <SegmentedControl
            :model-value="tab"
            :options="TABS"
            size="sm"
            @update:model-value="setQuery({ tab: $event })"
          />

          <!-- Files -->
          <Card v-if="tab === 'files'" :title="repo">
            <SearchField v-model="find" size="sm" placeholder="Find a file" />
            <p v-if="treeError" class="tp-note" role="alert">{{ treeError }}</p>
            <p v-else-if="loadingTree" class="tp-note">Reading the tree…</p>
            <p v-if="truncated" class="tp-note">
              GitHub cut the tree; search finds only what it sent.
            </p>
            <div v-if="dir && !find" class="gw__crumb">
              <Button size="sm" variant="ghost" @click="up">Up</Button>
              <span class="tp-note">{{ dir }}/</span>
            </div>
            <ul class="gw__files" data-testid="file-list">
              <li v-for="e in listing.slice(0, 200)" :key="e.path">
                <button
                  type="button"
                  class="gw__file"
                  :class="{ 'is-dir': e.type === 'tree', 'is-on': e.path === filePath }"
                  @click="openEntry(e)"
                >
                  {{ e.type === 'tree' ? `${e.name}/` : e.name }}
                </button>
              </li>
            </ul>
          </Card>

          <Card v-if="tab === 'files' && filePath" :title="filePath" data-testid="file-view">
            <div class="gw__actions">
              <Button
                size="sm"
                variant="primary"
                :disabled="fileText == null"
                data-testid="act-explain"
                @click="explain"
              >
                Explain
              </Button>
              <Button
                size="sm"
                variant="secondary"
                :disabled="fileText == null"
                data-testid="act-bugs"
                @click="bugs"
              >
                Find bugs &amp; TODOs
              </Button>
              <Button size="sm" variant="ghost" data-testid="act-change" @click="requestChange()">
                Request a change
              </Button>
            </div>
            <p v-if="loadingFile" class="tp-note">Reading the file…</p>
            <p v-else-if="fileNote" class="tp-note">{{ fileNote }}</p>
            <template v-else-if="fileText != null">
              <ul v-if="todos.length" class="gw__todos" aria-label="TODO markers">
                <li v-for="t in todos" :key="t.line" class="tp-note">
                  <Badge tone="warning" :label="t.tag" /> line {{ t.line }}:
                  {{ t.text || '(no text)' }}
                </li>
              </ul>
              <pre
                class="gw__code"
              ><code><span v-for="(l, i) in previewLines" :key="i" class="gw__line"><span class="gw__ln">{{ i + 1 }}</span>{{ l }}
</span></code></pre>
              <p v-if="fileText.split(/\r?\n/).length > PREVIEW_LINES" class="tp-note">
                Showing the first {{ PREVIEW_LINES }} lines.
              </p>
            </template>
          </Card>

          <!-- Pull requests -->
          <Card v-if="tab === 'pulls'" title="Open pull requests">
            <p v-if="pullsError" class="tp-note" role="alert">{{ pullsError }}</p>
            <ul v-if="pulls.length" class="tp-list">
              <li v-for="p in pulls" :key="p.number" class="tp-item">
                <div class="tp-main">
                  <span class="tp-strong">#{{ p.number }} {{ p.title }}</span>
                  <span class="tp-note">
                    {{ p.user }} · {{ p.head.ref }} → {{ p.base.ref }} · updated
                    {{ ago(p.updated_at) }}
                  </span>
                </div>
                <Button
                  size="sm"
                  :variant="openPull?.number === p.number ? 'tinted' : 'ghost'"
                  @click="choosePull(p)"
                  >{{ openPull?.number === p.number ? 'Opened' : 'Open' }}</Button
                >
              </li>
            </ul>
            <p v-else-if="!pullsError" class="tp-note">No open pull requests.</p>
          </Card>
          <Card
            v-if="tab === 'pulls' && openPull"
            :title="`#${openPull.number} ${openPull.title}`"
            data-testid="pull-view"
          >
            <div class="gw__actions">
              <Button
                size="sm"
                variant="primary"
                :disabled="!pullFiles.length"
                data-testid="act-review"
                @click="aiReview"
              >
                Review with AI
              </Button>
              <Button
                size="sm"
                variant="secondary"
                data-testid="act-claude-review"
                @click="claudeReview"
              >
                Claude review (server)
              </Button>
            </div>
            <div v-if="review" class="gw__review" role="status" data-testid="claude-review">
              <Badge
                :tone="
                  review.status === 'done'
                    ? 'success'
                    : review.status === 'failed'
                      ? 'danger'
                      : 'info'
                "
                :label="review.status"
              />
              <span v-if="review.verdict" class="tp-strong">{{ review.verdict }}</span>
              <span v-if="review.summary" class="tp-note">{{ review.summary }}</span>
              <span v-if="review.status === 'done'" class="tp-note">
                {{ review.findings }} finding{{ review.findings === 1 ? '' : 's' }}. Publishing to
                GitHub is done from
                <Button size="sm" variant="ghost" @click="router.push('/dev/reviews')"
                  >Reviews</Button
                >.
              </span>
              <span v-if="review.error" class="tp-note" role="alert">{{ review.error }}</span>
            </div>
            <ul class="gw__files">
              <li v-for="f in pullFiles" :key="f.filename" class="tp-note">
                {{ f.filename }} · {{ f.status }} · +{{ f.additions ?? 0 }} −{{ f.deletions ?? 0 }}
              </li>
            </ul>
          </Card>

          <!-- Changes -->
          <template v-if="tab === 'changes'">
            <Card title="Request a change">
              <p v-if="gitRepos === null" class="tp-note">Checking the server's clones…</p>
              <div v-else-if="!coding" class="cc-notice cc-notice--warning" role="status">
                <p class="cc-notice__title">No clone of {{ repo }} on the server</p>
                <p class="tp-note">
                  Code tasks run in a clone the coding agent owns. Add this repository to the
                  server's coding repos (Code (Aureon) → clone), then come back.
                </p>
              </div>
              <form v-else class="gw__form" @submit.prevent="sendChange">
                <TextInput
                  v-model="change.title"
                  size="sm"
                  placeholder="Title"
                  aria-label="Title"
                />
                <TextArea
                  v-model="change.instruction"
                  label="Instruction"
                  placeholder="What should change, and why"
                />
                <TextInput
                  v-model="change.paths"
                  size="sm"
                  placeholder="Paths (optional, comma separated)"
                  aria-label="Paths"
                />
                <p class="tp-note">
                  Runs in {{ coding }} on its own branch with the repository's tests. You read the
                  diff and approve or reject it; nothing reaches GitHub before that, and merging
                  stays behind the approval gate.
                </p>
                <div class="tp-row">
                  <Button
                    type="submit"
                    size="sm"
                    variant="primary"
                    :loading="sending"
                    :disabled="!change.title.trim() || !change.instruction.trim()"
                    data-testid="send-change"
                    >Request change</Button
                  >
                  <span v-if="changeMsg" class="tp-note" role="status">{{ changeMsg }}</span>
                </div>
              </form>
            </Card>
            <Card v-if="coding" title="Proposed changes">
              <CodeTaskList ref="taskList" :repo="coding" title="Tasks" />
            </Card>
          </template>
        </div>

        <Card title="AI" class="gw__side">
          <AiAnswer :repo="repo" :ask="ask" />
        </Card>
      </div>
    </template>
  </AureonPage>
</template>

<style scoped>
.gw__bar,
.gw__actions,
.gw__crumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-width: 0;
}
.gw__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--sp-3);
  min-width: 0;
}
@media (min-width: 1024px) {
  .gw__grid {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    align-items: start;
  }
  .gw__side {
    position: sticky;
    top: var(--sp-3);
  }
}
.gw__main {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.gw__files {
  display: flex;
  flex-direction: column;
  margin: var(--sp-2) 0 0;
  padding: 0;
  list-style: none;
  max-height: 360px;
  overflow-y: auto;
  min-width: 0;
}
.gw__file {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 6px var(--sp-2);
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: var(--text-xs);
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.gw__file.is-dir {
  font-weight: var(--weight-semibold);
}
.gw__file.is-on,
.gw__file:hover {
  background: color-mix(in oklch, var(--theme-accent) 12%, transparent);
}
.gw__todos {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: var(--sp-2) 0;
  padding: 0;
  list-style: none;
}
.gw__code {
  max-height: 480px;
  margin: var(--sp-2) 0 0;
  overflow: auto;
  font-size: var(--text-2xs);
  line-height: 1.5;
}
.gw__line {
  display: block;
  white-space: pre;
}
.gw__ln {
  display: inline-block;
  width: 3.5em;
  padding-right: var(--sp-2);
  color: var(--text-secondary);
  text-align: right;
  user-select: none;
}
.gw__review {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  margin-top: var(--sp-2);
  min-width: 0;
}
.gw__form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
</style>
