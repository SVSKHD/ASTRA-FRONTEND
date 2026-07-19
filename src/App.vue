<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'

import Starfield from '@/components/Starfield.vue'
import CursorTail from '@/components/CursorTail.vue'
import TopBar from '@/components/TopBar.vue'
import TabBar from '@/components/TabBar.vue'
import Ticker from '@/components/Ticker.vue'
import NotesDrawer from '@/components/NotesDrawer.vue'
import TaskDialog from '@/components/TaskDialog.vue'
import ReminderDialog from '@/components/ReminderDialog.vue'
import TaskView from '@/components/TaskView.vue'
import GithubPanel from '@/components/GithubPanel.vue'
import AuthDialog from '@/components/AuthDialog.vue'
import Toast from '@/components/Toast.vue'
import NotifBanner from '@/components/NotifBanner.vue'
import SharedBanner from '@/components/SharedBanner.vue'

import TodoView from '@/components/views/TodoView.vue'
import TasksView from '@/components/views/TasksView.vue'
import DeadlinesView from '@/components/views/DeadlinesView.vue'
import RemindersView from '@/components/views/RemindersView.vue'
import FinancesView from '@/components/views/FinancesView.vue'
import TripsView from '@/components/views/TripsView.vue'

const ui = useUiStore()
const app = useAppStore()
const auth = useAuthStore()
const { c, s } = useStyles()
const { tab } = storeToRefs(ui)

const viewMap = {
  todo: TodoView,
  tasks: TasksView,
  deadlines: DeadlinesView,
  reminders: RemindersView,
  finances: FinancesView,
  trips: TripsView,
}
const currentView = computed(() => viewMap[tab.value])
const activeView = ref<{ focus: () => void } | null>(null)

function focusPrimaryInput() {
  activeView.value?.focus()
}

const notesIconStyle = pxify({ display: 'block' })

// --- global keyboard --------------------------------------------------------
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (app.taskViewId != null) return app.closeTaskView()
    if (app.dialogTaskId != null) return app.closeDialog()
    if (app.dialogReminderId != null) return app.closeReminderDialog()
    if (auth.githubPanelOpen) {
      auth.closeGithubPanel()
      return
    }
    if (auth.avatarMenuOpen) {
      auth.toggleAvatarMenu()
      return
    }
    if (auth.authOpen) {
      auth.continueGuest()
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
  const tag = (e.target as HTMLElement)?.tagName || ''
  const typing =
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable
  if (typing) return
  if (e.key === 'ArrowRight') ui.cycleTab(1)
  else if (e.key === 'ArrowLeft') ui.cycleTab(-1)
  else if (['1', '2', '3', '4', '5', '6'].indexOf(e.key) !== -1) ui.setTabByIndex(parseInt(e.key) - 1)
  else if (e.key.toLowerCase() === 'n') {
    e.preventDefault()
    focusPrimaryInput()
  }
}

// --- swipe between tabs (touch) --------------------------------------------
let touchX: number | null = null
function onTouchStart(e: TouchEvent) {
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
function onPop() {
  try {
    const m = location.pathname.match(/^\/tasks\/(\w+)\/view$/)
    if (m) {
      let id: number | string = parseInt(m[1])
      if (isNaN(id as number)) id = m[1]
      app.taskViewId = id as number
    } else {
      app.taskViewId = null
    }
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  clockTimer = setInterval(() => ui.tick(), 60000)
  remTimer = setInterval(() => app.checkReminders(), 15000)
  window.addEventListener('resize', onResize)
  document.addEventListener('keydown', onKey)
  window.addEventListener('popstate', onPop)
})
onBeforeUnmount(() => {
  clearInterval(clockTimer)
  clearInterval(remTimer)
  window.removeEventListener('resize', onResize)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('popstate', onPop)
})
</script>

<template>
  <Starfield />
  <CursorTail />

  <div :style="s.page">
    <div :style="s.stack">
      <TopBar />
      <TabBar />
      <div :style="s.container" @touchstart="onTouchStart" @touchend="onTouchEnd">
        <component :is="currentView" ref="activeView" />
      </div>
    </div>
  </div>

  <Ticker />

  <button :style="s.fab" v-hover-style="s.fabHover" aria-label="Notes" @click="ui.toggleDrawer()">
    <svg :style="notesIconStyle" width="19" height="19" viewBox="0 0 24 24" fill="none" :stroke="c.accent" stroke-width="2" stroke-linecap="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="7.5" y1="8" x2="16.5" y2="8" />
      <line x1="7.5" y1="12" x2="16.5" y2="12" />
      <line x1="7.5" y1="16" x2="13" y2="16" />
    </svg>
  </button>

  <button :style="s.ghFab" v-hover-style="s.fabHover" aria-label="GitHub" @click="auth.openGithubPanel()">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" :stroke="c.accent" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="18" cy="8" r="2.4" />
      <path d="M18 10.4v1.6a3 3 0 0 1-3 3H9" />
      <line x1="6" y1="8.4" x2="6" y2="15.6" />
    </svg>
  </button>

  <div :style="s.brandWrap"><span :style="s.brand">AUREON</span></div>

  <NotesDrawer />
  <TaskDialog />
  <ReminderDialog />
  <TaskView />
  <GithubPanel />
  <AuthDialog />
  <NotifBanner />
  <SharedBanner />
  <Toast />
</template>
