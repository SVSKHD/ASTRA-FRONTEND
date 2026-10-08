// The repository the GitHub tab's Pull requests and Code panes are looking at.
//
// One choice for both, held at module level, so opening a repo's PRs and then
// switching to Code lands in the same repo rather than back at the first one.
// The list is the linked repos first (the ones the user said they care about),
// then every other repo the server token can see.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import type { LinkedRepo } from '@/types'

const chosenId = ref<string>('')
let requested = false

export function useGhRepos() {
  const app = useAppStore()
  const { repos, ghInstalled, ghBusy } = storeToRefs(app)

  const choices = computed<LinkedRepo[]>(() => {
    const linked = repos.value.slice().sort((a, b) => b.pushedAt - a.pushedAt)
    const seen = new Set(linked.map((r) => r.id))
    const rest = (ghInstalled.value ?? []).filter((r) => !seen.has(r.id))
    return [...linked, ...rest]
  })

  const repo = computed<LinkedRepo | null>(
    () => choices.value.find((r) => r.id === chosenId.value) ?? choices.value[0] ?? null,
  )

  function choose(id: string) {
    chosenId.value = id
  }

  /** Ask once per session for every repo the token can see. */
  function ensureLoaded() {
    if (requested || ghInstalled.value?.length) return
    requested = true
    void app.loadInstalledRepos()
  }

  const options = computed(() => choices.value.map((r) => ({ value: r.id, label: r.fullName })))

  return { choices, options, repo, choose, ensureLoaded, loading: ghBusy }
}
