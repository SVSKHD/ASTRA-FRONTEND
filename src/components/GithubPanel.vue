<script setup lang="ts">
import TextInput from '@/components/ui/TextInput.vue'
// Settings → Integrations → GitHub (section 13a). "Connect GitHub", then a repo
// picker listing the repos the App installation can see with a toggle per repo.
//
// The panel never sees a GitHub token: connecting means installing the GitHub
// App, and every read here is a ghProxy Cloud Function call authenticated with
// the user's Firebase ID token.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useStyles } from '@/composables/useStyles'
import { DANGER, SUCCESS, WARNING, pxify, typeStep } from '@/styles'
import { formatRelative } from '@/utils/timestamps'
import { pausedLabel, rateLimitLabel } from '@/utils/ghPoll'
import type { LinkedRepo } from '@/types'

const app = useAppStore()
const auth = useAuthStore()
const { c, s } = useStyles()
const { githubPanelOpen } = storeToRefs(auth)
const { githubIntegration, repos, ghInstalled, ghBusy, ghError } = storeToRefs(app)

const search = ref('')

// Opening the panel is what triggers the installation read — there is no reason
// to spend rate limit on a panel nobody opened.
watch(
  githubPanelOpen,
  (open) => {
    if (open && app.githubConfigured && ghInstalled.value === null && !ghBusy.value) {
      void app.loadInstalledRepos()
    }
  },
  { immediate: true },
)

const linkedIds = computed(() => new Set(repos.value.map((r) => r.id)))

// The picker lists what the installation can see; linked repos sort first so the
// current selection is readable at a glance.
const pickerRepos = computed<LinkedRepo[]>(() => {
  const q = search.value.trim().toLowerCase()
  return (ghInstalled.value || [])
    .filter((r) => !q || r.fullName.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => {
      const la = linkedIds.value.has(a.id) ? 0 : 1
      const lb = linkedIds.value.has(b.id) ? 0 : 1
      return la - lb || b.pushedAt - a.pushedAt
    })
})

// Rate limit and the paused state are always on screen: a stalled sync should
// be explicable at a glance rather than looking like nothing is happening.
const now = ref(Date.now())
const rateLabel = computed(() => rateLimitLabel(githubIntegration.value.rateLimit, now.value))
const paused = computed(() =>
  pausedLabel(githubIntegration.value.pausedUntil, githubIntegration.value.pausedReason, now.value),
)
const lastSync = computed(() => githubIntegration.value.lastSyncAt)

// Tick the clock while the panel is open so "resuming in 3m" counts down.
let clock: ReturnType<typeof setInterval> | undefined
watch(
  githubPanelOpen,
  (open) => {
    clearInterval(clock)
    clock = open ? setInterval(() => (now.value = Date.now()), 15_000) : undefined
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(clock))

async function syncNow() {
  for (const repo of repos.value) await app.refreshRepoIssues(repo.id, true)
}

const rowStyle = pxify({ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' })
const toggleTrack = (on: boolean) =>
  pxify({
    flexShrink: 0,
    width: 38,
    height: 22,
    borderRadius: 'var(--radius-card)',
    background: on ? SUCCESS : c.value.border,
    border: '1px solid ' + c.value.border,
    cursor: 'pointer',
    position: 'relative',
    transition: 'background .2s ease',
  })
const toggleKnob = (on: boolean) =>
  pxify({
    position: 'absolute',
    top: 2,
    left: on ? 18 : 2,
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#fff',
    transition: 'left .2s ease',
  })
const bannerStyle = (col: string) =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-1)',
    padding: '8px 10px',
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + col,
    background: 'color-mix(in oklch, ' + col + ' 14%, transparent)',
    ...typeStep('xs'),
    color: c.value.text,
  })
const avatarStyle = pxify({ width: 26, height: 26, borderRadius: '50%', flexShrink: 0 })
</script>

<template>
  <template v-if="githubPanelOpen">
    <div :style="s.dialogOverlay" @click="auth.closeGithubPanel()"></div>
    <div :style="s.ghPanel">
      <div :style="s.drawerHeader">
        <span :style="s.drawerTitle">GitHub</span>
        <button :style="s.del" @click="auth.closeGithubPanel()">×</button>
      </div>

      <!-- No proxy URL: the integration is simply not deployed here. Say so
           rather than offering a Connect button that cannot work. -->
      <div v-if="!app.githubConfigured" :style="s.ghLinkCard">
        <span :style="s.finMeta">
          GitHub is not configured for this workspace. Set <code>VITE_GH_PROXY_URL</code> to the
          ghProxy Cloud Function endpoint — the access token stays in Secret Manager and never
          reaches the browser.
        </span>
      </div>

      <template v-else-if="!app.githubConnected">
        <div :style="s.ghLinkCard">
          <span :style="s.finMeta">
            Install the GitHub App to pick exactly which repositories Spasta can read. Issues are
            read/write; contents, metadata and pull requests are read-only.
          </span>
          <a
            v-if="app.githubInstallUrl()"
            :style="s.saveBtn"
            :href="app.githubInstallUrl()"
            target="_blank"
            rel="noopener noreferrer"
            >Connect GitHub</a
          >
          <button :style="s.editBtn" :disabled="ghBusy" @click="app.connectGithub()">
            {{ ghBusy ? 'Checking…' : "I've installed it" }}
          </button>
          <span v-if="ghError" :style="s.finMeta">{{ ghError }}</span>
        </div>
      </template>

      <template v-else>
        <div :style="rowStyle">
          <img
            v-if="githubIntegration.avatarUrl"
            :src="githubIntegration.avatarUrl"
            :style="avatarStyle"
            alt=""
          />
          <div :style="s.taskMain">
            <span :style="s.dlTitle">{{ githubIntegration.login || 'Installed' }}</span>
            <span :style="s.finMeta">
              installation {{ githubIntegration.installationId }} · connected
              {{ formatRelative(githubIntegration.connectedAt ?? 0, now) }}
              <template v-if="lastSync"> · synced {{ formatRelative(lastSync, now) }}</template>
            </span>
          </div>
          <button :style="s.del" title="Disconnect" @click="app.disconnectGithub()">
            Disconnect
          </button>
        </div>

        <!-- Rate limit is always visible, so a stalled sync is explicable (13f). -->
        <div :style="s.ghConnRow">
          <span :style="s.finMeta">{{ rateLabel }}</span>
          <button :style="s.importBtn" @click="syncNow">Sync now</button>
        </div>
        <div v-if="paused" :style="bannerStyle(WARNING)">
          <strong>Sync paused</strong>
          <span>{{ paused }}</span>
          <button :style="s.editBtn" @click="app.resumeGithubSync()">Resume now</button>
        </div>
        <div v-if="ghError" :style="bannerStyle(DANGER)">{{ ghError }}</div>

        <TextInput placeholder="Search repositories…" v-model="search" />

        <div v-if="ghBusy && !ghInstalled" :style="s.ghShimmer"></div>
        <div v-else-if="!pickerRepos.length" :style="s.empty">
          No repositories in this installation.
        </div>
        <div v-else :style="s.list">
          <div v-for="repo in pickerRepos" :key="repo.id" :style="s.ghRepoCard">
            <div :style="rowStyle">
              <div :style="s.taskMain">
                <span :style="s.dlTitle">{{ repo.fullName }}</span>
                <span :style="s.finMeta">
                  {{ repo.private ? 'private' : 'public' }}
                  <template v-if="repo.language"> · {{ repo.language }}</template>
                  · {{ repo.defaultBranch }} · {{ repo.openIssuesCount }} open
                </span>
              </div>
              <div
                :style="toggleTrack(linkedIds.has(repo.id))"
                role="switch"
                :aria-checked="linkedIds.has(repo.id)"
                :title="linkedIds.has(repo.id) ? 'Unlink from workspace' : 'Link to workspace'"
                @click="app.toggleRepoLink(repo)"
              >
                <div :style="toggleKnob(linkedIds.has(repo.id))"></div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </template>
</template>
