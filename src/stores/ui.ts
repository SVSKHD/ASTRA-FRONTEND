import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { THEMES, computeAutoTheme, type ThemeKey, type Theme, type ThemeSetting } from '@/themes'
import { useAppStore } from '@/stores/app'
import type { ItemStatus, TabKey } from '@/types'

// 'all' plus the three lifecycle states — what the day-list filter can be set to.
export type StatusFilter = ItemStatus | 'all'

const TAB_ORDER: TabKey[] = [
  'todo',
  'tasks',
  'deadlines',
  'reminders',
  'finances',
  'trips',
  'ideas',
  'stocks',
]

export type { ThemeSetting }

// Global UI state: theme selection, current tab, viewport width and a coarse clock.
export const useUiStore = defineStore('ui', () => {
  // The choice itself lives in the app store so it persists to the user's
  // Firestore document and comes back on refresh. This is a view onto it.
  const { themeSetting } = storeToRefs(useAppStore())
  const tab = ref<TabKey>('todo')
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
  const isMobile = computed(() => vw.value < 640)
  const isDayTime = computed(() => {
    const h = new Date(now.value).getHours()
    return h >= 6 && h < 18
  })

  function setTheme(k: ThemeSetting) {
    themeSetting.value = k
    themePanelOpen.value = false
  }
  function toggleThemePanel() {
    themePanelOpen.value = !themePanelOpen.value
  }
  function toggleDrawer() {
    drawerOpen.value = !drawerOpen.value
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
    isDayTime,
    tabOrder: TAB_ORDER,
    setTheme,
    toggleThemePanel,
    toggleDrawer,
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
