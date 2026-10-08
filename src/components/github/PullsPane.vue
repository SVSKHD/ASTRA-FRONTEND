<script setup lang="ts">
// The GitHub tab's Pull requests pane: one repo's PRs, open, closed or all,
// each a row with its state, branches, author, CI and size; opening one shows
// its description and every file it changes as a numbered diff.
//
// Read-only on purpose. Merging is the one GitHub action that is hard to take
// back, and it belongs where the checks and the reviewers are.
import { computed, ref, watch } from 'vue'
import { ghCall } from '@/utils/ghProxy'
import { useGhRepos } from '@/composables/useGhRepos'
import { formatRelative } from '@/utils/timestamps'
import { renderMarkdown } from '@/utils/markdown'
import { parsePatch, pullStatus, type PullStatus } from '@/utils/ghCode'
import Icon from '@/components/ui/Icon.vue'
import Select from '@/components/ui/Select.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import SearchField from '@/components/ui/SearchField.vue'

interface RawPull {
  number: number
  title: string
  state: string
  draft?: boolean
  merged_at?: string | null
  updated_at: string
  html_url: string
  user?: { login?: string; avatar_url?: string }
  head?: { ref?: string }
  base?: { ref?: string }
  ci?: string
  comments?: number
  labels?: { name: string }[]
}
interface RawPullDetail extends RawPull {
  body?: string | null
  additions?: number
  deletions?: number
  changed_files?: number
  commits?: number
  mergeable_state?: string
}
interface RawFile {
  filename: string
  status: string
  additions: number
  deletions: number
  patch?: string
}

const { options, repo, choose, ensureLoaded } = useGhRepos()
ensureLoaded()

const state = ref<'open' | 'closed' | 'all'>('open')
const query = ref('')
const pulls = ref<RawPull[]>([])
const loading = ref(false)
const error = ref('')
const now = ref(Date.now())
// The PR that is opened. Declared before the watcher below, which resets it
// and runs immediately.
const open = ref<number | null>(null)

async function load() {
  const r = repo.value
  if (!r) return
  loading.value = true
  error.value = ''
  try {
    const res = await ghCall<RawPull[]>('pulls', {
      owner: r.owner,
      repo: r.name,
      state: state.value,
      perPage: 50,
    })
    pulls.value = Array.isArray(res.data) ? res.data : []
    now.value = Date.now()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load pull requests.'
    pulls.value = []
  } finally {
    loading.value = false
  }
}
watch(
  [() => repo.value?.id, state],
  () => {
    open.value = null
    void load()
  },
  { immediate: true },
)

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return pulls.value
  return pulls.value.filter(
    (p) => String(p.number).includes(q) || p.title.toLowerCase().includes(q),
  )
})

// ---- one PR, opened ----------------------------------------------------------
const detail = ref<RawPullDetail | null>(null)
const files = ref<RawFile[]>([])
const detailLoading = ref(false)
const shut = ref<Set<string>>(new Set())

async function toggle(n: number) {
  if (open.value === n) {
    open.value = null
    return
  }
  open.value = n
  detail.value = null
  files.value = []
  shut.value = new Set()
  const r = repo.value
  if (!r) return
  detailLoading.value = true
  try {
    const [d, f] = await Promise.all([
      ghCall<RawPullDetail>('pull', { owner: r.owner, repo: r.name, number: n }),
      ghCall<RawFile[]>('pullFiles', { owner: r.owner, repo: r.name, number: n, perPage: 100 }),
    ])
    if (open.value !== n) return
    detail.value = d.data
    files.value = Array.isArray(f.data) ? f.data : []
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not open that pull request.'
  } finally {
    detailLoading.value = false
  }
}
function toggleFile(name: string) {
  const next = new Set(shut.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  shut.value = next
}

const STATUS_ICON: Record<PullStatus, 'share' | 'pencil' | 'check' | 'x'> = {
  open: 'share',
  draft: 'pencil',
  merged: 'check',
  closed: 'x',
}
function ciLabel(ci?: string) {
  return ci === 'passing'
    ? 'Checks pass'
    : ci === 'failing'
      ? 'Checks fail'
      : ci === 'pending'
        ? 'Checks running'
        : ''
}
function time(iso: string) {
  return formatRelative(Date.parse(iso), now.value)
}
</script>

<template>
  <div class="prp">
    <div class="prp__bar">
      <Select
        :model-value="repo?.id ?? ''"
        :options="options"
        size="md"
        placeholder="Pick a repository"
        aria-label="Repository"
        class="prp__repo"
        @update:model-value="choose"
      />
      <SegmentedControl
        v-model="state"
        size="sm"
        as="tablist"
        aria-label="Pull request state"
        :options="[
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Closed' },
          { value: 'all', label: 'All' },
        ]"
      />
      <SearchField
        v-model="query"
        size="md"
        placeholder="Filter by # or title…"
        class="prp__find"
      />
      <button type="button" class="gh-icon-btn" title="Refresh" aria-label="Refresh" @click="load">
        <Icon name="refresh-cw" size="sm" :class="{ 'is-spinning': loading }" />
      </button>
    </div>

    <p v-if="error" class="gh-note gh-note--error">
      <Icon name="alert-circle" size="sm" /> {{ error }}
    </p>

    <div v-if="!repo" class="gh-empty">
      <span class="gh-empty__icon"><Icon name="github" size="lg" /></span>
      <p class="gh-empty__title">No repository yet</p>
      <p class="gh-empty__text">Connect GitHub in Settings, and your repositories appear here.</p>
    </div>
    <div v-else-if="loading && !pulls.length" class="prp__list">
      <div v-for="i in 4" :key="i" class="gh-skel" />
    </div>
    <div v-else-if="!shown.length" class="gh-empty">
      <span class="gh-empty__icon"><Icon name="check" size="lg" /></span>
      <p class="gh-empty__title">
        {{
          query
            ? 'No pull request matches'
            : `No ${state === 'all' ? '' : state + ' '}pull requests`
        }}
      </p>
      <p class="gh-empty__text">{{ repo.fullName }}</p>
    </div>

    <ul v-else class="prp__list">
      <li
        v-for="p in shown"
        :key="p.number"
        class="prp__item"
        :class="{ 'is-open': open === p.number }"
      >
        <button
          type="button"
          class="prp__row"
          :aria-expanded="open === p.number"
          @click="toggle(p.number)"
        >
          <span class="prp__status" :data-status="pullStatus(p)" :title="pullStatus(p)">
            <Icon :name="STATUS_ICON[pullStatus(p)]" size="sm" />
          </span>
          <span class="prp__main">
            <span class="prp__title">
              {{ p.title }}
              <span class="prp__num">#{{ p.number }}</span>
            </span>
            <span class="prp__meta">
              <img v-if="p.user?.avatar_url" :src="p.user.avatar_url" alt="" class="prp__avatar" />
              <span>{{ p.user?.login }}</span>
              <span aria-hidden="true">·</span>
              <span class="prp__refs">
                <code>{{ p.head?.ref }}</code>
                <Icon name="chevron-right" size="xs" />
                <code>{{ p.base?.ref }}</code>
              </span>
              <span aria-hidden="true">·</span>
              <span>{{ time(p.updated_at) }}</span>
            </span>
          </span>
          <span class="prp__side">
            <span v-for="l in (p.labels ?? []).slice(0, 2)" :key="l.name" class="gh-chip">{{
              l.name
            }}</span>
            <span v-if="ciLabel(p.ci)" class="gh-ci" :data-ci="p.ci">
              <span class="gh-ci__dot" />{{ ciLabel(p.ci) }}
            </span>
            <span class="gh-pill" :data-status="pullStatus(p)">{{ pullStatus(p) }}</span>
          </span>
        </button>

        <div v-if="open === p.number" class="prp__detail">
          <div v-if="detailLoading" class="gh-skel gh-skel--tall" />
          <template v-else-if="detail">
            <div class="prp__stats">
              <span class="prp__stat"
                ><b>{{ detail.commits ?? 0 }}</b> commits</span
              >
              <span class="prp__stat"
                ><b>{{ detail.changed_files ?? files.length }}</b> files</span
              >
              <span class="prp__stat prp__stat--add">+{{ detail.additions ?? 0 }}</span>
              <span class="prp__stat prp__stat--del">−{{ detail.deletions ?? 0 }}</span>
              <a :href="p.html_url" target="_blank" rel="noopener noreferrer" class="gh-link">
                Open on GitHub <Icon name="external-link" size="xs" />
              </a>
            </div>
            <!-- Sanitised markdown: raw HTML in a PR body renders as text. -->
            <div v-if="detail.body" class="prp__body md" v-html="renderMarkdown(detail.body)" />
            <p v-else class="gh-muted">No description.</p>

            <div class="prp__files">
              <section v-for="f in files" :key="f.filename" class="prp__file">
                <button type="button" class="prp__file-head" @click="toggleFile(f.filename)">
                  <Icon :name="shut.has(f.filename) ? 'chevron-right' : 'chevron-down'" size="xs" />
                  <span class="prp__file-name">{{ f.filename }}</span>
                  <span class="gh-pill gh-pill--sm" :data-file="f.status">{{ f.status }}</span>
                  <span class="prp__stat--add">+{{ f.additions }}</span>
                  <span class="prp__stat--del">−{{ f.deletions }}</span>
                </button>
                <div v-if="!shut.has(f.filename)" class="prp__diff gh-code">
                  <p v-if="!f.patch" class="gh-muted prp__nopatch">
                    No diff to show — binary, renamed only, or too large.
                  </p>
                  <div
                    v-for="(l, i) in parsePatch(f.patch ?? '')"
                    v-else
                    :key="i"
                    class="prp__line"
                    :data-kind="l.kind"
                  >
                    <span class="prp__ln">{{ l.oldNo ?? '' }}</span>
                    <span class="prp__ln">{{ l.newNo ?? '' }}</span>
                    <span class="prp__sign">{{
                      l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ''
                    }}</span>
                    <span class="prp__text">{{ l.text }}</span>
                  </div>
                </div>
              </section>
            </div>
          </template>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.prp {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.prp__bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.prp__repo {
  flex: 0 1 280px;
  min-width: 200px;
}
.prp__find {
  flex: 1 1 200px;
  min-width: 0;
}
.prp__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.prp__item {
  min-width: 0;
  border: 1px solid var(--gh-line);
  border-radius: 16px;
  background: var(--theme-card);
  transition: border-color var(--dur-fast) ease;
}
.prp__item:hover,
.prp__item.is-open {
  border-color: color-mix(in oklch, var(--theme-accent) 40%, transparent);
}
.prp__row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 12px 14px;
  border: 0;
  background: none;
  color: var(--theme-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.prp__row:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: -2px;
  border-radius: 16px;
}
.prp__status {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--gh-wash);
  color: var(--theme-accent);
}
.prp__status[data-status='merged'] {
  background: color-mix(in oklch, var(--theme-success) 16%, transparent);
  color: var(--theme-success);
}
.prp__status[data-status='closed'] {
  background: color-mix(in oklch, var(--theme-danger) 14%, transparent);
  color: var(--theme-danger);
}
.prp__status[data-status='draft'] {
  background: color-mix(in oklch, var(--theme-text) 7%, transparent);
  color: var(--theme-dim);
}
.prp__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.prp__title {
  min-width: 0;
  overflow: hidden;
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.prp__num {
  color: var(--theme-dim);
  font-weight: var(--weight-medium);
}
.prp__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  white-space: nowrap;
}
.prp__avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
}
.prp__refs {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  overflow: hidden;
}
.prp__refs code {
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--gh-wash);
  color: var(--theme-text);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
}
.prp__side {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.prp__detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 14px 16px 60px;
}
.prp__stats {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  font-size: var(--text-sm);
  color: var(--theme-dim);
}
.prp__stat b {
  color: var(--theme-text);
  font-weight: var(--weight-semibold);
}
.prp__stat--add {
  color: var(--theme-success);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.prp__stat--del {
  color: var(--theme-danger);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.prp__body {
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--gh-wash);
  font-size: var(--text-sm);
  overflow-x: auto;
}
.prp__files {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.prp__file {
  overflow: hidden;
  border: 1px solid var(--gh-line);
  border-radius: 12px;
}
.prp__file-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 8px 12px;
  border: 0;
  background: var(--gh-wash);
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-xs);
  text-align: left;
  cursor: pointer;
}
.prp__file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.prp__diff {
  max-height: 420px;
  overflow: auto;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: 1.6;
}
.prp__nopatch {
  margin: 0;
  padding: 10px 12px;
}
.prp__line {
  display: grid;
  grid-template-columns: 44px 44px 16px minmax(0, 1fr);
  min-width: max-content;
}
.prp__line[data-kind='add'] {
  background: color-mix(in oklch, var(--theme-success) 12%, transparent);
}
.prp__line[data-kind='del'] {
  background: color-mix(in oklch, var(--theme-danger) 11%, transparent);
}
.prp__line[data-kind='hunk'] {
  background: color-mix(in oklch, var(--theme-accent) 9%, transparent);
  color: var(--theme-dim);
}
.prp__ln {
  padding-right: 8px;
  color: var(--theme-dim);
  text-align: right;
  user-select: none;
  opacity: 0.7;
}
.prp__sign {
  color: var(--theme-dim);
  user-select: none;
}
.prp__line[data-kind='add'] .prp__sign {
  color: var(--theme-success);
}
.prp__line[data-kind='del'] .prp__sign {
  color: var(--theme-danger);
}
.prp__text {
  min-width: 0;
  padding-right: 12px;
  white-space: pre;
}
.prp__line[data-kind='hunk'] .prp__text {
  grid-column: 1 / -1;
  padding-left: 12px;
}
@media (max-width: 700px) {
  .prp__side .gh-chip,
  .prp__side .gh-ci {
    display: none;
  }
  .prp__detail {
    padding-left: 14px;
  }
}
</style>
