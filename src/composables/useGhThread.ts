// One pull request's comment thread (section 40).
//
// Loaded when a pull request is expanded and torn down when it is collapsed,
// rather than streamed with everything else: a repo with forty open PRs has a
// few hundred comments between them, and holding all of those to render the one
// panel somebody opened is a lot of rows for nothing.
//
// Ordered by when each comment was written, across all three kinds — an issue
// comment, a review's summary and a line comment are one conversation, and
// splitting them into three lists is what makes a review thread unreadable.

import { computed, onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { storeToRefs } from 'pinia'
import type { DocumentData, Unsubscribe } from 'firebase/firestore'
import { loadFirestore } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import type { GhComment, GhCommentKind } from '@/types'

const COMMENTS = 'gh-comments'

function millis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis(): number }).toMillis()
  }
  return typeof value === 'number' ? value : 0
}

export function readComment(id: string, d: DocumentData): GhComment {
  return {
    id,
    userId: String(d.userId ?? ''),
    repoId: Number(d.repoId ?? 0),
    pullNumber: Number(d.pullNumber ?? 0),
    commentId: Number(d.commentId ?? 0),
    kind: (d.kind as GhCommentKind) ?? 'issue',
    author: String(d.author ?? ''),
    bodyPreview: String(d.bodyPreview ?? ''),
    path: String(d.path ?? ''),
    line: Number(d.line ?? 0),
    createdAt: millis(d.createdAt),
    url: String(d.url ?? ''),
  }
}

/** `null` for "nothing expanded", which is the state most of the time. */
export function useGhThread(pull: MaybeRefOrGetter<{ repoId: number; number: number } | null>) {
  const { user } = storeToRefs(useAuthStore())
  const uid = computed(() => user.value?.uid ?? '')
  const target = computed(() => toValue(pull))

  const comments = ref<GhComment[]>([])
  const loading = ref(false)
  const error = ref('')
  let unsub: Unsubscribe | null = null
  let token = 0

  function detach(): void {
    unsub?.()
    unsub = null
  }

  async function attach(): Promise<void> {
    detach()
    const mine = ++token
    const owner = uid.value
    const want = target.value
    comments.value = []
    if (!owner || !want) {
      loading.value = false
      return
    }
    loading.value = true
    const cloud = await loadFirestore()
    if (!cloud || mine !== token) {
      loading.value = false
      return
    }
    const { db, fs } = cloud
    unsub = fs.onSnapshot(
      // userId, then the pull number, then time: the equality pair before the
      // ordering, which is the shape the composite index declares.
      fs.query(
        fs.collection(db, COMMENTS),
        fs.where('userId', '==', owner),
        fs.where('pullNumber', '==', want.number),
        fs.orderBy('createdAt', 'asc'),
      ),
      (snap) => {
        if (mine !== token) return
        comments.value = snap.docs
          .map((d) => readComment(d.id, d.data()))
          // A pull number is unique within a repo, not across them, so the repo
          // is filtered here rather than adding a third equality to the index.
          .filter((c) => c.repoId === want.repoId)
        loading.value = false
      },
      (err) => {
        console.error('[Astra] gh-comments listener failed:', err)
        error.value = 'The thread could not be read.'
        loading.value = false
      },
    )
  }

  watch([uid, target], () => void attach(), { immediate: true })
  onUnmounted(detach)

  return { comments, loading, error }
}
