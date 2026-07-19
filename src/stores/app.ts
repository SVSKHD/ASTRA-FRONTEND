import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { AUREON_COLLECTION, auth, db, firebaseEnabled } from '@/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { mockGithub } from '@/utils/github'
import { buildShareUrl, copyToClipboard, parseSharedFromLocation } from '@/utils/share'
import { occurrences } from '@/utils/reminders'
import type {
  ActiveNotif,
  Deadline,
  EditingState,
  Finance,
  GithubCacheEntry,
  ItemType,
  ListKey,
  Note,
  PullRequest,
  Reminder,
  Repeat,
  SharedView,
  Task,
  Toast,
  Todo,
  Trip,
} from '@/types'

function rel(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function seedTodos(): Todo[] {
  return [
    { id: 1, text: 'Water the plants', done: false },
    { id: 2, text: 'Read 10 pages', done: false },
    { id: 3, text: 'Reply to Sam', done: true },
  ]
}
function seedTasks(): Task[] {
  return [
    { id: 1, title: 'Draft launch email', tag: 'Marketing', done: false, deadline: '', notes: '', repo: '' },
    { id: 2, title: 'Fix login redirect bug', tag: 'Eng', done: false, deadline: rel(3), notes: '', repo: 'vercel/next.js' },
  ]
}
function seedDeadlines(): Deadline[] {
  return [
    { id: 1, title: 'Submit tax documents', due: rel(5) },
    { id: 2, title: 'Portfolio review', due: rel(17) },
    { id: 3, title: 'Renew passport', due: rel(2) },
  ]
}
function seedFinances(): Finance[] {
  return [
    { id: 1, amount: 12.5, category: 'Food', note: 'Lunch', date: rel(0) },
    { id: 2, amount: 40, category: 'Transport', note: 'Metro card', date: rel(-3) },
    { id: 3, amount: 9.99, category: 'Fun', note: 'Album', date: rel(-10) },
  ]
}
function seedNotes(): Note[] {
  return [{ id: 1, text: '<div>Idea: batch groceries on <b>Sundays</b></div>', ts: Date.now() - 3600000 }]
}
function seedReminders(): Reminder[] {
  return [
    {
      id: 1,
      title: 'Stretch break',
      note: 'Stand up and stretch',
      start: new Date(Date.now() + 25 * 60000).toISOString().slice(0, 16),
      repeat: { type: 'hours', n: 2 },
      calSync: 'local',
      lastFiredOcc: null,
    },
    {
      id: 2,
      title: 'Weekly review',
      note: 'Plan next week',
      start: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16),
      repeat: { type: 'weekdays', n: 1, weekdays: [1] },
      calSync: 'local',
      lastFiredOcc: null,
    },
  ]
}

function seedTrips(): Trip[] {
  return []
}

export const useAppStore = defineStore('app', () => {
  const todos = ref<Todo[]>(seedTodos())
  const tasks = ref<Task[]>(seedTasks())
  const deadlines = ref<Deadline[]>(seedDeadlines())
  const finances = ref<Finance[]>(seedFinances())
  const notes = ref<Note[]>(seedNotes())
  const reminders = ref<Reminder[]>(seedReminders())
  const trips = ref<Trip[]>(seedTrips())

  const editing = ref<EditingState>({ type: null, id: null })
  const draft = ref<Record<string, unknown>>({})
  const toast = ref<Toast | null>(null)
  const burst = ref<number | null>(null)

  const dialogTaskId = ref<number | null>(null)
  const dialogReminderId = ref<number | null>(null)
  const dialogClosing = ref(false)
  const taskViewId = ref<number | null>(null)

  const githubCache = ref<Record<number, GithubCacheEntry>>({})
  const approvedPRs = ref<Record<string, boolean>>({})
  const draggingId = ref<number | null>(null)

  const activeNotif = ref<ActiveNotif | null>(null)
  const notifPermission = ref<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  )
  const sharedView = ref<SharedView | null>(parseSharedFromLocation())

  let nid = 100
  const id = () => ++nid
  let dragId: number | null = null
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  // --- id counter bootstrap: keep above any existing ids ------------------
  function bumpNid() {
    const maxId = Math.max(
      0,
      ...todos.value.map((t) => t.id),
      ...tasks.value.map((t) => t.id),
      ...deadlines.value.map((t) => t.id),
      ...finances.value.map((t) => t.id),
      ...notes.value.map((t) => t.id),
      ...reminders.value.map((t) => t.id),
      ...trips.value.map((t) => t.id),
    )
    if (maxId >= nid) nid = maxId + 1
  }

  // ---- Todos --------------------------------------------------------------
  function addTodo(text: string) {
    const t = text.trim()
    if (!t) return
    todos.value = [...todos.value, { id: id(), text: t, done: false }]
  }
  function toggleTodo(tid: number) {
    const wasDone = todos.value.find((t) => t.id === tid)?.done
    todos.value = todos.value.map((t) => (t.id === tid ? { ...t, done: !t.done } : t))
    if (!wasDone) {
      burst.value = tid
      setTimeout(() => {
        if (burst.value === tid) burst.value = null
      }, 650)
    }
  }

  // ---- Tasks --------------------------------------------------------------
  function addTask(title: string, tag: string) {
    const t = title.trim()
    if (!t) return
    tasks.value = [
      ...tasks.value,
      { id: id(), title: t, tag: tag.trim(), done: false, deadline: '', notes: '', repo: '' },
    ]
  }
  function toggleTask(tid: number) {
    tasks.value = tasks.value.map((t) => (t.id === tid ? { ...t, done: !t.done } : t))
  }
  function updateTask(tid: number, field: keyof Task, value: string) {
    tasks.value = tasks.value.map((t) => (t.id === tid ? { ...t, [field]: value } : t))
  }

  // ---- Deadlines ----------------------------------------------------------
  function addDeadline(title: string, due: string) {
    const t = title.trim()
    if (!t || !due) return
    deadlines.value = [...deadlines.value, { id: id(), title: t, due }]
  }

  // ---- Finances -----------------------------------------------------------
  function addFinance(amountStr: string, category: string, note: string) {
    const a = parseFloat(amountStr)
    if (!a || a <= 0) return
    finances.value = [
      ...finances.value,
      { id: id(), amount: a, category, note: note.trim(), date: rel(0) },
    ]
  }

  // ---- Trips --------------------------------------------------------------
  function addTrip(location: string, date: string) {
    const place = location.trim()
    if (!place || !date) return
    trips.value = [...trips.value, { id: id(), location: place, date }]
  }

  // ---- Editing / drafts ---------------------------------------------------
  function startEdit<T extends { id: number | null }>(type: ItemType, item: T) {
    editing.value = { type, id: item.id }
    draft.value = { ...item } as Record<string, unknown>
  }
  function newNote() {
    startEdit('note', { id: null, text: '' })
  }
  function cancelEdit() {
    editing.value = { type: null, id: null }
    draft.value = {}
  }
  function setDraft(field: string, value: unknown) {
    draft.value = { ...draft.value, [field]: value }
  }
  function saveEdit() {
    const { type, id: eid } = editing.value
    const d = draft.value
    if (type === 'todo') {
      todos.value = todos.value.map((t) => (t.id === eid ? { ...t, text: d.text as string } : t))
    } else if (type === 'deadline') {
      deadlines.value = deadlines.value.map((t) =>
        t.id === eid ? { ...t, title: d.title as string, due: d.due as string } : t,
      )
    } else if (type === 'finance') {
      finances.value = finances.value.map((t) =>
        t.id === eid
          ? {
              ...t,
              amount: parseFloat(d.amount as string) || t.amount,
              category: d.category as string,
              note: d.note as string,
            }
          : t,
      )
    } else if (type === 'note') {
      if (eid == null) {
        notes.value = [...notes.value, { id: id(), text: (d.text as string) || '', ts: Date.now() }]
      } else {
        notes.value = notes.value.map((t) => (t.id === eid ? { ...t, text: d.text as string } : t))
      }
    } else if (type === 'trip') {
      const location = (d.location as string).trim()
      const date = d.date as string
      if (location && date) {
        trips.value = trips.value.map((t) => (t.id === eid ? { ...t, location, date } : t))
      }
    }
    editing.value = { type: null, id: null }
    draft.value = {}
  }

  // ---- Delete + undo ------------------------------------------------------
  const LIST_MAP: Record<ListKey, () => { get: () => unknown[]; set: (v: unknown[]) => void }> = {
    todos: () => ({ get: () => todos.value, set: (v) => (todos.value = v as Todo[]) }),
    tasks: () => ({ get: () => tasks.value, set: (v) => (tasks.value = v as Task[]) }),
    deadlines: () => ({ get: () => deadlines.value, set: (v) => (deadlines.value = v as Deadline[]) }),
    finances: () => ({ get: () => finances.value, set: (v) => (finances.value = v as Finance[]) }),
    notes: () => ({ get: () => notes.value, set: (v) => (notes.value = v as Note[]) }),
    reminders: () => ({ get: () => reminders.value, set: (v) => (reminders.value = v as Reminder[]) }),
    trips: () => ({ get: () => trips.value, set: (v) => (trips.value = v as Trip[]) }),
  }

  function deleteWithUndo(listKey: ListKey, type: ItemType, itemId: number) {
    const accessor = LIST_MAP[listKey]()
    const list = accessor.get() as { id: number; [k: string]: unknown }[]
    const idx = list.findIndex((x) => x.id === itemId)
    if (idx < 0) return
    const item = list[idx]
    const label =
      type === 'todo'
        ? (item.text as string)
        : type === 'task'
          ? (item.title as string)
          : type === 'deadline'
            ? (item.title as string)
            : type === 'finance'
              ? ((item.note as string) || (item.category as string))
              : type === 'reminder'
                ? (item.title as string)
                : type === 'trip'
                  ? (item.location as string)
                : (item.text as string)
    const short = label && label.length > 28 ? label.slice(0, 28) + '…' : label
    accessor.set(list.filter((x) => x.id !== itemId))
    toast.value = { message: 'Deleted "' + short + '"', undo: true, listKey, item, idx }
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      if (toast.value) toast.value = null
    }, 5000)
  }
  function undoDelete() {
    const t = toast.value
    if (!t || t.listKey == null || t.item == null || t.idx == null) return
    const accessor = LIST_MAP[t.listKey]()
    const list = [...accessor.get()]
    list.splice(Math.min(t.idx, list.length), 0, t.item)
    accessor.set(list)
    toast.value = null
    clearTimeout(toastTimer)
  }
  function showToastMsg(message: string) {
    toast.value = { message, undo: false }
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      if (toast.value) toast.value = null
    }, 3000)
  }
  function closeToast() {
    clearTimeout(toastTimer)
    toast.value = null
  }

  // ---- Sharing ------------------------------------------------------------
  function share(type: ItemType, item: { id: number }) {
    const url = buildShareUrl(type, item)
    copyToClipboard(url).finally(() => showToastMsg('Link copied to clipboard'))
  }
  function dismissShared() {
    sharedView.value = null
    try {
      history.replaceState(null, '', '/')
    } catch {
      /* ignore */
    }
  }
  function addSharedItem() {
    const sv = sharedView.value
    if (!sv || !sv.type) return
    const it = sv.item || {}
    const nidNew = id()
    if (sv.type === 'todo')
      todos.value = [...todos.value, { id: nidNew, text: (it.text as string) || 'Shared todo', done: false }]
    else if (sv.type === 'task')
      tasks.value = [
        ...tasks.value,
        {
          id: nidNew,
          title: (it.title as string) || 'Shared task',
          tag: (it.tag as string) || '',
          done: false,
          deadline: (it.deadline as string) || '',
          notes: (it.notes as string) || '',
          repo: (it.repo as string) || '',
        },
      ]
    else if (sv.type === 'deadline')
      deadlines.value = [
        ...deadlines.value,
        { id: nidNew, title: (it.title as string) || 'Shared deadline', due: (it.due as string) || rel(3) },
      ]
    else if (sv.type === 'finance')
      finances.value = [
        ...finances.value,
        {
          id: nidNew,
          amount: (it.amount as number) || 0,
          category: (it.category as string) || 'Other',
          note: (it.note as string) || '',
          date: rel(0),
        },
      ]
    else if (sv.type === 'note')
      notes.value = [...notes.value, { id: nidNew, text: (it.text as string) || '', ts: Date.now() }]
    else if (sv.type === 'trip')
      trips.value = [
        ...trips.value,
        {
          id: nidNew,
          location: (it.location as string) || 'Shared location',
          date: (it.date as string) || rel(0),
        },
      ]
    dismissShared()
  }

  // ---- GitHub (mock) ------------------------------------------------------
  function fetchGithub(taskId: number, repo: string) {
    githubCache.value = { ...githubCache.value, [taskId]: { status: 'loading' } }
    setTimeout(
      () => {
        const data = mockGithub(repo)
        githubCache.value = { ...githubCache.value, [taskId]: { status: 'ready', data } }
      },
      800 + Math.random() * 600,
    )
  }
  function attachRepo(taskId: number, repo: string) {
    if (!repo || !repo.trim()) return
    fetchGithub(taskId, repo.trim())
  }
  function approvePR(pr: PullRequest) {
    approvedPRs.value = { ...approvedPRs.value, [pr.id]: true }
    showToastMsg('Approved PR #' + pr.num)
    // GitHub review API: POST /repos/{owner}/{repo}/pulls/{num}/reviews { event: 'APPROVE' }
  }
  function importIssue(repo: { name: string; full: string }, issue: { num: number; title: string }) {
    tasks.value = [
      ...tasks.value,
      {
        id: id(),
        title: issue.title,
        tag: repo.name,
        done: false,
        deadline: '',
        notes: 'Imported from ' + repo.full + ' #' + issue.num,
        repo: repo.full,
      },
    ]
    showToastMsg('Imported "' + (issue.title.length > 24 ? issue.title.slice(0, 24) + '…' : issue.title) + '"')
  }

  // ---- Drag & drop (tasks) ------------------------------------------------
  function setDragId(v: number | null) {
    dragId = v
    draggingId.value = v
  }
  function dropOnTask(targetId: number) {
    if (dragId == null || dragId === targetId) {
      draggingId.value = null
      return
    }
    const arr = tasks.value.slice()
    const di = arr.findIndex((t) => t.id === dragId)
    if (di < 0) {
      draggingId.value = null
      dragId = null
      return
    }
    const drag = { ...arr[di] }
    arr.splice(di, 1)
    const ti = arr.findIndex((t) => t.id === targetId)
    if (ti < 0) {
      arr.push(drag)
    } else {
      drag.deadline = arr[ti].deadline || ''
      arr.splice(ti, 0, drag)
    }
    tasks.value = arr
    draggingId.value = null
    dragId = null
  }
  function dropOnGroup(dateStr: string) {
    if (dragId == null) {
      draggingId.value = null
      return
    }
    const arr = tasks.value.slice()
    const di = arr.findIndex((t) => t.id === dragId)
    if (di < 0) {
      draggingId.value = null
      dragId = null
      return
    }
    const drag = { ...arr[di], deadline: dateStr }
    arr.splice(di, 1)
    let lastIdx = -1
    arr.forEach((t, i) => {
      if ((t.deadline || '') === dateStr) lastIdx = i
    })
    if (lastIdx >= 0) arr.splice(lastIdx + 1, 0, drag)
    else arr.push(drag)
    tasks.value = arr
    draggingId.value = null
    dragId = null
  }

  // ---- Dialogs / task view ------------------------------------------------
  function openTaskDialog(tid: number) {
    dialogTaskId.value = tid
  }
  function closeDialog() {
    if (dialogTaskId.value == null) return
    dialogClosing.value = true
    setTimeout(() => {
      dialogTaskId.value = null
      dialogClosing.value = false
    }, 220)
  }
  function openReminderDialog(rid: number) {
    dialogReminderId.value = rid
  }
  function closeReminderDialog() {
    if (dialogReminderId.value == null) return
    dialogClosing.value = true
    setTimeout(() => {
      dialogReminderId.value = null
      dialogClosing.value = false
    }, 220)
  }
  function openTaskView(tid: number) {
    try {
      history.pushState({ taskView: tid }, '', '/tasks/' + tid + '/view')
    } catch {
      /* ignore */
    }
    taskViewId.value = tid
    dialogTaskId.value = null
    dialogClosing.value = false
  }
  function closeTaskView() {
    taskViewId.value = null
    try {
      if (history.state && history.state.taskView != null) history.back()
      else history.replaceState(null, '', '/')
    } catch {
      /* ignore */
    }
  }

  // ---- Reminders ----------------------------------------------------------
  function addReminder(payload: { title: string; note: string; start: string; repeat: Repeat }) {
    const t = payload.title.trim()
    if (!t || !payload.start) return
    reminders.value = [
      ...reminders.value,
      { id: id(), title: t, note: payload.note.trim(), start: payload.start, repeat: payload.repeat, calSync: 'local', lastFiredOcc: null },
    ]
    requestNotifPermission()
  }
  function updateReminder(rid: number, field: keyof Reminder, value: unknown) {
    reminders.value = reminders.value.map((r) => (r.id === rid ? { ...r, [field]: value } : r))
  }
  function toggleWeekday(rid: number, day: number) {
    reminders.value = reminders.value.map((r) => {
      if (r.id !== rid) return r
      const wd = (r.repeat.weekdays || []).slice()
      const i = wd.indexOf(day)
      if (i === -1) wd.push(day)
      else wd.splice(i, 1)
      return { ...r, repeat: { ...r.repeat, weekdays: wd } }
    })
  }
  function syncCalendar(rid: number) {
    reminders.value = reminders.value.map((r) => (r.id === rid ? { ...r, calSync: 'pending' } : r))
    // Real Google Calendar API would go here (needs Google auth / gapi).
    setTimeout(() => {
      reminders.value = reminders.value.map((r) => (r.id === rid ? { ...r, calSync: 'synced' } : r))
    }, 1200)
  }
  function syncAllCalendar() {
    reminders.value.forEach((r) => syncCalendar(r.id))
  }
  function requestNotifPermission() {
    if (typeof Notification !== 'undefined' && Notification.requestPermission) {
      Notification.requestPermission().then(() => {
        notifPermission.value = Notification.permission
      })
    }
  }
  function fireReminder(r: Reminder) {
    activeNotif.value = { id: r.id, title: r.title, note: r.note }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(r.title, { body: r.note || 'Reminder due' })
      } catch {
        /* ignore */
      }
    }
  }
  function checkReminders() {
    const now = Date.now()
    let fired = false
    const updated = reminders.value.map((r) => {
      const { last } = occurrences(r, now)
      if (last && now - last < 90000 && r.lastFiredOcc !== last) {
        fired = true
        fireReminder(r)
        return { ...r, lastFiredOcc: last }
      }
      return r
    })
    if (fired) reminders.value = updated
  }
  function snoozeNotif(mins: number) {
    const n = activeNotif.value
    if (!n) return
    const when = new Date(Date.now() + mins * 60000).toISOString().slice(0, 16)
    reminders.value = [
      ...reminders.value,
      { id: id(), title: n.title, note: n.note, start: when, repeat: { type: 'none' }, calSync: 'local', lastFiredOcc: null },
    ]
    activeNotif.value = null
  }
  function dismissNotif() {
    activeNotif.value = null
  }

  // ---- Firestore persistence ---------------------------------------------
  let uid: string | null = null
  let cloudUnsub: Unsubscribe | null = null
  let hydrating = false
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  function snapshotData() {
    return {
      todos: todos.value,
      tasks: tasks.value,
      deadlines: deadlines.value,
      finances: finances.value,
      notes: notes.value,
      reminders: reminders.value,
      trips: trips.value,
      approvedPRs: approvedPRs.value,
    }
  }
  function applyData(data: Record<string, unknown>) {
    hydrating = true
    if (Array.isArray(data.todos)) todos.value = data.todos as Todo[]
    if (Array.isArray(data.tasks)) tasks.value = data.tasks as Task[]
    if (Array.isArray(data.deadlines)) deadlines.value = data.deadlines as Deadline[]
    if (Array.isArray(data.finances)) finances.value = data.finances as Finance[]
    if (Array.isArray(data.notes)) notes.value = data.notes as Note[]
    if (Array.isArray(data.reminders)) reminders.value = data.reminders as Reminder[]
    if (Array.isArray(data.trips)) trips.value = data.trips as Trip[]
    if (data.approvedPRs && typeof data.approvedPRs === 'object')
      approvedPRs.value = data.approvedPRs as Record<string, boolean>
    bumpNid()
    // Release the hydration guard after the reactive writes settle.
    setTimeout(() => {
      hydrating = false
    }, 0)
  }
  function saveCloud() {
    if (!firebaseEnabled || !db || !uid || hydrating) return
    const ref = doc(db, AUREON_COLLECTION, uid)
    setDoc(ref, { ...snapshotData(), ownerId: uid, updatedAt: Date.now() }, { merge: true }).catch((err) =>
      console.error('[Aureon] Cloud save failed:', err),
    )
  }
  function scheduleSave() {
    // Snapshot hydration updates every reactive list. Do not turn those remote
    // changes into another write, otherwise the realtime listener can loop.
    if (hydrating) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(saveCloud, 600)
  }

  if (firebaseEnabled && auth && db) {
    onAuthStateChanged(auth, async (u) => {
      if (cloudUnsub) {
        cloudUnsub()
        cloudUnsub = null
      }
      uid = u ? u.uid : null
      if (!uid || !db) return
      const ref = doc(db, AUREON_COLLECTION, uid)
      try {
        const snap = await getDoc(ref)
        if (snap.exists()) applyData(snap.data())
        else await setDoc(ref, { ...snapshotData(), ownerId: uid, updatedAt: Date.now() }, { merge: true })
      } catch (err) {
        console.error('[Aureon] Cloud load failed:', err)
      }
      // Live updates from other devices.
      cloudUnsub = onSnapshot(
        ref,
        (s) => {
          if (s.exists() && s.metadata.hasPendingWrites === false) applyData(s.data())
        },
        (err) => console.error('[Aureon] Cloud listener failed:', err),
      )
    })

    watch([todos, tasks, deadlines, finances, notes, reminders, trips, approvedPRs], scheduleSave, {
      deep: true,
    })
  }

  bumpNid()

  return {
    // state
    todos,
    tasks,
    deadlines,
    finances,
    notes,
    reminders,
    trips,
    editing,
    draft,
    toast,
    burst,
    dialogTaskId,
    dialogReminderId,
    dialogClosing,
    taskViewId,
    githubCache,
    approvedPRs,
    draggingId,
    activeNotif,
    notifPermission,
    sharedView,
    // actions
    addTodo,
    toggleTodo,
    addTask,
    toggleTask,
    updateTask,
    addDeadline,
    addFinance,
    addTrip,
    startEdit,
    newNote,
    cancelEdit,
    setDraft,
    saveEdit,
    deleteWithUndo,
    undoDelete,
    showToastMsg,
    closeToast,
    share,
    dismissShared,
    addSharedItem,
    attachRepo,
    approvePR,
    importIssue,
    setDragId,
    dropOnTask,
    dropOnGroup,
    openTaskDialog,
    closeDialog,
    openReminderDialog,
    closeReminderDialog,
    openTaskView,
    closeTaskView,
    addReminder,
    updateReminder,
    toggleWeekday,
    syncCalendar,
    syncAllCalendar,
    requestNotifPermission,
    checkReminders,
    snoozeNotif,
    dismissNotif,
  }
})
