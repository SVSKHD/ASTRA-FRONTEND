import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { THEMES, computeAutoTheme, type ThemeKey, type Theme } from '@/themes'
import type { TabKey } from '@/types'

const TAB_ORDER: TabKey[] = ['todo', 'tasks', 'deadlines', 'reminders', 'finances', 'trips']

export type ThemeSetting = 'auto' | ThemeKey

// Global UI state: theme selection, current tab, viewport width and a coarse clock.
export const useUiStore = defineStore('ui', () => {
  const themeSetting = ref<ThemeSetting>('auto')
  const tab = ref<TabKey>('todo')
  const tabDir = ref<1 | -1>(1)
  const vw = ref<number>(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const now = ref<number>(Date.now())
  const themePanelOpen = ref(false)
  const drawerOpen = ref(false)

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
  }
})
