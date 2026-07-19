<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import type { Repo } from '@/types'

const app = useAppStore()
const auth = useAuthStore()
const { c, dark, s } = useStyles()
const { tasks } = storeToRefs(app)
const { githubPanelOpen, githubLinked, ghRepos, ghSearch, expandedRepoId } = storeToRefs(auth)

const unlinked = computed(() => githubPanelOpen.value && !githubLinked.value)
const linkedNoRepos = computed(() => githubLinked.value && !ghRepos.value)
const showRepos = computed(() => githubLinked.value && !!ghRepos.value)

interface RepoView {
  repo: Repo
  expanded: boolean
  ciColor: string
  attached: { id: number; title: string; done: boolean }[]
  doneCount: number
  pct: number
}
const repos = computed<RepoView[]>(() => {
  const q = ghSearch.value.trim().toLowerCase()
  return (ghRepos.value || [])
    .filter((r) => !q || (r.name + ' ' + r.desc).toLowerCase().indexOf(q) !== -1)
    .slice()
    .sort((a, b) => b.pushedMs - a.pushedMs)
    .map((repo) => {
      const attached = tasks.value.filter((t) => t.repo === repo.full)
      const doneCount = attached.filter((t) => t.done).length
      return {
        repo,
        expanded: expandedRepoId.value === repo.id,
        ciColor: repo.ci === 'passing' ? (dark.value ? 'oklch(0.72 0.15 145)' : 'oklch(0.55 0.15 145)') : 'oklch(0.65 0.2 25)',
        attached: attached.map((t) => ({ id: t.id, title: t.title, done: t.done })),
        doneCount,
        pct: attached.length ? Math.round((doneCount / attached.length) * 100) : 0,
      }
    })
})

const headerStyle = pxify({ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' })
function langDotStyle(color: string) {
  return pxify({
    display: 'inline-block',
    width: 9,
    height: 9,
    borderRadius: '50%',
    background: color,
    marginRight: 8,
    boxShadow: '0 0 6px ' + color,
    verticalAlign: 'middle',
  })
}
function ciBadgeStyle(rv: RepoView) {
  return pxify({
    flexShrink: 0,
    fontSize: 10,
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: 7,
    color: rv.ciColor,
    background: rv.repo.ci === 'passing' ? 'rgba(90,200,140,0.14)' : 'rgba(255,90,90,0.14)',
    whiteSpace: 'nowrap',
  })
}
function progressInner(pct: number) {
  return pxify({
    height: '100%',
    width: pct + '%',
    background: c.value.accent,
    borderRadius: 3,
    boxShadow: '0 0 8px ' + c.value.accent,
    transition: 'width .5s ease',
  })
}
</script>

<template>
  <template v-if="githubPanelOpen">
    <div :style="s.dialogOverlay" @click="auth.closeGithubPanel()"></div>
    <div :style="s.ghPanel">
      <div :style="s.drawerHeader">
        <span :style="s.drawerTitle">GitHub</span>
        <button :style="s.del" @click="auth.closeGithubPanel()">×</button>
      </div>

      <div v-if="unlinked" :style="s.ghLinkCard">
        <span :style="s.finMeta">Connect GitHub to browse repos, issues, PRs and CI status.</span>
        <button :style="s.saveBtn" @click="auth.linkGithub()">Link GitHub</button>
      </div>

      <div v-else-if="linkedNoRepos" :style="s.ghShimmer"></div>

      <template v-else-if="showRepos">
        <input :style="s.input" placeholder="Search repos…" :value="ghSearch" @input="auth.setGhSearch(($event.target as HTMLInputElement).value)" />
        <div :style="s.list">
          <div v-for="rv in repos" :key="rv.repo.id" :style="s.ghRepoCard">
            <div :style="headerStyle" @click="auth.toggleRepoExpand(rv.repo.id)">
              <div :style="s.taskMain">
                <span :style="s.dlTitle"><span :style="langDotStyle(rv.repo.langColor)"></span>{{ rv.repo.name }}</span>
                <span :style="s.finMeta">{{ rv.repo.desc }}</span>
              </div>
              <span :style="ciBadgeStyle(rv)">CI {{ rv.repo.ci }}</span>
            </div>
            <div :style="s.ghRepoMeta">
              <span>★ {{ rv.repo.stars }}</span>
              <span>issues {{ rv.repo.issues }}</span>
              <span>PRs {{ rv.repo.prs }}</span>
              <span>pushed {{ rv.repo.pushedLabel }}</span>
            </div>
            <template v-if="rv.attached.length">
              <div :style="s.ghProgressOuter"><div :style="progressInner(rv.pct)"></div></div>
              <span :style="s.finMeta">{{ rv.doneCount }}/{{ rv.attached.length }} attached tasks done</span>
            </template>
            <div v-if="rv.expanded" :style="s.ghSection">
              <span :style="s.ghLabel">Attached tasks</span>
              <span v-if="rv.attached.length === 0" :style="s.finMeta">None yet — import an issue below.</span>
              <div v-for="at in rv.attached" :key="at.id" :style="s.ghIssueRow">
                <span :style="s.ghIssueText">{{ at.title }}</span>
                <span :style="s.finMeta">{{ at.done ? 'done' : 'open' }}</span>
              </div>
              <span :style="s.ghLabel">Open issues</span>
              <div v-for="iss in rv.repo.openIssues" :key="iss.id" :style="s.ghIssueRow">
                <span :style="s.ghIssueText">#{{ iss.num }} · {{ iss.title }}</span>
                <button :style="s.importBtn" @click="app.importIssue(rv.repo, iss)">Import</button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </template>
</template>
