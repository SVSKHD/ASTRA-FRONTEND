import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { buildStyles, pxify, type Style } from '@/styles'
import type { CSSProperties } from 'vue'

// Reactive access to the theme and the full pxified style map.
export function useStyles() {
  const ui = useUiStore()
  const { theme, dark, isMobile, tabDir } = storeToRefs(ui)

  const built = computed(() => buildStyles(theme.value, dark.value, isMobile.value))
  const B = computed(() => built.value.B)

  // s: a proxy of pxified styles keyed by name.
  const s = computed<Record<string, CSSProperties>>(() => {
    const raw = built.value.s
    const out: Record<string, CSSProperties> = {}
    for (const key in raw) out[key] = pxify(raw[key])
    return out
  })

  const panelStyle = computed<CSSProperties>(() =>
    pxify({
      animation:
        (tabDir.value === -1 ? 'slideInL' : 'slideInR') + ' .35s cubic-bezier(.4,1.3,.4,1) both',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-4)',
      // The card has a fixed height; the panel fills it and lets its own list
      // do the scrolling, so no tab is taller or shorter than any other.
      flex: 1,
      minHeight: 0,
    }),
  )

  return { c: theme, dark, isMobile, B, s, panelStyle, raw: computed(() => built.value.s) }
}

export { pxify }
export type { Style }
