<script setup lang="ts">
// "All repositories", in the GitHub tab's Repos pane.
//
// WHY IT EXISTS. Every other repository list in the app is a MIRROR of
// something: the GitHub tab's own list holds the repos whose issues are linked,
// and the Code tab's holds what the webhook and the fifteen-minute sweep have
// delivered. Both are short, and neither answers "which repositories do I
// have" — which is the question you ask when deciding what to link or track.
// This asks GitHub directly, through the same proxy the rest of the integration
// uses, and lets a repo be tracked for the Code tab's mirror from the row.
//
// It loads once when the tab opens and can be folded away. Each row says what
// the repository is built with, from `/languages` rather than from the list's
// single `language` field — "TypeScript" alone is not what a project is made of.
//
// No token reaches this component. `ghCall` posts to the proxy with the caller's
// Firebase ID token; the PAT stays on the server (see utils/ghProxy).
import { computed, onMounted, ref } from 'vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import Caret from '@/components/ui/Caret.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Icon from '@/components/ui/Icon.vue'
import TextInput from '@/components/ui/TextInput.vue'
import TechChips from '@/components/github/TechChips.vue'
import { useSettings } from '@/composables/useSettings'
import { ghCall, isGhConfigured, GhNotConfiguredError } from '@/utils/ghProxy'
import { filterRepoRows, isTracked, parseRepoRows, withTracked } from '@/utils/ghRepoList'
import { techBadge, topTech, type TechBadge } from '@/utils/techBadge'
import { formatRelative } from '@/utils/timestamps'
import type { GhRepoRow } from '@/utils/ghRepoList'

// The count goes up to the Code tab, which hides the four-step setup panel once
// there is a list: somebody looking at their repositories has plainly connected.
const emit = defineEmits<{ loaded: [count: number] }>()

const store = useSettings()
const { settings } = store

// Open from the start. It used to be collapsed and load on first open, which
// made "which repositories do I have" a question you had to know to ask.
const open = ref(true)
const rows = ref<GhRepoRow[]>([])
const loading = ref(false)
const error = ref('')
const loaded = ref(false)
const filter = ref('')

const configured = computed(() => isGhConfigured())

async function load(): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    // `installations` is the proxy's name for "every repository this token can
    // see" — it predates the PAT and is kept so the request contract does not
    // change under the deployed function.
    const res = await ghCall<unknown>('installations')
    rows.value = parseRepoRows(res.data)
    loaded.value = true
    emit('loaded', rows.value.length)
    void loadTech()
  } catch (err) {
    rows.value = []
    error.value =
      err instanceof GhNotConfiguredError
        ? 'GitHub is not connected in this deployment.'
        : err instanceof Error
          ? err.message
          : 'Could not reach GitHub.'
  } finally {
    loading.value = false
  }
}

// ---- what each repository is built with ------------------------------------
// The repository list carries only the single largest language, so the chips
// come from `/languages` — one request per repository. Run a few at a time
// rather than seventeen at once: a browser caps its own connections anyway, and
// a burst is what makes a rate limit feel like a wall. A failure is silent by
// design — a missing chip row is not worth an error over a decoration.
const tech = ref<Record<string, TechBadge[]>>({})
const TECH_CONCURRENCY = 4

async function loadTech(): Promise<void> {
  const queue = [...rows.value]
  const workers = Array.from({ length: TECH_CONCURRENCY }, async () => {
    for (;;) {
      const row = queue.shift()
      if (!row) return
      const [owner, repo] = row.fullName.split('/')
      if (!owner || !repo) continue
      try {
        const res = await ghCall<unknown>('languages', { owner, repo })
        const badges = topTech(res.data)
        if (badges.length) tech.value = { ...tech.value, [row.fullName]: badges }
      } catch {
        /* the row simply shows no chips */
      }
    }
  })
  await Promise.all(workers)
}

function techOf(row: GhRepoRow): TechBadge[] {
  const found = tech.value[row.fullName]
  if (found?.length) return found
  // Until `/languages` answers, the list's own single language is something
  // rather than nothing — and it is all there is for an empty repository.
  return row.language ? [{ ...techBadge(row.language) }] : []
}

function toggle(): void {
  open.value = !open.value
}

const shown = computed(() => filterRepoRows(rows.value, filter.value))
const tracked = computed(() => settings.value.trackedRepos)
function trackedNow(fullName: string): boolean {
  return isTracked(tracked.value, fullName)
}
function setTracked(fullName: string, on: boolean): void {
  // Tracking is a settings change: the webhook resolves a delivery to a uid by
  // reading this list, so it takes effect with no redeploy.
  void store.save({ trackedRepos: withTracked(tracked.value, fullName, on) })
}

const now = Date.now()
function pushedLabel(row: GhRepoRow): string {
  return row.pushedAt ? `pushed ${formatRelative(row.pushedAt, now)}` : ''
}

onMounted(() => {
  if (configured.value) void load()
})
</script>

<template>
  <section v-if="configured" class="rb">
    <button type="button" class="rb__head" :aria-expanded="open" @click="toggle">
      <Caret :open="open" size="sm" />
      <span class="rb__title">All repositories</span>
      <span v-if="loaded" class="rb__count ui-mono">{{ rows.length }}</span>
      <span class="rb__note">everything this token can see</span>
    </button>

    <div v-if="open" class="rb__body">
      <div class="rb__row">
        <TextInput v-model="filter" placeholder="Filter" aria-label="Filter repositories" />
        <Button size="sm" variant="ghost" :loading="loading" @click="load">Refresh</Button>
      </div>

      <Alert v-if="error" tone="danger">{{ error }}</Alert>
      <p v-else-if="loading && !rows.length" class="rb__note">Asking GitHub…</p>
      <p v-else-if="loaded && !rows.length" class="rb__note">
        The token can see no repositories. Check which ones it was granted when it was created.
      </p>
      <p v-else-if="loaded && !shown.length" class="rb__note">
        Nothing matches “{{ filter.trim() }}”.
      </p>

      <ul v-if="shown.length" class="rb__list">
        <li v-for="repo in shown" :key="repo.id || repo.fullName" class="rb__item">
          <Checkbox
            :model-value="trackedNow(repo.fullName)"
            :aria-label="`Track ${repo.fullName}`"
            @update:model-value="setTracked(repo.fullName, $event)"
          />
          <a class="rb__name" :href="repo.url" target="_blank" rel="noopener noreferrer">
            {{ repo.fullName }}<Icon name="external-link" size="xs" />
          </a>
          <span v-if="repo.private" class="rb__badge">private</span>
          <!-- What it is built with, biggest language first. -->
          <TechChips :items="techOf(repo)" />
          <span class="rb__meta">{{ pushedLabel(repo) }}</span>
        </li>
      </ul>

      <p v-if="shown.length" class="rb__note">
        Ticking one tracks it for the Code tab. Its pull requests appear there once a webhook
        delivery or the fifteen-minute sweep arrives — tracking alone does not backfill.
      </p>
    </div>
  </section>
</template>

<style scoped>
.rb {
  min-width: 0;
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
}
.rb__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  border: 0;
  background: none;
  cursor: pointer;
  color: inherit;
  font: inherit;
  text-align: left;
}
.rb__title {
  flex-shrink: 0;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-primary, var(--theme-text));
}
.rb__count {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: var(--theme-card);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary, var(--theme-dim));
}
.rb__note {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.rb__body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: 0 var(--sp-3) var(--sp-3);
}
.rb__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.rb__row > :first-child {
  flex: 1 1 220px;
  min-width: 0;
}
.rb__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
  /* Seventeen rows is a list; four hundred is a page. It scrolls in its own
     window so the mirrored list below stays reachable. */
  max-height: 300px;
  overflow-y: auto;
}
.rb__item {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: 2px 0;
}
.rb__name {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  color: var(--text-primary, var(--theme-text));
  text-decoration: none;
}
.rb__name:hover,
.rb__name:focus-visible {
  text-decoration: underline;
}
.rb__badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-pill);
  font-size: var(--text-2xs);
  color: var(--text-secondary, var(--theme-dim));
}
.rb__meta {
  flex-shrink: 0;
  font-size: var(--text-2xs);
  color: var(--text-muted, var(--theme-dim));
}
/* The metadata is the first thing to go when the row cannot fit. */
@media (max-width: 640px) {
  .rb__meta {
    display: none;
  }
}
</style>
