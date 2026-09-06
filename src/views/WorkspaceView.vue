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
import { useDeviceSession } from '@/composables/useDeviceSession'
import { useScrollMemory } from '@/composables/useScrollMemory'
import { useTabRoute } from '@/composables/useTabRoute'
import { stageGeometry, stageWrapGeometry } from '@/views/workspaceStage'

import AppShell from '@/components/shell/AppShell.vue'
import DragGhost from '@/components/DragGhost.vue'
import NotesDrawer from '@/components/NotesDrawer.vue'
import NoteView from '@/components/NoteView.vue'
import DetailHost from '@/components/detail/DetailHost.vue'
import ItemDialog from '@/components/ItemDialog.vue'
import TripDialog from '@/components/TripDialog.vue'
import ReminderDialog from '@/components/ReminderDialog.vue'
import TaskView from '@/components/TaskView.vue'
import GithubPanel from '@/components/GithubPanel.vue'
import SecurityPanel from '@/components/security/SecurityPanel.vue'
import AuthDialog from '@/components/AuthDialog.vue'
import ToastHost from '@/components/ToastHost.vue'
import NotifBanner from '@/components/NotifBanner.vue'
import SharedBanner from '@/components/SharedBanner.vue'
import ShareDialog from '@/components/ShareDialog.vue'
import LockScreen from '@/components/LockScreen.vue'
import CloudLoading from '@/components/CloudLoading.vue'

// Every tab is its own async chunk (section 16e): opening the app parses the
// shell and the one tab being shown, not the code behind twelve others. The
// heavy ones — Planning (JointJS) and Calendar (FullCalendar) — are the reason
// this matters most, but the rule is uniform so no future tab reintroduces the
// problem.
const PlanningView = defineAsyncComponent(() => import('@/components/views/PlanningView.vue'))
const OverviewView = defineAsyncComponent(() => import('@/components/views/OverviewView.vue'))
const TodoView = defineAsyncComponent(() => import('@/components/views/TodoView.vue'))
const TasksView = defineAsyncComponent(() => import('@/components/views/TasksView.vue'))
const GoalsView = defineAsyncComponent(() => import('@/components/views/GoalsView.vue'))
const DeadlinesView = defineAsyncComponent(() => import('@/components/views/DeadlinesView.vue'))
const RemindersView = defineAsyncComponent(() => import('@/components/views/RemindersView.vue'))
const FinancesView = defineAsyncComponent(() => import('@/components/views/FinancesView.vue'))
const TripsView = defineAsyncComponent(() => import('@/components/views/TripsView.vue'))
const IdeasView = defineAsyncComponent(() => import('@/components/views/IdeasView.vue'))
const StocksView = defineAsyncComponent(() => import('@/components/views/StocksView.vue'))
const TradesView = defineAsyncComponent(() => import('@/components/views/TradesView.vue'))
const ExpensesView = defineAsyncComponent(() => import('@/components/views/ExpensesView.vue'))
const NewsView = defineAsyncComponent(() => import('@/components/views/NewsView.vue'))
const CodeView = defineAsyncComponent(() => import('@/components/views/CodeView.vue'))
const AiView = defineAsyncComponent(() => import('@/components/views/AiView.vue'))
const BotsView = defineAsyncComponent(() => import('@/components/views/BotsView.vue'))
const GithubView = defineAsyncComponent(() => import('@/components/views/GithubView.vue'))
const WalletsView = defineAsyncComponent(() => import('@/components/views/WalletsView.vue'))
// FullCalendar (grid + interaction plugins) is heavy; load it only when the
// Calendar tab is opened so it lands in its own async chunk.
const CalendarView = defineAsyncComponent(() => import('@/components/views/CalendarView.vue'))

const ui = useUiStore()
const app = useAppStore()
const auth = useAuthStore()
const lock = useLockStore()
const { c } = useStyles()
const { tab, vw, isPhone } = storeToRefs(ui)

// The tab in the URL, and where each tab was scrolled to (section 42). Both are
// mounted here rather than inside a tab, because "which tab" is a fact about
// the workspace and a composable that only exists on Trades can only ever
// remember Trades.
useTabRoute()
useScrollMemory(tab)

// The centered stage (sections 42 and 44).
//
// IT IS IN FLOW INSIDE THE SHELL'S CONTENT REGION, WHICH IS WHAT SCROLLS. It
// used to be `position: fixed` at `inset: 0` with a fixed `86vh` height and
// `overflow: hidden`, and those three together are why a long month was cut off
// at the bottom of the screen with no way to reach the rest.
//
// The scrollport moved from the document to the content region when the chrome
// was given regions of its own (section 44) — the strip and the bar have to
// stay put while the month goes past, and a document that scrolls takes them
// with it. Everything below still applies unchanged: the stage itself must not
// clip, must not transform and must not be taken out of flow.
//
// Nothing inside is a scrollbox now either. A table that scrolls in its own
// 420px window inside a page that cannot scroll is two broken things agreeing
// with each other; the table is as tall as its rows and the document carries it.
//
// The wrapper still centres, and `min-height` still keeps the stage a full
// screen tall when a tab is nearly empty, so there is starfield above and below
// rather than a card floating in a void.
// The geometry is in `workspaceStage.ts` so a test can assert what is NOT in
// it; the paint — the glass, the border, the shadow — stays here where the
// theme is.
const stageWrap = pxify(stageWrapGeometry())
const stageStyle = computed(() => {
  return pxify({
    ...stageGeometry({ vw: vw.value, isPhone: isPhone.value }),
    background: c.value.glass,
    backdropFilter: 'blur(30px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(30px) saturate(1.6)',
    border: '1px solid color-mix(in oklch, ' + c.value.border + ' 62%, transparent)',
    borderRadius: 'var(--radius-dialog)',
    boxShadow: '0 18px 48px color-mix(in oklch, ' + c.value.pageBg + ' 42%, transparent)',
    padding: isPhone.value ? '16px' : '22px 24px',
    // NO `overflow` and NO `transform`. Both break `position: sticky` inside:
    // an overflow other than visible makes this the scrollport a sticky header
    // would stick to, and a transform makes it the containing block. The idle
    // drift that used to live here was a transform on the element containing
    // every row on the page, animating forever — it went with the fixed height
    // that made this a floating card in the first place.
  })
})
const stageBody = computed(() =>
  pxify({
    flex: '1 1 auto',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    alignSelf: 'stretch',
    minHeight: 0,
    minWidth: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    overscrollBehaviorY: 'contain',
    padding: isPhone.value ? '0 2px 18px 0' : '0 4px 22px 0',
  }),
)
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
  trades: TradesView,
  expenses: ExpensesView,
  news: NewsView,
  code: CodeView,
  ai: AiView,
  bots: BotsView,
  github: GithubView,
  wallets: WalletsView,
  calendar: CalendarView,
}
const currentView = computed(() => viewMap[tab.value])
const activeView = ref<{ focus: () => void } | null>(null)

function focusPrimaryInput() {
  activeView.value?.focus()
}

// Device session tracking (section 27a). Set up once here, in setup scope, and
// NOT in a router hook: the spec's rule is "on app focus, not per route change",
// and a per-route hook is exactly the shape that turns a keyboard-navigated
// workspace into thousands of writes a day. It no-ops when Firebase is off.
useDeviceSession({ onRevoked: () => auth.signOut() })

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
    // The detail dialog handles its own Escape (it has a dirty guard to run
    // first), so it is deliberately not closed from here.
    if (app.detailOpen) return
    // One slot now backs every dialog, so one check closes whichever is open.
    if (app.itemDialog) return app.closeItemDialog()
    if (auth.securityPanelOpen) {
      auth.closeSecurityPanel()
      return
    }
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
// /goals/:goalId is the goal's wide page (section 18d). It is the Goals tab
// showing one goal, so entering the route switches tab as well as selection —
// otherwise a cold load would land on whatever tab was last used and show
// nothing.
watch(
  () => (route.name === 'goal-page' ? String(route.params.goalId ?? '') : ''),
  (raw) => {
    if (!raw) {
      if (app.goalPageId != null) app.closeGoalPage()
      return
    }
    const parsed = Number.parseInt(raw, 10)
    if (Number.isNaN(parsed)) return
    ui.setTab('goals')
    app.openGoalPage(parsed)
  },
  { immediate: true },
)

// /notes/:noteId is the note's own page (section 22c's "Open full"). It is the
// full-screen reader the notes drawer already opens, given a URL — so a note
// read beside a task can be handed to somebody, or reopened tomorrow.
watch(
  () => (route.name === 'note-page' ? String(route.params.noteId ?? '') : ''),
  (raw) => {
    if (!raw) return
    const parsed = Number.parseInt(raw, 10)
    if (Number.isNaN(parsed)) return
    app.openNotePage(parsed)
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
  <!-- Four regions over the starfield: the dock in the rail, the page's header
       actions and the reminder in the top strip, the active section in the one
       scrolling content area, and the sync status and action cluster in the
       bottom bar. Nothing is `position: fixed` and nothing overlaps anything. -->
  <AppShell v-if="showWorkspace">
    <div :style="stageWrap">
      <div :style="stageStyle">
          <div :style="stageBody" class="workspace-stage__body">
            <component :is="currentView" ref="activeView" />
          </div>
      </div>
    </div>
  </AppShell>

  <template v-if="showWorkspace">
    <NotesDrawer />
    <NoteView />
    <ItemDialog />
    <TripDialog />
    <DetailHost />
    <ReminderDialog />
    <TaskView />
    <GithubPanel />
    <SecurityPanel :open="auth.securityPanelOpen" @close="auth.closeSecurityPanel()" />
    <NotifBanner />
    <SharedBanner />
    <ShareDialog />
    <ToastHost />
    <DragGhost />
  </template>
  <AuthDialog />
  <CloudLoading v-if="authReady && isSignedIn && !cloudReady" />
  <LockScreen v-if="authReady && isSignedIn && cloudReady && !canUseApp" />
</template>
