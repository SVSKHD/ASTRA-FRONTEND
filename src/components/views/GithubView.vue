<script setup lang="ts">
import Select from '@/components/ui/Select.vue'
import Icon from '@/components/ui/Icon.vue'
import PullsPane from '@/components/github/PullsPane.vue'
import CodePane from '@/components/github/CodePane.vue'
import { isGhConfigured } from '@/utils/ghProxy'
import TextInput from '@/components/ui/TextInput.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
// The GitHub tab (13d + 13e): a cross-repo Issues view and a Repos view.
//
// Issues: filter by repo, state, label, assignee and linked/unlinked; pull one
// in as a task in a click, or bulk-create from a selection. Bodies render as
// sanitised markdown — never as HTML.
//
// Issues can also be WRITTEN here — new issue, edit, comment, close/reopen —
// because a tab that shows your issues and then sends you to github.com to
// answer one has failed at the thing it is for. There is no delete: GitHub has
// none either, an issue is closed, and closing is reversible from the same row.
//
// Pull requests: one repo's PRs in any state, each opening to its description
// and a numbered diff of every file it changes (PullsPane). Read-only.
//
// Code: the repo's file tree at any branch, a highlighted viewer, and an editor
// that commits one file at a time back to that branch (CodePane). The only
// write here besides issues, and it is guarded by the blob sha.
//
// Repos: every linked repo with its metadata and sync toggle, expanding to
// recent commits on the default branch, open PRs with CI status, and branches.
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useStyles } from '@/composables/useStyles'
import { DANGER, SUCCESS, pxify, typeStep } from '@/styles'
import { formatRelative } from '@/utils/timestamps'
import { fullName, issueStateColor } from '@/utils/githubModel'
import { renderMarkdown } from '@/utils/markdown'
import {
  assigneeOptions,
  countIssues,
  defaultIssueFilter,
  filterIssues,
  isLinked,
  labelOptions,
  repoTaskProgress,
  sortIssues,
} from '@/utils/issueFilters'
import type { GithubIssue } from '@/types'
import RepoBrowser from '@/components/github/RepoBrowser.vue'
import IssueForm from '@/components/github/IssueForm.vue'
import TextArea from '@/components/ui/TextArea.vue'
import TechChips from '@/components/github/TechChips.vue'
import { techBadge } from '@/utils/techBadge'

const app = useAppStore()
const auth = useAuthStore()
const { c, s, panelStyle, isMobile } = useStyles()
const { repos, ghIssues, tasks, githubIntegration } = storeToRefs(app)

type Pane = 'issues' | 'pulls' | 'code' | 'repos'
const pane = ref<Pane>('issues')

// The token proxy answers with a plain repo list, and reading it is what marks
// the integration connected — so do that once on arrival rather than waiting
// for Settings to be opened.
onMounted(() => {
  if (!app.githubConnected && isGhConfigured()) void app.loadInstalledRepos()
})
const filter = ref(defaultIssueFilter())
const selected = ref<Set<string>>(new Set())
const expandedIssue = ref<string | null>(null)
const expandedRepo = ref<string | null>(null)
const now = Date.now()

// The issues pane AND its create form: "the thing this tab is for" is filing
// an issue, and landing on the list with nothing open was half an answer.
defineExpose({
  focus: () => {
    pane.value = 'issues'
    startCreate()
  },
})

const visibleIssues = computed(() =>
  sortIssues(filterIssues(ghIssues.value, filter.value, tasks.value)),
)
const counts = computed(() => countIssues(ghIssues.value, tasks.value))
const sections = computed<
  {
    value: Pane
    label: string
    icon: 'alert-circle' | 'share' | 'notebook' | 'github'
    count: number | null
  }[]
>(() => [
  { value: 'issues', label: 'Issues', icon: 'alert-circle', count: counts.value.open },
  { value: 'pulls', label: 'Pull requests', icon: 'share', count: null },
  { value: 'code', label: 'Code', icon: 'notebook', count: null },
  { value: 'repos', label: 'Repos', icon: 'github', count: repos.value.length },
])
const labels = computed(() => labelOptions(ghIssues.value))
const assignees = computed(() => assigneeOptions(ghIssues.value))

function linked(issue: GithubIssue): boolean {
  return isLinked(issue, tasks.value)
}
function toggleSelect(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
// Only unlinked issues are worth selecting — a linked one would be skipped by
// the bulk action anyway, so it never enters the selection.
const selectableIds = computed(() => visibleIssues.value.filter((i) => !linked(i)).map((i) => i.id))
function selectAll() {
  selected.value = new Set(selectableIds.value)
}
function clearSelection() {
  selected.value = new Set()
}
function bulkCreate() {
  app.createTasksFromIssues([...selected.value])
  clearSelection()
}
function toggleIssue(id: string) {
  expandedIssue.value = expandedIssue.value === id ? null : id
}
function toggleRepo(id: string) {
  const next = expandedRepo.value === id ? null : id
  expandedRepo.value = next
  if (next) void app.loadRepoActivity(next)
}

// ---- writing issues (13c's other half) -------------------------------------
// Reading an issue tab and then going to github.com to answer it is the tab
// failing at the only thing it is for. These write through the same proxy the
// sync uses; `busy` keeps a double-click from sending two of anything.
const creating = ref(false)
const editingId = ref<string | null>(null)
const commentingId = ref<string | null>(null)
const commentDraft = ref('')
const busy = ref(false)

const repoOptions = computed(() =>
  repos.value.map((r) => ({ value: String(r.id), label: r.fullName })),
)

function startCreate() {
  creating.value = true
  editingId.value = null
}
function startEdit(id: string) {
  editingId.value = id
  commentingId.value = null
}
function startComment(id: string) {
  commentingId.value = id
  commentDraft.value = ''
  editingId.value = null
}

async function run(work: () => Promise<boolean>): Promise<boolean> {
  if (busy.value) return false
  busy.value = true
  try {
    return await work()
  } finally {
    busy.value = false
  }
}

async function submitCreate(draft: {
  repoId: string
  title: string
  body: string
  labels: string[]
}) {
  const ok = await run(() =>
    app.createGithubIssue(draft.repoId, {
      title: draft.title,
      body: draft.body,
      labels: draft.labels,
    }),
  )
  if (ok) creating.value = false
}

async function submitEdit(id: string, draft: { title: string; body: string; labels: string[] }) {
  const ok = await run(() =>
    app.updateGithubIssue(id, { title: draft.title, body: draft.body, labels: draft.labels }),
  )
  if (ok) editingId.value = null
}

async function submitComment(id: string) {
  const ok = await run(() => app.commentOnGithubIssue(id, commentDraft.value))
  if (ok) {
    commentingId.value = null
    commentDraft.value = ''
  }
}

function toggleState(issue: GithubIssue) {
  void run(() =>
    app.updateGithubIssue(issue.id, { state: issue.state === 'open' ? 'closed' : 'open' }),
  )
}

const repoRows = computed(() =>
  repos.value
    .slice()
    .sort((a, b) => b.pushedAt - a.pushedAt)
    .map((repo) => ({
      repo,
      progress: repoTaskProgress(repo.id, tasks.value),
      activity: app.activityOf(repo.id),
      expanded: expandedRepo.value === repo.id,
    })),
)

// ---- styles ---------------------------------------------------------------
const filterRow = computed(() =>
  pxify({
    display: 'grid',
    gridTemplateColumns: isMobile.value ? '1fr 1fr' : 'repeat(5, minmax(0, 1fr))',
    gap: 'var(--sp-2)',
  }),
)
const rowStyle = pxify({ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', width: '100%' })
const issueActions = pxify({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--sp-2)',
  paddingTop: 'var(--sp-2)',
})
const commentBox = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  paddingTop: 'var(--sp-2)',
})
function stateDot(state: 'open' | 'closed') {
  const col = issueStateColor(state)
  return pxify({
    flexShrink: 0,
    width: 9,
    height: 9,
    borderRadius: '50%',
    background: state === 'open' ? col : 'transparent',
    border: '1.5px solid ' + col,
  })
}
function labelChip() {
  return pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '2px 7px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid ' + c.value.border,
    color: c.value.dim,
    whiteSpace: 'nowrap',
  })
}
const bodyStyle = computed(() =>
  pxify({
    ...typeStep('xs'),
    lineHeight: 1.55,
    color: c.value.dim,
    padding: '8px 10px',
    borderRadius: 'var(--radius-card)',
    background: 'color-mix(in oklch, ' + c.value.border + ' 25%, transparent)',
    overflowX: 'auto',
  }),
)
const bulkBar = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    padding: '8px 10px',
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + c.value.accent,
    background: 'color-mix(in oklch, ' + c.value.accent + ' 12%, transparent)',
    ...typeStep('xs'),
  }),
)
function ciChip(ci: string) {
  const col = ci === 'passing' ? SUCCESS : ci === 'failing' ? DANGER : c.value.dim
  return pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '2px 7px',
    borderRadius: 'var(--radius-control)',
    color: col,
    border: '1px solid ' + col,
    whiteSpace: 'nowrap',
  })
}
function toggleTrack(on: boolean) {
  return pxify({
    flexShrink: 0,
    width: 34,
    height: 20,
    borderRadius: 'var(--radius-card)',
    background: on ? SUCCESS : c.value.border,
    border: '1px solid ' + c.value.border,
    cursor: 'pointer',
    position: 'relative',
  })
}
function toggleKnob(on: boolean) {
  return pxify({
    position: 'absolute',
    top: 2,
    left: on ? 16 : 2,
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: '#fff',
    transition: 'left .2s ease',
  })
}
function progressInner(pct: number) {
  return pxify({
    height: '100%',
    width: pct + '%',
    background: c.value.accent,
    borderRadius: 3,
    transition: 'width .4s ease',
  })
}
</script>

<template>
  <div :style="panelStyle" class="ghv">
    <!-- The hero: who GitHub knows this as, whether it is live, and the way to
         Settings. Then the four sections as one strip. -->
    <header class="ghv__hero">
      <span class="ghv__mark" aria-hidden="true"><Icon name="github" size="lg" /></span>
      <div class="ghv__hero-text">
        <h2 class="ghv__title">GitHub</h2>
        <span class="ghv__who">
          <img
            v-if="githubIntegration.avatarUrl"
            :src="githubIntegration.avatarUrl"
            alt=""
            class="ghv__avatar"
          />
          <span class="ghv__dot" :class="{ 'is-on': app.githubConnected }" />
          <template v-if="app.githubConnected">
            {{ githubIntegration.login || 'Connected' }} · {{ repos.length }} linked
          </template>
          <template v-else>Not connected</template>
        </span>
      </div>
      <div class="ghv__hero-actions">
        <button
          v-if="pane === 'issues' && repos.length"
          type="button"
          class="gh-soft gh-soft--accent"
          @click="startCreate"
        >
          <Icon name="plus" size="xs" /> New issue
        </button>
        <button type="button" class="gh-soft" @click="auth.openGithubPanel()">
          <Icon name="shield" size="xs" /> Settings
        </button>
      </div>
    </header>

    <nav class="ghv__tabs" role="tablist" aria-label="GitHub section">
      <button
        v-for="t in sections"
        :key="t.value"
        type="button"
        role="tab"
        class="ghv__tab"
        :class="{ 'is-on': pane === t.value }"
        :aria-selected="pane === t.value"
        @click="pane = t.value"
      >
        <Icon :name="t.icon" size="sm" />
        <span>{{ t.label }}</span>
        <span v-if="t.count != null" class="ghv__tab-n">{{ t.count }}</span>
      </button>
    </nav>

    <div v-if="app.githubPaused" :style="bulkBar">
      Sync paused — {{ githubIntegration.pausedReason }}.
      <button :style="s.importBtn" @click="app.resumeGithubSync()">Resume</button>
    </div>

    <!-- ---- Issues ------------------------------------------------------- -->
    <template v-if="pane === 'issues'">
      <div :style="filterRow">
        <Select
          v-model="filter.repoId"
          :options="[
            { value: 'all', label: 'All repos' },
            ...repos.map((r) => ({ value: String(r.id), label: `${r.fullName}` })),
          ]"
        />
        <Select
          v-model="filter.state"
          :options="[
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
            { value: 'all', label: 'Any state' },
          ]"
        />
        <Select
          v-model="filter.label"
          :options="[
            { value: 'all', label: 'Any label' },
            ...labels.map((l) => ({ value: String(l), label: l })),
          ]"
        />
        <Select
          v-model="filter.assignee"
          :options="[
            { value: 'all', label: 'Anyone' },
            ...assignees.map((a) => ({ value: String(a), label: a })),
          ]"
        />
        <Select
          v-model="filter.link"
          :options="[
            { value: 'all', label: 'Linked or not' },
            { value: 'linked', label: 'Linked to a task' },
            { value: 'unlinked', label: 'Not linked' },
          ]"
        />
      </div>
      <TextInput placeholder="Search by number or title…" v-model="filter.query" />

      <!-- Writing a new issue. Above the list, where the result will appear. -->
      <IssueForm
        v-if="creating"
        :repos="repoOptions"
        :repo-id="filter.repoId !== 'all' ? filter.repoId : ''"
        :busy="busy"
        @submit="submitCreate"
        @cancel="creating = false"
      />

      <div v-if="selected.size" :style="bulkBar">
        <span>{{ selected.size }} selected</span>
        <button :style="s.importBtn" @click="bulkCreate">Create tasks from selected</button>
        <button :style="s.editBtn" @click="clearSelection">Clear</button>
      </div>
      <div v-else-if="selectableIds.length" :style="s.finMeta">
        {{ counts.unlinked }} unlinked ·
        <button :style="s.importBtn" @click="selectAll">Select all shown</button>
      </div>

      <div v-if="!repos.length" :style="s.empty">
        No repositories linked yet — connect GitHub and pick one in Settings.
      </div>
      <div v-else-if="!visibleIssues.length" :style="s.empty">No issues match these filters.</div>
      <div class="stagger-in" v-else :style="s.list">
        <div v-for="issue in visibleIssues" :key="issue.id" :style="s.ghRepoCard">
          <div :style="rowStyle">
            <Checkbox
              v-if="!linked(issue)"
              :model-value="selected.has(issue.id)"
              @update:model-value="toggleSelect(issue.id)"
            />
            <span :style="stateDot(issue.state)"></span>
            <div :style="s.taskMain" @click="toggleIssue(issue.id)">
              <span :style="s.dlTitle">{{ issue.title }}</span>
              <span :style="s.finMeta">
                {{ fullName(issue.repoId) }}#{{ issue.number }} · {{ issue.author }} ·
                {{ formatRelative(issue.updatedAt, now) }}
                <template v-if="issue.commentsCount"> · {{ issue.commentsCount }} 💬</template>
              </span>
              <div :style="s.chipRow">
                <span v-for="l in issue.labels" :key="l" :style="labelChip()">{{ l }}</span>
                <span v-for="a in issue.assignees" :key="a" :style="labelChip()">@{{ a }}</span>
              </div>
            </div>
            <a
              :style="s.prLink"
              :href="issue.htmlUrl"
              target="_blank"
              rel="noopener noreferrer"
              title="Open on GitHub"
              >↗</a
            >
            <button
              v-if="!linked(issue)"
              :style="s.importBtn"
              @click="app.createTaskFromIssue(issue.id)"
            >
              Create task
            </button>
            <span v-else :style="s.finMeta">linked</span>
          </div>

          <!-- The issue's own actions, in the row that is open. Edit and
               comment write to GitHub; there is no delete, because GitHub has
               none — an issue is closed, and closing is reversible. -->
          <template v-if="expandedIssue === issue.id">
            <!-- Sanitised markdown: raw HTML in an issue body renders as text. -->
            <div v-if="issue.body && editingId !== issue.id" :style="bodyStyle">
              <div v-html="renderMarkdown(issue.body)"></div>
            </div>

            <IssueForm
              v-if="editingId === issue.id"
              :issue="issue"
              :repos="repoOptions"
              :busy="busy"
              @submit="submitEdit(issue.id, $event)"
              @cancel="editingId = null"
            />

            <div v-else :style="issueActions">
              <button :style="s.editBtn" @click="startEdit(issue.id)">Edit</button>
              <button :style="s.editBtn" @click="startComment(issue.id)">Comment</button>
              <button :style="s.editBtn" @click="toggleState(issue)">
                {{ issue.state === 'open' ? 'Close issue' : 'Reopen' }}
              </button>
            </div>

            <div v-if="commentingId === issue.id" :style="commentBox">
              <TextArea
                v-model="commentDraft"
                :rows="3"
                placeholder="Leave a comment (markdown)"
                aria-label="Comment"
              />
              <div :style="issueActions">
                <button :style="s.importBtn" @click="submitComment(issue.id)">
                  {{ busy ? 'Posting…' : 'Comment' }}
                </button>
                <button :style="s.editBtn" @click="commentingId = null">Cancel</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- ---- Pull requests and Code ----------------------------------------- -->
    <PullsPane v-else-if="pane === 'pulls'" />
    <CodePane v-else-if="pane === 'code'" />

    <!-- ---- Repos --------------------------------------------------------- -->
    <template v-else>
      <!-- Every repository the token can see, with what it is built with. The
           list below is only the LINKED ones — the repos whose issues are
           mirrored — which is a much shorter list and never the answer to
           "what do I have on GitHub". -->
      <RepoBrowser />

      <div v-if="!repoRows.length" :style="s.empty">
        No repositories linked yet — connect GitHub and pick one in Settings.
      </div>
      <div v-else :style="s.list">
        <div v-for="row in repoRows" :key="row.repo.id" :style="s.ghRepoCard">
          <div :style="rowStyle">
            <div :style="s.taskMain" @click="toggleRepo(row.repo.id)">
              <span :style="s.dlTitle">{{ row.repo.fullName }}</span>
              <span :style="s.finMeta">
                {{ row.repo.private ? 'private' : 'public' }}
                · {{ row.repo.defaultBranch }} · {{ row.repo.openIssuesCount }} open issues · pushed
                {{ formatRelative(row.repo.pushedAt, now) }}
              </span>
              <!-- The language as the same chip the browse list uses, rather
                   than a bare word in the middle of a metadata sentence. -->
              <TechChips v-if="row.repo.language" :items="[techBadge(row.repo.language)]" />
            </div>
            <div
              :style="toggleTrack(row.repo.syncEnabled)"
              role="switch"
              :aria-checked="row.repo.syncEnabled"
              title="Sync this repo"
              @click="app.setRepoSync(row.repo.id, !row.repo.syncEnabled)"
            >
              <div :style="toggleKnob(row.repo.syncEnabled)"></div>
            </div>
            <button :style="s.del" title="Unlink" @click="app.unlinkRepo(row.repo.id)">×</button>
          </div>

          <template v-if="row.progress.total">
            <div :style="s.ghProgressOuter">
              <div
                :style="progressInner(Math.round((row.progress.done / row.progress.total) * 100))"
              ></div>
            </div>
            <span :style="s.finMeta"
              >{{ row.progress.done }}/{{ row.progress.total }} linked tasks done</span
            >
          </template>

          <div v-if="row.expanded" :style="s.ghSection">
            <div v-if="row.activity.loading" :style="s.ghShimmer"></div>
            <template v-else>
              <span :style="s.ghLabel">Recent commits on {{ row.repo.defaultBranch }}</span>
              <span v-if="!row.activity.commits.length" :style="s.finMeta">Nothing to show.</span>
              <div v-for="commit in row.activity.commits" :key="commit.sha" :style="s.ghIssueRow">
                <a
                  :style="s.prLink"
                  :href="commit.htmlUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  >{{ commit.message }}</a
                >
                <span :style="s.finMeta"
                  >{{ commit.author }} · {{ formatRelative(commit.committedAt, now) }}</span
                >
              </div>

              <span :style="s.ghLabel">Open pull requests</span>
              <span v-if="!row.activity.pulls.length" :style="s.finMeta">None open.</span>
              <div v-for="pr in row.activity.pulls" :key="pr.number" :style="s.ghIssueRow">
                <a :style="s.prLink" :href="pr.htmlUrl" target="_blank" rel="noopener noreferrer"
                  >#{{ pr.number }} · {{ pr.title }}</a
                >
                <span v-if="pr.draft" :style="labelChip()">draft</span>
                <span :style="ciChip(pr.ci)">CI {{ pr.ci }}</span>
              </div>

              <span :style="s.ghLabel">Branches</span>
              <div :style="s.chipRow">
                <span v-for="b in row.activity.branches" :key="b" :style="labelChip()">{{
                  b
                }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style>
/* The GitHub tab's shared language, unscoped but under .ghv so the panes
   (PullsPane, CodePane) speak it without each restating it. */
.ghv {
  --gh-wash: color-mix(in oklch, var(--theme-accent) 8%, transparent);
  --gh-wash-strong: color-mix(in oklch, var(--theme-accent) 16%, transparent);
  --gh-line: color-mix(in oklch, var(--theme-text) 9%, transparent);
}

/* ---- hero and sections ------------------------------------------------------ */
.ghv__hero {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.ghv__mark {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: linear-gradient(
    145deg,
    var(--theme-accent),
    color-mix(in oklch, var(--theme-accent) 65%, var(--theme-text))
  );
  color: var(--theme-on-accent);
  box-shadow: 0 10px 22px -12px var(--theme-accent);
}
.ghv__hero-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}
.ghv__title {
  margin: 0;
  color: var(--theme-text);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
}
.ghv__who {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  overflow: hidden;
  color: var(--theme-dim);
  font-size: var(--text-sm);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ghv__avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}
.ghv__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: color-mix(in oklch, var(--theme-text) 25%, transparent);
}
.ghv__dot.is-on {
  background: var(--theme-success);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--theme-success) 22%, transparent);
}
.ghv__hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.ghv__tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  overflow-x: auto;
  border-radius: 16px;
  background: color-mix(in oklch, var(--theme-text) 5%, transparent);
  scrollbar-width: none;
}
.ghv__tabs::-webkit-scrollbar {
  display: none;
}
.ghv__tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1 0 auto;
  height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background var(--dur-fast) ease,
    color var(--dur-fast) ease;
}
.ghv__tab:hover:not(.is-on) {
  color: var(--theme-text);
  background: color-mix(in oklch, var(--theme-text) 5%, transparent);
}
.ghv__tab.is-on {
  background: var(--glass-solid, var(--theme-card));
  color: var(--theme-text);
  font-weight: var(--weight-semibold);
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--shadow-ink, #000) 10%, transparent),
    0 4px 12px -6px color-mix(in srgb, var(--shadow-ink, #000) 30%, transparent);
}
.ghv__tab.is-on svg {
  color: var(--theme-accent);
}
.ghv__tab:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 1px;
}
.ghv__tab-n {
  min-width: 20px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-text) 8%, transparent);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  line-height: 1.7;
  font-variant-numeric: tabular-nums;
}
.ghv__tab.is-on .ghv__tab-n {
  background: var(--gh-wash-strong);
}

/* ---- shared pieces ----------------------------------------------------------- */
.ghv .gh-soft {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--gh-wash);
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--dur-fast) ease;
}
.ghv .gh-soft:hover:not(:disabled) {
  background: var(--gh-wash-strong);
}
.ghv .gh-soft:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ghv .gh-soft--accent {
  background: var(--theme-accent);
  color: var(--theme-on-accent);
}
.ghv .gh-soft--accent:hover:not(:disabled) {
  background: var(--theme-accent);
  filter: brightness(1.06);
}
.ghv .gh-soft:focus-visible,
.ghv .gh-icon-btn:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.ghv .gh-icon-btn {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 12px;
  background: var(--gh-wash);
  color: var(--theme-text);
  cursor: pointer;
}
.ghv .gh-icon-btn:hover {
  background: var(--gh-wash-strong);
}
.ghv .is-spinning {
  animation: gh-spin 0.9s linear infinite;
}
@keyframes gh-spin {
  to {
    transform: rotate(360deg);
  }
}
.ghv .gh-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-text) 7%, transparent);
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
}
.ghv .gh-chip--accent {
  background: var(--gh-wash-strong);
  color: var(--theme-text);
}
.ghv .gh-pill {
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  background: var(--gh-wash-strong);
  color: var(--theme-text);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  text-transform: capitalize;
  white-space: nowrap;
}
.ghv .gh-pill--sm {
  padding: 0 7px;
}
.ghv .gh-pill:is([data-status='merged'], [data-file='added']) {
  background: color-mix(in oklch, var(--theme-success) 16%, transparent);
  color: var(--theme-success);
}
.ghv .gh-pill:is([data-status='closed'], [data-file='removed']) {
  background: color-mix(in oklch, var(--theme-danger) 14%, transparent);
  color: var(--theme-danger);
}
.ghv .gh-pill[data-status='draft'] {
  background: color-mix(in oklch, var(--theme-text) 7%, transparent);
  color: var(--theme-dim);
}
.ghv .gh-ci {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
}
.ghv .gh-ci__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--theme-warning);
}
.ghv .gh-ci[data-ci='passing'] .gh-ci__dot {
  background: var(--theme-success);
}
.ghv .gh-ci[data-ci='failing'] .gh-ci__dot {
  background: var(--theme-danger);
}
.ghv .gh-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--theme-accent);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  text-decoration: none;
}
.ghv .gh-link:hover {
  text-decoration: underline;
}
.ghv .gh-muted {
  color: var(--theme-dim);
  font-size: var(--text-xs);
}
.ghv .gh-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--gh-wash);
  color: var(--theme-text);
  font-size: var(--text-sm);
}
.ghv .gh-note--error {
  background: color-mix(in oklch, var(--theme-danger) 12%, transparent);
}
.ghv .gh-note--error svg {
  color: var(--theme-danger);
}
.ghv .gh-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 40px 16px;
  text-align: center;
}
.ghv .gh-empty__icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin-bottom: 4px;
  border-radius: 18px;
  background: var(--gh-wash-strong);
  color: var(--theme-accent);
}
.ghv .gh-empty__title {
  margin: 0;
  color: var(--theme-text);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
}
.ghv .gh-empty__text {
  margin: 0;
  color: var(--theme-dim);
  font-size: var(--text-sm);
}
.ghv .gh-skel {
  height: 62px;
  border-radius: 16px;
  background: linear-gradient(
    90deg,
    var(--gh-wash) 0%,
    var(--gh-wash-strong) 50%,
    var(--gh-wash) 100%
  );
  background-size: 200% 100%;
  animation: gh-shimmer 1.4s ease-in-out infinite;
}
.ghv .gh-skel--tall {
  height: 160px;
}
.ghv .gh-skel--line {
  height: 18px;
  border-radius: 6px;
}
@keyframes gh-shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: -100% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ghv .gh-skel,
  .ghv .is-spinning {
    animation: none;
  }
}
</style>
