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

/**
 * A focus session on one todo (Todo v2, 5b). Running while `endsAt` is set;
 * paused, the time left is held in `remainingMs`. Persisted, so a reload picks
 * the timer up where it was rather than silently dropping it.
 */
export interface FocusSession {
  todoId: number
  remainingMs: number
  endsAt: number | null
}
export const FOCUS_MS = 25 * 60 * 1000
const FOCUS_KEY = 'aureon.focus'

function loadFocus(): FocusSession | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(FOCUS_KEY) : null
    if (!raw) return null
    const v = JSON.parse(raw) as FocusSession
    return typeof v?.todoId === 'number' && typeof v.remainingMs === 'number' ? v : null
  } catch {
    return null
  }
}

/** A weekly-review decision, with what it replaced so it can be taken back. */
export interface ReviewDecision {
  kind: 'keep' | 'drop'
  prior: { createdAt: number; archivedAt: number | null }
}

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

  // --- Todo v2 ----------------------------------------------------------------
  // The bottom pill's panels. Opening one closes the others, so there is only
  // ever one popover standing over the bar. The account menu's flag lives on the
  // auth store and is handed in, which keeps this store free of a dependency on
  // that one.
  function openShellPanel(
    name: 'notes' | 'appearance' | 'account' | null,
    account: { value: boolean },
  ) {
    const was = {
      notes: drawerOpen.value,
      appearance: themePanelOpen.value,
      account: account.value,
    }
    drawerOpen.value = name === 'notes' && !was.notes
    themePanelOpen.value = name === 'appearance' && !was.appearance
    account.value = name === 'account' && !was.account
  }

  // Focus mode (5b).
  const focus = ref<FocusSession | null>(loadFocus())
  watch(
    focus,
    (v) => {
      try {
        if (v) localStorage.setItem(FOCUS_KEY, JSON.stringify(v))
        else localStorage.removeItem(FOCUS_KEY)
      } catch {
        /* private mode: the session just does not survive a reload */
      }
    },
    { deep: true },
  )
  function focusRemaining(at = Date.now()): number {
    const f = focus.value
    if (!f) return 0
    return f.endsAt != null ? Math.max(0, f.endsAt - at) : f.remainingMs
  }
  function startFocus(todoId: number) {
    focus.value = { todoId, remainingMs: FOCUS_MS, endsAt: Date.now() + FOCUS_MS }
  }
  function pauseFocus() {
    const f = focus.value
    if (!f || f.endsAt == null) return
    focus.value = { ...f, remainingMs: focusRemaining(), endsAt: null }
  }
  function resumeFocus() {
    const f = focus.value
    if (!f || f.endsAt != null) return
    focus.value = { ...f, endsAt: Date.now() + f.remainingMs }
  }
  function stopFocus() {
    focus.value = null
  }

  // Weekly review (5c). Decisions are this session's: each one is applied to the
  // todo straight away and remembers what it replaced, so a second click undoes it.
  const reviewOpen = ref(false)
  const reviewDecisions = ref<Record<number, ReviewDecision>>({})
  function setReviewOpen(v: boolean) {
    reviewOpen.value = v
  }
  function setReviewDecision(todoId: number, d: ReviewDecision | null) {
    const next = { ...reviewDecisions.value }
    if (d) next[todoId] = d
    else delete next[todoId]
    reviewDecisions.value = next
  }

  // Phone: the todo shown in the bottom sheet (3b), and the tab bar's More sheet.
  const sheetTodoId = ref<number | null>(null)
  const moreSheetOpen = ref(false)
  function setSheetTodo(id: number | null) {
    sheetTodoId.value = id
  }
  function setMoreSheet(v: boolean) {
    moreSheetOpen.value = v
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
    openShellPanel,
    focus,
    focusRemaining,
    startFocus,
    pauseFocus,
    resumeFocus,
    stopFocus,
    reviewOpen,
    reviewDecisions,
    setReviewOpen,
    setReviewDecision,
    sheetTodoId,
    moreSheetOpen,
    setSheetTodo,
    setMoreSheet,
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
