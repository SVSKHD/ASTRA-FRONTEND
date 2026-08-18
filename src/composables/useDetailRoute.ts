// Keeps the detail dialog and the URL in step (section 18a).
//
// The URL is the authority in one direction and the store in the other, which is
// the whole difficulty: without care the two watchers ping-pong. `syncing` marks
// the window in which one side is applying the other's change, so the echo is
// ignored rather than re-applied.
//
// History shape, deliberately flat:
//   opening   pushes  — so the browser back button closes the dialog
//   stepping  replaces — prev/next and drill-in leave one entry, so back still
//                        means "close", never "walk back through six subtasks"
//   closing   replaces — so back after a close does not re-open what was closed
//
// Mounted once, by the workspace, alongside the dialog itself.

import { nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { detailFromQuery, queryWithDetail, sameTarget, type DetailTarget } from '@/utils/detailUrl'

export function useDetailRoute() {
  const app = useAppStore()
  const route = useRoute()
  const router = useRouter()

  let syncing = false
  const release = () => {
    void nextTick(() => {
      syncing = false
    })
  }

  const frameTarget = (): DetailTarget | null => {
    const frame = app.detailFrame
    return frame ? { kind: frame.kind, id: frame.id } : null
  }

  // URL → dialog. Immediate, so a cold load on ?task=4 opens over the list
  // rather than needing a second navigation (acceptance 86).
  watch(
    () => route.query,
    (query) => {
      if (syncing) return
      const target = detailFromQuery(query as Record<string, unknown>)
      if (sameTarget(target, frameTarget())) return
      syncing = true
      if (target) app.openDetail(target.kind, target.id, app.detailSiblings)
      else app.closeDetail()
      release()
    },
    { immediate: true, deep: true },
  )

  // Dialog → URL.
  watch(
    () => app.detailFrame,
    (frame) => {
      if (syncing) return
      const query = route.query as Record<string, unknown>
      const current = detailFromQuery(query)
      const target = frame ? { kind: frame.kind, id: frame.id } : null
      if (sameTarget(current, target)) return
      syncing = true
      // Only the first open earns a history entry; everything after it edits the
      // one already there.
      const navigate = target && !current ? router.push : router.replace
      Promise.resolve(navigate.call(router, { query: queryWithDetail(query, target) }))
        .catch(() => {
          /* a cancelled navigation is not an error worth surfacing */
        })
        .finally(release)
    },
  )
}
