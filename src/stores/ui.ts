import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { THEMES, computeAutoTheme, type ThemeKey, type Theme, type ThemeSetting } from '@/themes'
import { applyThemeToDom } from '@/themes/apply'
import { useAppStore } from '@/stores/app'
import { TAB_ORDER } from '@/tabs.config'
import type { ItemStatus, TabKey } from '@/types'

// 'all' plus the three lifecycle states — what the day-list filter can be set to.
export type StatusFilter = ItemStatus | 'all'

export type { ThemeSetting }

// Global UI state: theme selection, current tab, viewport width and a coarse clock.
export const useUiStore = defineStore('ui', () => {
  // The choice itself lives in the app store so it persists to the user's
  // Firestore document and comes back on refresh. This is a view onto it.
  const { themeSetting, preferredDark, preferredLight, railCollapsed } = storeToRefs(useAppStore())
  const tab = ref<TabKey>('overview')
  const tabDir = ref<1 | -1>(1)
  const vw = ref<number>(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const now = ref<number>(Date.now())
  const themePanelOpen = ref(false)
  const drawerOpen = ref(false)

  // --- day accordion + status filter, shared by the todo and task tabs ------
  // Only days the user has actually toggled are stored; everything else falls
  // back to the caller's default (Today open, the rest closed), so a new day
  // card behaves sensibly without anyone having to seed it. Keyed by tab so the
  // two lists remember their own shape.
  const openDays = ref<Record<string, boolean>>({})
  const dayFilter = ref<Record<string, StatusFilter>>({})

  function isDayOpen(tabKey: TabKey, groupKey: string, fallback: boolean) {
    const v = openDays.value[tabKey + ':' + groupKey]
    return v === undefined ? fallback : v
  }
  function setDayOpen(tabKey: TabKey, groupKey: string, open: boolean) {
    openDays.value = { ...openDays.value, [tabKey + ':' + groupKey]: open }
  }
  function toggleDay(tabKey: TabKey, groupKey: string, fallback: boolean) {
    setDayOpen(tabKey, groupKey, !isDayOpen(tabKey, groupKey, fallback))
  }
  // Expand/collapse everything at once, for the header's all/none control.
  function setAllDays(tabKey: TabKey, groupKeys: string[], open: boolean) {
    const next = { ...openDays.value }
    for (const k of groupKeys) next[tabKey + ':' + k] = open
    openDays.value = next
  }
  function getFilter(tabKey: TabKey): StatusFilter {
    return dayFilter.value[tabKey] ?? 'all'
  }
  function setFilter(tabKey: TabKey, v: StatusFilter) {
    dayFilter.value = { ...dayFilter.value, [tabKey]: v }
  }

  const effectiveThemeKey = computed<ThemeKey>(() =>
    themeSetting.value === 'auto'
      ? computeAutoTheme(new Date(now.value).getHours())
      : themeSetting.value,
  )
  const theme = computed<Theme>(() => THEMES[effectiveThemeKey.value])
  const dark = computed(() => theme.value.group === 'dark')

  // Push the resolved theme onto the document (data-theme, meta theme-color, CSS
  // vars, localStorage mirror) so cross-cutting surfaces and the no-flash boot
  // script track the choice. Immediate so it runs on first render, and it follows
  // both an explicit change and the clock-driven 'auto' rotation.
  watch([effectiveThemeKey, themeSetting], ([key, setting]) => applyThemeToDom(key, setting), {
    immediate: true,
  })
  const isMobile = computed(() => vw.value < 640)
  // Shell breakpoints for the rail rework (distinct from the 640px isMobile the
  // existing styles use). Phone gets the bottom bar; tablet portrait gets a
  // collapsed-only rail with no expand toggle; desktop gets the full rail.
  const isPhone = computed(() => vw.value < 768)
  const isTablet = computed(() => vw.value >= 768 && vw.value < 1024)
  const isDesktop = computed(() => vw.value >= 1024)
  const isDayTime = computed(() => {
    const h = new Date(now.value).getHours()
    return h >= 6 && h < 18
  })

  function setTheme(k: ThemeSetting) {
    themeSetting.value = k
    // Remember the last fixed theme picked in each family (ignoring the special
    // themes, which have no opposite) so the quick toggle flips between the two
    // the user actually likes. 'auto' resolves through effectiveThemeKey.
    if (k !== 'auto') {
      const g = THEMES[k]
      if (g.group === 'dark' && !g.noGlass) preferredDark.value = k
      else if (g.group === 'light') preferredLight.value = k
    }
    themePanelOpen.value = false
  }
  // The header sun/moon: flip to the opposite family's remembered theme. From a
  // dark theme (or auto currently resolving dark) → the preferred light one, and
  // vice versa. Always lands on a concrete theme, never 'auto'.
  function toggleThemeMode() {
    setTheme(dark.value ? preferredLight.value : preferredDark.value)
  }
  function toggleThemePanel() {
    themePanelOpen.value = !themePanelOpen.value
  }
  function toggleDrawer() {
    drawerOpen.value = !drawerOpen.value
  }
  function toggleRail() {
    railCollapsed.value = !railCollapsed.value
  }
  function setRailCollapsed(v: boolean) {
    railCollapsed.value = v === true
  }
  function setTab(k: TabKey) {
    tabDir.value = TAB_ORDER.indexOf(k) > TAB_ORDER.indexOf(tab.value) ? 1 : -1
    tab.value = k
  }
  function cycleTab(delta: number) {
    const i = TAB_ORDER.indexOf(tab.value)
    setTab(TAB_ORDER[(i + delta + TAB_ORDER.length) % TAB_ORDER.length])
  }
  function setTabByIndex(i: number) {
    if (i >= 0 && i < TAB_ORDER.length) setTab(TAB_ORDER[i])
  }
  function setVw(w: number) {
    vw.value = w
  }
  function tick() {
    now.value = Date.now()
  }

  return {
    themeSetting,
    railCollapsed,
    tab,
    tabDir,
    vw,
    now,
    themePanelOpen,
    drawerOpen,
    openDays,
    dayFilter,
    effectiveThemeKey,
    theme,
    dark,
    isMobile,
    isPhone,
    isTablet,
    isDesktop,
    isDayTime,
    tabOrder: TAB_ORDER,
    preferredDark,
    preferredLight,
    setTheme,
    toggleThemeMode,
    toggleThemePanel,
    toggleDrawer,
    toggleRail,
    setRailCollapsed,
    setTab,
    cycleTab,
    setTabByIndex,
    setVw,
    tick,
    isDayOpen,
    setDayOpen,
    toggleDay,
    setAllDays,
    getFilter,
    setFilter,
  }
})
