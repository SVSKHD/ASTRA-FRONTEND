// The allowlisted repositories (GET /api/v1/github/repositories), one shared
// copy for the repo picker and the dashboard. The server already filters by
// its allowlist, so anything listed here is a repo the modules may open.

import { reactive } from 'vue'
import { aureon } from '@/api/client'
import { cc, must, setRepo, type Schemas } from '@/control/api'

export const repos = reactive({
  items: [] as Schemas['RepositoryOut'][],
  loaded: false,
  loading: false,
  error: '',
  status: 0,
})

export async function loadRepos(refresh = false): Promise<void> {
  repos.loading = true
  try {
    const r = await aureon.GET('/api/v1/github/repositories', {
      params: { query: { limit: 200, ...(refresh ? { refresh: true } : {}) } },
    })
    repos.status = r.response.status
    repos.items = must(r).items
    repos.error = ''
    // Point the modules at a repo the server still allows.
    if (!repos.items.some((x) => x.full_name.toLowerCase() === cc.repo.toLowerCase())) {
      setRepo(repos.items[0]?.full_name ?? '')
    }
  } catch (e) {
    repos.error = (e as Error).message
  } finally {
    repos.loading = false
    repos.loaded = true
  }
}
