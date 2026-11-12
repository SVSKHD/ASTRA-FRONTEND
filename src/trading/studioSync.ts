// The chart's indicators follow the user to every device.
//
// The studio keeps its state in localStorage (fast, works signed out). This
// adds the account copy, in the settings document `Astra-users/{uid}` beside
// the other durable choices (src/composables/useSettings.ts):
//
//   • when the settings arrive with saved studies, the chart switches to them;
//   • after a change on this device, the new state is saved there, debounced,
//     so dragging a parameter is one write, not fifty.
//
// Signed out, or before the settings arrive, the device's copy is all there is.

import { watch, type WatchStopHandle } from 'vue'
import { MAX_STUDIO_CHARS, useSettings } from '@/composables/useSettings'
import type { Studio, SyncedStudies } from '@/trading/studies'

export const SAVE_DELAY_MS = 1500

export function syncStudio(studio: Studio): () => void {
  const { settings, ready, save } = useSettings()
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: SyncedStudies | null = null

  const stopWatch: WatchStopHandle = watch(
    () => [ready.value, settings.value.chartStudies, settings.value.chartPresets] as const,
    ([isReady, studies, presets]) => {
      if (!isReady || pending) return // a local change not yet saved wins
      const mine = studio.exportState()
      if (studies === mine.studies && presets === mine.presets) return
      studio.importState({ studies, presets })
    },
    { immediate: true },
  )

  function flush() {
    timer = undefined
    const next = pending
    pending = null
    if (!next) return
    if (next.studies.length > MAX_STUDIO_CHARS || next.presets.length > MAX_STUDIO_CHARS) return
    void save({ chartStudies: next.studies, chartPresets: next.presets })
  }

  const unsubscribe = studio.subscribe((next) => {
    pending = next
    clearTimeout(timer)
    timer = setTimeout(flush, SAVE_DELAY_MS)
  })

  return () => {
    if (timer) {
      clearTimeout(timer)
      flush() // leaving the chart still saves the last change
    }
    unsubscribe()
    stopWatch()
  }
}
