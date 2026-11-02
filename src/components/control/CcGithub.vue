<script setup lang="ts">
// GitHub dashboard: connection health and rate limit, the allowlisted repos,
// and for the selected repo its recent Actions runs and open PR / issue counts.
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { aureon } from '@/api/client'
import { cc, must, repoParams, setRepo } from '@/control/api'
import { usePoll } from '@/control/poll'
import { loadRepos, repos } from '@/control/repos'
import { runTone } from '@/control/status'
import { ago, when } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

const router = useRouter()

const conn = useLoad(async () => must(await aureon.GET('/api/v1/github/connection')))
async function check() {
  try {
    conn.data.value = must(await aureon.POST('/api/v1/github/connection/check'))
  } catch (e) {
    conn.error.value = (e as Error).message
  }
}

const rate = computed(() => conn.data.value?.rate_limit ?? null)
const ratePct = computed(() =>
  rate.value?.limit && rate.value.remaining != null
    ? Math.round((rate.value.remaining / rate.value.limit) * 100)
    : null,
)

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
      <Card title="Connection">
        <template v-if="conn.data.value">
          <div
            v-if="!conn.data.value.configured"
            class="cc-notice cc-notice--warning"
            role="status"
          >
            <p class="cc-notice__title">GitHub is not configured on the server</p>
            <p class="tp-note">
              Set GITHUB_TOKEN in Aureon's environment. The token never comes to the browser.
            </p>
          </div>
          <template v-else>
            <div class="tp-row">
              <Badge
                :tone="
                  conn.data.value.ok
                    ? 'success'
                    : conn.data.value.ok === false
                      ? 'danger'
                      : 'neutral'
                "
                :label="
                  conn.data.value.ok
                    ? 'Healthy'
                    : conn.data.value.ok === false
                      ? 'Failing'
                      : 'Not checked'
                "
              />
              <span class="tp-strong">{{ conn.data.value.login ?? 'unknown login' }}</span>
            </div>
            <p class="tp-note">
              {{ conn.data.value.token_kind ?? 'token' }} · fingerprint
              {{ conn.data.value.fingerprint ?? '—' }} · checked
              {{ ago(conn.data.value.last_checked_at) }}
            </p>
            <p v-if="conn.data.value.detail" class="tp-note">{{ conn.data.value.detail }}</p>
            <p v-if="rate && rate.limit" class="tp-note tp-num">
              Rate limit: {{ rate.remaining }} of {{ rate.limit }} left ({{ ratePct }}%) · resets
              {{ when(rate.reset_at) }}
            </p>
            <p v-else class="tp-note">
              No rate-limit reading yet. Check the connection to get one.
            </p>
            <p class="tp-note">
              Allowlist:
              {{
                [...conn.data.value.allowed_repos, ...conn.data.value.allowed_owners].join(', ') ||
                "the token user's own repositories"
              }}
            </p>
          </template>
        </template>
        <p v-else-if="conn.error.value" class="tp-note" role="alert">{{ conn.error.value }}</p>
        <template #footer>
          <Button size="sm" variant="secondary" :loading="conn.loading.value" @click="check"
            >Check now</Button
          >
        </template>
      </Card>

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
