// What the top bar is allowed to be about (section 43, item 5).
//
// The bar is the one loading treatment not attached to the thing it is about,
// so the set of things it may report has to be closed and small — otherwise it
// becomes the loader anybody reaches for, and a bar that means six things means
// none of them.
//
// Two members, and both are work with nowhere else to go:
//
//   • a route change, which is by definition not about any element on the
//     screen, because the screen is being replaced;
//   • a background sync, which is about rows that may not be visible at all.
//
// A save is NOT in this set. A save has an element — the button that started it
// — and that element gets the ring. That is the whole rule that keeps the four
// treatments from becoming one.

import { onUnmounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useConnectivity } from '@/composables/useConnectivity'

export function useBackgroundWork() {
  const router = useRouter()
  const { isSyncing } = useConnectivity()
  const navigating = ref(false)

  const stopBefore = router.beforeEach((_to, _from, next) => {
    navigating.value = true
    next()
  })
  const stopAfter = router.afterEach(() => {
    navigating.value = false
  })
  const stopError = router.onError(() => {
    navigating.value = false
  })

  onUnmounted(() => {
    stopBefore()
    stopAfter()
    stopError()
  })

  // The bar's own 200ms delay means a route served from cache — which is most
  // of them — never shows anything at all. That is the delay doing its job, not
  // the flag failing to be set.
  return computed(() => navigating.value || isSyncing.value)
}
