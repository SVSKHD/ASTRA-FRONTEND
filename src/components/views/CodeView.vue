<script setup lang="ts">
// The Code tab (section 40).
//
// Three levels, each opened by the one above it: repositories with their open
// count, expanding to pull requests, expanding to the conversation. That is the
// shape of the question — "anything waiting on me?" answered at a glance, then
// narrowed twice — and it is why the comments are loaded only when a pull
// request is actually opened.
//
// Nothing on this tab calls GitHub. Functions write what the webhook and the
// sweep told them into Firestore and this watches it, which is what makes a
// comment appear while its author is still on the page and why one PAT serves
// however many tabs are open.
import { computed, ref } from 'vue'
import ListToolbar from '@/components/ListToolbar.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import TextInput from '@/components/ui/TextInput.vue'
import PullRow from '@/components/code/PullRow.vue'
import CommentThread from '@/components/code/CommentThread.vue'
import GithubSetup from '@/components/code/GithubSetup.vue'
import { useStyles } from '@/composables/useStyles'
import { useGhThread } from '@/composables/useGhThread'
import { useGithubLive } from '@/composables/useGithubLive'
import { useRowFlash } from '@/composables/useRowFlash'
import { useSettings } from '@/composables/useSettings'
import { countOf, dayLabel } from '@/utils/format'
import { IST, ymdOn } from '@/utils/tradeTime'

const { panelStyle } = useStyles()
const store = useSettings()
const { settings, ready } = store
const live = useGithubLive()
const { flashing } = useRowFlash(live.touched)

const openRepo = ref<number | null>(null)
const openPull = ref<{ repoId: number; number: number } | null>(null)
const thread = useGhThread(() => openPull.value)

/**
 * The guided setup (section 44, item 9).
 *
 * Open by default when nothing is tracked, because on the first visit the tab
 * has nothing to show and the setup is the only thing worth being on it. Once a
 * repository is tracked it folds away behind a button — a reader coming back to
 * read a review does not want four numbered steps above it.
 */
const setupOpen = ref(false)
const setupShown = computed(
  () => setupOpen.value || (!settings.value.trackedRepos.length && !live.repos.value.length),
)

const adding = ref('')
const addError = computed(() =>
  adding.value && !/^[\w.-]+\/[\w.-]+$/.test(adding.value.trim())
    ? 'Enter it as owner/name — not a full GitHub URL.'
    : '',
)

/** Tracking is a settings change, so it takes effect without any redeploy. */
function track() {
  const name = adding.value.trim().toLowerCase()
  if (!name || addError.value || settings.value.trackedRepos.includes(name)) return
  void store.save({ trackedRepos: [...settings.value.trackedRepos, name] })
  adding.value = ''
}

function untrack(name: string) {
  void store.save({ trackedRepos: settings.value.trackedRepos.filter((r) => r !== name) })
}

function toggleRepo(repoId: number) {
  openRepo.value = openRepo.value === repoId ? null : repoId
  openPull.value = null
}

/** Is this the one pull request whose conversation is showing? */
function isOpen(pull: { repoId: number; number: number }): boolean {
  return openPull.value?.repoId === pull.repoId && openPull.value?.number === pull.number
}

function togglePull(repoId: number, number: number) {
  const same = openPull.value?.repoId === repoId && openPull.value?.number === number
  openPull.value = same ? null : { repoId, number }
}

/** Tracked but nothing mirrored yet — a real state on the first day. */
const silent = computed(() =>
  settings.value.trackedRepos.filter(
    (name) => !live.repos.value.some((r) => r.fullName.toLowerCase() === name),
  ),
)
</script>

<template>
  <div :style="panelStyle" :data-ready="ready && !live.loading.value ? 'true' : 'false'">
    <ListToolbar title="Code">
      <template #actions>
        <Button variant="ghost" size="sm" @click="setupOpen = !setupOpen">
          {{ setupShown ? 'Hide setup' : 'Set up GitHub' }}
        </Button>
      </template>
    </ListToolbar>

    <Alert v-if="live.error.value" tone="danger">{{ live.error.value }}</Alert>

    <div class="cv__scroll">
      <GithubSetup v-if="setupShown" />

      <section class="cv__track">
        <TextInput
          :model-value="adding"
          placeholder="owner/name"
          aria-label="Track a repository"
          @update:model-value="adding = String($event)"
          @keydown.enter="track"
        />
        <Button variant="ghost" size="sm" :disabled="!adding || !!addError" @click="track">
          Track
        </Button>
        <p v-if="addError" class="cv__note cv__error">{{ addError }}</p>
        <p v-else class="cv__note">
          Webhook events for an untracked repository are acknowledged and dropped. Adding one here
          needs no redeploy — or pick from what your token can see, in the setup above.
        </p>
      </section>

      <EmptyState
        v-if="!live.repos.value.length && !settings.trackedRepos.length"
        title="No repositories tracked"
        description="Work through the four steps above: a fine-grained token, the repositories to track, and the webhook. The sweep fills in the rest within fifteen minutes."
      />

      <ul v-else class="cv__repos">
        <li v-for="repo in live.repos.value" :key="repo.id" class="cv__repo">
          <button
            type="button"
            class="cv__repoHead"
            :aria-expanded="openRepo === repo.repoId"
            @click="toggleRepo(repo.repoId)"
          >
            <span class="cv__repoName">{{ repo.fullName }}</span>
            <span class="cv__repoCount ui-mono">{{ countOf(repo.openPRCount, 'open PR') }}</span>
            <span class="cv__repoPushed">
              {{ repo.pushedAt ? `pushed ${dayLabel(ymdOn(IST, repo.pushedAt))}` : '' }}
            </span>
          </button>

          <div v-if="openRepo === repo.repoId" class="cv__pulls">
            <!-- The thread belongs to ITS pull request, inside the loop. Below
                 the list it would sit under whichever row happened to be last,
                 which reads as a conversation on the wrong pull request. -->
            <template v-for="pull in live.pullsByRepo.value[repo.repoId] ?? []" :key="pull.id">
              <PullRow
                :pull="pull"
                :expanded="isOpen(pull)"
                :flashing="flashing.has(pull.id)"
                @toggle="togglePull(pull.repoId, pull.number)"
              />
              <CommentThread
                v-if="isOpen(pull)"
                :comments="thread.comments.value"
                :loading="thread.loading.value"
              />
            </template>
            <p v-if="!(live.pullsByRepo.value[repo.repoId] ?? []).length" class="cv__note">
              Nothing mirrored for this repository yet.
            </p>
          </div>
        </li>

        <li v-for="name in silent" :key="name" class="cv__repo cv__repo--silent">
          <span class="cv__repoName">{{ name }}</span>
          <!-- Tracked and quiet is not the same as broken, and saying which is
               the difference between waiting and debugging. -->
          <span class="cv__note">tracked · nothing received yet</span>
          <Button variant="ghost" size="sm" @click="untrack(name)">Untrack</Button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.cv__scroll {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  padding-bottom: var(--sp-4);
}
.cv__track {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
/* A basis rather than a bare `flex: 1`: below about thirty characters of room
   the note wraps onto its own line instead of being squeezed into a four-word
   column beside the field, which is what it did at 390px. */
.cv__note {
  flex: 1 1 30ch;
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.cv__error {
  color: var(--theme-danger);
}
.cv__repos {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.cv__repo {
  min-width: 0;
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
  overflow: hidden;
}
.cv__repo--silent {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  padding: var(--sp-2) var(--sp-3);
}
.cv__repoHead {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: baseline;
  gap: var(--sp-3);
  width: 100%;
  min-width: 0;
  padding: var(--sp-3);
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.cv__repoName {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-primary, var(--theme-text));
}
.cv__repoCount,
.cv__repoPushed {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
  font-variant-numeric: tabular-nums;
}
.cv__pulls {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 0 var(--sp-2) var(--sp-2);
}
</style>
