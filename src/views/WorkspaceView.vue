<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useLockStore } from '@/stores/lock'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'

import FloatingDock from '@/components/FloatingDock.vue'
import FloatingChrome from '@/components/FloatingChrome.vue'
import DragGhost from '@/components/DragGhost.vue'
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
import GoalsView from '@/components/views/GoalsView.vue'
// Planning pulls in JointJS (@joint/core), which is heavy; load it only when the
// tab is opened so it lands in its own async chunk rather than the main bundle.
const PlanningView = defineAsyncComponent(() => import('@/components/views/PlanningView.vue'))
import DeadlinesView from '@/components/views/DeadlinesView.vue'
import RemindersView from '@/components/views/RemindersView.vue'
import FinancesView from '@/components/views/FinancesView.vue'
import TripsView from '@/components/views/TripsView.vue'
import IdeasView from '@/components/views/IdeasView.vue'
import StocksView from '@/components/views/StocksView.vue'
import AiView from '@/components/views/AiView.vue'
import BotsView from '@/components/views/BotsView.vue'
import GithubView from '@/components/views/GithubView.vue'

const ui = useUiStore()
const app = useAppStore()
const auth = useAuthStore()
const lock = useLockStore()
const { c } = useStyles()
const { tab, vw, isPhone } = storeToRefs(ui)

// The centered floating stage. Width tracks the breakpoints; it never touches an
// edge, and it keeps its height even when a section is empty so there is always
// visible starfield above and below — no dead black region under the cards.
const stageWrap = pxify({
  position: 'fixed',
  inset: 0,
  zIndex: 2,
  display: 'grid',
  placeItems: 'center',
  // The gutters around the stage belong to the dock and the starfield, so the
  // wrapper must not eat their clicks.
  pointerEvents: 'none',
})
const stageStyle = computed(() => {
  const w = vw.value
  const width = isPhone.value ? '94vw' : w < 1024 ? '92vw' : w < 1440 ? '82vw' : '70vw'
  return pxify({
    position: 'relative',
    pointerEvents: 'auto',
    width,
    maxWidth: 1500,
    minWidth: isPhone.value ? 0 : 720,
    height: isPhone.value ? '88dvh' : '86vh',
    display: 'flex',
    flexDirection: 'column',
    background: c.value.glass,
    backdropFilter: 'blur(30px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(30px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    borderRadius: 24,
    boxShadow: c.value.shadow + ', inset 0 1px 0 rgba(255,255,255,0.16)',
    padding: isPhone.value ? '16px' : '22px 24px',
    overflow: 'hidden',
    // A gentle idle drift; disabled under prefers-reduced-motion by the global rule.
    animation: 'stageDrift 6s ease-in-out infinite',
  })
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
  goals: GoalsView,
  planning: PlanningView,
  deadlines: DeadlinesView,
  reminders: RemindersView,
  finances: FinancesView,
  trips: TripsView,
  ideas: IdeasView,
  stocks: StocksView,
  ai: AiView,
  bots: BotsView,
  github: GithubView,
}
const currentView = computed(() => viewMap[tab.value])
const activeView = ref<{ focus: () => void } | null>(null)

function focusPrimaryInput() {
  activeView.value?.focus()
}

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
    <!-- Everything floats over the starfield: an icon dock on the left, a single
         centered glass stage holding the active section, and the chrome orbs. -->
    <FloatingDock />
    <div :style="stageWrap">
      <main :style="stageStyle">
        <component :is="currentView" ref="activeView" />
      </main>
    </div>
    <FloatingChrome />
  </template>

  <Ticker v-if="showWorkspace" />

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
    <DragGhost />
  </template>
  <AuthDialog />
  <CloudLoading v-if="authReady && isSignedIn && !cloudReady" />
  <LockScreen v-if="authReady && isSignedIn && cloudReady && !canUseApp" />
</template>
