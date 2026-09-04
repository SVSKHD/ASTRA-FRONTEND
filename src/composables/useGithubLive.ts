// The live GitHub mirror, read side (section 40).
//
// The app has TWO GitHub paths and they do different jobs. The older one
// (`utils/ghProxy`) is a request/response proxy for issues — it asks a function
// a question and gets an answer, which is right for "create this issue". This
// one is a mirror: functions write what GitHub told them into Firestore, and the
// app watches it. That is what makes a review comment appear while its author is
// still on the page, and it is why nothing here calls GitHub.
//
// Two listeners, not three. Repos and pull requests are what the Code tab is,
// so both are live from the moment the tab opens; the comment thread of one
// expanded pull request is loaded on demand by `useGhThread`, because streaming
// every comment on every open PR is a lot of rows to hold for a panel nobody has
// opened yet.

import { computed, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { DocumentData, Unsubscribe } from 'firebase/firestore'
import { loadFirestore } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import type { GhPull, GhRepo, PullState } from '@/types'

const REPOS = 'gh-repos'
const PULLS = 'gh-pulls'

function millis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis(): number }).toMillis()
  }
  return typeof value === 'number' ? value : 0
}

export function readRepo(id: string, d: DocumentData): GhRepo {
  return {
    id,
    userId: String(d.userId ?? ''),
    repoId: Number(d.repoId ?? 0),
    fullName: String(d.fullName ?? ''),
    defaultBranch: String(d.defaultBranch ?? 'main'),
    openPRCount: Number(d.openPRCount ?? 0),
    pushedAt: millis(d.pushedAt),
    updatedAt: millis(d.updatedAt),
  }
}

export function readPull(id: string, d: DocumentData): GhPull {
  return {
    id,
    userId: String(d.userId ?? ''),
    repoId: Number(d.repoId ?? 0),
    number: Number(d.number ?? 0),
    title: String(d.title ?? ''),
    state: (d.state as PullState) ?? 'open',
    draft: d.draft === true,
    author: String(d.author ?? ''),
    headRef: String(d.headRef ?? ''),
    baseRef: String(d.baseRef ?? ''),
    additions: Number(d.additions ?? 0),
    deletions: Number(d.deletions ?? 0),
    reviewDecision: String(d.reviewDecision ?? ''),
    commentCount: Number(d.commentCount ?? 0),
    createdAt: millis(d.createdAt),
    updatedAt: millis(d.updatedAt),
    url: String(d.url ?? ''),
  }
}

export function useGithubLive() {
  const { user } = storeToRefs(useAuthStore())
  const uid = computed(() => user.value?.uid ?? '')

  const repos = ref<GhRepo[]>([])
  const pulls = ref<GhPull[]>([])
  const loading = ref(true)
  const error = ref('')
  /** Ids the snapshot changed on this tick, for the row's brief ring. */
  const touched = ref<string[]>([])

  let unsubs: Unsubscribe[] = []
  let token = 0

  function detach(): void {
    for (const u of unsubs) u()
    unsubs = []
  }

  async function attach(): Promise<void> {
    detach()
    const mine = ++token
    const owner = uid.value
    repos.value = []
    pulls.value = []
    if (!owner) {
      loading.value = false
      return
    }
    loading.value = true
    const cloud = await loadFirestore()
    if (!cloud || mine !== token) {
      if (!cloud) {
        error.value = 'GitHub data is unreachable.'
        loading.value = false
      }
      return
    }
    const { db, fs } = cloud

    unsubs.push(
      fs.onSnapshot(
        fs.query(
          fs.collection(db, REPOS),
          fs.where('userId', '==', owner),
          fs.orderBy('fullName', 'asc'),
        ),
        (snap) => {
          if (mine !== token) return
          // The sweep stores its ETags in this collection too; they carry no
          // repoId and are not repositories.
          repos.value = snap.docs.map((d) => readRepo(d.id, d.data())).filter((r) => r.repoId > 0)
          loading.value = false
        },
        (err) => {
          console.error('[Astra] gh-repos listener failed:', err)
          error.value = 'Live repository updates stopped. Reload to reconnect.'
          loading.value = false
        },
      ),
    )

    unsubs.push(
      fs.onSnapshot(
        fs.query(
          fs.collection(db, PULLS),
          fs.where('userId', '==', owner),
          fs.orderBy('updatedAt', 'desc'),
        ),
        (snap) => {
          if (mine !== token) return
          pulls.value = snap.docs.map((d) => readPull(d.id, d.data()))
          // What actually changed, from the snapshot's own diff rather than by
          // comparing arrays: this is what the view rings briefly, instead of
          // re-animating a list where one row moved.
          touched.value = snap
            .docChanges()
            .filter((c) => c.type === 'modified')
            .map((c) => c.doc.id)
        },
        (err) => {
          console.error('[Astra] gh-pulls listener failed:', err)
          error.value = 'Live pull-request updates stopped. Reload to reconnect.'
        },
      ),
    )
  }

  watch(uid, () => void attach(), { immediate: true })
  onUnmounted(detach)

  /** Pull requests per repo, newest first — what a repo row expands into. */
  const pullsByRepo = computed<Record<number, GhPull[]>>(() => {
    const out: Record<number, GhPull[]> = {}
    for (const pull of pulls.value) (out[pull.repoId] ??= []).push(pull)
    return out
  })

  return { repos, pulls, pullsByRepo, loading, error, touched }
}
