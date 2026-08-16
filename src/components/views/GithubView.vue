<script setup lang="ts">
// The GitHub tab (13d + 13e): a cross-repo Issues view and a Repos view.
//
// Issues: filter by repo, state, label, assignee and linked/unlinked; pull one
// in as a task in a click, or bulk-create from a selection. Bodies render as
// sanitised markdown — never as HTML.
//
// Repos: every linked repo with its metadata and sync toggle, expanding to
// recent commits on the default branch, open PRs with CI status, and branches.
// Nothing here pushes, merges or deletes: v1 is read-only apart from issues.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
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

const app = useAppStore()
const auth = useAuthStore()
const { c, s, panelStyle, isMobile } = useStyles()
const { repos, ghIssues, tasks, githubIntegration } = storeToRefs(app)

const pane = ref<'issues' | 'repos'>('issues')
const filter = ref(defaultIssueFilter())
const selected = ref<Set<string>>(new Set())
const expandedIssue = ref<string | null>(null)
const expandedRepo = ref<string | null>(null)
const now = Date.now()

defineExpose({ focus: () => (pane.value = 'issues') })

const visibleIssues = computed(() =>
  sortIssues(filterIssues(ghIssues.value, filter.value, tasks.value)),
)
const counts = computed(() => countIssues(ghIssues.value, tasks.value))
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
const segRow = pxify({ display: 'flex', gap: 8, alignItems: 'center' })
function segBtn(active: boolean) {
  return pxify({
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 14px',
    borderRadius: 10,
    cursor: 'pointer',
    border: '1px solid ' + (active ? c.value.accent : c.value.border),
    background: active
      ? 'color-mix(in oklch, ' + c.value.accent + ' 18%, transparent)'
      : 'transparent',
    color: active ? c.value.accent : c.value.dim,
  })
}
const filterRow = computed(() =>
  pxify({
    display: 'grid',
    gridTemplateColumns: isMobile.value ? '1fr 1fr' : 'repeat(5, minmax(0, 1fr))',
    gap: 8,
  }),
)
const rowStyle = pxify({ display: 'flex', alignItems: 'center', gap: 10, width: '100%' })
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
    fontSize: 9,
    fontWeight: 600,
    padding: '2px 7px',
    borderRadius: 6,
    border: '1px solid ' + c.value.border,
    color: c.value.dim,
    whiteSpace: 'nowrap',
  })
}
const bodyStyle = computed(() =>
  pxify({
    fontSize: 12,
    lineHeight: 1.55,
    color: c.value.dim,
    padding: '8px 10px',
    borderRadius: 10,
    background: 'color-mix(in oklch, ' + c.value.border + ' 25%, transparent)',
    overflowX: 'auto',
  }),
)
const bulkBar = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 12,
    border: '1px solid ' + c.value.accent,
    background: 'color-mix(in oklch, ' + c.value.accent + ' 12%, transparent)',
    fontSize: 12,
  }),
)
function ciChip(ci: string) {
  const col =
    ci === 'passing' ? 'oklch(0.7 0.15 145)' : ci === 'failing' ? 'oklch(0.65 0.2 25)' : c.value.dim
  return pxify({
    fontSize: 9,
    fontWeight: 600,
    padding: '2px 7px',
    borderRadius: 6,
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
    borderRadius: 10,
    background: on ? 'oklch(0.68 0.16 150)' : c.value.border,
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
  <div :style="panelStyle">
    <div :style="segRow">
      <button :style="segBtn(pane === 'issues')" @click="pane = 'issues'">
        Issues · {{ counts.open }} open
      </button>
      <button :style="segBtn(pane === 'repos')" @click="pane = 'repos'">
        Repos · {{ repos.length }}
      </button>
      <span style="flex: 1"></span>
      <button :style="s.editBtn" @click="auth.openGithubPanel()">Settings</button>
    </div>

    <div v-if="app.githubPaused" :style="bulkBar">
      Sync paused — {{ githubIntegration.pausedReason }}.
      <button :style="s.importBtn" @click="app.resumeGithubSync()">Resume</button>
    </div>

    <!-- ---- Issues ------------------------------------------------------- -->
    <template v-if="pane === 'issues'">
      <div :style="filterRow">
        <select :style="s.select" v-model="filter.repoId">
          <option value="all">All repos</option>
          <option v-for="r in repos" :key="r.id" :value="r.id">{{ r.fullName }}</option>
        </select>
        <select :style="s.select" v-model="filter.state">
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="all">Any state</option>
        </select>
        <select :style="s.select" v-model="filter.label">
          <option value="all">Any label</option>
          <option v-for="l in labels" :key="l" :value="l">{{ l }}</option>
        </select>
        <select :style="s.select" v-model="filter.assignee">
          <option value="all">Anyone</option>
          <option v-for="a in assignees" :key="a" :value="a">{{ a }}</option>
        </select>
        <select :style="s.select" v-model="filter.link">
          <option value="all">Linked or not</option>
          <option value="linked">Linked to a task</option>
          <option value="unlinked">Not linked</option>
        </select>
      </div>
      <input :style="s.input" placeholder="Search by number or title…" v-model="filter.query" />

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
      <div v-else :style="s.list">
        <div v-for="issue in visibleIssues" :key="issue.id" :style="s.ghRepoCard">
          <div :style="rowStyle">
            <input
              v-if="!linked(issue)"
              type="checkbox"
              :checked="selected.has(issue.id)"
              @change="toggleSelect(issue.id)"
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
          <!-- Sanitised markdown: raw HTML in an issue body renders as text. -->
          <div
            v-if="expandedIssue === issue.id && issue.body"
            :style="bodyStyle"
            v-html="renderMarkdown(issue.body)"
          ></div>
        </div>
      </div>
    </template>

    <!-- ---- Repos --------------------------------------------------------- -->
    <template v-else>
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
                <template v-if="row.repo.language"> · {{ row.repo.language }}</template>
                · {{ row.repo.defaultBranch }} · {{ row.repo.openIssuesCount }} open issues · pushed
                {{ formatRelative(row.repo.pushedAt, now) }}
              </span>
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
