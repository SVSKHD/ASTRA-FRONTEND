<script setup lang="ts">
// GitHub dashboard: connection health and rate limit, the allowlisted repos,
// and for the selected repo its recent Actions runs and open PR / issue counts.
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import GithubConnectionCard from '@/components/github/GithubConnectionCard.vue'
import { aureon } from '@/api/client'
import { cc, must, repoParams, setRepo } from '@/control/api'
import { usePoll } from '@/control/poll'
import { loadRepos, repos } from '@/control/repos'
import { runTone } from '@/control/status'
import { ago } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

const router = useRouter()

const counts = useLoad(async () => {
  const p = repoParams()
  if (!p) return null
  const [pulls, issues, runs] = await Promise.all([
    aureon.GET('/api/v1/github/repositories/{owner}/{repo}/pulls', {
      params: { path: p, query: { state: 'open', per_page: 100 } },
    }),
    aureon.GET('/api/v1/github/repositories/{owner}/{repo}/issues', {
      params: { path: p, query: { state: 'open', per_page: 100 } },
    }),
    aureon.GET('/api/v1/github/repositories/{owner}/{repo}/actions/runs', {
      params: { path: p, query: { per_page: 5 } },
    }),
  ])
  const pl = must(pulls)
  const il = must(issues)
  return {
    pulls: `${pl.items.length}${pl.has_next ? '+' : ''}`,
    issues: `${il.items.length}${il.has_next ? '+' : ''}`,
    runs: must(runs).items,
  }
}, false)
watch(
  () => cc.repo,
  () => void counts.reload(),
  { immediate: true },
)
usePoll(() => counts.reload(), 60_000)
</script>

<template>
  <div class="tp-page">
    <div class="tp-grid">
      <GithubConnectionCard @synced="loadRepos()" />

      <Card title="Open work">
        <template v-if="counts.data.value">
          <div class="tp-row">
            <Button size="sm" variant="ghost" @click="router.push('/dev/pulls')"
              >{{ counts.data.value.pulls }} open pull requests</Button
            >
            <Button size="sm" variant="ghost" @click="router.push('/dev/issues')"
              >{{ counts.data.value.issues }} open issues</Button
            >
          </div>
          <ul v-if="counts.data.value.runs.length" class="tp-list" aria-label="Recent runs">
            <li v-for="r in counts.data.value.runs" :key="r.id" class="tp-item">
              <div class="tp-main">
                <span class="tp-strong">{{ r.name ?? r.path ?? `run ${r.id}` }}</span>
                <span class="tp-note"
                  >{{ r.branch ?? '—' }} · {{ r.event }} · {{ ago(r.created_at) }}</span
                >
              </div>
              <Badge
                :tone="runTone(r.status, r.conclusion)"
                :label="r.conclusion ?? r.status ?? '—'"
              />
            </li>
          </ul>
          <p v-else class="tp-note">No Actions runs on this repository yet.</p>
        </template>
        <p v-else-if="counts.error.value" class="tp-note" role="alert">{{ counts.error.value }}</p>
        <p v-else-if="!cc.repo" class="tp-note">Pick a repository to see its open work.</p>
      </Card>
    </div>

    <Card title="Repositories">
      <ul v-if="repos.items.length" class="tp-list">
        <li v-for="r in repos.items" :key="r.id" class="tp-item">
          <div class="tp-main">
            <span class="tp-strong">{{ r.full_name }}</span>
            <span class="tp-note"
              >{{ r.private ? 'private' : 'public' }} · {{ r.default_branch ?? '—' }} · pushed
              {{ ago(r.pushed_at) }}{{ r.archived ? ' · archived' : '' }}</span
            >
            <span v-if="r.description" class="tp-note">{{ r.description }}</span>
          </div>
          <Button
            size="sm"
            :variant="r.full_name === cc.repo ? 'tinted' : 'ghost'"
            @click="setRepo(r.full_name)"
            >{{ r.full_name === cc.repo ? 'Selected' : 'Select' }}</Button
          >
        </li>
      </ul>
      <p v-else-if="repos.error" class="tp-note" role="alert">{{ repos.error }}</p>
      <EmptyState
        v-else-if="repos.loaded"
        title="No repositories are visible"
        description="The server lists only allowlisted repos. Sync, or widen GITHUB_ALLOWED_REPOS on the server."
      />
      <template #footer>
        <Button size="sm" variant="secondary" :loading="repos.loading" @click="loadRepos(true)"
          >Sync from GitHub</Button
        >
      </template>
    </Card>
  </div>
</template>
