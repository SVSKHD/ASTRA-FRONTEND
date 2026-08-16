<script setup lang="ts">
// Dashboard repo card (13e): for each linked repo, the open issue count, the
// last commit on the default branch with its author and relative time, and a
// progress line of linked tasks done / total.
//
// The commit is a live read through ghProxy, so the card renders immediately
// from what the workspace already knows and fills the commit line in when it
// arrives — it never blocks on the network.
import { computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { formatRelative } from '@/utils/timestamps'
import { repoTaskProgress } from '@/utils/issueFilters'

const app = useAppStore()
const ui = useUiStore()
const { c } = useStyles()
const { repos, tasks } = storeToRefs(app)

const now = Date.now()

// Newest activity first, and only a handful — the dashboard is a glance.
const rows = computed(() =>
  repos.value
    .slice()
    .sort((a, b) => b.pushedAt - a.pushedAt)
    .slice(0, 3)
    .map((repo) => ({
      repo,
      progress: repoTaskProgress(repo.id, tasks.value),
      commit: app.activityOf(repo.id).commits[0] ?? null,
    })),
)

function loadCommits() {
  for (const row of rows.value) void app.loadRepoActivity(row.repo.id)
}
onMounted(loadCommits)
watch(() => repos.value.length, loadCommits)

const card = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '18px 18px 15px',
    borderRadius: 18,
    background: c.value.card,
    border: '1px solid ' + c.value.border,
    boxShadow: c.value.shadow,
    minWidth: 0,
  }),
)
const headRow = pxify({ display: 'flex', alignItems: 'center', gap: 8 })
const label = computed(() =>
  pxify({ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.value.dim }),
)
const countChip = computed(() =>
  pxify({
    fontSize: 11,
    fontWeight: 700,
    color: c.value.accent,
    padding: '1px 7px',
    borderRadius: 999,
    border: '1px solid ' + c.value.accent,
  }),
)
const viewAllBtn = computed(() =>
  pxify({
    marginLeft: 'auto',
    fontSize: 11,
    fontWeight: 600,
    color: c.value.dim,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  }),
)
const repoRow = pxify({ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 })
const nameRow = pxify({ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 })
const nameStyle = computed(() =>
  pxify({
    fontSize: 13,
    color: c.value.text,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  }),
)
const meta = computed(() =>
  pxify({
    fontSize: 11,
    color: c.value.dim,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
)
const track = computed(() =>
  pxify({ height: 5, borderRadius: 3, background: c.value.border, overflow: 'hidden' }),
)
function fill(pct: number) {
  return pxify({ height: '100%', width: pct + '%', background: c.value.accent, borderRadius: 3 })
}
</script>

<template>
  <div v-if="rows.length" :style="card">
    <div :style="headRow">
      <span :style="label">Repos</span>
      <span :style="countChip">{{ repos.length }}</span>
      <button :style="viewAllBtn" @click="ui.setTab('github')">View all</button>
    </div>
    <div v-for="row in rows" :key="row.repo.id" :style="repoRow">
      <div :style="nameRow">
        <span :style="nameStyle">{{ row.repo.fullName }}</span>
        <span :style="meta">{{ row.repo.openIssuesCount }} open</span>
      </div>
      <span v-if="row.commit" :style="meta">
        {{ row.commit.message }} — {{ row.commit.author }} ·
        {{ formatRelative(row.commit.committedAt, now) }}
      </span>
      <span v-else :style="meta">pushed {{ formatRelative(row.repo.pushedAt, now) }}</span>
      <template v-if="row.progress.total">
        <div :style="track">
          <div :style="fill(Math.round((row.progress.done / row.progress.total) * 100))"></div>
        </div>
        <span :style="meta"
          >{{ row.progress.done }}/{{ row.progress.total }} linked tasks done</span
        >
      </template>
    </div>
  </div>
</template>
