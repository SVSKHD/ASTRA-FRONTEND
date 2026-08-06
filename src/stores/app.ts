import { defineStore } from 'pinia'
import { computed, ref, watch, type Ref } from 'vue'
import { doc, getDoc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { AUREON_COLLECTION, auth, db, defaultLockMinutes, firebaseEnabled } from '@/firebase'
import { onAuthStateChanged, type User as FbUser } from 'firebase/auth'
import { isThemeSetting, type ThemeSetting } from '@/themes'
import { isFirebaseUserAllowed } from '@/stores/auth'
import { mockGithub } from '@/utils/github'
import { buildShareUrl, copyToClipboard, parseSharedFromLocation } from '@/utils/share'
import { createShare, deleteShare, updateShareItem, writeShareDoc } from '@/utils/shares'
import {
  CalendarAuthError,
  createEvent,
  deleteEvent,
  hasCalendarToken,
  updateEvent,
} from '@/utils/gcal'
import { useAuthStore } from '@/stores/auth'
import { occurrences } from '@/utils/reminders'
import { stampOnDay, ymd } from '@/utils/dayGroups'
import { isBlankNote } from '@/utils/notes'
import {
  DEFAULT_TAGS,
  normalizeTag,
  sameTag,
  sanitizeTags,
  withTag,
  withoutTag,
} from '@/utils/tags'
import { STATUS_CYCLE, emptyFinanceSettings, isStatus, statusFromDone } from '@/types'
import { chunk, eligibleTasks, eligibleTodos, todayKey } from '@/utils/rollover'
import { pendingKeysBetween, signatureOf, type Identified } from '@/utils/sync'
import { deviceLabel, draftKey, sanitizeDrafts, type DraftRecord } from '@/utils/drafts'
import { seedBots } from '@/utils/bots'
import { AI_MODELS, type AiChat, type AiMessage, type Bot } from '@/types'
import type { Debt, DebtPayment, FinScope, FinTag, ScopeFilter, Txn } from '@/types'
import { titleFromMessage } from '@/utils/ai'
import { debtOutstanding, migrateExpenses } from '@/utils/finance'
import { resolveIncome } from '@/utils/budget'
import { checkLink, hasRef, sameRef, type Graph, type LinkCheck } from '@/utils/links'
import { nestSummary, planNest } from '@/utils/dragNest'
import type {
  ActiveNotif,
  Deadline,
  EditingState,
  Finance,
  GithubCacheEntry,
  Idea,
  ItemDialogState,
  ItemStatus,
  ItemType,
  LinkRef,
  LinkCollection,
  ListKey,
  Note,
  Stock,
  Priority,
  PullRequest,
  FinanceSettings,
  Reminder,
  Repeat,
  RepeatType,
  SecuritySettings,
  SharedView,
  SourceRef,
  Task,
  Timestamped,
  Toast,
  Todo,
  Trip,
  TripPlace,
  TripStatus,
} from '@/types'

function rel(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function isPriority(value: unknown): value is Priority {
  return value === 'low' || value === 'normal' || value === 'high'
}

// Sanitise a stored cross-collection back-pointer to a well-formed SourceRef, so
// a malformed or legacy value reads as "created directly" rather than crashing
// the bridge logic.
function sourceRefOf(v: unknown): SourceRef | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Partial<SourceRef>
  if (typeof r.id !== 'number') return null
  if (r.collection === 'todos' || r.collection === 'tasks' || r.collection === 'reminders') {
    return { collection: r.collection, id: r.id }
  }
  return null
}

// A short, self-contained WebAudio chime for a firing reminder — no asset to
// bundle or fetch, so it works offline. Silently no-ops where WebAudio is
// unavailable (SSR, older browsers, autoplay-blocked before any interaction).
function playReminderChime() {
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1174, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
    osc.onended = () => void ctx.close()
  } catch {
    /* ignore — sound is a nicety, never a hard dependency */
  }
}

function emptySecurity(): SecuritySettings {
  return {
    pinHash: '',
    pinSalt: '',
    autoLockEnabled: true,
    lockTimeoutMinutes: defaultLockMinutes,
  }
}

export const useAppStore = defineStore('app', () => {
  const todos = ref<Todo[]>([])
  const tasks = ref<Task[]>([])
  const deadlines = ref<Deadline[]>([])
  const finances = ref<Finance[]>([])
  const notes = ref<Note[]>([])
  const reminders = ref<Reminder[]>([])
  const trips = ref<Trip[]>([])
  const ideas = ref<Idea[]>([])
  const stocks = ref<Stock[]>([])
  // The shared tag vocabulary behind both pickers. Seeded for a new workspace;
  // a hydrate replaces it, and any tag typed anywhere joins it.
  const tags = ref<string[]>(DEFAULT_TAGS.slice())
  const security = ref<SecuritySettings>(emptySecurity())
  // Theme is a per-user preference, so it rides along in the workspace doc and
  // is restored on refresh once the document lands. The ui store reads it.
  const themeSetting = ref<ThemeSetting>('auto')
  // Left-rail collapsed state — a per-user preference, persisted in the same
  // workspace doc so it comes back on refresh and across devices. The ui store
  // reads it; the rail's toggle writes it.
  const railCollapsed = ref(false)
  // "Move pending to today" preferences. autoRollover runs the rollover once on
  // the first load of a new day; lastAutoRolloverDay (a YYYY-MM-DD key) records
  // the last day it did, so it fires at most once per day per device-sync.
  const autoRollover = ref(false)
  const lastAutoRolloverDay = ref('')
  // Done/Not-done split preferences. hideCompleted collapses the Completed
  // section entirely for users who never want it; reminderSound plays a short
  // tone alongside the browser notification when a reminder fires.
  const hideCompleted = ref(false)
  const reminderSound = ref(false)
  // Monthly-income settings for the expenses view (INR).
  const financeSettings = ref<FinanceSettings>(emptyFinanceSettings())
  // Draft-resume store (section 8). One in-progress draft per entity, keyed
  // `${entityType}:${entityId ?? 'new'}`, held in the workspace doc so it rides
  // the same offline-synced save path and reaches every device. This device's
  // stable label rides along on each draft so a cross-device draft can be named.
  const drafts = ref<Record<string, DraftRecord>>({})
  const thisDeviceLabel = deviceLabel()
  // AI chat (Part A) and trading bots (Part B). Both live in the workspace doc
  // like everything else, so they sync and work offline through the same layer.
  const aiChats = ref<AiChat[]>([])
  const aiActiveChatId = ref<number | null>(null)
  const aiUseData = ref(true)
  const bots = ref<Bot[]>([])
  // Finances rework: unified transactions, debts, first-class tags, a per-scope
  // business income setting (personal reuses financeSettings), the active scope
  // filter, and a one-time migration guard for the legacy expenses array.
  const transactions = ref<Txn[]>([])
  const debts = ref<Debt[]>([])
  const financeTags = ref<FinTag[]>([])
  const businessFinance = ref<FinanceSettings>(emptyFinanceSettings())
  const finScope = ref<ScopeFilter>('personal')
  const finMigrated = ref(false)
  const cloudReady = ref(false)
  const cloudError = ref('')
  const syncState = ref<'idle' | 'saving' | 'synced' | 'error'>('idle')
  // Offline sync signals, fed from the workspace snapshot's metadata. Because
  // the whole workspace is one document, `fromCache`/`hasPendingWrites` describe
  // the doc as a whole; per-item pending is recovered by diffing against
  // syncedSig, the signature of the last server-acknowledged snapshot.
  const syncFromCache = ref(false)
  const syncHasPending = ref(false)
  const lastSyncedAt = ref<number | null>(null)
  const syncedSig = ref<Map<string, string>>(new Map())

  const editing = ref<EditingState>({ type: null, id: null })
  const draft = ref<Record<string, unknown>>({})
  const toast = ref<Toast | null>(null)
  const burst = ref<number | null>(null)

  // Which item dialog is open. One slot rather than a ref per type: only one
  // dialog is ever on screen, and per-type refs drifted out of sync (opening a
  // reminder used to leave a stale task id behind).
  //
  // `create` edits `dialogDraft` and commits on save; `edit` writes through to
  // the stored item on every keystroke, so its save button only dismisses.
  const itemDialog = ref<ItemDialogState | null>(null)
  const dialogDraft = ref<Record<string, unknown>>({})
  const dialogClosing = ref(false)
  const taskViewId = ref<number | null>(null)
  // The note open in the full-screen reader/editor. It stays up until it is
  // closed, so it is a slot of its own rather than a mode of the drawer. A null
  // id in edit mode is a note that has not been saved yet.
  const noteView = ref<{ id: number | null; mode: 'read' | 'edit' } | null>(null)
  const noteViewClosing = ref(false)

  const githubCache = ref<Record<number, GithubCacheEntry>>({})
  const approvedPRs = ref<Record<string, boolean>>({})
  const draggingId = ref<number | null>(null)
  const draggingTodoId = ref<number | null>(null)

  const activeNotif = ref<ActiveNotif | null>(null)
  const notifPermission = ref<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  )
  const sharedView = ref<SharedView | null>(parseSharedFromLocation())
  // The item awaiting a public/private choice in the share dialog.
  const pendingShare = ref<{ type: ItemType; item: { id: number } } | null>(null)
  const shareBusy = ref(false)
  // Set when a calendar call comes back 401 — the access token is ~1h and
  // Firebase issues no browser refresh token, so re-consent is the only fix.
  const calendarNeedsAuth = ref(false)

  let nid = 100
  const id = () => ++nid
  let dragId: number | null = null
  let todoDragId: number | null = null
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  // Set while a non-delete toast (e.g. the rollover) offers Undo; performUndo
  // dispatches here first, falling back to undoDelete for deletions.
  let toastUndoHandler: (() => void) | null = null

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
      ...ideas.value.map((t) => t.id),
      ...stocks.value.map((t) => t.id),
    )
    if (maxId >= nid) nid = maxId + 1
  }

  // ---- Timestamps ---------------------------------------------------------
  // Every create stamps both fields; every mutation bumps updatedAt. Kept in
  // one place so a new action cannot quietly forget to age its item.
  function stamps(): { createdAt: number; updatedAt: number } {
    const ts = Date.now()
    return { createdAt: ts, updatedAt: ts }
  }
  function touched<T>(item: T): T {
    return { ...item, updatedAt: Date.now() }
  }

  // ---- Tags ---------------------------------------------------------------
  // Every path that writes a tag funnels through here, so a tag typed into a
  // row's edit field joins the vocabulary exactly like one created in a picker.
  function registerTag(raw: string): string {
    const tag = normalizeTag(raw)
    if (!tag) return ''
    const next = withTag(tags.value, tag)
    if (next !== tags.value) tags.value = next
    // Reuse the stored spelling so "office" does not shadow "Office".
    return tags.value.find((t) => sameTag(t, tag)) ?? tag
  }
  function addTag(raw: string) {
    return registerTag(raw)
  }
  // Removing a tag from the vocabulary leaves items that use it alone — their
  // tag is still their tag, it is just no longer offered in the pickers.
  function removeTag(raw: string) {
    tags.value = withoutTag(tags.value, raw)
  }

  // ---- Status -------------------------------------------------------------
  // One lifecycle for todos and tasks. `done` is written from `status` here and
  // nowhere else, so the two can never drift apart.
  function withStatus<T extends { status: ItemStatus; done: boolean }>(
    item: T,
    next: ItemStatus,
  ): T {
    // Stamp completedAt when entering done, clear it when leaving — the monthly
    // overview counts fulfilment by the month completedAt falls in. (Items
    // without the field, if any, just carry an ignored extra property.)
    return touched({
      ...item,
      status: next,
      done: next === 'done',
      completedAt: next === 'done' ? Date.now() : null,
    })
  }
  function nextStatus(cur: ItemStatus): ItemStatus {
    const i = STATUS_CYCLE.indexOf(cur)
    return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length]
  }
  // The done-burst is a todo-only flourish; fire it whenever a todo lands on
  // done, whichever control moved it there.
  function fireBurst(tid: number) {
    burst.value = tid
    setTimeout(() => {
      if (burst.value === tid) burst.value = null
    }, 650)
  }

  // ---- Todos --------------------------------------------------------------
  function addTodo(text: string, tag = '', description = '') {
    const t = text.trim()
    if (!t) return
    todos.value = [
      ...todos.value,
      {
        id: id(),
        text: t,
        done: false,
        status: 'pending',
        tag: registerTag(tag),
        description: description.trim(),
        isPublic: false,
        shareId: null,
        sharedAt: null,
        rolledOverAt: null,
        rolloverCount: 0,
        completedAt: null,
        reminderIds: [],
        sourceRef: null,
        linked: [],
        parents: [],
        ...stamps(),
      },
    ]
  }
  function updateTodo(tid: number, fields: Partial<Todo>) {
    const next =
      'tag' in fields ? { ...fields, tag: registerTag(String(fields.tag ?? '')) } : fields
    todos.value = todos.value.map((t) => (t.id === tid ? touched({ ...t, ...next }) : t))
    // Keep a public share's frozen snapshot in step with the edit just made.
    syncShareIfPublic('todo', tid)
  }
  function setTodoStatus(tid: number, next: ItemStatus) {
    const cur = todos.value.find((t) => t.id === tid)
    if (!cur || cur.status === next) return
    todos.value = todos.value.map((t) => (t.id === tid ? withStatus(t, next) : t))
    if (next === 'done') {
      fireBurst(tid)
      cancelRemindersFor('todos', tid)
    }
    // A shared todo's status is part of its public page; keep it in sync.
    syncShareIfPublic('todo', tid)
  }
  function cycleTodoStatus(tid: number) {
    const cur = todos.value.find((t) => t.id === tid)
    if (cur) setTodoStatus(tid, nextStatus(cur.status))
  }
  function toggleTodo(tid: number) {
    const cur = todos.value.find((t) => t.id === tid)
    if (cur) setTodoStatus(tid, cur.done ? 'pending' : 'done')
  }

  // ---- Tasks --------------------------------------------------------------
  function addTask(title: string, tag: string, fields: Partial<Task> = {}) {
    const t = title.trim()
    if (!t) return
    tasks.value = [
      ...tasks.value,
      {
        id: id(),
        title: t,
        tag: registerTag(tag),
        done: false,
        status: 'pending',
        deadline: '',
        notes: '',
        repo: '',
        rolledOverAt: null,
        rolloverCount: 0,
        completedAt: null,
        reminderIds: [],
        sourceRef: null,
        linked: [],
        parents: [],
        ...fields,
        ...stamps(),
      },
    ]
  }
  function setTaskStatus(tid: number, next: ItemStatus) {
    const cur = tasks.value.find((t) => t.id === tid)
    if (!cur || cur.status === next) return
    tasks.value = tasks.value.map((t) => (t.id === tid ? withStatus(t, next) : t))
    if (next === 'done') cancelRemindersFor('tasks', tid)
  }
  function cycleTaskStatus(tid: number) {
    const cur = tasks.value.find((t) => t.id === tid)
    if (cur) setTaskStatus(tid, nextStatus(cur.status))
  }
  function toggleTask(tid: number) {
    const cur = tasks.value.find((t) => t.id === tid)
    if (cur) setTaskStatus(tid, cur.done ? 'pending' : 'done')
  }
  function updateTask(tid: number, field: keyof Task, value: string) {
    const v = field === 'tag' ? registerTag(value) : value
    tasks.value = tasks.value.map((t) => (t.id === tid ? touched({ ...t, [field]: v }) : t))
  }

  // ---- Deadlines ----------------------------------------------------------
  function addDeadline(title: string, due: string) {
    const t = title.trim()
    if (!t || !due) return
    deadlines.value = [...deadlines.value, { id: id(), title: t, due, ...stamps() }]
  }
  function updateDeadline(did: number, fields: Partial<Deadline>) {
    deadlines.value = deadlines.value.map((d) => (d.id === did ? touched({ ...d, ...fields }) : d))
  }

  // ---- Finances -----------------------------------------------------------
  function addFinance(amountStr: string, category: string, note: string, date = rel(0)) {
    const a = parseFloat(amountStr)
    if (!a || a <= 0) return
    finances.value = [
      ...finances.value,
      { id: id(), amount: a, category, note: note.trim(), date: date || rel(0), ...stamps() },
    ]
  }
  function updateFinance(fid: number, fields: Partial<Finance>) {
    finances.value = finances.value.map((f) => (f.id === fid ? touched({ ...f, ...fields }) : f))
  }

  // ---- Monthly income (INR) ----------------------------------------------
  // Income is set per month; writing a month also updates monthlyIncome so it
  // becomes the fallback for later months that have no explicit value.
  function setMonthlyIncome(monthKey: string, amount: number) {
    const val = Number.isFinite(amount) && amount > 0 ? amount : 0
    financeSettings.value = {
      ...financeSettings.value,
      monthlyIncome: val,
      incomeByMonth: { ...financeSettings.value.incomeByMonth, [monthKey]: val },
      incomeUpdatedAt: Date.now(),
    }
  }

  // ---- "Move pending to today" (generalized over todos + tasks) -----------
  // One code path rolls overdue items in either collection forward to today:
  //   tasks — set `deadline` to today.
  //   todos — todos have no due date; their day is `createdAt`, so re-stamp it
  //           to today keeping the time of day (same move as a drag-to-day).
  // Both bump `rolledOverAt`/`rolloverCount`. Idempotent: a second run finds an
  // empty eligible set. Firestore's writeBatch caps at 500 ops; the whole
  // workspace is one document here, so a "chunk" persists as one workspace
  // write, and 400 still bounds how much a huge run touches per step.
  const ROLLOVER_CHUNK = 400

  type CollectionKey = 'todos' | 'tasks'
  interface MoveRestore {
    id: number
    prev: Record<string, string | number | null>
  }
  interface MoveResult {
    moved: number
    failed: number
    restore: MoveRestore[]
  }

  // The exact eligible list, shared by the badge count and the action so they
  // can never disagree. Uses the real local clock (today).
  function pendingOverdue(collectionKey: CollectionKey): Array<Todo | Task> {
    const today = todayKey()
    return collectionKey === 'tasks'
      ? eligibleTasks(tasks.value, today)
      : eligibleTodos(todos.value, today)
  }

  // Yield a frame so the progress bar can paint between chunks (used only on the
  // offline path, where there is no server ack to await).
  function nextFrame(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
      else setTimeout(resolve, 16)
    })
  }

  async function movePendingToToday(
    collectionKey: CollectionKey,
    onProgress?: (done: number, total: number) => void,
  ): Promise<MoveResult> {
    const today = todayKey()
    const eligible = pendingOverdue(collectionKey)
    const total = eligible.length
    const restore: MoveRestore[] = []
    if (total === 0) return { moved: 0, failed: 0, restore }

    // Offline, the workspace write never acknowledges until reconnect, so we
    // must not await it (that would hang the bar forever). Online we await the
    // real write for genuine per-chunk progress; offline we commit the chunk
    // locally (durable via persistence) and let the offline layer replay it.
    const online =
      (typeof navigator === 'undefined' || navigator.onLine !== false) && !syncFromCache.value

    const priorOf = (item: Todo | Task): Record<string, string | number | null> =>
      collectionKey === 'tasks'
        ? {
            deadline: (item as Task).deadline,
            rolledOverAt: item.rolledOverAt,
            rolloverCount: item.rolloverCount,
          }
        : {
            createdAt: item.createdAt,
            rolledOverAt: item.rolledOverAt,
            rolloverCount: item.rolloverCount,
          }
    const applyChunk = (ids: Set<number>, at: number) => {
      if (collectionKey === 'tasks') {
        tasks.value = tasks.value.map((t) =>
          ids.has(t.id)
            ? {
                ...t,
                deadline: today,
                rolledOverAt: at,
                rolloverCount: (t.rolloverCount || 0) + 1,
                updatedAt: at,
              }
            : t,
        )
      } else {
        todos.value = todos.value.map((t) =>
          ids.has(t.id)
            ? {
                ...t,
                createdAt: stampOnDay(today, t.createdAt),
                rolledOverAt: at,
                rolloverCount: (t.rolloverCount || 0) + 1,
                updatedAt: at,
              }
            : t,
        )
      }
    }
    const revertChunk = (prior: Map<number, Record<string, string | number | null>>) => {
      if (collectionKey === 'tasks') {
        tasks.value = tasks.value.map((t) =>
          prior.has(t.id) ? ({ ...t, ...prior.get(t.id) } as Task) : t,
        )
      } else {
        todos.value = todos.value.map((t) =>
          prior.has(t.id) ? ({ ...t, ...prior.get(t.id) } as Todo) : t,
        )
      }
    }

    const maxSteps = 20
    const chunkSize = Math.min(ROLLOVER_CHUNK, Math.max(1, Math.ceil(total / maxSteps)))
    const groups = chunk(eligible, chunkSize)

    let moved = 0
    let failed = 0
    for (const group of groups) {
      const ids = new Set(group.map((i) => i.id))
      const prior = new Map(group.map((i) => [i.id, priorOf(i)]))
      applyChunk(ids, Date.now())
      if (online) {
        try {
          await saveCloudNow()
          for (const i of group) restore.push({ id: i.id, prev: prior.get(i.id)! })
          moved += group.length
        } catch {
          revertChunk(prior)
          failed += group.length
        }
      } else {
        // Queue locally without blocking, then yield a frame so the bar moves.
        void saveCloudNow().catch(() => {})
        await nextFrame()
        for (const i of group) restore.push({ id: i.id, prev: prior.get(i.id)! })
        moved += group.length
      }
      onProgress?.(moved + failed, total)
    }
    return { moved, failed, restore }
  }

  // Restore each moved item to the day (and rollover bookkeeping) it had before.
  function undoMovePending(collectionKey: CollectionKey, restore: MoveRestore[]) {
    if (!restore.length) return
    const map = new Map(restore.map((r) => [r.id, r.prev]))
    const at = Date.now()
    if (collectionKey === 'tasks') {
      tasks.value = tasks.value.map((t) =>
        map.has(t.id) ? ({ ...t, ...map.get(t.id), updatedAt: at } as Task) : t,
      )
    } else {
      todos.value = todos.value.map((t) =>
        map.has(t.id) ? ({ ...t, ...map.get(t.id), updatedAt: at } as Todo) : t,
      )
    }
    void saveCloudNow().catch(() => {})
  }

  function setAutoRollover(v: boolean) {
    autoRollover.value = v === true
  }
  function setHideCompleted(v: boolean) {
    hideCompleted.value = v === true
  }
  function setReminderSound(v: boolean) {
    reminderSound.value = v === true
  }

  // ---- Interlinked todos/tasks -------------------------------------------
  // Links are {id, collection} refs stored on both endpoints: a child sits in
  // the parent's `linked`, the parent sits in the child's `parents`. Both sides
  // are written together (one reactive update each, coalesced into a single
  // debounced save — the single-doc equivalent of a writeBatch).
  function linkableList(collection: LinkCollection): typeof todos | typeof tasks {
    return collection === 'todos' ? todos : tasks
  }
  function linkableById(ref: LinkRef): Todo | Task | undefined {
    return linkableList(ref.collection).value.find((i) => i.id === ref.id)
  }
  function linkGraph(): Graph {
    return {
      children: (r) => linkableById(r)?.linked ?? [],
      parents: (r) => linkableById(r)?.parents ?? [],
    }
  }
  function applyLinkPatch(ref: LinkRef, next: { linked?: LinkRef[]; parents?: LinkRef[] }) {
    if (ref.collection === 'todos') {
      todos.value = todos.value.map((t) => (t.id === ref.id ? { ...t, ...next } : t))
    } else {
      tasks.value = tasks.value.map((t) => (t.id === ref.id ? { ...t, ...next } : t))
    }
  }

  // Validation only — used by the picker to filter candidates and disable rows.
  function canLinkItems(parent: LinkRef, child: LinkRef): LinkCheck {
    const p = linkableById(parent)
    if (!p) return { ok: false, reason: 'self' }
    return checkLink(linkGraph(), parent, p.linked, child)
  }
  // Link child under parent, writing both directions. Returns the check so the
  // caller can toast the specific rejection reason.
  function linkItems(parent: LinkRef, child: LinkRef): LinkCheck {
    const p = linkableById(parent)
    const c = linkableById(child)
    if (!p || !c) return { ok: false, reason: 'self' }
    const check = checkLink(linkGraph(), parent, p.linked, child)
    if (!check.ok) return check
    applyLinkPatch(parent, { linked: [...p.linked, child] })
    applyLinkPatch(child, { parents: [...c.parents, parent] })
    return { ok: true }
  }
  function unlinkItems(parent: LinkRef, child: LinkRef) {
    const p = linkableById(parent)
    const c = linkableById(child)
    if (p) applyLinkPatch(parent, { linked: p.linked.filter((r) => !sameRef(r, child)) })
    if (c) applyLinkPatch(child, { parents: c.parents.filter((r) => !sameRef(r, parent)) })
  }
  // Drag-to-nest: link one or more children under `target`, re-parenting each out
  // of the parent it was dragged from (sourceParents, keyed `collection:id`).
  // Reuses linkItems/unlinkItems — both write both directions and coalesce into
  // one debounced workspace save, which is this app's writeBatch equivalent.
  // Invalid children are skipped (never silently); the toast reports the mix and
  // offers a 10s Undo restoring each child's previous parent.
  interface NestRestore {
    child: LinkRef
    oldParent: LinkRef | null
  }
  function nestUnder(
    children: LinkRef[],
    target: LinkRef,
    sourceParents: Record<string, LinkRef | null> = {},
  ) {
    const plan = planNest(children, (child) => canLinkItems(target, child))
    const restore: NestRestore[] = []
    for (const child of plan.valid) {
      const res = linkItems(target, child)
      if (!res.ok) continue
      const old = sourceParents[linkKeyOf(child)] ?? null
      if (old && !sameRef(old, target)) unlinkItems(old, child)
      restore.push({ child, oldParent: old })
    }
    const msg = nestSummary(plan)
    if (restore.length) {
      showToastWithUndo(
        msg,
        () => {
          for (const r of restore) {
            unlinkItems(target, r.child)
            if (r.oldParent) linkItems(r.oldParent, r.child)
          }
        },
        10000,
        'Undo',
      )
    } else if (plan.skipped.length) {
      showToastMsg(msg)
    }
    return plan
  }
  function linkKeyOf(ref: LinkRef): string {
    return ref.collection + ':' + ref.id
  }
  // Drop onto empty space / the background: lift a child out of a parent to the
  // top level, keeping the item. A no-op if it wasn't nested there.
  function unnestFrom(child: LinkRef, parent: LinkRef) {
    unlinkItems(parent, child)
    showToastWithUndo('Moved to top level', () => linkItems(parent, child), 10000, 'Undo')
  }
  // On delete: strip the item from every counterpart's linked/parents so no
  // dangling pointers remain.
  function cleanupLinksForDelete(ref: LinkRef) {
    const strip = (arr: LinkRef[]) => arr.filter((r) => !sameRef(r, ref))
    const touchList = <T extends { linked: LinkRef[]; parents: LinkRef[] }>(list: T[]): T[] =>
      list.map((it) =>
        hasRef(it.linked, ref) || hasRef(it.parents, ref)
          ? { ...it, linked: strip(it.linked), parents: strip(it.parents) }
          : it,
      )
    todos.value = touchList(todos.value)
    tasks.value = touchList(tasks.value)
  }
  // Direct-children progress (not a rolled-up subtree): done = status 'done'.
  function linkProgressOf(ref: LinkRef): { done: number; total: number; pct: number } {
    const links = linkableById(ref)?.linked ?? []
    let done = 0
    for (const l of links) if (linkableById(l)?.status === 'done') done++
    const total = links.length
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
  }

  // ---- Offline sync signals ----------------------------------------------
  // The syncable collections, keyed by the same type prefixes the chip lookups
  // use.
  function syncCollections(): Record<string, Identified[]> {
    return {
      todo: todos.value,
      task: tasks.value,
      deadline: deadlines.value,
      finance: finances.value,
      note: notes.value,
      reminder: reminders.value,
      trip: trips.value,
      idea: ideas.value,
      stock: stocks.value,
    }
  }
  // Snapshot the current collections as the "last acknowledged" baseline. Called
  // whenever a server-acked (non-pending) snapshot lands, so a subsequent local
  // edit shows up as a diff against it.
  function captureSyncedBaseline() {
    syncedSig.value = signatureOf(syncCollections())
  }
  // Keys (`type:id`) with unsynced local changes — the source of truth for both
  // the per-item chip and the pending count.
  const pendingKeys = computed(() =>
    pendingKeysBetween(signatureOf(syncCollections()), syncedSig.value),
  )
  const pendingCount = computed(() => pendingKeys.value.size)
  function isItemPending(type: ItemType, itemId: number): boolean {
    return pendingKeys.value.has(type + ':' + itemId)
  }
  // Manual retry for a stuck write: re-issue the workspace write so the SDK
  // re-attempts delivery. A no-op when there is nothing pending or no connection
  // target.
  function retrySync() {
    void saveCloudNow().catch(() => {})
  }
  // Stamp the last-synced time when pending drains to zero (not on the initial
  // already-empty state, so a fresh load doesn't flash "All changes saved").
  watch(pendingCount, (count, prev) => {
    if (count === 0 && prev > 0) lastSyncedAt.value = Date.now()
  })

  // Runs the rollover once on the first load of a new day when autoRollover is
  // on. lastAutoRolloverDay is advanced first so a slow write cannot cause a
  // second run on a quick reload, and it is stored so the once-a-day promise
  // holds across devices/sessions.
  async function runAutoRolloverIfDue() {
    const today = todayKey()
    if (!autoRollover.value || lastAutoRolloverDay.value === today) return
    lastAutoRolloverDay.value = today
    const res = await movePendingToToday('tasks')
    if (res.moved > 0) {
      showToastMsg(`${res.moved} task${res.moved === 1 ? '' : 's'} moved to today`)
    }
  }

  // ---- Trips --------------------------------------------------------------
  // A trip is a titled plan with an ordered list of places (each with its own
  // map pin, visited date/time, notes and photos). Create takes the essentials;
  // places, photos and the map are filled in from the detail dialog afterwards.
  function addTrip(fields: {
    title: string
    date?: string
    status?: TripStatus
    description?: string
    tag?: string
  }): number | undefined {
    const title = fields.title.trim()
    if (!title) return undefined
    const newId = id()
    trips.value = [
      ...trips.value,
      {
        id: newId,
        title,
        status: fields.status ?? 'tovisit',
        date: fields.date || rel(0),
        visitedDate: '',
        description: (fields.description ?? '').trim(),
        tag: registerTag(fields.tag ?? ''),
        photos: [],
        places: [],
        noteIds: [],
        // Legacy mirror so old share/render paths still find a location string.
        location: title,
        ...stamps(),
      },
    ]
    return newId
  }
  function updateTrip(tid: number, fields: Partial<Trip>) {
    const next =
      'tag' in fields ? { ...fields, tag: registerTag(String(fields.tag ?? '')) } : fields
    trips.value = trips.value.map((t) => (t.id === tid ? touched({ ...t, ...next }) : t))
  }
  function tripById(tid: number): Trip | undefined {
    return trips.value.find((t) => t.id === tid)
  }
  function blankPlace(): TripPlace {
    return {
      id: id(),
      name: '',
      address: '',
      lat: null,
      lng: null,
      visitedAt: '',
      notes: '',
      photos: [],
    }
  }
  function addTripPlace(tid: number, place?: Partial<TripPlace>): number | undefined {
    const trip = tripById(tid)
    if (!trip) return undefined
    const created = { ...blankPlace(), ...place }
    updateTrip(tid, { places: [...trip.places, created] })
    return created.id
  }
  function updateTripPlace(tid: number, placeId: number, fields: Partial<TripPlace>) {
    const trip = tripById(tid)
    if (!trip) return
    updateTrip(tid, {
      places: trip.places.map((p) => (p.id === placeId ? { ...p, ...fields } : p)),
    })
  }
  function removeTripPlace(tid: number, placeId: number) {
    const trip = tripById(tid)
    if (!trip) return
    updateTrip(tid, { places: trip.places.filter((p) => p.id !== placeId) })
  }
  // Reorder places to an explicit id order — drag-to-reorder in the dialog.
  function reorderTripPlaces(tid: number, orderedIds: number[]) {
    const trip = tripById(tid)
    if (!trip) return
    const byId = new Map(trip.places.map((p) => [p.id, p]))
    const next = orderedIds.map((pid) => byId.get(pid)).filter((p): p is TripPlace => !!p)
    // Keep any place the caller forgot to mention, appended in its old order.
    for (const p of trip.places) if (!orderedIds.includes(p.id)) next.push(p)
    updateTrip(tid, { places: next })
  }
  // One-tap To Visit -> Done, recording when it happened.
  function moveTripToDone(tid: number, visitedDate: string) {
    updateTrip(tid, { status: 'done', visitedDate: visitedDate || rel(0) })
  }
  function moveTripToVisit(tid: number) {
    updateTrip(tid, { status: 'tovisit' })
  }

  // ---- Ideas --------------------------------------------------------------
  function addIdea(title: string, tag: string, fields: Partial<Idea> = {}) {
    const t = title.trim()
    if (!t) return
    ideas.value = [
      ...ideas.value,
      {
        id: id(),
        title: t,
        description: '',
        deadline: '',
        ideaType: 'feature',
        tag: registerTag(tag),
        noteIds: [],
        ...fields,
        ...stamps(),
      },
    ]
  }
  function updateIdea(iid: number, fields: Partial<Idea>) {
    const next =
      'tag' in fields ? { ...fields, tag: registerTag(String(fields.tag ?? '')) } : fields
    ideas.value = ideas.value.map((i) => (i.id === iid ? touched({ ...i, ...next }) : i))
  }

  // ---- Stocks -------------------------------------------------------------
  function addStock(symbol: string, tag: string, fields: Partial<Stock> = {}) {
    const s = symbol.trim().toUpperCase()
    if (!s) return
    stocks.value = [
      ...stocks.value,
      {
        id: id(),
        symbol: s,
        name: '',
        why: '',
        targetPrice: 0,
        watchPrice: 0,
        tag: registerTag(tag),
        noteIds: [],
        ...fields,
        ...stamps(),
      },
    ]
  }
  function updateStock(sid: number, fields: Partial<Stock>) {
    const next =
      'tag' in fields ? { ...fields, tag: registerTag(String(fields.tag ?? '')) } : fields
    stocks.value = stocks.value.map((st) => (st.id === sid ? touched({ ...st, ...next }) : st))
  }

  // ---- Note attachment (ideas + stocks) -----------------------------------
  // Notes are referenced by id, never copied. One note can hang off many items;
  // detaching only drops the reference, the note itself lives on in the drawer.
  function currentNoteIds(type: ItemType, itemId: number): number[] {
    const list = type === 'idea' ? ideas.value : type === 'trip' ? trips.value : stocks.value
    const found = list.find((i) => i.id === itemId)
    return found ? ((found as { noteIds?: number[] }).noteIds?.slice() ?? []) : []
  }
  function writeNoteIds(type: 'idea' | 'stock' | 'trip', itemId: number, noteIds: number[]) {
    if (type === 'idea') updateIdea(itemId, { noteIds })
    else if (type === 'trip') updateTrip(itemId, { noteIds })
    else updateStock(itemId, { noteIds })
  }
  function attachNote(type: 'idea' | 'stock' | 'trip', itemId: number, noteId: number) {
    const ids = currentNoteIds(type, itemId)
    if (ids.includes(noteId)) return
    writeNoteIds(type, itemId, [...ids, noteId])
  }
  function detachNote(type: 'idea' | 'stock' | 'trip', itemId: number, noteId: number) {
    writeNoteIds(
      type,
      itemId,
      currentNoteIds(type, itemId).filter((n) => n !== noteId),
    )
  }

  // ---- Editing / drafts ---------------------------------------------------
  function startEdit<T extends { id: number | null }>(type: ItemType, item: T) {
    editing.value = { type, id: item.id }
    draft.value = { ...item } as Record<string, unknown>
  }
  // ---- Notes: the full-screen reader / rich-text editor -------------------
  // Every note now opens in its own dialog — reading it, then editing it in
  // place — instead of the drawer swapping itself out for an editor. The drawer
  // is the index; this is the document.
  const openNote = computed<Note | null>(() => {
    const v = noteView.value
    if (!v || v.id == null) return null
    return notes.value.find((n) => n.id === v.id) ?? null
  })

  function newNote() {
    noteView.value = { id: null, mode: 'edit' }
    noteViewClosing.value = false
    draft.value = { text: '' }
  }
  function openNoteView(noteId: number) {
    noteView.value = { id: noteId, mode: 'read' }
    noteViewClosing.value = false
  }
  function editNoteView(noteId?: number) {
    const target = noteId ?? noteView.value?.id ?? null
    noteView.value = { id: target, mode: 'edit' }
    noteViewClosing.value = false
    draft.value = { text: target == null ? '' : (openNote.value?.text ?? '') }
  }
  // Commit the editor's HTML. A note whose markup carries no text at all is
  // dropped rather than saved — an empty <div> would be an unreadable row.
  function saveNoteView(html: string) {
    const v = noteView.value
    if (!v) return
    const text = html
    if (isBlankNote(text)) {
      if (v.id == null) return closeNoteView()
      deleteWithUndo('notes', 'note', v.id)
      return closeNoteView()
    }
    if (v.id == null) {
      const newId = id()
      notes.value = [...notes.value, { id: newId, text, ts: Date.now(), ...stamps() }]
      noteView.value = { id: newId, mode: 'read' }
    } else {
      const target = v.id
      notes.value = notes.value.map((n) => (n.id === target ? touched({ ...n, text }) : n))
      noteView.value = { id: target, mode: 'read' }
    }
    draft.value = {}
  }
  function closeNoteView() {
    if (!noteView.value) return
    noteViewClosing.value = true
    setTimeout(() => {
      noteView.value = null
      noteViewClosing.value = false
      draft.value = {}
    }, 220)
  }
  // A checkbox ticked in the reader writes straight back, so the note is the
  // checklist rather than a picture of one.
  function setNoteText(noteId: number, html: string) {
    notes.value = notes.value.map((n) => (n.id === noteId ? touched({ ...n, text: html }) : n))
  }
  // Autosave while editing: persist the draft in place without leaving edit
  // mode. A new note is created on its first non-blank keystroke and the view
  // rebinds to it, so subsequent autosaves update rather than duplicate. Blank
  // markup is ignored — an empty note is not worth a row until it has content.
  function autosaveNoteDraft(html: string) {
    const v = noteView.value
    if (!v || v.mode !== 'edit') return
    if (isBlankNote(html)) return
    if (v.id == null) {
      const newId = id()
      notes.value = [...notes.value, { id: newId, text: html, ts: Date.now(), ...stamps() }]
      noteView.value = { id: newId, mode: 'edit' }
    } else {
      const target = v.id
      notes.value = notes.value.map((n) => (n.id === target ? touched({ ...n, text: html }) : n))
    }
  }
  function cancelEdit() {
    editing.value = { type: null, id: null }
    draft.value = {}
  }
  function setDraft(field: string, value: unknown) {
    draft.value = { ...draft.value, [field]: value }
  }
  // Notes are the only inline-edited item left — every other type creates and
  // updates through its own dialog, so those branches went with the inline rows.
  function saveEdit() {
    const { type, id: eid } = editing.value
    const d = draft.value
    if (type === 'note') {
      if (eid == null) {
        notes.value = [
          ...notes.value,
          { id: id(), text: (d.text as string) || '', ts: Date.now(), ...stamps() },
        ]
      } else {
        notes.value = notes.value.map((t) =>
          t.id === eid ? touched({ ...t, text: d.text as string }) : t,
        )
      }
    }
    editing.value = { type: null, id: null }
    draft.value = {}
  }

  // ---- Draft resume (section 8) -------------------------------------------
  // The primitives behind useDraft and the create-dialog resume: read, write and
  // clear the per-entity draft. All three write through drafts.value, so a draft
  // change schedules a workspace save exactly like any other edit — which is what
  // gives drafts offline durability and cross-device delivery with no extra code.
  function draftFor(entityType: string, entityId: number | null): DraftRecord | null {
    return drafts.value[draftKey(entityType, entityId)] ?? null
  }
  function saveDraft(
    entityType: string,
    entityId: number | null,
    payload: Record<string, unknown>,
  ) {
    const key = draftKey(entityType, entityId)
    drafts.value = {
      ...drafts.value,
      [key]: {
        entityType,
        entityId: entityId ?? null,
        // Copy so a later mutation of the caller's form object cannot rewrite a
        // stored draft behind our back.
        payload: { ...payload },
        updatedAt: Date.now(),
        deviceLabel: thisDeviceLabel,
      },
    }
  }
  function deleteDraft(entityType: string, entityId: number | null) {
    const key = draftKey(entityType, entityId)
    if (!(key in drafts.value)) return
    const next = { ...drafts.value }
    delete next[key]
    drafts.value = next
  }

  // ---- AI chat (Part A) ---------------------------------------------------
  function aiChatById(chatId: number): AiChat | undefined {
    return aiChats.value.find((ch) => ch.id === chatId)
  }
  const activeAiChat = computed<AiChat | null>(
    () => aiChats.value.find((ch) => ch.id === aiActiveChatId.value) ?? null,
  )
  function newAiChat(model = AI_MODELS[0].id): number {
    const chatId = id()
    const ts = Date.now()
    aiChats.value = [
      ...aiChats.value,
      {
        id: chatId,
        title: 'New chat',
        model,
        pinned: false,
        messages: [],
        createdAt: ts,
        updatedAt: ts,
      },
    ]
    aiActiveChatId.value = chatId
    return chatId
  }
  function selectAiChat(chatId: number) {
    aiActiveChatId.value = chatId
  }
  function setAiChatModel(chatId: number, model: string) {
    aiChats.value = aiChats.value.map((ch) => (ch.id === chatId ? { ...ch, model } : ch))
  }
  function renameAiChat(chatId: number, title: string) {
    const t = title.trim()
    if (!t) return
    aiChats.value = aiChats.value.map((ch) =>
      ch.id === chatId ? { ...ch, title: t, updatedAt: Date.now() } : ch,
    )
  }
  function toggleAiChatPin(chatId: number) {
    aiChats.value = aiChats.value.map((ch) =>
      ch.id === chatId ? { ...ch, pinned: !ch.pinned } : ch,
    )
  }
  function deleteAiChat(chatId: number) {
    aiChats.value = aiChats.value.filter((ch) => ch.id !== chatId)
    if (aiActiveChatId.value === chatId) aiActiveChatId.value = aiChats.value[0]?.id ?? null
  }
  // Append a message and bump the chat. The title is auto-derived from the first
  // user turn (a plain text slice, no extra model call) until the user renames it.
  function addAiMessage(chatId: number, msg: Omit<AiMessage, 'id' | 'createdAt'>): number {
    const chat = aiChatById(chatId)
    if (!chat) return -1
    const msgId = id()
    const ts = Date.now()
    const message: AiMessage = { ...msg, id: msgId, createdAt: ts }
    const firstUser = msg.role === 'user' && chat.messages.every((m) => m.role !== 'user')
    aiChats.value = aiChats.value.map((ch) =>
      ch.id === chatId
        ? {
            ...ch,
            messages: [...ch.messages, message],
            title: firstUser && ch.title === 'New chat' ? titleFromMessage(msg.content) : ch.title,
            updatedAt: ts,
          }
        : ch,
    )
    return msgId
  }
  // Stream an assistant reply into an existing message bubble as tokens arrive.
  function appendAiMessageContent(chatId: number, msgId: number, delta: string) {
    aiChats.value = aiChats.value.map((ch) =>
      ch.id === chatId
        ? {
            ...ch,
            messages: ch.messages.map((m) =>
              m.id === msgId ? { ...m, content: m.content + delta } : m,
            ),
          }
        : ch,
    )
  }
  function setAiUseData(v: boolean) {
    aiUseData.value = v === true
  }

  // ---- Trading bots (Part B) ----------------------------------------------
  function botById(botId: number): Bot | undefined {
    return bots.value.find((b) => b.id === botId)
  }
  function patchBot(botId: number, patch: Partial<Bot>) {
    bots.value = bots.value.map((b) => (b.id === botId ? { ...b, ...patch } : b))
  }
  // Flip `enabled` (the only field the app ever writes) and show the intermediate
  // "Starting…/Stopping…" state until the bot's next heartbeat confirms. With no
  // bot process attached this simulates that confirmation after a beat so the UI
  // is usable; a real bot's heartbeat write clears `pending` the same way.
  function toggleBot(botId: number, next?: boolean) {
    const bot = botById(botId)
    if (!bot) return
    const target = next === undefined ? !bot.enabled : next
    patchBot(botId, { enabled: target, pending: true })
    setTimeout(() => {
      const b = botById(botId)
      if (!b || b.enabled !== target) return
      patchBot(botId, {
        pending: false,
        status: target ? 'running' : 'stopped',
        heartbeatAt: Date.now(),
      })
    }, 1200)
  }
  // The kill switch: disable every bot at once.
  function stopAllBots() {
    for (const b of bots.value) if (b.enabled) toggleBot(b.id, false)
  }

  // ---- Finances rework (transactions / debts / tags) ----------------------
  function setFinScope(s: ScopeFilter) {
    finScope.value = s
  }
  // Baseline (expected) monthly income for a scope, resolved from that scope's
  // settings. 'all' sums both scopes' baselines.
  function baselineIncome(scope: ScopeFilter, monthKey: string): number {
    if (scope === 'business') return resolveIncome(businessFinance.value, monthKey)
    if (scope === 'personal') return resolveIncome(financeSettings.value, monthKey)
    return (
      resolveIncome(financeSettings.value, monthKey) +
      resolveIncome(businessFinance.value, monthKey)
    )
  }
  function setScopeIncome(scope: FinScope, monthKey: string, amount: number) {
    const val = Number.isFinite(amount) && amount > 0 ? amount : 0
    if (scope === 'business') {
      businessFinance.value = {
        ...businessFinance.value,
        monthlyIncome: val,
        incomeByMonth: { ...businessFinance.value.incomeByMonth, [monthKey]: val },
        incomeUpdatedAt: Date.now(),
      }
    } else {
      setMonthlyIncome(monthKey, val)
    }
  }

  function addTxn(fields: Partial<Txn> & { kind: Txn['kind']; amount: number }): number {
    const newId = id()
    transactions.value = [
      ...transactions.value,
      {
        id: newId,
        kind: fields.kind,
        scope: fields.scope ?? (finScope.value === 'all' ? 'personal' : finScope.value),
        amount: Number(fields.amount) || 0,
        date: fields.date || rel(0),
        note: (fields.note ?? '').trim(),
        category: fields.category ?? (fields.kind === 'income' ? 'Income' : 'Other'),
        tags: Array.isArray(fields.tags) ? fields.tags : [],
        source: fields.source,
        party: fields.party,
        isRecurring: fields.isRecurring === true,
        recurrenceRule: fields.recurrenceRule,
        confirmed: fields.confirmed,
        gst: fields.gst,
        debtId: fields.debtId ?? null,
        attachmentUrl: fields.attachmentUrl,
        ...stamps(),
      },
    ]
    return newId
  }
  function updateTxn(txnId: number, patch: Partial<Txn>) {
    transactions.value = transactions.value.map((t) =>
      t.id === txnId ? touched({ ...t, ...patch }) : t,
    )
  }
  function deleteTxn(txnId: number) {
    const gone = transactions.value.find((t) => t.id === txnId)
    transactions.value = transactions.value.filter((t) => t.id !== txnId)
    // If it was a debt payment, drop the matching payment entry so the two sides
    // stay consistent.
    if (gone?.debtId != null) {
      debts.value = debts.value.map((d) =>
        d.id === gone.debtId
          ? { ...d, payments: d.payments.filter((p) => p.transactionId !== txnId) }
          : d,
      )
    }
  }
  // Confirm a recurring "expected" income as actually received.
  function confirmIncome(txnId: number) {
    updateTxn(txnId, { confirmed: true })
  }

  function addDebt(
    fields: Partial<Debt> & {
      direction: Debt['direction']
      counterparty: string
      principal: number
    },
  ): number {
    const newId = id()
    debts.value = [
      ...debts.value,
      {
        id: newId,
        direction: fields.direction,
        scope: fields.scope ?? (finScope.value === 'all' ? 'personal' : finScope.value),
        counterparty: fields.counterparty.trim(),
        principal: Number(fields.principal) || 0,
        currency: 'INR',
        interestRatePct: fields.interestRatePct,
        interestType: fields.interestType ?? 'none',
        startDate: fields.startDate || rel(0),
        dueDate: fields.dueDate,
        status: fields.status ?? 'open',
        note: (fields.note ?? '').trim(),
        tags: Array.isArray(fields.tags) ? fields.tags : [],
        payments: [],
        ...stamps(),
      },
    ]
    return newId
  }
  function updateDebt(debtId: number, patch: Partial<Debt>) {
    debts.value = debts.value.map((d) => (d.id === debtId ? touched({ ...d, ...patch }) : d))
  }
  function deleteDebt(debtId: number) {
    debts.value = debts.value.filter((d) => d.id !== debtId)
    // Unlink (don't delete) any transactions that pointed at it — they remain
    // valid money records, just no longer tied to a debt.
    transactions.value = transactions.value.map((t) =>
      t.debtId === debtId ? { ...t, debtId: null } : t,
    )
  }
  function settleDebt(debtId: number) {
    updateDebt(debtId, { status: 'settled' })
  }
  function writeOffDebt(debtId: number) {
    updateDebt(debtId, { status: 'written_off' })
  }
  // Record a payment against a debt: creates a linked transaction (expense for
  // money I pay out, income for money coming back to me) so it flows into the
  // month's totals, then files the payment referencing that transaction.
  function recordDebtPayment(debtId: number, p: { amount: number; date?: string; note?: string }) {
    const debt = debts.value.find((d) => d.id === debtId)
    if (!debt) return
    const amount = Number(p.amount) || 0
    if (amount <= 0) return
    const txnId = addTxn({
      kind: debt.direction === 'owed_by_me' ? 'expense' : 'income',
      scope: debt.scope,
      amount,
      date: p.date || rel(0),
      note:
        p.note ||
        `Debt ${debt.direction === 'owed_by_me' ? 'payment to' : 'received from'} ${debt.counterparty}`,
      category: 'Debt',
      party: debt.counterparty,
      debtId,
    })
    const payment: DebtPayment = {
      id: id(),
      amount,
      date: p.date || rel(0),
      note: p.note || '',
      transactionId: txnId,
    }
    const next = { ...debt, payments: [...debt.payments, payment] }
    // Auto-settle once fully repaid.
    if (debtOutstanding(next, Date.now()) <= 0) next.status = 'settled'
    debts.value = debts.value.map((d) => (d.id === debtId ? touched(next) : d))
  }
  function deleteDebtPayment(debtId: number, paymentId: number) {
    const debt = debts.value.find((d) => d.id === debtId)
    if (!debt) return
    const payment = debt.payments.find((p) => p.id === paymentId)
    if (payment?.transactionId != null) {
      transactions.value = transactions.value.filter((t) => t.id !== payment.transactionId)
    }
    updateDebt(debtId, { payments: debt.payments.filter((p) => p.id !== paymentId) })
  }

  // Tags (finance): first-class, colour-coded, shared by income + expenses.
  const TAG_COLORS = [
    'oklch(0.7 0.15 25)',
    'oklch(0.72 0.15 150)',
    'oklch(0.74 0.13 250)',
    'oklch(0.8 0.16 72)',
    'oklch(0.72 0.16 320)',
    'oklch(0.7 0.13 190)',
  ]
  function addFinTag(name: string, scope: ScopeFilter = 'all', color?: string): number | undefined {
    const nm = name.trim()
    if (!nm) return undefined
    const existing = financeTags.value.find((t) => t.name.toLowerCase() === nm.toLowerCase())
    if (existing) return existing.id
    const newId = id()
    financeTags.value = [
      ...financeTags.value,
      {
        id: newId,
        name: nm,
        color: color || TAG_COLORS[financeTags.value.length % TAG_COLORS.length],
        scope,
        kind: 'both',
      },
    ]
    return newId
  }
  // Rename cascades to every transaction and debt carrying the old name, in one
  // pass, so the table never shows a stale tag.
  function renameFinTag(tagId: number, newName: string) {
    const tag = financeTags.value.find((t) => t.id === tagId)
    const nm = newName.trim()
    if (!tag || !nm) return
    const old = tag.name
    financeTags.value = financeTags.value.map((t) => (t.id === tagId ? { ...t, name: nm } : t))
    const swap = (arr: string[]) => arr.map((x) => (x === old ? nm : x))
    transactions.value = transactions.value.map((t) =>
      t.tags.includes(old) ? { ...t, tags: swap(t.tags) } : t,
    )
    debts.value = debts.value.map((d) => (d.tags.includes(old) ? { ...d, tags: swap(d.tags) } : d))
  }
  function mergeFinTags(fromId: number, toId: number) {
    const from = financeTags.value.find((t) => t.id === fromId)
    const to = financeTags.value.find((t) => t.id === toId)
    if (!from || !to) return
    const dedupe = (arr: string[]) =>
      Array.from(new Set(arr.map((x) => (x === from.name ? to.name : x))))
    transactions.value = transactions.value.map((t) =>
      t.tags.includes(from.name) ? { ...t, tags: dedupe(t.tags) } : t,
    )
    debts.value = debts.value.map((d) =>
      d.tags.includes(from.name) ? { ...d, tags: dedupe(d.tags) } : d,
    )
    financeTags.value = financeTags.value.filter((t) => t.id !== fromId)
  }
  function setFinTagColor(tagId: number, color: string) {
    financeTags.value = financeTags.value.map((t) => (t.id === tagId ? { ...t, color } : t))
  }
  function archiveFinTag(tagId: number, archived = true) {
    financeTags.value = financeTags.value.map((t) => (t.id === tagId ? { ...t, archived } : t))
  }
  // Register a free-form tag typed on a form so it joins the vocabulary with a
  // colour, then return its stored name.
  function ensureFinTag(name: string): string {
    const nm = name.trim()
    if (!nm) return ''
    addFinTag(nm)
    return financeTags.value.find((t) => t.name.toLowerCase() === nm.toLowerCase())?.name ?? nm
  }

  // ---- Delete + undo ------------------------------------------------------
  const LIST_MAP: Record<ListKey, () => { get: () => unknown[]; set: (v: unknown[]) => void }> = {
    todos: () => ({ get: () => todos.value, set: (v) => (todos.value = v as Todo[]) }),
    tasks: () => ({ get: () => tasks.value, set: (v) => (tasks.value = v as Task[]) }),
    deadlines: () => ({
      get: () => deadlines.value,
      set: (v) => (deadlines.value = v as Deadline[]),
    }),
    finances: () => ({ get: () => finances.value, set: (v) => (finances.value = v as Finance[]) }),
    notes: () => ({ get: () => notes.value, set: (v) => (notes.value = v as Note[]) }),
    reminders: () => ({
      get: () => reminders.value,
      set: (v) => (reminders.value = v as Reminder[]),
    }),
    trips: () => ({ get: () => trips.value, set: (v) => (trips.value = v as Trip[]) }),
    ideas: () => ({ get: () => ideas.value, set: (v) => (ideas.value = v as Idea[]) }),
    stocks: () => ({ get: () => stocks.value, set: (v) => (stocks.value = v as Stock[]) }),
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
              ? (item.note as string) || (item.category as string)
              : type === 'reminder'
                ? (item.title as string)
                : type === 'trip'
                  ? (item.title as string) || (item.location as string)
                  : type === 'idea'
                    ? (item.title as string)
                    : type === 'stock'
                      ? (item.symbol as string)
                      : (item.text as string)
    const short = label && label.length > 28 ? label.slice(0, 28) + '…' : label
    accessor.set(list.filter((x) => x.id !== itemId))
    // Linked todos/tasks: strip this item from every counterpart's links so no
    // dangling refs remain. (Undo restores the item's own arrays but not the
    // counterpart pointers — link resolution already ignores missing refs.)
    if (type === 'todo' || type === 'task') {
      cleanupLinksForDelete({ id: itemId, collection: type === 'todo' ? 'todos' : 'tasks' })
      // Linked reminders are deleted in the same batch — a reminder that points
      // at a todo makes no sense once the todo is gone. Their calendar events go
      // with them; Undo restores the item but not these (a resurrected reminder
      // would re-create fresh events), matching how link pointers aren't restored.
      const linkedReminderIds = (item as unknown as Todo | Task).reminderIds ?? []
      if (linkedReminderIds.length) {
        const gone = new Set(linkedReminderIds)
        for (const r of reminders.value) {
          if (gone.has(r.id) && r.calEventId) {
            void deleteEvent(r.calEventId).catch((error) => {
              if (error instanceof CalendarAuthError) calendarNeedsAuth.value = true
              console.error('[Aureon] Calendar delete on linked-reminder delete failed:', error)
            })
          }
        }
        reminders.value = reminders.value.filter((r) => !gone.has(r.id))
      }
    }
    // Deleting a reminder must also remove its Google Calendar event, otherwise
    // the event outlives the reminder with nothing left pointing at it. Undo
    // re-creates the event and stores the new id (Google does not resurrect the
    // old one), which is why the id is cleared from the retained copy.
    if (type === 'reminder') {
      const eventId = (item as unknown as Reminder).calEventId
      if (eventId) {
        void deleteEvent(eventId).catch((error) => {
          if (error instanceof CalendarAuthError) calendarNeedsAuth.value = true
          console.error('[Aureon] Calendar delete on reminder delete failed:', error)
        })
      }
    }
    // A delete undo runs through undoDelete, not a stored handler; clear any
    // handler a prior rollover toast left set.
    toastUndoHandler = null
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
    // The calendar event was already deleted; Google will not restore it under
    // the old id, so the restored reminder starts unsynced and re-creates the
    // event, picking up a fresh id.
    const wasSynced = t.listKey === 'reminders' && !!(t.item as Reminder).calEventId
    const restored = wasSynced
      ? { ...(t.item as Reminder), calEventId: null, calSync: 'local' as const }
      : t.item
    list.splice(Math.min(t.idx, list.length), 0, restored)
    accessor.set(list)
    toast.value = null
    clearTimeout(toastTimer)
    if (wasSynced) void syncCalendar((restored as Reminder).id)
  }
  function showToastMsg(message: string) {
    toastUndoHandler = null
    toast.value = { message, undo: false }
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      if (toast.value) toast.value = null
    }, 3000)
  }
  function closeToast() {
    clearTimeout(toastTimer)
    toast.value = null
    toastUndoHandler = null
  }
  // A generic Undo for toasts that are not deletions (the rollover uses it). The
  // delete flow keeps its own undoDelete; performUndo dispatches to whichever is
  // active so the single Undo button in Toast.vue serves both.
  function showToastWithUndo(
    message: string,
    onUndo: () => void,
    ms = 10000,
    actionLabel?: string,
  ) {
    toast.value = { message, undo: true, actionLabel }
    toastUndoHandler = onUndo
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      if (toast.value) toast.value = null
      toastUndoHandler = null
    }, ms)
  }
  function performUndo() {
    if (toastUndoHandler) {
      const run = toastUndoHandler
      toastUndoHandler = null
      toast.value = null
      clearTimeout(toastTimer)
      run()
      return
    }
    undoDelete()
  }

  // ---- Sharing ------------------------------------------------------------
  // share() only opens the chooser; the document is written by createShareLink
  // once the visibility is picked. Keeping the entry point synchronous means
  // every ↗ button in the views stays a plain `app.share(type, item)` call.
  function share(type: ItemType, item: { id: number }) {
    if (!uid) {
      showToastMsg('Sign in to share')
      return
    }
    pendingShare.value = { type, item }
  }
  function cancelShare() {
    pendingShare.value = null
    shareBusy.value = false
  }
  // Writes a frozen snapshot and copies its page URL. `isPublic` is what the
  // Firestore rule on aureon-shares reads — visibility is enforced there, not
  // here, so a private link cannot be opened by guessing the URL.
  async function createShareLink(isPublic: boolean) {
    const pending = pendingShare.value
    if (!pending || !uid || shareBusy.value) return
    shareBusy.value = true
    try {
      const shareId = await createShare(uid, pending.type, pending.item, isPublic)
      if (!shareId) {
        showToastMsg('Sharing needs Firebase configured')
        return
      }
      await copyToClipboard(buildShareUrl(pending.type, shareId))
      showToastMsg(isPublic ? 'Public link copied' : 'Private link copied')
    } catch (error) {
      console.error('[Aureon] Share failed:', error)
      showToastMsg('Could not create the share link')
    } finally {
      shareBusy.value = false
      pendingShare.value = null
    }
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
      todos.value = [
        ...todos.value,
        {
          id: nidNew,
          text: (it.text as string) || 'Shared todo',
          done: false,
          status: 'pending',
          tag: (it.tag as string) || '',
          description: (it.description as string) || '',
          // A copied-in shared todo starts un-shared: it is the recipient's own
          // item now, not a re-publication of the original's link.
          isPublic: false,
          shareId: null,
          sharedAt: null,
          rolledOverAt: null,
          rolloverCount: 0,
          completedAt: null,
          reminderIds: [],
          sourceRef: null,
          linked: [],
          parents: [],
          ...stamps(),
        },
      ]
    else if (sv.type === 'task')
      tasks.value = [
        ...tasks.value,
        {
          id: nidNew,
          title: (it.title as string) || 'Shared task',
          tag: (it.tag as string) || '',
          done: false,
          status: 'pending',
          deadline: (it.deadline as string) || '',
          notes: (it.notes as string) || '',
          repo: (it.repo as string) || '',
          rolledOverAt: null,
          rolloverCount: 0,
          completedAt: null,
          reminderIds: [],
          sourceRef: null,
          linked: [],
          parents: [],
          ...stamps(),
        },
      ]
    else if (sv.type === 'deadline')
      deadlines.value = [
        ...deadlines.value,
        {
          id: nidNew,
          title: (it.title as string) || 'Shared deadline',
          due: (it.due as string) || rel(3),
          ...stamps(),
        },
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
          ...stamps(),
        },
      ]
    else if (sv.type === 'idea')
      ideas.value = [
        ...ideas.value,
        {
          id: nidNew,
          title: (it.title as string) || 'Shared idea',
          description: (it.description as string) || '',
          deadline: (it.deadline as string) || '',
          ideaType: (it.ideaType as string) || 'feature',
          tag: (it.tag as string) || '',
          // A shared snapshot cannot bring the owner's private notes with it.
          noteIds: [],
          ...stamps(),
        },
      ]
    else if (sv.type === 'stock')
      stocks.value = [
        ...stocks.value,
        {
          id: nidNew,
          symbol: (it.symbol as string) || 'SHARED',
          name: (it.name as string) || '',
          why: (it.why as string) || '',
          targetPrice: (it.targetPrice as number) || 0,
          watchPrice: (it.watchPrice as number) || 0,
          tag: (it.tag as string) || '',
          noteIds: [],
          ...stamps(),
        },
      ]
    else if (sv.type === 'note')
      notes.value = [
        ...notes.value,
        { id: nidNew, text: (it.text as string) || '', ts: Date.now(), ...stamps() },
      ]
    else if (sv.type === 'trip') {
      const sharedPlaces = Array.isArray(it.places) ? (it.places as TripPlace[]) : []
      const title = (it.title as string) || (it.location as string) || 'Shared trip'
      trips.value = [
        ...trips.value,
        {
          id: nidNew,
          title,
          status: it.status === 'done' ? 'done' : 'tovisit',
          date: (it.date as string) || rel(0),
          visitedDate: (it.visitedDate as string) || '',
          description: (it.description as string) || '',
          tag: (it.tag as string) || '',
          photos: Array.isArray(it.photos) ? (it.photos as string[]) : [],
          // Give each imported place a fresh id in this workspace's id space.
          places: sharedPlaces.map((p) => ({ ...p, id: id() })),
          // A shared snapshot cannot bring the owner's private notes with it.
          noteIds: [],
          location: (it.location as string) || title,
          ...stamps(),
        },
      ]
    }
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
  function importIssue(
    repo: { name: string; full: string },
    issue: { num: number; title: string },
  ) {
    tasks.value = [
      ...tasks.value,
      {
        id: id(),
        title: issue.title,
        tag: repo.name,
        done: false,
        status: 'pending',
        deadline: '',
        notes: 'Imported from ' + repo.full + ' #' + issue.num,
        repo: repo.full,
        rolledOverAt: null,
        rolloverCount: 0,
        completedAt: null,
        reminderIds: [],
        sourceRef: null,
        linked: [],
        parents: [],
        ...stamps(),
      },
    ]
    showToastMsg(
      'Imported "' + (issue.title.length > 24 ? issue.title.slice(0, 24) + '…' : issue.title) + '"',
    )
  }

  // ---- Drag & drop (tasks) ------------------------------------------------
  function setDragId(v: number | null) {
    dragId = v
    draggingId.value = v
  }
  // A task that lands on a different day has been re-planned, so it ages.
  function reday(t: Task, dateStr: string): Task {
    return (t.deadline || '') === dateStr ? t : touched({ ...t, deadline: dateStr })
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
    let drag = { ...arr[di] }
    arr.splice(di, 1)
    const ti = arr.findIndex((t) => t.id === targetId)
    if (ti < 0) {
      arr.push(drag)
    } else {
      drag = reday(drag, arr[ti].deadline || '')
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
    const drag = reday(arr[di], dateStr)
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

  // ---- Drag & drop (todos) ------------------------------------------------
  // Todos have no deadline: their day *is* their createdAt stamp. Dropping one
  // on another day therefore rewrites that stamp — keeping the time of day —
  // which is what moves the row between the accordion's day cards.
  function setTodoDragId(v: number | null) {
    todoDragId = v
    draggingTodoId.value = v
  }
  function endTodoDrag() {
    draggingTodoId.value = null
    todoDragId = null
  }
  function moveTodoToDay(arr: Todo[], idx: number, dateStr: string): Todo {
    const cur = arr[idx]
    const next = stampOnDay(dateStr, cur.createdAt)
    return next === cur.createdAt ? cur : touched({ ...cur, createdAt: next })
  }
  function dropTodoOnDay(dateStr: string) {
    if (todoDragId == null) return endTodoDrag()
    const arr = todos.value.slice()
    const di = arr.findIndex((t) => t.id === todoDragId)
    if (di < 0) return endTodoDrag()
    const drag = moveTodoToDay(arr, di, dateStr)
    arr.splice(di, 1)
    arr.push(drag)
    todos.value = arr
    endTodoDrag()
  }
  // Dropping onto a row adopts that row's day and slots in above it, so a drag
  // reorders within a day as well as moving between days.
  function dropTodoOnTodo(targetId: number) {
    if (todoDragId == null || todoDragId === targetId) return endTodoDrag()
    const arr = todos.value.slice()
    const di = arr.findIndex((t) => t.id === todoDragId)
    const target = arr.find((t) => t.id === targetId)
    if (di < 0 || !target) return endTodoDrag()
    const drag = moveTodoToDay(arr, di, target.createdAt > 0 ? ymd(new Date(target.createdAt)) : '')
    arr.splice(di, 1)
    const ti = arr.findIndex((t) => t.id === targetId)
    if (ti < 0) arr.push(drag)
    else arr.splice(ti, 0, drag)
    todos.value = arr
    endTodoDrag()
  }

  // ---- Dialogs / task view ------------------------------------------------
  // Fields a create form starts from. Dates default to today so the common case
  // is one field away from valid.
  function blankDraft(type: ItemType): Record<string, unknown> {
    if (type === 'todo') return { text: '', description: '', tag: '' }
    if (type === 'task') return { title: '', tag: '', deadline: '', notes: '', repo: '' }
    if (type === 'deadline') return { title: '', due: rel(0) }
    if (type === 'finance') return { amount: '', category: 'Food', note: '', date: rel(0) }
    if (type === 'trip')
      return { title: '', date: rel(0), description: '', tag: '', status: 'tovisit' }
    if (type === 'idea')
      return { title: '', description: '', deadline: '', ideaType: 'feature', tag: '', noteIds: [] }
    if (type === 'stock')
      return {
        symbol: '',
        name: '',
        why: '',
        targetPrice: '',
        watchPrice: '',
        tag: '',
        noteIds: [],
      }
    if (type === 'reminder')
      return {
        title: '',
        note: '',
        start: '',
        repeatType: 'none',
        repeatN: 1,
        weekdays: [],
        priority: 'normal',
        addToCalendar: false,
      }
    return {}
  }
  // The task and reminder dialogs predate the generic one and address it by
  // type-specific name. They are views onto the same single dialog slot rather
  // than state of their own, so only one dialog can ever be open.
  const dialogTaskId = computed(() =>
    itemDialog.value?.type === 'task' && itemDialog.value.mode === 'edit'
      ? itemDialog.value.id
      : null,
  )
  const dialogReminderId = computed(() =>
    itemDialog.value?.type === 'reminder' && itemDialog.value.mode === 'edit'
      ? itemDialog.value.id
      : null,
  )
  function openCreate(type: ItemType) {
    itemDialog.value = { type, mode: 'create', id: null }
    dialogDraft.value = blankDraft(type)
    dialogClosing.value = false
  }
  function openEdit(type: ItemType, itemId: number) {
    itemDialog.value = { type, mode: 'edit', id: itemId }
    dialogDraft.value = {}
    dialogClosing.value = false
  }
  // Generic read/write for the one dialog that edits every type. Edit mode
  // writes through on each keystroke, so there is no draft to reconcile — these
  // two are all it needs from a type it does not know the shape of.
  function itemById(type: ItemType, itemId: number): Record<string, unknown> | undefined {
    const lists: Partial<Record<ItemType, { id: number }[]>> = {
      todo: todos.value,
      task: tasks.value,
      deadline: deadlines.value,
      finance: finances.value,
      trip: trips.value,
      reminder: reminders.value,
      note: notes.value,
      idea: ideas.value,
      stock: stocks.value,
    }
    return lists[type]?.find((i) => i.id === itemId) as Record<string, unknown> | undefined
  }
  function updateItem(type: ItemType, itemId: number, field: string, value: unknown) {
    if (type === 'todo') updateTodo(itemId, { [field]: value } as Partial<Todo>)
    else if (type === 'task') updateTask(itemId, field as keyof Task, String(value))
    else if (type === 'deadline') updateDeadline(itemId, { [field]: value } as Partial<Deadline>)
    else if (type === 'finance')
      updateFinance(itemId, {
        [field]: field === 'amount' ? Number(value) || 0 : value,
      } as Partial<Finance>)
    else if (type === 'trip') updateTrip(itemId, { [field]: value } as Partial<Trip>)
    else if (type === 'idea') updateIdea(itemId, { [field]: value } as Partial<Idea>)
    else if (type === 'stock')
      updateStock(itemId, {
        [field]: field === 'targetPrice' || field === 'watchPrice' ? Number(value) || 0 : value,
      } as Partial<Stock>)
    else if (type === 'reminder') updateReminder(itemId, field as keyof Reminder, value)
  }

  // ---- Per-item public sharing (globe toggle) -----------------------------
  // These are the generic primitives behind useShareLink, so notes/ideas/trips
  // can adopt the toggle without new store code. patchItem merges arbitrary
  // fields into an item in place; the write functions push and tear down the
  // aureon-shares mirror doc that a signed-out visitor actually reads.
  const shareLists: Partial<Record<ItemType, Ref<{ id: number }[]>>> = {
    todo: todos,
    task: tasks,
    deadline: deadlines,
    finance: finances,
    trip: trips,
    reminder: reminders,
    note: notes,
    idea: ideas,
    stock: stocks,
  }
  // A share toggle is not a content edit, so it deliberately does NOT bump
  // updatedAt — the read-only page reports when the item last changed, not when
  // it was last shared.
  function patchItem(type: ItemType, itemId: number, patch: Record<string, unknown>) {
    const listRef = shareLists[type]
    if (!listRef) return
    listRef.value = listRef.value.map((it) =>
      it.id === itemId ? { ...it, ...patch } : it,
    ) as never
  }

  // Where the private item lives. A public reader never follows it — they render
  // the frozen snapshot — but it keeps the mirror doc traceable to its source.
  function shareRefPath(itemId: number): string {
    return `${AUREON_COLLECTION}/${uid}#todo-${itemId}`
  }

  // Publish (or fully rewrite) the mirror doc from the item's current state.
  // Throws so the optimistic toggle can roll back if the write is rejected.
  async function publishShare(type: ItemType, itemId: number): Promise<void> {
    if (!uid) throw new Error('Not signed in')
    const item = itemById(type, itemId)
    const shareId = item?.shareId
    if (!item || typeof shareId !== 'string' || !shareId) throw new Error('Missing share id')
    await writeShareDoc(shareId, uid, type, item, true, shareRefPath(itemId))
  }

  async function unpublishShare(shareId: string): Promise<void> {
    await deleteShare(shareId)
  }

  // Fire-and-forget snapshot refresh: called after a content edit so a shared
  // item's public page keeps up. A failure here is logged, never surfaced — the
  // owner's edit still succeeded locally and will re-sync on the next change.
  function syncShareIfPublic(type: ItemType, itemId: number) {
    if (!uid) return
    const item = itemById(type, itemId)
    const shareId = item?.shareId
    if (!item || item.isPublic !== true || typeof shareId !== 'string' || !shareId) return
    updateShareItem(shareId, uid, item).catch((error) => {
      console.error('[Aureon] Share snapshot sync failed:', error)
    })
  }

  function openTaskDialog(tid: number) {
    openEdit('task', tid)
  }
  function openReminderDialog(rid: number) {
    openEdit('reminder', rid)
  }
  function closeItemDialog() {
    if (!itemDialog.value) return
    dialogClosing.value = true
    setTimeout(() => {
      itemDialog.value = null
      dialogDraft.value = {}
      dialogClosing.value = false
    }, 220)
  }
  function setDialogDraft(field: string, value: unknown) {
    dialogDraft.value = { ...dialogDraft.value, [field]: value }
  }
  // Commits a create-mode dialog. Returns false and leaves the dialog open when
  // the draft is incomplete, so a mistyped entry is not silently discarded.
  function commitCreate(): boolean {
    const state = itemDialog.value
    if (!state || state.mode !== 'create') return false
    const d = dialogDraft.value
    const str = (k: string) => String(d[k] ?? '').trim()
    const fail = (msg: string) => {
      showToastMsg(msg)
      return false
    }

    if (state.type === 'todo') {
      if (!str('text')) return fail('Give the todo a title')
      addTodo(str('text'), str('tag'), str('description'))
    } else if (state.type === 'task') {
      if (!str('title')) return fail('Give the task a title')
      addTask(str('title'), str('tag'), {
        deadline: str('deadline'),
        notes: str('notes'),
        repo: str('repo'),
      })
    } else if (state.type === 'deadline') {
      if (!str('title')) return fail('Give the deadline a title')
      if (!str('due')) return fail('Pick a due date')
      addDeadline(str('title'), str('due'))
    } else if (state.type === 'finance') {
      const amount = parseFloat(str('amount'))
      if (!amount || amount <= 0) return fail('Enter an amount above zero')
      addFinance(str('amount'), str('category') || 'Other', str('note'), str('date'))
    } else if (state.type === 'trip') {
      if (!str('title')) return fail('Give the trip a name')
      const newId = addTrip({
        title: str('title'),
        date: str('date'),
        description: str('description'),
        tag: str('tag'),
        status: (str('status') || 'tovisit') as TripStatus,
      })
      // Switch straight to the fresh trip's detail dialog so places and the map
      // can be added at once. openEdit resets the shared dialog slot in place —
      // no closeItemDialog first, whose timer would later null the new dialog.
      if (newId != null) openEdit('trip', newId)
      else closeItemDialog()
      return true
    } else if (state.type === 'idea') {
      if (!str('title')) return fail('Give the idea a title')
      addIdea(str('title'), str('tag'), {
        description: str('description'),
        deadline: str('deadline'),
        ideaType: str('ideaType') || 'feature',
        noteIds: Array.isArray(d.noteIds) ? (d.noteIds as number[]) : [],
      })
    } else if (state.type === 'stock') {
      if (!str('symbol')) return fail('Give the stock a symbol')
      addStock(str('symbol'), str('tag'), {
        name: str('name'),
        why: str('why'),
        targetPrice: parseFloat(str('targetPrice')) || 0,
        watchPrice: parseFloat(str('watchPrice')) || 0,
        noteIds: Array.isArray(d.noteIds) ? (d.noteIds as number[]) : [],
      })
    } else if (state.type === 'reminder') {
      if (!str('title')) return fail('Give the reminder a title')
      if (!str('start')) return fail('Pick a start date and time')
      const repeatType = (str('repeatType') || 'none') as RepeatType
      const repeat: Repeat =
        repeatType === 'weekdays'
          ? { type: 'weekdays', weekdays: ((d.weekdays as number[]) || []).slice() }
          : { type: repeatType, n: Number(d.repeatN) || 1 }
      if (repeat.type === 'weekdays' && !(repeat.weekdays || []).length)
        return fail('Pick at least one weekday')
      addReminder({
        title: str('title'),
        note: str('note'),
        start: str('start'),
        repeat,
        priority: (str('priority') || 'normal') as Priority,
        addToCalendar: d.addToCalendar === true,
      })
    } else {
      return false
    }

    closeItemDialog()
    return true
  }
  function openTaskView(tid: number) {
    try {
      history.pushState({ taskView: tid }, '', '/tasks/' + tid + '/view')
    } catch {
      /* ignore */
    }
    taskViewId.value = tid
    itemDialog.value = null
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
  function addReminder(payload: {
    title: string
    note: string
    start: string
    repeat: Repeat
    priority?: Priority
    addToCalendar?: boolean
    sourceRef?: SourceRef | null
  }) {
    const t = payload.title.trim()
    if (!t || !payload.start) return
    const created: Reminder = {
      id: id(),
      title: t,
      note: payload.note.trim(),
      start: payload.start,
      repeat: payload.repeat,
      priority: payload.priority || 'normal',
      calSync: 'local',
      calEventId: null,
      lastFiredOcc: null,
      acknowledgedAt: null,
      sourceRef: payload.sourceRef ?? null,
      cancelledAt: null,
      ...stamps(),
    }
    reminders.value = [...reminders.value, created]
    requestNotifPermission()
    if (payload.addToCalendar) void syncCalendar(created.id)
    return created.id
  }
  function updateReminder(rid: number, field: keyof Reminder, value: unknown) {
    reminders.value = reminders.value.map((r) =>
      r.id === rid ? touched({ ...r, [field]: value }) : r,
    )
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
  function patchReminder(rid: number, patch: Partial<Reminder>) {
    reminders.value = reminders.value.map((r) => (r.id === rid ? { ...r, ...patch } : r))
  }

  // ---- Todo/Task ↔ Reminder bridge ----------------------------------------
  // "Remind me" on a todo/task creates a reminder that points back rather than
  // duplicating the item; completing the item cancels those reminders; and the
  // reverse ("Create todo from this") sets the same back-pointer the other way.
  function sourceItem(collection: LinkCollection, itemId: number): Todo | Task | undefined {
    const list: readonly (Todo | Task)[] = collection === 'todos' ? todos.value : tasks.value
    return list.find((x) => x.id === itemId)
  }
  function reminderTitleOf(item: Todo | Task): string {
    return 'text' in item ? item.text : item.title
  }
  // Add a reminder id to a source item's forward index, branching on the
  // collection so each list is written as its own concrete type.
  function indexReminderOnItem(collection: LinkCollection, itemId: number, rid: number) {
    if (collection === 'todos') {
      todos.value = todos.value.map((x) =>
        x.id === itemId ? touched({ ...x, reminderIds: [...x.reminderIds, rid] }) : x,
      )
    } else {
      tasks.value = tasks.value.map((x) =>
        x.id === itemId ? touched({ ...x, reminderIds: [...x.reminderIds, rid] }) : x,
      )
    }
  }

  // Create a reminder from a todo/task. The reminder inherits the item's title,
  // carries a sourceRef back to it, and its id is indexed on the item so the row
  // can show a bell chip and completion can cancel it. Returns the reminder id.
  function createReminderFromItem(
    collection: LinkCollection,
    itemId: number,
    payload: { start: string; repeat?: Repeat; note?: string; priority?: Priority },
  ): number | undefined {
    const src = sourceItem(collection, itemId)
    if (!src || !payload.start) return
    const rid = addReminder({
      title: reminderTitleOf(src),
      note: payload.note ?? '',
      start: payload.start,
      repeat: payload.repeat ?? { type: 'none' },
      priority: payload.priority ?? 'normal',
      sourceRef: { collection, id: itemId },
    })
    if (rid == null) return
    indexReminderOnItem(collection, itemId, rid)
    return rid
  }

  // Apply one schedule to many items in a single pass — the bulk "Remind me".
  function createRemindersForItems(
    collection: LinkCollection,
    itemIds: number[],
    payload: { start: string; repeat?: Repeat; note?: string; priority?: Priority },
  ): number {
    let made = 0
    for (const itemId of itemIds) if (createReminderFromItem(collection, itemId, payload) != null) made++
    return made
  }

  // Completing a todo/task auto-acknowledges its pending reminders and cancels
  // their future occurrences, so a done item stops nagging. Kept idempotent by
  // the cancelledAt guard.
  function cancelRemindersFor(collection: LinkCollection, itemId: number) {
    const src = sourceItem(collection, itemId)
    const ids = src?.reminderIds ?? []
    if (!ids.length) return
    const at = Date.now()
    const set = new Set(ids)
    let cancelled = 0
    reminders.value = reminders.value.map((r) => {
      if (!set.has(r.id) || r.cancelledAt != null) return r
      cancelled++
      return { ...r, acknowledgedAt: at, cancelledAt: at }
    })
    if (activeNotif.value && set.has(activeNotif.value.id)) activeNotif.value = null
    if (cancelled) {
      showToastMsg('Reminder cancelled — ' + (collection === 'todos' ? 'todo' : 'task') + ' completed')
    }
  }

  // Acknowledge a specific reminder (the Up next band's Acknowledge, distinct
  // from dismissing the active banner). Does NOT complete the source item.
  function acknowledgeReminder(rid: number, at: number = Date.now()) {
    reminders.value = reminders.value.map((r) => (r.id === rid ? { ...r, acknowledgedAt: at } : r))
    if (activeNotif.value?.id === rid) activeNotif.value = null
  }

  // Snooze a specific reminder by `mins`. A one-off simply slides its start
  // forward; a repeat acknowledges this occurrence and spawns a one-off snooze
  // that keeps the source link so it's still cancelled if the item completes.
  function snoozeReminder(rid: number, mins: number) {
    const r = reminders.value.find((x) => x.id === rid)
    if (!r) return
    const when = new Date(Date.now() + mins * 60000).toISOString().slice(0, 16)
    const repeats = !!r.repeat && r.repeat.type !== 'none'
    if (!repeats) {
      patchReminder(rid, { start: when, acknowledgedAt: null, lastFiredOcc: null, cancelledAt: null })
      if (activeNotif.value?.id === rid) activeNotif.value = null
      return
    }
    acknowledgeReminder(rid)
    const newId = addReminder({
      title: r.title,
      note: r.note,
      start: when,
      repeat: { type: 'none' },
      priority: r.priority,
      sourceRef: r.sourceRef,
    })
    const sr = r.sourceRef
    if (newId != null && sr && (sr.collection === 'todos' || sr.collection === 'tasks')) {
      indexReminderOnItem(sr.collection, sr.id, newId)
    }
  }

  // Skip this occurrence: a one-off is cancelled outright; a repeat just
  // acknowledges the current occurrence, leaving the next scheduled.
  function skipReminder(rid: number) {
    const r = reminders.value.find((x) => x.id === rid)
    if (!r) return
    const at = Date.now()
    if (!r.repeat || r.repeat.type === 'none') {
      patchReminder(rid, { acknowledgedAt: at, cancelledAt: at })
      if (activeNotif.value?.id === rid) activeNotif.value = null
    } else {
      acknowledgeReminder(rid, at)
    }
  }

  // The acknowledge sheet's one-tap "Mark todo done too": complete the reminder's
  // source item, which in turn cancels the reminder through the normal path.
  function completeReminderSource(rid: number) {
    const r = reminders.value.find((x) => x.id === rid)
    const sr = r?.sourceRef
    if (!sr) return
    if (sr.collection === 'todos') setTodoStatus(sr.id, 'done')
    else if (sr.collection === 'tasks') setTaskStatus(sr.id, 'done')
  }

  // Reverse direction: create a todo from a reminder, setting sourceRef the other
  // way so the two stay traceable. Returns the new todo id.
  function createTodoFromReminder(rid: number): number | undefined {
    const r = reminders.value.find((x) => x.id === rid)
    if (!r) return
    const newId = id()
    todos.value = [
      ...todos.value,
      {
        id: newId,
        text: r.title,
        done: false,
        status: 'pending',
        tag: '',
        description: r.note,
        isPublic: false,
        shareId: null,
        sharedAt: null,
        rolledOverAt: null,
        rolloverCount: 0,
        completedAt: null,
        reminderIds: [],
        sourceRef: { collection: 'reminders', id: rid },
        linked: [],
        parents: [],
        ...stamps(),
      },
    ]
    showToastMsg('Todo created from reminder')
    return newId
  }

  // Creates the event if the reminder has none, otherwise patches the existing
  // one — so pressing Sync twice does not litter the calendar with duplicates.
  async function syncCalendar(rid: number) {
    const target = reminders.value.find((r) => r.id === rid)
    if (!target) return
    if (!hasCalendarToken()) {
      calendarNeedsAuth.value = true
      patchReminder(rid, { calSync: 'error' })
      showToastMsg('Connect Google Calendar to sync')
      return
    }
    patchReminder(rid, { calSync: 'pending' })
    try {
      if (target.calEventId) {
        await updateEvent(target.calEventId, target)
        patchReminder(rid, { calSync: 'synced' })
      } else {
        const eventId = await createEvent(target)
        patchReminder(rid, { calSync: 'synced', calEventId: eventId })
      }
    } catch (error) {
      patchReminder(rid, { calSync: 'error' })
      if (error instanceof CalendarAuthError) {
        calendarNeedsAuth.value = true
        showToastMsg('Google Calendar access expired')
      } else {
        console.error('[Aureon] Calendar sync failed:', error)
        showToastMsg('Could not sync to Google Calendar')
      }
    }
  }
  async function syncAllCalendar() {
    for (const r of [...reminders.value]) await syncCalendar(r.id)
  }
  // Removes the Google Calendar event and forgets its id, leaving the reminder
  // itself in place.
  async function unsyncCalendar(rid: number) {
    const target = reminders.value.find((r) => r.id === rid)
    if (!target?.calEventId) return
    try {
      await deleteEvent(target.calEventId)
      patchReminder(rid, { calSync: 'local', calEventId: null })
      showToastMsg('Removed from Google Calendar')
    } catch (error) {
      if (error instanceof CalendarAuthError) calendarNeedsAuth.value = true
      console.error('[Aureon] Calendar remove failed:', error)
      showToastMsg('Could not remove the calendar event')
    }
  }
  async function reconnectCalendar(): Promise<boolean> {
    const authStore = useAuthStore()
    const ok = await authStore.reconnectCalendar()
    calendarNeedsAuth.value = !ok
    return ok
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
    if (reminderSound.value) playReminderChime()
  }
  function checkReminders() {
    const now = Date.now()
    let fired = false
    const updated = reminders.value.map((r) => {
      if (r.cancelledAt != null) return r
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
      {
        id: id(),
        title: n.title,
        note: n.note,
        start: when,
        repeat: { type: 'none' },
        priority: 'normal',
        calSync: 'local',
        calEventId: null,
        lastFiredOcc: null,
        acknowledgedAt: null,
        sourceRef: null,
        cancelledAt: null,
        ...stamps(),
      },
    ]
    activeNotif.value = null
  }
  function dismissNotif() {
    // Dismissing is the "acknowledged" signal the monthly overview counts.
    const n = activeNotif.value
    if (n) {
      const at = Date.now()
      reminders.value = reminders.value.map((r) =>
        r.id === n.id ? { ...r, acknowledgedAt: at } : r,
      )
    }
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
      ideas: ideas.value,
      stocks: stocks.value,
      tags: tags.value,
      security: security.value,
      themeSetting: themeSetting.value,
      railCollapsed: railCollapsed.value,
      approvedPRs: approvedPRs.value,
      autoRollover: autoRollover.value,
      lastAutoRolloverDay: lastAutoRolloverDay.value,
      hideCompleted: hideCompleted.value,
      reminderSound: reminderSound.value,
      financeSettings: financeSettings.value,
      drafts: drafts.value,
      aiChats: aiChats.value,
      aiUseData: aiUseData.value,
      bots: bots.value,
      transactions: transactions.value,
      debts: debts.value,
      financeTags: financeTags.value,
      businessFinance: businessFinance.value,
      finScope: finScope.value,
      finMigrated: finMigrated.value,
    }
  }
  function resetData() {
    hydrating = true
    todos.value = []
    tasks.value = []
    deadlines.value = []
    finances.value = []
    notes.value = []
    reminders.value = []
    trips.value = []
    ideas.value = []
    stocks.value = []
    tags.value = DEFAULT_TAGS.slice()
    approvedPRs.value = {}
    security.value = emptySecurity()
    themeSetting.value = 'auto'
    railCollapsed.value = false
    autoRollover.value = false
    lastAutoRolloverDay.value = ''
    hideCompleted.value = false
    reminderSound.value = false
    financeSettings.value = emptyFinanceSettings()
    drafts.value = {}
    aiChats.value = []
    aiActiveChatId.value = null
    aiUseData.value = true
    bots.value = []
    transactions.value = []
    debts.value = []
    financeTags.value = []
    businessFinance.value = emptyFinanceSettings()
    finScope.value = 'personal'
    finMigrated.value = false
    syncedSig.value = new Map()
    syncFromCache.value = false
    syncHasPending.value = false
    lastSyncedAt.value = null
    editing.value = { type: null, id: null }
    draft.value = {}
    noteView.value = null
    noteViewClosing.value = false
    nid = 100
    setTimeout(() => {
      hydrating = false
    }, 0)
  }
  function applyData(data: Record<string, unknown>) {
    hydrating = true
    // Items written before timestamps existed carry neither stamp. They are
    // backfilled to 0 rather than Date.now(), so the UI reports them as
    // "Unknown" instead of claiming every legacy item changed at hydrate time.
    const stamped = <T extends Partial<Timestamped>>(list: unknown): T[] =>
      Array.isArray(list)
        ? (list as T[]).map((it) => ({
            ...it,
            createdAt: typeof it.createdAt === 'number' ? it.createdAt : 0,
            updatedAt: typeof it.updatedAt === 'number' ? it.updatedAt : 0,
          }))
        : []

    // Items written before status existed only carry `done`; derive the status
    // from it so nothing loads as an unknown state.
    const statused = <T extends { done?: boolean; status?: ItemStatus }>(it: T): T => ({
      ...it,
      status: isStatus(it.status) ? it.status : statusFromDone(it.done),
      done: isStatus(it.status) ? it.status === 'done' : it.done === true,
    })

    // Sanitise a stored link array to well-formed {id, collection} refs, so a
    // malformed or legacy value never crashes the graph logic.
    const linkList = (v: unknown): LinkRef[] =>
      Array.isArray(v)
        ? v.filter(
            (x): x is LinkRef =>
              !!x &&
              typeof x === 'object' &&
              typeof (x as LinkRef).id === 'number' &&
              ((x as LinkRef).collection === 'todos' || (x as LinkRef).collection === 'tasks'),
          )
        : []

    // Todos written before tag/description existed lack those fields; fill them
    // in on read so the rest of the app can treat them as required.
    todos.value = stamped<Todo>(data.todos).map((t) => ({
      ...statused(t),
      tag: typeof t.tag === 'string' ? t.tag : '',
      description: typeof t.description === 'string' ? t.description : '',
      // Share fields arrived after the first release; todos stored before then
      // read as "never shared".
      isPublic: t.isPublic === true,
      shareId: typeof t.shareId === 'string' ? t.shareId : null,
      sharedAt: typeof t.sharedAt === 'number' ? t.sharedAt : null,
      // Rollover fields, backfilled for todos written before "move to today".
      rolledOverAt: typeof t.rolledOverAt === 'number' ? t.rolledOverAt : null,
      rolloverCount: typeof t.rolloverCount === 'number' ? t.rolloverCount : 0,
      // Completion stamp + links, backfilled for todos written before them.
      completedAt: typeof t.completedAt === 'number' ? t.completedAt : null,
      // Reminder bridge, backfilled for todos written before "Remind me".
      reminderIds: Array.isArray(t.reminderIds)
        ? t.reminderIds.filter((n) => typeof n === 'number')
        : [],
      sourceRef: sourceRefOf(t.sourceRef),
      linked: linkList(t.linked),
      parents: linkList(t.parents),
    }))
    // Rollover fields arrived after tasks did; tasks stored before then read as
    // "never rolled over".
    tasks.value = stamped<Task>(data.tasks)
      .map(statused)
      .map((t) => ({
        ...t,
        rolledOverAt: typeof t.rolledOverAt === 'number' ? t.rolledOverAt : null,
        rolloverCount: typeof t.rolloverCount === 'number' ? t.rolloverCount : 0,
        completedAt: typeof t.completedAt === 'number' ? t.completedAt : null,
        reminderIds: Array.isArray(t.reminderIds)
          ? t.reminderIds.filter((n) => typeof n === 'number')
          : [],
        sourceRef: sourceRefOf(t.sourceRef),
        linked: linkList(t.linked),
        parents: linkList(t.parents),
      }))
    deadlines.value = stamped<Deadline>(data.deadlines)
    finances.value = stamped<Finance>(data.finances)
    notes.value = stamped<Note>(data.notes)
    // Reminders written before priority/calEventId existed lack those fields;
    // fill them in on read so the rest of the app can treat them as required.
    reminders.value = stamped<Reminder>(data.reminders).map((r) => ({
      ...r,
      priority: isPriority(r.priority) ? r.priority : 'normal',
      acknowledgedAt: typeof r.acknowledgedAt === 'number' ? r.acknowledgedAt : null,
      calEventId: typeof r.calEventId === 'string' ? r.calEventId : null,
      sourceRef: sourceRefOf(r.sourceRef),
      cancelledAt: typeof r.cancelledAt === 'number' ? r.cancelledAt : null,
    }))
    // Trips gained a title, status, places, photos and attached notes after the
    // first release; older trips carry only { date, location }. Backfill each
    // field so the rest of the app can treat them as required, seeding the
    // title from the old location and wrapping that location as a first place.
    trips.value = stamped<Trip>(data.trips).map((t) => {
      const legacyLoc = typeof t.location === 'string' ? t.location : ''
      const places: TripPlace[] = Array.isArray(t.places)
        ? (t.places as TripPlace[]).map((p) => ({
            id: typeof p.id === 'number' ? p.id : id(),
            name: typeof p.name === 'string' ? p.name : '',
            address: typeof p.address === 'string' ? p.address : '',
            lat: typeof p.lat === 'number' ? p.lat : null,
            lng: typeof p.lng === 'number' ? p.lng : null,
            visitedAt: typeof p.visitedAt === 'string' ? p.visitedAt : '',
            notes: typeof p.notes === 'string' ? p.notes : '',
            photos: Array.isArray(p.photos) ? p.photos.filter((x) => typeof x === 'string') : [],
          }))
        : []
      return {
        ...t,
        title: typeof t.title === 'string' && t.title ? t.title : legacyLoc,
        status: t.status === 'done' ? 'done' : 'tovisit',
        date: typeof t.date === 'string' ? t.date : '',
        visitedDate: typeof t.visitedDate === 'string' ? t.visitedDate : '',
        description: typeof t.description === 'string' ? t.description : '',
        tag: typeof t.tag === 'string' ? t.tag : '',
        photos: Array.isArray(t.photos) ? t.photos.filter((x) => typeof x === 'string') : [],
        places,
        noteIds: Array.isArray(t.noteIds) ? t.noteIds.filter((n) => typeof n === 'number') : [],
        location: legacyLoc,
      }
    })
    // Ideas/stocks are newer than the first release, so every legacy field is
    // backfilled on read — including noteIds, which older items never had.
    ideas.value = stamped<Idea>(data.ideas).map((i) => ({
      ...i,
      description: typeof i.description === 'string' ? i.description : '',
      deadline: typeof i.deadline === 'string' ? i.deadline : '',
      ideaType: typeof i.ideaType === 'string' && i.ideaType ? i.ideaType : 'feature',
      tag: typeof i.tag === 'string' ? i.tag : '',
      noteIds: Array.isArray(i.noteIds) ? i.noteIds.filter((n) => typeof n === 'number') : [],
    }))
    stocks.value = stamped<Stock>(data.stocks).map((st) => ({
      ...st,
      name: typeof st.name === 'string' ? st.name : '',
      why: typeof st.why === 'string' ? st.why : '',
      targetPrice: typeof st.targetPrice === 'number' ? st.targetPrice : 0,
      watchPrice: typeof st.watchPrice === 'number' ? st.watchPrice : 0,
      tag: typeof st.tag === 'string' ? st.tag : '',
      noteIds: Array.isArray(st.noteIds) ? st.noteIds.filter((n) => typeof n === 'number') : [],
    }))
    // Workspaces written before tags existed have none stored. Rather than
    // leaving the pickers empty, seed them from the tags already in use and
    // fall back to the defaults for a workspace that has none of those either.
    const stored = sanitizeTags(data.tags)
    let vocab = stored.length ? stored : DEFAULT_TAGS.slice()
    for (const item of [...todos.value, ...tasks.value, ...ideas.value, ...stocks.value])
      vocab = withTag(vocab, item.tag || '')
    tags.value = vocab
    approvedPRs.value =
      data.approvedPRs && typeof data.approvedPRs === 'object'
        ? (data.approvedPRs as Record<string, boolean>)
        : {}
    security.value =
      data.security && typeof data.security === 'object'
        ? { ...emptySecurity(), ...(data.security as Partial<SecuritySettings>) }
        : emptySecurity()
    // Guard the stored value: a theme key removed in a later release must not
    // leave the ui store indexing THEMES with a key that no longer exists.
    themeSetting.value = isThemeSetting(data.themeSetting) ? data.themeSetting : 'auto'
    railCollapsed.value = data.railCollapsed === true
    autoRollover.value = data.autoRollover === true
    lastAutoRolloverDay.value =
      typeof data.lastAutoRolloverDay === 'string' ? data.lastAutoRolloverDay : ''
    hideCompleted.value = data.hideCompleted === true
    reminderSound.value = data.reminderSound === true
    // Finance settings: merge onto the empty shape so a partial or legacy doc
    // still yields a well-formed object, and coerce the income map's values to
    // numbers.
    const fs = data.financeSettings
    if (fs && typeof fs === 'object') {
      const raw = fs as Partial<FinanceSettings>
      const byMonth: Record<string, number> = {}
      if (raw.incomeByMonth && typeof raw.incomeByMonth === 'object') {
        for (const [k, v] of Object.entries(raw.incomeByMonth)) {
          if (typeof v === 'number' && Number.isFinite(v)) byMonth[k] = v
        }
      }
      financeSettings.value = {
        currency: 'INR',
        monthlyIncome: typeof raw.monthlyIncome === 'number' ? raw.monthlyIncome : 0,
        incomeByMonth: byMonth,
        incomeUpdatedAt: typeof raw.incomeUpdatedAt === 'number' ? raw.incomeUpdatedAt : 0,
      }
    } else {
      financeSettings.value = emptyFinanceSettings()
    }
    // Drafts are newer than the first release, so a legacy doc has none; a
    // malformed entry is dropped rather than trusted.
    drafts.value = sanitizeDrafts(data.drafts)
    // AI chats + bots (Parts A/B). Arrays are trusted shallowly like the other
    // collections. Bots seed the two defaults only when the field has never been
    // written — an explicit empty array (the user removed them all) is respected.
    aiChats.value = Array.isArray(data.aiChats) ? (data.aiChats as AiChat[]) : []
    aiUseData.value = data.aiUseData !== false
    if (Array.isArray(data.bots)) bots.value = data.bots as Bot[]
    else bots.value = seedBots(id, Date.now())
    // Finances rework state + one-time migration of the legacy expenses array
    // into the unified transactions collection (personal scope, no tags). The
    // guard makes it idempotent: it runs once, then finMigrated stays true.
    debts.value = Array.isArray(data.debts) ? (data.debts as Debt[]) : []
    financeTags.value = Array.isArray(data.financeTags) ? (data.financeTags as FinTag[]) : []
    businessFinance.value =
      data.businessFinance && typeof data.businessFinance === 'object'
        ? {
            ...emptyFinanceSettings(),
            ...(data.businessFinance as Partial<FinanceSettings>),
            currency: 'INR',
          }
        : emptyFinanceSettings()
    finScope.value =
      data.finScope === 'business' || data.finScope === 'all' ? data.finScope : 'personal'
    finMigrated.value = data.finMigrated === true
    if (Array.isArray(data.transactions)) {
      transactions.value = data.transactions as Txn[]
    } else if (!finMigrated.value) {
      transactions.value = migrateExpenses(finances.value)
      finMigrated.value = true
    } else {
      transactions.value = []
    }
    bumpNid()
    // Release the hydration guard after the reactive writes settle.
    setTimeout(() => {
      hydrating = false
    }, 0)
  }
  function saveCloud() {
    if (!firebaseEnabled || !db || !uid || hydrating || !cloudReady.value) return
    const ref = doc(db, AUREON_COLLECTION, uid)
    syncState.value = 'saving'
    setDoc(ref, { ...snapshotData(), ownerId: uid, updatedAt: Date.now() }, { merge: true })
      .then(() => {
        syncState.value = 'synced'
      })
      .catch((error) => {
        syncState.value = 'error'
        cloudError.value = 'Could not save changes to Firebase.'
        console.error('[Aureon] Cloud save failed:', error)
      })
  }
  function scheduleSave() {
    // Snapshot hydration updates every reactive list. Do not turn those remote
    // changes into another write, otherwise the realtime listener can loop.
    if (hydrating) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(saveCloud, 600)
  }
  // Persist immediately and await the write. The rollover uses this to report
  // real per-chunk progress: a chunk is "done" only once its write resolves,
  // not on a timer. Resolves (a no-op) when there is nothing to persist to, so
  // callers do not have to special-case an offline/unconfigured workspace.
  function saveCloudNow(): Promise<void> {
    if (!firebaseEnabled || !db || !uid || hydrating || !cloudReady.value) return Promise.resolve()
    const ref = doc(db, AUREON_COLLECTION, uid)
    clearTimeout(saveTimer)
    syncState.value = 'saving'
    return setDoc(ref, { ...snapshotData(), ownerId: uid, updatedAt: Date.now() }, { merge: true })
      .then(() => {
        syncState.value = 'synced'
      })
      .catch((error) => {
        syncState.value = 'error'
        cloudError.value = 'Could not save changes to Firebase.'
        console.error('[Aureon] Cloud save failed:', error)
        throw error
      })
  }

  async function connectCloud(u: FbUser | null) {
    if (cloudUnsub) {
      cloudUnsub()
      cloudUnsub = null
    }
    clearTimeout(saveTimer)
    cloudReady.value = false
    cloudError.value = ''
    syncState.value = 'idle'
    uid = u && isFirebaseUserAllowed(u) ? u.uid : null
    resetData()
    if (!uid || !db) return
    const ref = doc(db, AUREON_COLLECTION, uid)
    try {
      const snap = await getDoc(ref)
      if (snap.exists()) applyData(snap.data())
      else {
        // A brand-new workspace: seed the two default bots so the Bots tab has
        // something to show, then write the first document.
        bots.value = seedBots(id, Date.now())
        await setDoc(ref, { ...snapshotData(), ownerId: uid, updatedAt: Date.now() })
      }
      // Baseline the acknowledged signature so nothing reads as pending on load.
      captureSyncedBaseline()
      cloudReady.value = true
      syncState.value = 'synced'
      // Once hydration settles (applyData releases the guard on the next tick),
      // run the auto-rollover if it is enabled and hasn't run today.
      setTimeout(() => void runAutoRolloverIfDue(), 0)
    } catch (error) {
      cloudError.value = 'Could not load your Firebase data.'
      syncState.value = 'error'
      console.error('[Aureon] Cloud load failed:', error)
      return
    }
    // Live updates from other devices. includeMetadataChanges so the pending /
    // fromCache transitions (which carry no data change) still wake the pill.
    cloudUnsub = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (s) => {
        syncFromCache.value = s.metadata.fromCache
        syncHasPending.value = s.metadata.hasPendingWrites
        // Only a server-acknowledged snapshot (no pending local writes) is a new
        // baseline: apply its data and re-capture the signature so local pending
        // clears. A pending snapshot is our own optimistic echo — skip it.
        if (s.exists() && s.metadata.hasPendingWrites === false) {
          applyData(s.data())
          captureSyncedBaseline()
          cloudReady.value = true
          syncState.value = 'synced'
        }
      },
      (error) => {
        cloudError.value = 'Firebase realtime sync was interrupted.'
        syncState.value = 'error'
        console.error('[Aureon] Cloud listener failed:', error)
      },
    )
  }

  // Re-run the connect for whoever is currently signed in, so a transient
  // Firestore failure does not strand the user on the error card.
  async function retryCloud() {
    await connectCloud(auth?.currentUser ?? null)
  }

  if (firebaseEnabled && auth && db) {
    onAuthStateChanged(auth, connectCloud)

    watch(
      [
        todos,
        tasks,
        deadlines,
        finances,
        notes,
        reminders,
        trips,
        ideas,
        stocks,
        security,
        themeSetting,
        railCollapsed,
        approvedPRs,
        autoRollover,
        lastAutoRolloverDay,
        hideCompleted,
        reminderSound,
        financeSettings,
        drafts,
        aiChats,
        aiUseData,
        bots,
        transactions,
        debts,
        financeTags,
        businessFinance,
        finScope,
        finMigrated,
      ],
      scheduleSave,
      { deep: true },
    )
  }

  function updateSecurity(patch: Partial<SecuritySettings>) {
    if (!uid || !cloudReady.value) return
    security.value = { ...security.value, ...patch }
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
    ideas,
    stocks,
    tags,
    security,
    themeSetting,
    railCollapsed,
    autoRollover,
    hideCompleted,
    reminderSound,
    financeSettings,
    cloudReady,
    cloudError,
    syncState,
    syncFromCache,
    syncHasPending,
    lastSyncedAt,
    pendingKeys,
    pendingCount,
    isItemPending,
    retrySync,
    editing,
    draft,
    drafts,
    deviceLabel: thisDeviceLabel,
    aiChats,
    aiActiveChatId,
    activeAiChat,
    aiUseData,
    bots,
    transactions,
    debts,
    financeTags,
    businessFinance,
    finScope,
    toast,
    burst,
    itemDialog,
    dialogDraft,
    dialogClosing,
    taskViewId,
    noteView,
    noteViewClosing,
    openNote,
    githubCache,
    approvedPRs,
    draggingId,
    draggingTodoId,
    activeNotif,
    notifPermission,
    sharedView,
    // actions
    addTag,
    removeTag,
    registerTag,
    addTodo,
    updateTodo,
    toggleTodo,
    setTodoStatus,
    cycleTodoStatus,
    addTask,
    toggleTask,
    setTaskStatus,
    cycleTaskStatus,
    updateTask,
    addDeadline,
    updateDeadline,
    addFinance,
    updateFinance,
    setMonthlyIncome,
    pendingOverdue,
    movePendingToToday,
    undoMovePending,
    setAutoRollover,
    setHideCompleted,
    setReminderSound,
    runAutoRolloverIfDue,
    // Todo/Task ↔ Reminder bridge
    createReminderFromItem,
    createRemindersForItems,
    cancelRemindersFor,
    acknowledgeReminder,
    snoozeReminder,
    skipReminder,
    completeReminderSource,
    createTodoFromReminder,
    linkableById,
    canLinkItems,
    linkItems,
    unlinkItems,
    nestUnder,
    unnestFrom,
    linkProgressOf,
    addTrip,
    updateTrip,
    tripById,
    addTripPlace,
    updateTripPlace,
    removeTripPlace,
    reorderTripPlaces,
    moveTripToDone,
    moveTripToVisit,
    addIdea,
    updateIdea,
    addStock,
    updateStock,
    attachNote,
    detachNote,
    updateSecurity,
    startEdit,
    newNote,
    openNoteView,
    editNoteView,
    saveNoteView,
    closeNoteView,
    setNoteText,
    autosaveNoteDraft,
    cancelEdit,
    setDraft,
    saveEdit,
    draftFor,
    saveDraft,
    deleteDraft,
    aiChatById,
    newAiChat,
    selectAiChat,
    setAiChatModel,
    renameAiChat,
    toggleAiChatPin,
    deleteAiChat,
    addAiMessage,
    appendAiMessageContent,
    setAiUseData,
    botById,
    patchBot,
    toggleBot,
    stopAllBots,
    setFinScope,
    baselineIncome,
    setScopeIncome,
    addTxn,
    updateTxn,
    deleteTxn,
    confirmIncome,
    addDebt,
    updateDebt,
    deleteDebt,
    settleDebt,
    writeOffDebt,
    recordDebtPayment,
    deleteDebtPayment,
    addFinTag,
    renameFinTag,
    mergeFinTags,
    setFinTagColor,
    archiveFinTag,
    ensureFinTag,
    deleteWithUndo,
    undoDelete,
    showToastMsg,
    showToastWithUndo,
    performUndo,
    closeToast,
    share,
    pendingShare,
    shareBusy,
    cancelShare,
    createShareLink,
    dismissShared,
    addSharedItem,
    attachRepo,
    approvePR,
    importIssue,
    setDragId,
    dropOnTask,
    dropOnGroup,
    setTodoDragId,
    endTodoDrag,
    dropTodoOnDay,
    dropTodoOnTodo,
    openCreate,
    openEdit,
    closeItemDialog,
    setDialogDraft,
    commitCreate,
    blankDraft,
    itemById,
    updateItem,
    patchItem,
    publishShare,
    unpublishShare,
    syncShareIfPublic,
    dialogTaskId,
    dialogReminderId,
    openTaskDialog,
    openReminderDialog,
    // The two named dialogs close the one shared slot.
    closeDialog: closeItemDialog,
    closeReminderDialog: closeItemDialog,
    openTaskView,
    closeTaskView,
    addReminder,
    updateReminder,
    toggleWeekday,
    syncCalendar,
    syncAllCalendar,
    unsyncCalendar,
    reconnectCalendar,
    calendarNeedsAuth,
    retryCloud,
    requestNotifPermission,
    checkReminders,
    snoozeNotif,
    dismissNotif,
  }
})
