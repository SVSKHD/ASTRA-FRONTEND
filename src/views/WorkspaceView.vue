<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useLockStore } from '@/stores/lock'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'

import TopBar from '@/components/TopBar.vue'
import LeftRail from '@/components/LeftRail.vue'
import BottomBar from '@/components/BottomBar.vue'
import Ticker from '@/components/Ticker.vue'
import NotesDrawer from '@/components/NotesDrawer.vue'
import NoteView from '@/components/NoteView.vue'
import TaskDialog from '@/components/TaskDialog.vue'
import ItemDialog from '@/components/ItemDialog.vue'
import TripDialog from '@/components/TripDialog.vue'
import ReminderDialog from '@/components/ReminderDialog.vue'
import TaskView from '@/components/TaskView.vue'
import GithubPanel from '@/components/GithubPanel.vue'
import AuthDialog from '@/components/AuthDialog.vue'
import Toast from '@/components/Toast.vue'
import NotifBanner from '@/components/NotifBanner.vue'
import SharedBanner from '@/components/SharedBanner.vue'
import ShareDialog from '@/components/ShareDialog.vue'
import LockScreen from '@/components/LockScreen.vue'
import CloudLoading from '@/components/CloudLoading.vue'

import OverviewView from '@/components/views/OverviewView.vue'
import TodoView from '@/components/views/TodoView.vue'
import TasksView from '@/components/views/TasksView.vue'
import DeadlinesView from '@/components/views/DeadlinesView.vue'
import RemindersView from '@/components/views/RemindersView.vue'
import FinancesView from '@/components/views/FinancesView.vue'
import TripsView from '@/components/views/TripsView.vue'
import IdeasView from '@/components/views/IdeasView.vue'
import StocksView from '@/components/views/StocksView.vue'

const ui = useUiStore()
const app = useAppStore()
const auth = useAuthStore()
const lock = useLockStore()
const { c, s } = useStyles()
const { tab, isPhone, isTablet, railCollapsed } = storeToRefs(ui)

// The rail is 72px collapsed / 232px expanded; tablet portrait forces collapsed.
const railW = computed(() => (isTablet.value || railCollapsed.value ? 72 : 232))
const shellGrid = computed(() =>
  pxify({
    display: 'grid',
    gridTemplateColumns: railW.value + 'px 1fr',
    height: '100dvh',
    transition: 'grid-template-columns .22s cubic-bezier(.4,0,.2,1)',
  }),
)
// The one scroll container in the desktop/tablet shell: full height, wide, no
// card. Inset per spec (20px top/right/bottom, 16px left). The active view fills
// it via its panelStyle (flex:1) and scrolls its own list inside — a single
// scrollbar, no nesting.
const contentDesktop = pxify({
  height: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
  padding: '20px 20px 20px 16px',
  overflow: 'hidden',
})
const { isSignedIn, authReady } = storeToRefs(auth)
const { cloudReady } = storeToRefs(app)
const { canUseApp } = storeToRefs(lock)
const showWorkspace = computed(
  () => authReady.value && isSignedIn.value && cloudReady.value && canUseApp.value,
)

const viewMap = {
  overview: OverviewView,
  todo: TodoView,
  tasks: TasksView,
  deadlines: DeadlinesView,
  reminders: RemindersView,
  finances: FinancesView,
  trips: TripsView,
  ideas: IdeasView,
  stocks: StocksView,
}
const currentView = computed(() => viewMap[tab.value])
const activeView = ref<{ focus: () => void } | null>(null)

function focusPrimaryInput() {
  activeView.value?.focus()
}

const notesIconStyle = pxify({ display: 'block' })

// --- global keyboard --------------------------------------------------------
function onKey(e: KeyboardEvent) {
  if (!showWorkspace.value) return
  if (e.key === 'Escape') {
    if (app.pendingShare) return app.cancelShare()
    // The note reader sits above everything else, so it unwinds first: an open
    // editor steps back to reading, and reading closes.
    if (app.noteView) {
      if (app.noteView.mode === 'edit' && app.noteView.id != null) app.openNoteView(app.noteView.id)
      else app.closeNoteView()
      return
    }
    if (app.taskViewId != null) return app.closeTaskView()
    // One slot now backs every dialog, so one check closes whichever is open.
    if (app.itemDialog) return app.closeItemDialog()
    if (auth.githubPanelOpen) {
      auth.closeGithubPanel()
      return
    }
    if (auth.avatarMenuOpen) {
      auth.toggleAvatarMenu()
      return
    }
    if (ui.drawerOpen) {
      ui.toggleDrawer()
      return
    }
    if (ui.themePanelOpen) {
      ui.themePanelOpen = false
      return
    }
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    focusPrimaryInput()
    return
  }
  // ⌘/Ctrl + 1–9 jumps to the nth tab (works even while typing, like ⌘K).
  if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
    e.preventDefault()
    ui.setTabByIndex(parseInt(e.key, 10) - 1)
    return
  }
  const tag = (e.target as HTMLElement)?.tagName || ''
  const typing =
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (e.target as HTMLElement)?.isContentEditable
  if (typing) return
  // The rail is vertical now, so ↑/↓ step through tabs; ←/→ are kept as aliases
  // so the old horizontal habit still works.
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') ui.cycleTab(1)
  else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') ui.cycleTab(-1)
  else if (e.key >= '1' && e.key <= '9') ui.setTabByIndex(parseInt(e.key, 10) - 1)
  else if (e.key.toLowerCase() === 'n') {
    e.preventDefault()
    focusPrimaryInput()
  }
}

// --- swipe between tabs (touch) --------------------------------------------
let touchX: number | null = null
function onTouchStart(e: TouchEvent) {
  if (!showWorkspace.value) return
  touchX = e.touches[0].clientX
}
function onTouchEnd(e: TouchEvent) {
  if (touchX == null) return
  const dx = e.changedTouches[0].clientX - touchX
  touchX = null
  if (Math.abs(dx) < 50) return
  ui.cycleTab(dx < 0 ? 1 : -1)
}

// --- timers + listeners -----------------------------------------------------
let clockTimer: ReturnType<typeof setInterval>
let remTimer: ReturnType<typeof setInterval>
function onResize() {
  ui.setVw(window.innerWidth)
}
// Re-read the clock the moment the app is focused or brought back to the
// foreground, so a session left open across midnight re-files the day
// accordions on resume rather than waiting out the next 60s tick.
function onResume() {
  if (document.visibilityState !== 'hidden') ui.tick()
}
// /tasks/:id/view is a real route now, so the open task follows route params
// rather than a hand-parsed popstate handler.
const route = useRoute()
watch(
  () => (route.name === 'task-view' ? String(route.params.id ?? '') : ''),
  (raw) => {
    if (!raw) {
      app.taskViewId = null
      return
    }
    const parsed = Number.parseInt(raw, 10)
    app.taskViewId = Number.isNaN(parsed) ? null : parsed
  },
  { immediate: true },
)

onMounted(() => {
  lock.start()
  clockTimer = setInterval(() => ui.tick(), 60000)
  remTimer = setInterval(() => app.checkReminders(), 15000)
  window.addEventListener('resize', onResize)
  window.addEventListener('focus', onResume)
  document.addEventListener('visibilitychange', onResume)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  lock.stop()
  clearInterval(clockTimer)
  clearInterval(remTimer)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('focus', onResume)
  document.removeEventListener('visibilitychange', onResume)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <template v-if="showWorkspace">
    <!-- Desktop + tablet: the left rail sits beside a single wide scroll region
         that fills the rest of the viewport. No centered card, no carousel. -->
    <div v-if="!isPhone" :style="shellGrid">
      <LeftRail />
      <main :style="contentDesktop">
        <component :is="currentView" ref="activeView" />
      </main>
    </div>
    <!-- Phone: the proven card layout, with the bottom bar standing in for the
         old top carousel. -->
    <div v-else :style="s.page">
      <div :style="s.stack">
        <TopBar />
        <div :style="s.container" @touchstart="onTouchStart" @touchend="onTouchEnd">
          <component :is="currentView" ref="activeView" />
        </div>
      </div>
    </div>
  </template>

  <BottomBar v-if="showWorkspace && isPhone" />
  <Ticker v-if="showWorkspace" />

  <button
    v-if="showWorkspace"
    :style="s.fab"
    v-hover-style="s.fabHover"
    aria-label="Notes"
    @click="ui.toggleDrawer()"
  >
    <svg
      :style="notesIconStyle"
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      :stroke="c.accent"
      stroke-width="2"
      stroke-linecap="round"
    >
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="7.5" y1="8" x2="16.5" y2="8" />
      <line x1="7.5" y1="12" x2="16.5" y2="12" />
      <line x1="7.5" y1="16" x2="13" y2="16" />
    </svg>
  </button>

  <button
    v-if="showWorkspace"
    :style="s.ghFab"
    v-hover-style="s.fabHover"
    aria-label="GitHub"
    @click="auth.openGithubPanel()"
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      :stroke="c.accent"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="18" cy="8" r="2.4" />
      <path d="M18 10.4v1.6a3 3 0 0 1-3 3H9" />
      <line x1="6" y1="8.4" x2="6" y2="15.6" />
    </svg>
  </button>

  <template v-if="showWorkspace">
    <NotesDrawer />
    <NoteView />
    <ItemDialog />
    <TripDialog />
    <TaskDialog />
    <ReminderDialog />
    <TaskView />
    <GithubPanel />
    <NotifBanner />
    <SharedBanner />
    <ShareDialog />
    <Toast />
  </template>
  <AuthDialog />
  <CloudLoading v-if="authReady && isSignedIn && !cloudReady" />
  <LockScreen v-if="authReady && isSignedIn && cloudReady && !canUseApp" />
</template>
