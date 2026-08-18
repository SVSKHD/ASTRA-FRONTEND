import { defineStore } from 'pinia'
import { computed, ref, watch, type Ref } from 'vue'
// Type-only: the Firestore SDK itself is loaded on demand (see @/firebase), so
// nothing here may import a value from 'firebase/firestore'.
import type { Unsubscribe } from 'firebase/firestore'
import {
  AUREON_COLLECTION,
  auth,
  defaultLockMinutes,
  firebaseEnabled,
  firestoreReady,
  loadFirestore,
} from '@/firebase'
import { onAuthStateChanged, type User as FbUser } from 'firebase/auth'
import { isThemeSetting, isThemeKey, THEMES, type ThemeSetting, type ThemeKey } from '@/themes'
import type { DetailKind } from '@/utils/detailUrl'
import {
  canGoBack,
  openStack,
  parentFrame,
  popFrame,
  pushFrame,
  replaceTop,
  sameFrame,
  stepIds,
  topOf,
  type DetailFrame,
} from '@/utils/detailStack'
import { isFirebaseUserAllowed } from '@/stores/auth'
import {
  GhNotConfiguredError,
  GhRateLimitError,
  ghCall,
  ghInstallUrl,
  isGhConfigured,
  type GhRateLimit,
} from '@/utils/ghProxy'
import {
  CLOSED_VIA_SPASTA,
  buildIssueBody,
  commitFromApi,
  pullFromApi,
  fullName,
  githubLinkOf,
  ingestIssues,
  issueFromApi,
  issueKey,
  issueStateForTaskStatus,
  parseRepoKey,
  repoFromApi,
  sanitizeIntegration,
  sanitizeIssue,
  sanitizeRepo,
  shouldPatchIssue,
  stripSpastaFooter,
  taskUrl,
} from '@/utils/githubModel'
import {
  POLL_TICK_MS,
  backoffDelay,
  reposDueForPoll,
  resumeAtFor,
  shouldPauseForRateLimit,
} from '@/utils/ghPoll'
import {
  effectsForIssues,
  isGhDelivery,
  issueFromDelivery,
  mergeDeferred,
  partitionEffects,
  repoPatchFromDelivery,
  type TaskEffect,
} from '@/utils/ghSync'
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
import { isBlankNote, isNoteEditorMode, type NoteEditorMode } from '@/utils/notes'
import {
  DEFAULT_TAGS,
  normalizeTag,
  sameTag,
  sanitizeTags,
  withTag,
  withoutTag,
} from '@/utils/tags'
import {
  STATUS_CYCLE,
  STATUS_LOG_LIMIT,
  emptyFinanceSettings,
  emptyGithubIntegration,
  isStatus,
  statusFromDone,
} from '@/types'
import { chunk, eligibleTasks, eligibleTodos, todayKey } from '@/utils/rollover'
import { pendingKeysBetween, signatureOf, type Identified } from '@/utils/sync'
import { deviceLabel, draftKey, sanitizeDrafts, type DraftRecord } from '@/utils/drafts'
import { seedBots } from '@/utils/bots'
import { chainName, isChainKey, type ChainKey, type Network } from '@/utils/chains'
import { validateAddress } from '@/utils/address'
import {
  defaultFilters,
  isCalendarView,
  type CalendarFilters,
  type CalendarViewKey,
} from '@/utils/calendarEvents'
import { reportError } from '@/utils/scrub'
import { AI_MODELS, type AiChat, type AiMessage, type Bot } from '@/types'
import type { Debt, DebtPayment, FinScope, FinTag, ScopeFilter, Txn } from '@/types'
import { titleFromMessage } from '@/utils/ai'
import { debtOutstanding, migrateExpenses } from '@/utils/finance'
import { resolveIncome } from '@/utils/budget'
import { checkLink, hasRef, sameRef, type Graph, type LinkCheck } from '@/utils/links'
import { nestSummary, planNest } from '@/utils/dragNest'
import {
  DEFAULT_NODE,
  isEdgeRelation,
  isNodeKind,
  nextNodePosition,
  tidyTreeLayout,
} from '@/utils/planning'
import {
  buildIndex,
  needsRenormalize,
  orderForPosition,
  recomputeSubtree,
  renormalize,
  wouldCreateCycle,
} from '@/utils/taskTree'
import { useSyncGuard } from '@/composables/useSyncGuard'
import type {
  ActiveNotif,
  Deadline,
  EditingState,
  Finance,
  GithubIntegration,
  GithubIssue,
  GithubLink,
  RepoCommit,
  RepoPull,
  LinkedRepo,
  GraphRef,
  Hierarchical,
  Idea,
  ItemDialogState,
  BoardType,
  EdgeRelation,
  LinkedItemType,
  NodeKind,
  PlanningBoard,
  PlanningEdge,
  PlanningNode,
  ItemStatus,
  ItemType,
  LinkRef,
  LinkCollection,
  ListKey,
  Note,
  Stock,
  Priority,
  StatusChange,
  FinanceSettings,
  Goal,
  GoalChecklistItem,
  GoalOccurrence,
  GoalStatus,
  Recurrence,
  Metric,
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
  Schedulable,
  Wallet,
} from '@/types'
import type { ParsedGoalItem, GoalDoc, GoalPoint } from '@/utils/goals'
import { horizonDates, localDateInTz } from '@/utils/recurrence'
import { captureOutcome } from '@/utils/goalMetrics'
import { exportGoalsJson } from '@/utils/goals'

function rel(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Backfill the calendar's scheduling fields on read. An item written before the
// calendar existed is simply unscheduled, which is exactly what "no startAt"
// means — it lives in the Unscheduled panel rather than being invented onto a day.
function scheduleFields(item: Partial<Schedulable>): Schedulable {
  const startAt = typeof item.startAt === 'number' ? item.startAt : null
  const endAt = typeof item.endAt === 'number' ? item.endAt : null
  return {
    startAt,
    endAt,
    allDay: item.allDay === true,
    durationMins:
      typeof item.durationMins === 'number'
        ? item.durationMins
        : startAt !== null && endAt !== null
          ? Math.max(1, Math.round((endAt - startAt) / 60000))
          : null,
  }
}

function isPriority(value: unknown): value is Priority {
  return value === 'low' || value === 'normal' || value === 'high'
}

// Sanitise a stored status history (section 18c) to well-formed entries, oldest
// first, capped. A malformed value reads as no history rather than crashing the
// activity section, and the cap is re-applied on read so a document written by
// an older or buggier client cannot grow unboundedly here.
function statusLogOf(value: unknown): StatusChange[] {
  if (!Array.isArray(value)) return []
  const entries = value.filter(
    (e): e is StatusChange =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as StatusChange).at === 'number' &&
      isStatus((e as StatusChange).status),
  )
  return entries.slice(-STATUS_LOG_LIMIT)
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
      (
        window as unknown as {
          AudioContext?: typeof AudioContext
          webkitAudioContext?: typeof AudioContext
        }
      ).AudioContext ||
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
  // Planning boards (JointJS node graphs). Stored flat in the workspace doc like
  // everything else: boards plus per-node and per-edge records, so positions and
  // relations sync granularly. See utils/planning + composables/usePlanningBoard.
  const boards = ref<PlanningBoard[]>([])
  const boardNodes = ref<PlanningNode[]>([])
  const boardEdges = ref<PlanningEdge[]>([])
  // Goals (task 8): a container above tasks/todos. Stored flat in the workspace
  // doc — the goals themselves plus their checklist items keyed by goalId
  // (adapting the spec's per-goal checklist subcollection). Tasks/todos attach by
  // reference through their own goalIds; a goal never stores the item list.
  const goals = ref<Goal[]>([])
  const goalChecklist = ref<GoalChecklistItem[]>([])
  // Dated occurrences of recurring goals (task 11). Flat array keyed by
  // (goalId, date); generation is idempotent on that pair so multi-device sync
  // never duplicates a day.
  const goalOccurrences = ref<GoalOccurrence[]>([])
  // The shared tag vocabulary behind both pickers. Seeded for a new workspace;
  // a hydrate replaces it, and any tag typed anywhere joins it.
  const tags = ref<string[]>(DEFAULT_TAGS.slice())
  const security = ref<SecuritySettings>(emptySecurity())
  // Theme is a per-user preference, so it rides along in the workspace doc and
  // is restored on refresh once the document lands. The ui store reads it.
  const themeSetting = ref<ThemeSetting>('auto')
  // The last fixed theme the user picked in each family, so the header's
  // sun/moon quick toggle can flip between "their dark" and "their light"
  // instead of a hardcoded pair. Persisted alongside themeSetting.
  const preferredDark = ref<ThemeKey>('deepSpace')
  const preferredLight = ref<ThemeKey>('daylight')
  // Left-rail collapsed state — a per-user preference, persisted in the same
  // workspace doc so it comes back on refresh and across devices. The ui store
  // reads it; the rail's toggle writes it.
  const railCollapsed = ref(false)
  // "Move pending to today" preferences. autoRollover runs the rollover once on
  // the first load of a new day; lastAutoRolloverDay (a YYYY-MM-DD key) records
  // the last day it did, so it fires at most once per day per device-sync.
  const autoRollover = ref(false)
  const lastAutoRolloverDay = ref('')
  // Records the last local day recurring-goal occurrences were generated, so the
  // lazy generator does its horizon pass at most once per day per device.
  const lastGoalGenDay = ref('')
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
  // GitHub integration (section 13). The connection record holds the installation
  // id, never a token — tokens live in Secret Manager and are only ever used
  // inside the ghProxy Cloud Function. Repos and mirrored issues are flat arrays
  // keyed by the spec's composite ids ("owner__name", "owner__name__number"),
  // adapting /projects/{id}/repos and /projects/{id}/issues to this app's single
  // workspace document.
  const githubIntegration = ref<GithubIntegration>(emptyGithubIntegration())
  const repos = ref<LinkedRepo[]>([])
  const ghIssues = ref<GithubIssue[]>([])
  // Transient: the repos the installation can see, for the picker. Never
  // persisted — it is a live read, and stale entries would mislead.
  const ghInstalled = ref<LinkedRepo[] | null>(null)
  const ghBusy = ref(false)
  const ghError = ref('')
  // Calendar (section 15) preferences: the last view used and the filter chips,
  // per user, so the tab opens where it was left.
  // How the note editor is laid out (section 17). Remembered per user with
  // everything else on the workspace document, so it survives a reload and a
  // different device rather than living in localStorage.
  const noteEditorMode = ref<NoteEditorMode>('split')
  const calendarView = ref<CalendarViewKey>('dayGridMonth')
  const calendarFilters = ref<CalendarFilters>(defaultFilters())
  // Wallets (section 14): the user's own PUBLIC receive addresses. They live on
  // the workspace document — under the user, never under a project — so the
  // existing `request.auth.uid == userId` rule already denies another uid's
  // wallets (acceptance 65). No key material is ever accepted or stored.
  const wallets = ref<Wallet[]>([])
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

  // The detail dialog (section 18): a stack rather than a single id, because
  // clicking a subtask inside it swaps the content and must leave a back path.
  // The top frame is what is on screen; an empty stack is a closed dialog.
  const detailStack = ref<DetailFrame[]>([])
  // The ids of the list the dialog was opened from, in the order the reader sees
  // them, so the header's prev/next arrows step through what they are looking at
  // rather than through the unfiltered collection.
  const detailSiblings = ref<number[]>([])
  // Set by the open body while a debounced autosave is still pending. The shell
  // reads it to decide whether closing needs a confirmation.
  const detailDirty = ref(false)
  // The goal open on its own wide page, /goals/:goalId (section 18d's footer
  // link). Distinct from the dialog: the page is the Goals tab showing one goal
  // full width, and it survives a reload because the URL names it.
  const goalPageId = ref<number | null>(null)
  // The note open in the full-screen reader/editor. It stays up until it is
  // closed, so it is a slot of its own rather than a mode of the drawer. A null
  // id in edit mode is a note that has not been saved yet.
  const noteView = ref<{ id: number | null; mode: 'read' | 'edit' } | null>(null)
  const noteViewClosing = ref(false)

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

  // Edit-safe sync guard: holds the editing/dirty/buffer state that protects an
  // open task dialog from incoming snapshots. The store drives it; the snapshot
  // handler, the task dialog and moveTask all consult it.
  const syncGuard = useSyncGuard()

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
      ...boards.value.map((b) => b.id),
      ...boardNodes.value.map((n) => n.id),
      ...boardEdges.value.map((e) => e.id),
      ...goals.value.map((g) => g.id),
      ...goalChecklist.value.map((c) => c.id),
      ...goalOccurrences.value.map((o) => o.id),
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
  // `fields` carries anything beyond the three common arguments — today that is
  // the calendar's scheduling fields on a duplicated todo.
  function addTodo(text: string, tag = '', description = '', fields: Partial<Todo> = {}) {
    const t = text.trim()
    if (!t) return
    const newId = id()
    const rootOrders = todos.value.filter((x) => x.parentId == null).map((x) => x.order)
    const nextOrder = rootOrders.length ? Math.max(...rootOrders) + 1 : 0
    todos.value = [
      ...todos.value,
      {
        id: newId,
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
        parentId: null,
        order: nextOrder,
        depth: 0,
        rootId: newId,
        localRev: 0,
        updatedBy: uid ?? '',
        ...fields,
        ...stamps(),
      },
    ]
    return newId
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
    const newId = id()
    // A fresh task is top-level; give it an order just past the current roots so
    // it lands at the bottom of the list, and seed depth/rootId for the flat tree.
    const rootOrders = tasks.value.filter((x) => x.parentId == null).map((x) => x.order)
    const nextOrder = rootOrders.length ? Math.max(...rootOrders) + 1 : 0
    tasks.value = [
      ...tasks.value,
      {
        id: newId,
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
        parentId: null,
        order: nextOrder,
        depth: 0,
        rootId: newId,
        localRev: 0,
        updatedBy: uid ?? '',
        ...fields,
        ...stamps(),
      },
    ]
    return newId
  }
  // Append a status transition to a task's history (section 18c). Capped at
  // write time as well as read time, so the array cannot grow past the limit
  // even in a long-lived session that never reloads.
  function withStatusLog(task: Task, next: ItemStatus): Task {
    const log = [...(task.statusLog ?? []), { at: Date.now(), status: next }]
    return { ...task, statusLog: log.slice(-STATUS_LOG_LIMIT) }
  }
  function setTaskStatus(tid: number, next: ItemStatus) {
    const cur = tasks.value.find((t) => t.id === tid)
    if (!cur || cur.status === next) return
    tasks.value = tasks.value.map((t) =>
      t.id === tid ? withStatusLog(withStatus(t, next), next) : t,
    )
    if (next === 'done') cancelRemindersFor('tasks', tid)
    // A linked task that changes state closes/reopens its issue (13c).
    scheduleIssuePush(tid)
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
    // Record the touched field so the sync guard keeps it if a remote snapshot
    // lands mid-edit (a no-op unless this task's dialog is open).
    syncGuard.markTouched(tid, field as string)
    // Title/description are the only fields that flow out to a linked issue,
    // debounced so a burst of keystrokes is one PATCH.
    if (field === 'title' || field === 'notes') scheduleIssuePush(tid)
  }
  // The typed sibling of updateTask, for the detail dialog's non-string fields
  // (priority, estimate, schedule). Same guard bookkeeping, same one write.
  function patchTask(tid: number, patch: Partial<Task>) {
    const keys = Object.keys(patch)
    if (!keys.length) return
    tasks.value = tasks.value.map((t) => (t.id === tid ? touched({ ...t, ...patch }) : t))
    for (const key of keys) syncGuard.markTouched(tid, key)
    if ('title' in patch || 'notes' in patch) scheduleIssuePush(tid)
  }
  // ⋯ → Duplicate. A copy of the task itself, dropped in beside it: the subtree,
  // the GitHub link and the reminders are deliberately NOT copied — a duplicated
  // task must not close someone else's issue or fire someone else's alarm.
  function duplicateTask(tid: number): number | null {
    const src = tasks.value.find((t) => t.id === tid)
    if (!src) return null
    const newId = addTask(`${src.title} (copy)`, src.tag, {
      deadline: src.deadline,
      notes: src.notes,
      repo: src.repo,
    })
    if (newId == null) return null
    patchTask(newId, {
      parentId: src.parentId,
      depth: src.depth,
      rootId: src.parentId == null ? newId : src.rootId,
      order: src.order + 0.5,
      assignee: src.assignee ?? '',
      priority: src.priority ?? 'normal',
      estimateMins: src.estimateMins ?? null,
      goalIds: [...(src.goalIds ?? [])],
    })
    return newId
  }
  // ⋯ → Archive. The same archive "Clear completed" uses, so an archived task
  // leaves the list without being destroyed.
  function archiveTask(tid: number) {
    patchTask(tid, { archivedAt: Date.now() })
  }
  // ⋯ → Convert to goal point. The task becomes a checklist point on the goal and
  // is archived rather than deleted, so nothing that referenced it dangles.
  function convertTaskToGoalPoint(tid: number, goalId: number): number | null {
    const task = tasks.value.find((t) => t.id === tid)
    if (!task || !goals.value.some((g) => g.id === goalId)) return null
    const pointId = addChecklistItem(goalId, task.title, {
      dueAt: task.deadline,
      estimateMins: task.estimateMins ?? null,
      spentMins: task.spentMins ?? 0,
      done: task.status === 'done',
    })
    archiveTask(tid)
    return pointId
  }

  // ---- Flat-hierarchy moves (drag and drop) -------------------------------
  // The shape a list must have to take part in the flat tree: an id plus the
  // hierarchy/edit-sync fields, and a timestamp to age on move. Todos and tasks
  // both satisfy it, so one engine drives both lists.
  type Movable = { id: number; updatedAt: number } & Hierarchical
  // Renormalise a sibling group to integers when repeated bisection has made a
  // gap too small to halve again. Writes only the members whose order changed.
  function renormalizeInList<T extends Movable>(listRef: Ref<T[]>, parentId: number | null) {
    const index = buildIndex(listRef.value)
    const group = index.children.get(parentId) ?? []
    if (!needsRenormalize(group)) return
    const remap = renormalize(group)
    if (remap.size === 0) return
    listRef.value = listRef.value.map((t) =>
      remap.has(t.id) ? { ...t, order: remap.get(t.id) as number } : t,
    )
  }
  // Move an item (with its whole subtree) under newParentId at the given slot in
  // that parent's child list. Returns false without writing when the drop would
  // form a cycle (target is the node itself or one of its descendants), so the
  // caller can play a reject animation. Otherwise it writes ONE change set: the
  // dragged node's parentId/order/depth/rootId plus depth/rootId for its
  // descendants — nothing else — and persists, rolling back on write failure.
  function moveInList<T extends Movable>(
    listRef: Ref<T[]>,
    draggedId: number,
    newParentId: number | null,
    position: number,
  ): boolean {
    const index = buildIndex(listRef.value)
    if (wouldCreateCycle(index, draggedId, newParentId)) return false
    const dragged = index.byId.get(draggedId)
    if (!dragged) return false
    const siblings = (index.children.get(newParentId) ?? []).filter((t) => t.id !== draggedId)
    const order = orderForPosition(siblings, position)
    const drUpdates = recomputeSubtree(index, draggedId, newParentId)
    const snapshot = listRef.value
    const now = Date.now()
    listRef.value = listRef.value.map((t) => {
      if (t.id === draggedId) {
        const dr = drUpdates.get(t.id)
        return {
          ...t,
          parentId: newParentId,
          order,
          depth: dr ? dr.depth : t.depth,
          rootId: dr ? dr.rootId : t.rootId,
          updatedAt: now,
          updatedBy: uid ?? t.updatedBy,
          localRev: t.localRev + 1,
        }
      }
      const dr = drUpdates.get(t.id)
      return dr ? { ...t, depth: dr.depth, rootId: dr.rootId } : t
    })
    renormalizeInList(listRef, newParentId)
    void persistMove(listRef, snapshot)
    return true
  }
  function moveTask(draggedId: number, newParentId: number | null, position: number): boolean {
    return moveInList(tasks, draggedId, newParentId, position)
  }
  function moveTodo(draggedId: number, newParentId: number | null, position: number): boolean {
    return moveInList(todos, draggedId, newParentId, position)
  }
  // Commit a move immediately and, if the write is rejected, restore the
  // pre-drag snapshot and surface a toast so an item never appears to have moved
  // when it did not persist.
  async function persistMove<T>(listRef: Ref<T[]>, snapshot: T[]) {
    try {
      await saveCloudNow()
    } catch {
      listRef.value = snapshot
      showToastMsg('Move failed — reverted')
    }
  }

  // ---- Goals (task 8) -----------------------------------------------------
  // A goal is a container above tasks/todos. It owns a checklist and can have
  // existing tasks/todos attached to it by reference (their goalIds). Progress
  // and counts are derived from the live lists here — never persisted. Reorder of
  // the goals list reuses the flat-tree mover (goals are a flat, parentId=null
  // list); the checklist has its own light fractional reorder.
  const CHECKLIST_GAP = 1000

  function addGoal(fields: Partial<Goal> = {}): number {
    const newId = id()
    const rootOrders = goals.value.filter((g) => g.parentId == null).map((g) => g.order)
    const nextOrder = rootOrders.length ? Math.max(...rootOrders) + 1 : 0
    goals.value = [
      ...goals.value,
      {
        id: newId,
        title: 'New goal',
        description: '',
        status: 'active',
        targetDate: '',
        startDate: '',
        color: '',
        icon: '',
        source: 'manual',
        sourceUrl: '',
        parentId: null,
        order: nextOrder,
        depth: 0,
        rootId: newId,
        localRev: 0,
        updatedBy: uid ?? '',
        ...fields,
        ...stamps(),
      },
    ]
    return newId
  }
  function updateGoal(gid: number, fields: Partial<Goal>) {
    goals.value = goals.value.map((g) =>
      g.id === gid ? touched({ ...g, ...fields, localRev: g.localRev + 1 }) : g,
    )
    // Enabling/retiming recurrence (or reactivating a recurring goal) should
    // materialise its occurrences right away, not only on the next app open, and
    // keep the linked daily reminder + calendar event in step with the config.
    if ('recurrence' in fields || 'metric' in fields || 'status' in fields) {
      generateOccurrences()
      if ('recurrence' in fields || 'status' in fields) syncGoalReminders(gid)
    }
  }
  function setGoalStatus(gid: number, status: GoalStatus) {
    updateGoal(gid, { status })
  }
  function moveGoal(draggedId: number, position: number): boolean {
    return moveInList(goals, draggedId, null, position)
  }
  // Delete a goal. Default ('unlink everything'): remove the goal and its
  // checklist, and detach its id from every task/todo — the items themselves are
  // never deleted. checklistOnly: wipe just the checklist, leaving the goal and
  // its attachments in place.
  function deleteGoal(gid: number, checklistOnly = false) {
    if (checklistOnly) {
      goalChecklist.value = goalChecklist.value.filter((c) => c.goalId !== gid)
      return
    }
    // Recurring goal: drop its reminders + calendar events and its occurrences.
    removeGoalReminders(gid)
    goalOccurrences.value = goalOccurrences.value.filter((o) => o.goalId !== gid)
    goals.value = goals.value.filter((g) => g.id !== gid)
    goalChecklist.value = goalChecklist.value.filter((c) => c.goalId !== gid)
    const detach = <T extends { goalIds?: number[] }>(it: T): T =>
      it.goalIds && it.goalIds.includes(gid)
        ? { ...it, goalIds: it.goalIds.filter((x) => x !== gid) }
        : it
    tasks.value = tasks.value.map(detach)
    todos.value = todos.value.map(detach)
  }
  function goalById(gid: number): Goal | undefined {
    return goals.value.find((g) => g.id === gid)
  }
  // Thin status/timeline/colour wrappers over updateGoal (task 10b).
  function archiveGoal(gid: number) {
    updateGoal(gid, { status: 'archived' })
  }
  function unarchiveGoal(gid: number) {
    updateGoal(gid, { status: 'active' })
  }
  function setGoalTimeline(gid: number, tl: { start?: string; target?: string }) {
    const patch: Partial<Goal> = {}
    if (tl.start !== undefined) patch.startDate = tl.start
    if (tl.target !== undefined) patch.targetDate = tl.target
    updateGoal(gid, patch)
  }
  function setGoalColor(gid: number, color: string) {
    updateGoal(gid, { color })
  }
  // Reorder a goal to sit between two neighbours (midpoint order, single write).
  // Either neighbour may be absent (moved to an end).
  function reorderGoal(gid: number, beforeId: number | null, afterId: number | null) {
    const before = beforeId != null ? goalById(beforeId) : undefined
    const after = afterId != null ? goalById(afterId) : undefined
    let order: number
    if (before && after) order = (before.order + after.order) / 2
    else if (before) order = before.order + 1000
    else if (after) order = after.order - 1000
    else order = 0
    updateGoal(gid, { order })
  }
  // Duplicate a goal and its checklist (appends " (copy)"). Attached tasks/todos
  // are references and are NOT copied — the duplicate starts with none.
  function duplicateGoal(gid: number): number | undefined {
    const g = goalById(gid)
    if (!g) return undefined
    const rootOrders = goals.value.filter((x) => x.parentId == null).map((x) => x.order)
    const newId = addGoal({
      title: `${g.title} (copy)`,
      description: g.description,
      status: g.status,
      startDate: g.startDate,
      targetDate: g.targetDate,
      color: g.color,
      icon: g.icon,
      source: 'manual',
      sourceUrl: '',
      order: (rootOrders.length ? Math.max(...rootOrders) : 0) + 1000,
    })
    for (const c of checklistOf(gid)) {
      addChecklistItem(newId, c.text, {
        order: c.order,
        estimateMins: c.estimateMins,
        dueAt: c.dueAt,
        startAt: c.startAt,
        tags: c.tags,
        done: c.done,
      })
    }
    return newId
  }
  // Delete a goal with an 8s Undo that restores the goal, its checklist, and the
  // goalId links stripped from every attached task/todo. The whole payload is held
  // in the toast handler's closure, not persisted.
  function removeGoalWithUndo(gid: number) {
    const g = goalById(gid)
    if (!g) return
    const savedChecklist = goalChecklist.value.filter((c) => c.goalId === gid)
    const savedOccurrences = goalOccurrences.value.filter((o) => o.goalId === gid)
    const attachedTaskIds = tasks.value.filter((t) => t.goalIds?.includes(gid)).map((t) => t.id)
    const attachedTodoIds = todos.value.filter((t) => t.goalIds?.includes(gid)).map((t) => t.id)
    deleteGoal(gid) // unlinks tasks/todos, removes checklist + occurrences + goal + reminders
    const short = g.title.length > 28 ? g.title.slice(0, 28) + '…' : g.title || 'goal'
    showToastWithUndo(
      `Deleted "${short}"`,
      () => {
        goals.value = [...goals.value, g]
        goalChecklist.value = [...goalChecklist.value, ...savedChecklist]
        goalOccurrences.value = [...goalOccurrences.value, ...savedOccurrences]
        // Re-register the recurring reminders + calendar events if it was recurring.
        if (g.recurrence?.enabled) syncGoalReminders(gid)
        const reAttach = new Set(attachedTaskIds)
        tasks.value = tasks.value.map((t) =>
          reAttach.has(t.id)
            ? { ...t, goalIds: Array.from(new Set([...(t.goalIds ?? []), gid])) }
            : t,
        )
        const reAttachTodos = new Set(attachedTodoIds)
        todos.value = todos.value.map((t) =>
          reAttachTodos.has(t.id)
            ? { ...t, goalIds: Array.from(new Set([...(t.goalIds ?? []), gid])) }
            : t,
        )
      },
      8000,
      'Undo',
    )
  }

  // --- checklist CRUD ------------------------------------------------------
  function checklistOf(gid: number): GoalChecklistItem[] {
    return goalChecklist.value.filter((c) => c.goalId === gid).sort((a, b) => a.order - b.order)
  }
  function nextChecklistOrder(gid: number): number {
    const os = goalChecklist.value.filter((c) => c.goalId === gid).map((c) => c.order)
    return os.length ? Math.max(...os) + CHECKLIST_GAP : CHECKLIST_GAP
  }
  function addChecklistItem(
    gid: number,
    text: string,
    extra: Partial<
      Pick<
        GoalChecklistItem,
        'estimateMins' | 'dueAt' | 'startAt' | 'tags' | 'order' | 'done' | 'spentMins'
      >
    > = {},
  ): number {
    const newId = id()
    goalChecklist.value = [
      ...goalChecklist.value,
      {
        id: newId,
        goalId: gid,
        text: text.trim(),
        done: extra.done ?? false,
        order: extra.order ?? nextChecklistOrder(gid),
        estimateMins: extra.estimateMins ?? null,
        spentMins: extra.spentMins ?? 0,
        dueAt: extra.dueAt ?? '',
        startAt: extra.startAt ?? '',
        tags: extra.tags ?? [],
        startedAt: null,
        completedAt: null,
        timerStartedAt: null,
        localRev: 0,
        ...stamps(),
      },
    ]
    return newId
  }
  function updateChecklistItem(itemId: number, fields: Partial<GoalChecklistItem>) {
    goalChecklist.value = goalChecklist.value.map((c) =>
      c.id === itemId ? touched({ ...c, ...fields, localRev: c.localRev + 1 }) : c,
    )
  }
  // Add several checklist items in one array mutation (task 10b), so a paste of N
  // points persists as a single write rather than N.
  function bulkAddChecklist(gid: number, texts: string[]): number[] {
    const clean = texts.map((t) => t.trim()).filter(Boolean)
    if (!clean.length) return []
    let ord = nextChecklistOrder(gid) - CHECKLIST_GAP
    const added: GoalChecklistItem[] = clean.map((text) => {
      ord += CHECKLIST_GAP
      return {
        id: id(),
        goalId: gid,
        text,
        done: false,
        order: ord,
        estimateMins: null,
        spentMins: 0,
        dueAt: '',
        startAt: '',
        tags: [],
        startedAt: null,
        completedAt: null,
        timerStartedAt: null,
        localRev: 0,
        ...stamps(),
      }
    })
    goalChecklist.value = [...goalChecklist.value, ...added]
    return added.map((a) => a.id)
  }
  function toggleChecklistItem(itemId: number) {
    const now = Date.now()
    goalChecklist.value = goalChecklist.value.map((c) => {
      if (c.id !== itemId) return c
      const done = !c.done
      return touched({
        ...c,
        done,
        completedAt: done ? now : null,
        startedAt: c.startedAt ?? (done ? now : null),
        localRev: c.localRev + 1,
      })
    })
  }
  function deleteChecklistItem(itemId: number) {
    goalChecklist.value = goalChecklist.value.filter((c) => c.id !== itemId)
  }
  function orderBetween(prev?: GoalChecklistItem, next?: GoalChecklistItem): number {
    if (!prev && !next) return CHECKLIST_GAP
    if (!prev) return next!.order - CHECKLIST_GAP
    if (!next) return prev.order + CHECKLIST_GAP
    return (prev.order + next.order) / 2
  }
  // Move a checklist item to a target index within its goal's list (fractional
  // ordering, so only the moved row is rewritten).
  function moveChecklistItem(itemId: number, toIndex: number) {
    const item = goalChecklist.value.find((c) => c.id === itemId)
    if (!item) return
    const siblings = checklistOf(item.goalId).filter((c) => c.id !== itemId)
    const clamped = Math.max(0, Math.min(toIndex, siblings.length))
    updateChecklistItem(itemId, {
      order: orderBetween(siblings[clamped - 1], siblings[clamped]),
    })
  }
  // --- checklist timer -----------------------------------------------------
  function startChecklistTimer(itemId: number) {
    const now = Date.now()
    goalChecklist.value = goalChecklist.value.map((c) =>
      c.id === itemId ? touched({ ...c, timerStartedAt: now, startedAt: c.startedAt ?? now }) : c,
    )
  }
  function stopChecklistTimer(itemId: number) {
    const now = Date.now()
    goalChecklist.value = goalChecklist.value.map((c) => {
      if (c.id !== itemId || c.timerStartedAt == null) return c
      const elapsed = Math.max(0, Math.round((now - c.timerStartedAt) / 60000))
      return touched({ ...c, spentMins: c.spentMins + elapsed, timerStartedAt: null })
    })
  }

  // --- attachment (by reference, both ways) --------------------------------
  function attachToGoal(collection: 'tasks' | 'todos', itemId: number, gid: number) {
    const listRef = collection === 'tasks' ? tasks : todos
    listRef.value = listRef.value.map((it) =>
      it.id === itemId
        ? touched({ ...it, goalIds: Array.from(new Set([...(it.goalIds ?? []), gid])) })
        : it,
    ) as typeof listRef.value
  }
  function detachFromGoal(collection: 'tasks' | 'todos', itemId: number, gid: number) {
    const listRef = collection === 'tasks' ? tasks : todos
    listRef.value = listRef.value.map((it) =>
      it.id === itemId && it.goalIds?.includes(gid)
        ? touched({ ...it, goalIds: it.goalIds.filter((x) => x !== gid) })
        : it,
    ) as typeof listRef.value
  }
  function createTaskInGoal(gid: number, title: string, tag = ''): number | undefined {
    return addTask(title, tag, { goalIds: [gid] })
  }
  function createTodoInGoal(gid: number, text: string): number | undefined {
    const tid = addTodo(text)
    if (tid != null) attachToGoal('todos', tid, gid)
    return tid
  }
  function tasksOfGoal(gid: number): Task[] {
    return tasks.value.filter((t) => t.goalIds?.includes(gid))
  }
  function todosOfGoal(gid: number): Todo[] {
    return todos.value.filter((t) => t.goalIds?.includes(gid))
  }
  // Progress rolls up checklist items + attached tasks + attached todos.
  function goalProgress(gid: number): { done: number; total: number; ratio: number } {
    const cl = goalChecklist.value.filter((c) => c.goalId === gid)
    const tk = tasksOfGoal(gid)
    const td = todosOfGoal(gid)
    const total = cl.length + tk.length + td.length
    const done =
      cl.filter((c) => c.done).length +
      tk.filter((t) => t.done).length +
      td.filter((t) => t.done).length
    return { done, total, ratio: total ? done / total : 0 }
  }
  function goalCounts(gid: number): { checklist: number; tasks: number; todos: number } {
    return {
      checklist: goalChecklist.value.filter((c) => c.goalId === gid).length,
      tasks: tasksOfGoal(gid).length,
      todos: todosOfGoal(gid).length,
    }
  }
  // Estimated vs spent minutes, summed across the goal's checklist items. Tasks
  // and todos carry no time fields, so only the checklist contributes.
  function goalTime(gid: number): { estimate: number; spent: number } {
    let estimate = 0
    let spent = 0
    for (const c of goalChecklist.value) {
      if (c.goalId !== gid) continue
      estimate += c.estimateMins ?? 0
      spent += c.spentMins
    }
    return { estimate, spent }
  }

  // --- recurring occurrences (task 11) -------------------------------------
  // Default config factories for the create flow.
  function defaultRecurrence(): Recurrence {
    let tz = 'UTC'
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      /* keep UTC */
    }
    return {
      enabled: true,
      freq: 'daily',
      daysOfWeek: [],
      timeOfDay: '09:00',
      timezone: tz,
      startDate: localDateInTz(Date.now(), tz),
      endDate: null,
      endOfDayNudge: '21:00',
    }
  }
  // Map a recurrence frequency to the reminders module's Repeat shape, so a
  // recurring goal reuses the existing scheduler + RRULE calendar sync.
  function recurrenceToRepeat(rec: Recurrence): Repeat {
    switch (rec.freq) {
      case 'daily':
        return { type: 'days', n: 1 }
      case 'weekdays':
        return { type: 'weekdays', weekdays: [1, 2, 3, 4, 5] }
      case 'weekly':
      case 'custom':
        return { type: 'weekdays', weekdays: rec.daysOfWeek.slice() }
    }
  }
  // Remove any reminders registered for a goal (silently — no undo toast), taking
  // their Google Calendar events with them.
  function removeGoalReminders(gid: number) {
    const ids = goalById(gid)?.reminderIds ?? []
    if (!ids.length) return
    for (const rid of ids) {
      const r = reminders.value.find((x) => x.id === rid)
      if (r?.calEventId) void deleteEvent(r.calEventId).catch(() => {})
    }
    const gone = new Set(ids)
    reminders.value = reminders.value.filter((r) => !gone.has(r.id))
  }
  // Register (or refresh) a recurring goal's reminders: a daily fire at timeOfDay
  // synced to Google Calendar as a recurring event, plus an optional end-of-day
  // "still pending?" nudge. Recreated wholesale on any config change so the
  // reminder + calendar rule always match the current recurrence.
  function syncGoalReminders(gid: number) {
    removeGoalReminders(gid)
    const g = goalById(gid)
    if (!g) return
    const rec = g.recurrence
    if (!rec?.enabled || g.status !== 'active') {
      if (g.reminderIds?.length) updateGoalQuiet(gid, { reminderIds: [] })
      return
    }
    const repeat = recurrenceToRepeat(rec)
    const src = { collection: 'goals' as const, id: gid }
    const ids: number[] = []
    const mainId = addReminder({
      title: g.title || 'Goal',
      note: g.metric?.enabled ? `Target ${g.metric.target} ${g.metric.unit}` : '',
      start: `${rec.startDate}T${rec.timeOfDay}`,
      repeat,
      addToCalendar: true,
      sourceRef: src,
    })
    if (mainId != null) ids.push(mainId)
    if (rec.endOfDayNudge) {
      const nudgeId = addReminder({
        title: `${g.title || 'Goal'} — still pending?`,
        note: '',
        start: `${rec.startDate}T${rec.endOfDayNudge}`,
        repeat,
        addToCalendar: false,
        sourceRef: src,
      })
      if (nudgeId != null) ids.push(nudgeId)
    }
    updateGoalQuiet(gid, { reminderIds: ids })
  }
  // Patch a goal without the recurrence/occurrence/reminder side effects that
  // updateGoal fires — used when writing back the reminder ids syncGoalReminders
  // just created, so it can't re-enter itself.
  function updateGoalQuiet(gid: number, fields: Partial<Goal>) {
    goals.value = goals.value.map((g) =>
      g.id === gid ? touched({ ...g, ...fields, localRev: g.localRev + 1 }) : g,
    )
  }
  function defaultMetric(): Metric {
    return {
      enabled: true,
      label: 'Amount',
      unit: 'count',
      target: 1,
      direction: 'at_least',
      allowPartial: true,
    }
  }
  function occurrencesOf(gid: number): GoalOccurrence[] {
    return goalOccurrences.value
      .filter((o) => o.goalId === gid)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  }
  function occurrenceOn(gid: number, date: string): GoalOccurrence | undefined {
    return goalOccurrences.value.find((o) => o.goalId === gid && o.date === date)
  }
  // The local "today" for a goal, honouring its captured timezone so travel or a
  // device-clock change can't mint two occurrences for one calendar day.
  function goalToday(goal: Goal): string {
    return localDateInTz(Date.now(), goal.recurrence?.timezone || '')
  }
  function todayOccurrence(gid: number): GoalOccurrence | undefined {
    const g = goalById(gid)
    return g ? occurrenceOn(gid, goalToday(g)) : undefined
  }

  // Lazily materialise occurrences for today + the next 7 days for every enabled,
  // active recurring goal, and flip any past still-`pending` day to `missed`.
  // Idempotent on (goalId, date): runs safely on every app open and day flip, and
  // two devices converge because the date string is the identity.
  function generateOccurrences() {
    let list = goalOccurrences.value
    let changed = false
    const have = new Set(list.map((o) => o.goalId + '|' + o.date))
    for (const g of goals.value) {
      const rec = g.recurrence
      if (!rec?.enabled || g.status !== 'active') continue
      const today = goalToday(g)
      const target = g.metric?.enabled ? g.metric.target : 0
      // Ensure the horizon exists.
      for (const date of horizonDates(rec, today, 7)) {
        const key = g.id + '|' + date
        if (have.has(key)) continue
        have.add(key)
        list = [
          ...list,
          {
            id: id(),
            goalId: g.id,
            date,
            status: 'pending',
            target,
            actual: null,
            note: null,
            completedAt: null,
            localRev: 0,
            updatedBy: uid ?? '',
            ...stamps(),
          },
        ]
        changed = true
      }
      // Rollover: a past pending day is a miss (data, not a backlog item).
      list = list.map((o) => {
        if (o.goalId === g.id && o.status === 'pending' && o.date < today) {
          changed = true
          return touched({ ...o, status: 'missed', localRev: o.localRev + 1 })
        }
        return o
      })
    }
    if (changed) goalOccurrences.value = list
  }
  // Mirror of runAutoRolloverIfDue: generate once per local day, plus always on a
  // fresh load. lastGoalGenDay is a device-local guard (host date is fine here —
  // generation itself is idempotent, this only avoids redundant passes).
  function runGoalGenerationIfDue() {
    const key = localDateInTz(Date.now(), '')
    if (lastGoalGenDay.value === key) {
      generateOccurrences()
      return
    }
    lastGoalGenDay.value = key
    generateOccurrences()
  }

  function writeOccurrence(gid: number, date: string, patch: Partial<GoalOccurrence>) {
    goalOccurrences.value = goalOccurrences.value.map((o) =>
      o.goalId === gid && o.date === date
        ? touched({ ...o, ...patch, localRev: o.localRev + 1 })
        : o,
    )
  }
  // Capture the actual for a metric occurrence. The actual is always stored as
  // entered; status becomes 'done' and completedAt is stamped. Colour/label (hit
  // vs short) is derived in the UI from captureOutcome — never here.
  function captureOccurrence(gid: number, date: string, actual: number, note: string | null) {
    writeOccurrence(gid, date, {
      actual,
      note,
      status: 'done',
      completedAt: Date.now(),
    })
  }
  function skipOccurrence(gid: number, date: string) {
    writeOccurrence(gid, date, { status: 'skipped', completedAt: null })
  }
  function markOccurrenceMissed(gid: number, date: string) {
    writeOccurrence(gid, date, { status: 'missed', completedAt: null })
  }
  // Plain (non-metric) tick: toggle done/pending with no capture prompt.
  function toggleOccurrenceDone(gid: number, date: string) {
    const o = occurrenceOn(gid, date)
    if (!o) return
    const done = o.status !== 'done'
    writeOccurrence(gid, date, {
      status: done ? 'done' : 'pending',
      completedAt: done ? Date.now() : null,
    })
  }
  // Inline-edit a past occurrence's actual from the history list.
  function updateOccurrenceActual(gid: number, date: string, actual: number | null) {
    writeOccurrence(gid, date, { actual })
  }
  // Whether entering `actual` hits the goal's target (for the capture UI outcome).
  function occurrenceOutcome(gid: number, actual: number) {
    const g = goalById(gid)
    if (!g?.metric?.enabled) return { hit: true, pct: 100, offerMissed: false }
    return captureOutcome(g.metric, actual)
  }

  // --- URL import ----------------------------------------------------------
  function goalBySourceUrl(url: string): Goal | undefined {
    return goals.value.find((g) => g.sourceUrl && g.sourceUrl === url)
  }
  // A preview row the import view hands back: the parsed item plus the target
  // kind the user chose for it.
  interface ImportRow extends ParsedGoalItem {
    kind: 'checklist' | 'task' | 'todo'
  }
  // Write an import in one synchronous pass (one debounced save = one atomic
  // whole-doc write). Either creates a fresh goal or, when mergeGoalId is given,
  // appends only checklist items whose text is not already present.
  function importGoals(opts: {
    title: string
    sourceUrl: string
    rows: ImportRow[]
    mergeGoalId?: number | null
  }): number | null {
    const merging = opts.mergeGoalId != null && goalById(opts.mergeGoalId) != null
    const gid = merging
      ? (opts.mergeGoalId as number)
      : addGoal({
          title: opts.title.trim() || 'Imported Goals',
          source: 'url-import',
          sourceUrl: opts.sourceUrl,
        })
    const existing = new Set(checklistOf(gid).map((c) => c.text.toLowerCase()))
    let ord = nextChecklistOrder(gid) - CHECKLIST_GAP
    for (const row of opts.rows) {
      const text = row.text.trim()
      if (!text) continue
      if (row.kind === 'checklist') {
        if (merging && existing.has(text.toLowerCase())) continue
        existing.add(text.toLowerCase())
        ord += CHECKLIST_GAP
        addChecklistItem(gid, text, {
          order: ord,
          estimateMins: row.estimateMins,
          dueAt: row.dueAt ?? '',
        })
      } else if (row.kind === 'task') {
        const tag = row.tags[0] ?? ''
        createTaskInGoal(gid, text, tag)
      } else {
        createTodoInGoal(gid, text)
      }
    }
    return gid
  }

  // Import a canonical JSON document (task 10a). Writes one goal per importable
  // GoalDoc (those without an `error`), each with its points as checklist items,
  // in one synchronous pass. When a goal's title matches an existing goal from the
  // same sourceUrl, its points are merged (append only new text) instead.
  function importGoalsDocument(
    doc: { goals: GoalDoc[] },
    opts: { sourceUrl?: string } = {},
  ): number[] {
    const created: number[] = []
    for (const g of doc.goals) {
      if (g.error || !g.title.trim()) continue
      const existing = opts.sourceUrl
        ? goals.value.find((x) => x.sourceUrl === opts.sourceUrl && x.title === g.title)
        : undefined
      const gid =
        existing?.id ??
        addGoal({
          title: g.title.trim(),
          description: g.description,
          status: g.status,
          startDate: g.startAt ?? '',
          targetDate: g.targetAt ?? '',
          color: g.color,
          source: opts.sourceUrl ? 'url-import' : 'manual',
          sourceUrl: opts.sourceUrl ?? '',
        })
      const seen = new Set(checklistOf(gid).map((c) => c.text.toLowerCase()))
      let ord = nextChecklistOrder(gid) - CHECKLIST_GAP
      for (const p of g.points) {
        const text = p.text.trim()
        if (!text || seen.has(text.toLowerCase())) continue
        seen.add(text.toLowerCase())
        ord += CHECKLIST_GAP
        addChecklistItem(gid, text, {
          order: ord,
          estimateMins: p.estimateMins,
          dueAt: p.dueAt ?? '',
          startAt: p.startAt ?? '',
          done: p.done,
          tags: p.tags,
        })
      }
      created.push(gid)
    }
    return created
  }

  // Serialise a goal + its checklist to the canonical JSON string (task 10a), for
  // the goal's ⋯ → Export. Attached tasks/todos are references, not part of the
  // portable goal, so only checklist points are emitted.
  function exportGoal(gid: number, exportedAt: string): string | null {
    const g = goalById(gid)
    if (!g) return null
    const points: GoalPoint[] = checklistOf(gid).map((c) => ({
      text: c.text,
      estimateMins: c.estimateMins,
      dueAt: c.dueAt || null,
      startAt: c.startAt || null,
      done: c.done,
      tags: c.tags ?? [],
    }))
    const gdoc: GoalDoc = {
      title: g.title,
      description: g.description,
      startAt: g.startDate || null,
      targetAt: g.targetDate || null,
      color: g.color,
      status: g.status,
      points,
    }
    return exportGoalsJson(g.title, [gdoc], exportedAt)
  }

  // ---- Edit-safe flush on task dialog close -------------------------------
  // Called when a task dialog closes: write the local edit FIRST (bump localRev /
  // updatedAt), then drain any snapshot the guard held back while it was open —
  // applying remote data only to fields the user did not touch, flagging a
  // conflict when the remote changed a field they did. Never the reverse order,
  // and never a whole-document last-write-wins.
  async function flushTaskEdit(id: number) {
    const local = tasks.value.find((t) => t.id === id)
    if (!local) {
      const { heldTasks } = syncGuard.resolveOnClose(id, {} as Task)
      if (heldTasks) tasks.value = heldTasks.filter((t) => t.id !== id)
      return
    }
    const bumped: Task = {
      ...local,
      localRev: local.localRev + 1,
      updatedAt: Date.now(),
      updatedBy: uid ?? local.updatedBy,
    }
    const { conflict, heldTasks } = syncGuard.resolveOnClose(id, bumped)
    const mergedItem: Task = conflict
      ? {
          ...conflict.merged,
          // Keep the local write's bookkeeping over the remote's.
          localRev: bumped.localRev,
          updatedAt: bumped.updatedAt,
          updatedBy: bumped.updatedBy,
          hasConflict: conflict.hasConflict ? true : undefined,
        }
      : bumped
    tasks.value = (heldTasks ?? tasks.value).map((t) => (t.id === id ? mergedItem : t))
    // The edit is written; now let any webhook that arrived while the dialog was
    // open have its say (acceptance 57).
    replayDeferredGhEffects(id)
    try {
      await saveCloudNow()
    } catch {
      showToastMsg('Could not save your changes')
    }
  }
  // The remote version of a conflicted task, for the "view remote version" badge.
  function remoteTaskVersion(id: number): Task | undefined {
    return syncGuard.remoteVersionOf(id)
  }
  // Dismiss a conflict badge once the user has reconciled it.
  function dismissTaskConflict(id: number) {
    syncGuard.clearConflict(id)
    tasks.value = tasks.value.map((t) =>
      t.id === id && t.hasConflict ? { ...t, hasConflict: undefined } : t,
    )
  }

  // ---- Planning boards (node graphs) --------------------------------------
  // Boards, nodes and edges are flat records in the workspace doc. Node writes
  // bump localRev so the board's sync guard can recognise a stale in-flight
  // write; multi-node ops (group move, layout, delete) mutate the array once so
  // they persist as a single write.
  function touchNode(n: PlanningNode): PlanningNode {
    return { ...n, updatedAt: Date.now(), updatedBy: uid ?? n.updatedBy, localRev: n.localRev + 1 }
  }
  function addBoard(name: string, type: BoardType = 'tree'): number {
    const boardId = id()
    boards.value = [
      ...boards.value,
      {
        id: boardId,
        name: name.trim() || 'Untitled board',
        type,
        layoutMode: 'manual',
        ...stamps(),
      },
    ]
    return boardId
  }
  function renameBoard(boardId: number, name: string) {
    boards.value = boards.value.map((b) =>
      b.id === boardId ? touched({ ...b, name: name.trim() || b.name }) : b,
    )
  }
  function setBoardLayoutMode(boardId: number, mode: 'manual' | 'tidy') {
    boards.value = boards.value.map((b) =>
      b.id === boardId ? touched({ ...b, layoutMode: mode }) : b,
    )
  }
  function deleteBoard(boardId: number) {
    const nodeIds = new Set(boardNodes.value.filter((n) => n.boardId === boardId).map((n) => n.id))
    for (const nid of nodeIds) stripGraphRefsForNode(nid)
    boardNodes.value = boardNodes.value.filter((n) => n.boardId !== boardId)
    boardEdges.value = boardEdges.value.filter((e) => e.boardId !== boardId)
    boards.value = boards.value.filter((b) => b.id !== boardId)
  }
  function nodesOfBoard(boardId: number): PlanningNode[] {
    return boardNodes.value.filter((n) => n.boardId === boardId)
  }
  // Run the tidy-tree layout and write every node's new position in one batch.
  function tidyBoard(boardId: number) {
    const positions = tidyTreeLayout(nodesOfBoard(boardId), edgesOfBoard(boardId))
    const updates: { id: number; x: number; y: number }[] = []
    for (const [nid, p] of positions) updates.push({ id: nid, x: p.x, y: p.y })
    if (updates.length) moveNodes(updates)
    setBoardLayoutMode(boardId, 'tidy')
  }
  function edgesOfBoard(boardId: number): PlanningEdge[] {
    return boardEdges.value.filter((e) => e.boardId === boardId)
  }
  function nodeById(nid: number): PlanningNode | undefined {
    return boardNodes.value.find((n) => n.id === nid)
  }
  function addNode(boardId: number, kind: NodeKind = 'idea', label = 'New node'): number {
    const nodeId = id()
    const pos = nextNodePosition(nodesOfBoard(boardId))
    boardNodes.value = [
      ...boardNodes.value,
      {
        id: nodeId,
        boardId,
        label,
        notes: '',
        kind,
        x: pos.x,
        y: pos.y,
        width: DEFAULT_NODE.width,
        height: DEFAULT_NODE.height,
        color: '',
        linkedType: null,
        linkedId: null,
        localRev: 0,
        updatedBy: uid ?? '',
        ...stamps(),
      },
    ]
    return nodeId
  }
  function updateNode(nid: number, patch: Partial<PlanningNode>) {
    boardNodes.value = boardNodes.value.map((n) =>
      n.id === nid ? touchNode({ ...n, ...patch }) : n,
    )
  }
  // Position-only write (the drag path); one node, or a batch for group-move.
  function moveNode(nid: number, x: number, y: number) {
    boardNodes.value = boardNodes.value.map((n) => (n.id === nid ? touchNode({ ...n, x, y }) : n))
  }
  function moveNodes(updates: { id: number; x: number; y: number }[]) {
    const map = new Map(updates.map((u) => [u.id, u]))
    boardNodes.value = boardNodes.value.map((n) => {
      const u = map.get(n.id)
      return u ? touchNode({ ...n, x: u.x, y: u.y }) : n
    })
  }
  function removeNode(nid: number, alsoDeleteLinked = false) {
    const node = nodeById(nid)
    if (node && alsoDeleteLinked && node.linkedType && node.linkedId != null) {
      deleteWithUndo(node.linkedType === 'task' ? 'tasks' : 'todos', node.linkedType, node.linkedId)
    } else if (node) {
      stripGraphRefsForNode(nid)
    }
    boardEdges.value = boardEdges.value.filter((e) => e.source !== nid && e.target !== nid)
    boardNodes.value = boardNodes.value.filter((n) => n.id !== nid)
  }

  // --- edges / relations ----------------------------------------------------
  interface EdgeResult {
    ok: boolean
    reason?: 'self' | 'exists' | 'cycle'
  }
  function addEdge(
    boardId: number,
    source: number,
    target: number,
    relation: EdgeRelation = 'relates_to',
  ): EdgeResult {
    if (source === target) return { ok: false, reason: 'self' }
    if (boardEdges.value.some((e) => e.source === source && e.target === target)) {
      return { ok: false, reason: 'exists' }
    }
    // A 'parent' edge between two linked items writes the real hierarchy, reusing
    // the flat-tree cycle guard: source is the parent, target the child.
    if (relation === 'parent') {
      const applied = applyParentRelation(source, target)
      if (!applied.ok) return applied
    }
    const edgeId = id()
    boardEdges.value = [
      ...boardEdges.value,
      { id: edgeId, boardId, source, target, relation, label: '', ...stamps() },
    ]
    // Record the relation on both linked items so it is navigable from the task.
    recordEdgeGraphRefs(boardId, source, target, relation)
    return { ok: true }
  }
  // Write child.parentId = parent.id through moveTask/moveTodo (cycle-guarded);
  // returns cycle when the tree would loop. A no-op (ok) when either side is not
  // a linked item of the matching type — the edge is still stored as a relation.
  function applyParentRelation(sourceNode: number, targetNode: number): EdgeResult {
    const parent = nodeById(sourceNode)
    const child = nodeById(targetNode)
    if (!parent?.linkedType || !child?.linkedType || parent.linkedType !== child.linkedType) {
      return { ok: true }
    }
    if (parent.linkedId == null || child.linkedId == null) return { ok: true }
    const ok =
      parent.linkedType === 'task'
        ? moveTask(child.linkedId, parent.linkedId, 0)
        : moveTodo(child.linkedId, parent.linkedId, 0)
    return ok ? { ok: true } : { ok: false, reason: 'cycle' }
  }
  function updateEdgeRelation(edgeId: number, relation: EdgeRelation): EdgeResult {
    const edge = boardEdges.value.find((e) => e.id === edgeId)
    if (!edge) return { ok: true }
    if (relation === 'parent') {
      const applied = applyParentRelation(edge.source, edge.target)
      if (!applied.ok) return applied
    }
    boardEdges.value = boardEdges.value.map((e) =>
      e.id === edgeId ? touched({ ...e, relation }) : e,
    )
    return { ok: true }
  }
  function removeEdge(edgeId: number) {
    const edge = boardEdges.value.find((e) => e.id === edgeId)
    if (!edge) return
    // Undo a written parent relation: lift the child back to the top level.
    if (edge.relation === 'parent') {
      const child = nodeById(edge.target)
      if (child?.linkedType && child.linkedId != null) {
        if (child.linkedType === 'task') moveTask(child.linkedId, null, 0)
        else moveTodo(child.linkedId, null, 0)
      }
    }
    stripEdgeGraphRefs(edge)
    boardEdges.value = boardEdges.value.filter((e) => e.id !== edgeId)
  }

  // --- node ↔ task/todo -----------------------------------------------------
  function convertNodeToTask(nid: number): number | undefined {
    const node = nodeById(nid)
    if (!node || node.linkedType) return
    addTask(node.label || 'Untitled', '', { notes: node.notes })
    const created = tasks.value[tasks.value.length - 1]
    if (!created) return
    linkNode(nid, 'task', created.id)
    return created.id
  }
  function convertNodeToTodo(nid: number): number | undefined {
    const node = nodeById(nid)
    if (!node || node.linkedType) return
    addTodo(node.label || 'Untitled', '', node.notes)
    const created = todos.value[todos.value.length - 1]
    if (!created) return
    linkNode(nid, 'todo', created.id)
    return created.id
  }
  function linkNode(nid: number, type: LinkedItemType, itemId: number) {
    const node = nodeById(nid)
    if (!node) return
    updateNode(nid, { linkedType: type, linkedId: itemId })
    pushGraphRef(type, itemId, { boardId: node.boardId, nodeId: nid, relation: 'mirror' })
  }
  function unlinkNode(nid: number) {
    const node = nodeById(nid)
    if (!node || !node.linkedType || node.linkedId == null) return
    stripGraphRef(node.linkedType, node.linkedId, (r) => r.nodeId === nid)
    updateNode(nid, { linkedType: null, linkedId: null })
  }

  // --- graphRefs bookkeeping on tasks/todos ---------------------------------
  function graphListRef(type: LinkedItemType): Ref<(Task | Todo)[]> {
    return (type === 'task' ? tasks : todos) as unknown as Ref<(Task | Todo)[]>
  }
  function pushGraphRef(type: LinkedItemType, itemId: number, ref: GraphRef) {
    const listRef = graphListRef(type)
    listRef.value = listRef.value.map((it) =>
      it.id === itemId ? { ...it, graphRefs: [...(it.graphRefs ?? []), ref] } : it,
    )
  }
  function stripGraphRef(type: LinkedItemType, itemId: number, match: (r: GraphRef) => boolean) {
    const listRef = graphListRef(type)
    listRef.value = listRef.value.map((it) =>
      it.id === itemId ? { ...it, graphRefs: (it.graphRefs ?? []).filter((r) => !match(r)) } : it,
    )
  }
  // On node delete: drop every graphRef that pointed at it from its linked item.
  function stripGraphRefsForNode(nid: number) {
    const node = nodeById(nid)
    if (node?.linkedType && node.linkedId != null) {
      stripGraphRef(node.linkedType, node.linkedId, (r) => r.nodeId === nid)
    }
  }
  // Record a relation edge on both endpoints' linked items (skip 'mirror').
  function recordEdgeGraphRefs(
    boardId: number,
    source: number,
    target: number,
    relation: EdgeRelation,
  ) {
    const s = nodeById(source)
    const t = nodeById(target)
    if (s?.linkedType && s.linkedId != null) {
      pushGraphRef(s.linkedType, s.linkedId, { boardId, nodeId: source, relation })
    }
    if (t?.linkedType && t.linkedId != null) {
      pushGraphRef(t.linkedType, t.linkedId, { boardId, nodeId: target, relation })
    }
  }
  function stripEdgeGraphRefs(edge: PlanningEdge) {
    const s = nodeById(edge.source)
    const t = nodeById(edge.target)
    if (s?.linkedType && s.linkedId != null) {
      stripGraphRef(
        s.linkedType,
        s.linkedId,
        (r) => r.nodeId === edge.source && r.relation === edge.relation,
      )
    }
    if (t?.linkedType && t.linkedId != null) {
      stripGraphRef(
        t.linkedType,
        t.linkedId,
        (r) => r.nodeId === edge.target && r.relation === edge.relation,
      )
    }
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
  // "Clear completed": archive (not delete) every done item in a collection, so
  // it drops out of the list but still counts in Overview and Calendar.
  function archiveCompleted(collection: LinkCollection) {
    const at = Date.now()
    if (collection === 'todos') {
      todos.value = todos.value.map((t) =>
        t.status === 'done' && t.archivedAt == null ? { ...t, archivedAt: at } : t,
      )
    } else {
      tasks.value = tasks.value.map((t) =>
        t.status === 'done' && t.archivedAt == null ? { ...t, archivedAt: at } : t,
      )
    }
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
  function setNoteEditorMode(mode: NoteEditorMode) {
    noteEditorMode.value = mode
  }
  // The term a note was found by, so the rendered view can mark it. Ephemeral
  // UI state: it belongs to this visit to this note, not to the workspace, so
  // it is deliberately not part of the snapshot.
  const noteSearch = ref('')
  function openNoteView(noteId: number, term = '') {
    noteView.value = { id: noteId, mode: 'read' }
    noteViewClosing.value = false
    noteSearch.value = term
  }
  function editNoteView(noteId?: number) {
    const target = noteId ?? noteView.value?.id ?? null
    noteView.value = { id: target, mode: 'edit' }
    noteViewClosing.value = false
    draft.value = { text: target == null ? '' : (openNote.value?.text ?? '') }
  }
  // Commit the editor's HTML. A note whose markup carries no text at all is
  // dropped rather than saved — an empty <div> would be an unreadable row.
  function saveNoteView(text: string) {
    const v = noteView.value
    if (!v) return
    if (isBlankNote(text)) {
      if (v.id == null) return closeNoteView()
      deleteWithUndo('notes', 'note', v.id)
      return closeNoteView()
    }
    if (v.id == null) {
      const newId = id()
      notes.value = [...notes.value, { id: newId, text, format: 'md', ts: Date.now(), ...stamps() }]
      noteView.value = { id: newId, mode: 'read' }
    } else {
      const target = v.id
      // Saving through the markdown editor also settles the format: a note
      // converted from the old HTML is markdown from here on.
      notes.value = notes.value.map((n) =>
        n.id === target ? touched({ ...n, text, format: 'md' as const }) : n,
      )
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
  // The checkbox write-back path: ticking a box in the rendered note replaces
  // the source in place. The format is whatever it already was — a legacy HTML
  // note stays HTML until it is opened in the editor.
  function setNoteText(noteId: number, text: string) {
    notes.value = notes.value.map((n) => (n.id === noteId ? touched({ ...n, text }) : n))
  }
  // Autosave while editing: persist the draft in place without leaving edit
  // mode. A new note is created on its first non-blank keystroke and the view
  // rebinds to it, so subsequent autosaves update rather than duplicate. Blank
  // markup is ignored — an empty note is not worth a row until it has content.
  function autosaveNoteDraft(text: string) {
    const v = noteView.value
    if (!v || v.mode !== 'edit') return
    if (isBlankNote(text)) return
    if (v.id == null) {
      const newId = id()
      notes.value = [...notes.value, { id: newId, text, format: 'md', ts: Date.now(), ...stamps() }]
      noteView.value = { id: newId, mode: 'edit' }
    } else {
      const target = v.id
      notes.value = notes.value.map((n) =>
        n.id === target ? touched({ ...n, text, format: 'md' as const }) : n,
      )
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
              reportError('[Aureon] Calendar delete on linked-reminder delete failed:', error)
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
          reportError('[Aureon] Calendar delete on reminder delete failed:', error)
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
      reportError('[Aureon] Share failed:', error)
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
          parentId: null,
          order: 0,
          depth: 0,
          rootId: nidNew,
          localRev: 0,
          updatedBy: uid ?? '',
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
          parentId: null,
          order: 0,
          depth: 0,
          rootId: nidNew,
          localRev: 0,
          updatedBy: uid ?? '',
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

  // ---- GitHub integration (section 13) ------------------------------------
  // Every call below goes through the ghProxy Cloud Function. Nothing in this
  // file has, or can obtain, a GitHub token (acceptance 59).

  const githubConnected = computed(() => githubIntegration.value.installationId !== null)
  const githubConfigured = computed(() => isGhConfigured())
  // Visible "sync paused" state rather than silent failure (13f).
  const githubPaused = computed(() => {
    const until = githubIntegration.value.pausedUntil
    return until !== null && until > Date.now()
  })

  function patchIntegration(patch: Partial<GithubIntegration>) {
    githubIntegration.value = { ...githubIntegration.value, ...patch }
  }

  // Fold the rate-limit reading from any proxy call into the integration record,
  // and pause sync when the window is spent.
  function noteRateLimit(rl: GhRateLimit | null) {
    if (!rl) return
    patchIntegration({ rateLimit: rl })
    if (rl.remaining <= 0) pauseGithubSync(rl.resetAt, 'GitHub rate limit reached')
  }

  function pauseGithubSync(until: number, reason: string) {
    patchIntegration({ pausedUntil: until, pausedReason: reason })
  }
  function resumeGithubSync() {
    patchIntegration({ pausedUntil: null, pausedReason: '' })
  }

  // Shared error handling: a rate-limit refusal pauses sync; anything else
  // surfaces as a message on the panel rather than a thrown promise.
  function handleGhError(err: unknown, fallback: string): void {
    if (err instanceof GhRateLimitError) {
      pauseGithubSync(err.resetAt, 'GitHub rate limit reached')
      ghError.value = 'Sync paused — GitHub rate limit reached.'
      return
    }
    if (err instanceof GhNotConfiguredError) {
      ghError.value = 'GitHub is not configured for this workspace.'
      return
    }
    ghError.value = err instanceof Error ? err.message : fallback
    reportError('[Aureon] GitHub:', err)
  }

  // Load the repos this installation can see. Called when the picker opens.
  async function loadInstalledRepos(): Promise<void> {
    if (ghBusy.value) return
    ghBusy.value = true
    ghError.value = ''
    try {
      const res = await ghCall<{
        installationId?: number
        login?: string
        avatarUrl?: string
        scopes?: string[]
        repositories?: Record<string, unknown>[]
      }>('installations')
      noteRateLimit(res.rateLimit)
      const payload = res.data || {}
      const now = Date.now()
      const list = Array.isArray(payload.repositories) ? payload.repositories : []
      ghInstalled.value = list
        .map((r) => repoFromApi(r, now))
        .filter((r): r is LinkedRepo => r !== null)
      // The installation identity is the only GitHub identifier we keep.
      if (typeof payload.installationId === 'number') {
        patchIntegration({
          installationId: payload.installationId,
          login: typeof payload.login === 'string' ? payload.login : githubIntegration.value.login,
          avatarUrl:
            typeof payload.avatarUrl === 'string'
              ? payload.avatarUrl
              : githubIntegration.value.avatarUrl,
          scopes: Array.isArray(payload.scopes) ? payload.scopes : githubIntegration.value.scopes,
          connectedAt: githubIntegration.value.connectedAt ?? now,
        })
        resumeGithubSync()
      }
    } catch (err) {
      ghInstalled.value = ghInstalled.value ?? []
      handleGhError(err, 'Could not list your GitHub repositories.')
    } finally {
      ghBusy.value = false
    }
  }

  // "Connect GitHub" — send the user to install the App, then read the
  // installation back. Installing is what grants per-repo access; there is no
  // token round-trip in the browser.
  function githubInstallUrl(): string {
    return ghInstallUrl()
  }
  async function connectGithub(): Promise<void> {
    await loadInstalledRepos()
  }

  function disconnectGithub() {
    githubIntegration.value = emptyGithubIntegration()
    ghInstalled.value = null
    ghError.value = ''
    // Linked repos and mirrored issues are left in place: disconnecting stops
    // syncing, it does not throw away what the workspace already knows. Tasks
    // keep their issue chips and can still be unlinked one by one.
  }

  function repoById(repoId: string): LinkedRepo | undefined {
    return repos.value.find((r) => r.id === repoId)
  }

  // Link a repo the installation can see. Idempotent: linking an already-linked
  // repo refreshes its metadata rather than adding a duplicate.
  function linkRepo(repo: LinkedRepo): LinkedRepo {
    const existing = repoById(repo.id)
    if (existing) {
      const merged: LinkedRepo = {
        ...existing,
        ...repo,
        linkedAt: existing.linkedAt,
        syncEnabled: existing.syncEnabled,
        labelFilter: existing.labelFilter,
        lastSyncAt: existing.lastSyncAt,
        etag: existing.etag,
      }
      repos.value = repos.value.map((r) => (r.id === repo.id ? merged : r))
      return merged
    }
    repos.value = [...repos.value, { ...repo, linkedAt: Date.now() }]
    showToastMsg('Linked ' + repo.fullName)
    return repo
  }

  function unlinkRepo(repoId: string) {
    const repo = repoById(repoId)
    repos.value = repos.value.filter((r) => r.id !== repoId)
    // Mirrored issues for an unlinked repo are dropped; the issues themselves
    // are untouched on GitHub, and any task link survives (it carries its own
    // repoId + number, so the chip still resolves).
    ghIssues.value = ghIssues.value.filter((i) => i.repoId !== repoId)
    if (repo) showToastMsg('Unlinked ' + repo.fullName)
  }

  function toggleRepoLink(repo: LinkedRepo) {
    if (repoById(repo.id)) unlinkRepo(repo.id)
    else linkRepo(repo)
  }

  function setRepoSync(repoId: string, enabled: boolean) {
    repos.value = repos.value.map((r) => (r.id === repoId ? { ...r, syncEnabled: enabled } : r))
  }

  function setRepoLabelFilter(repoId: string, labels: string[]) {
    const clean = labels.map((l) => l.trim()).filter(Boolean)
    repos.value = repos.value.map((r) => (r.id === repoId ? { ...r, labelFilter: clean } : r))
  }

  // ---- Wallets (section 14) ------------------------------------------------
  // Read-only by design: this is an address book. Nothing below signs, builds a
  // transaction or connects a wallet, and every write goes through
  // validateAddress first — which refuses a seed phrase or private key outright
  // and never persists the offending input, not even as a draft (acceptance 61).

  const walletsByChain = computed(() => {
    const groups = new Map<ChainKey, Wallet[]>()
    for (const w of [...wallets.value].sort((a, b) => a.order - b.order)) {
      const list = groups.get(w.chain) ?? []
      list.push(w)
      groups.set(w.chain, list)
    }
    return groups
  })

  function walletById(walletId: number): Wallet | undefined {
    return wallets.value.find((w) => w.id === walletId)
  }

  // The default wallet for a chain: the flagged one, else the first by order.
  function defaultWalletFor(chain: ChainKey): Wallet | undefined {
    const list = walletsByChain.value.get(chain) ?? []
    return list.find((w) => w.isDefault) ?? list[0]
  }

  // Add a wallet. Returns the rejection reason rather than throwing, so the form
  // can show something specific — and returns before any write when the input is
  // a secret, so nothing about it is ever persisted.
  function addWallet(fields: {
    label: string
    chain: ChainKey
    network?: Network
    address: string
    memoTag?: string | null
    notes?: string
  }): { id: number | null; error: string } {
    const network: Network = fields.network ?? 'mainnet'
    const address = (fields.address || '').trim()
    const check = validateAddress(fields.chain, address, network)
    if (!check.ok) return { id: null, error: check.reason }
    // The same address on the same chain twice is a mistake, not a feature.
    const duplicate = wallets.value.find(
      (w) => w.chain === fields.chain && w.network === network && w.address === address,
    )
    if (duplicate) return { id: null, error: 'That address is already saved on this chain' }

    const newId = id()
    const orders = wallets.value.map((w) => w.order)
    const chainHasOne = wallets.value.some((w) => w.chain === fields.chain)
    wallets.value = [
      ...wallets.value,
      {
        id: newId,
        label: (fields.label || '').trim() || chainName(fields.chain) + ' wallet',
        chain: fields.chain,
        network,
        address,
        memoTag: (fields.memoTag || '').trim() || null,
        // The first wallet on a chain is that chain's default.
        isDefault: !chainHasOne,
        order: orders.length ? Math.max(...orders) + 1 : 0,
        notes: (fields.notes || '').trim(),
        balanceEnabled: false,
        balance: null,
        ...stamps(),
      },
    ]
    return { id: newId, error: '' }
  }

  // ---- Calendar writes (section 15 SYNC) ----------------------------------
  // Every drag and resize is optimistic and rolls back on failure, and the
  // dragged item is held in the sync guard for the duration — so a snapshot
  // arriving mid-drag is buffered rather than snapping the event back under the
  // pointer (acceptance 69).

  function beginCalendarDrag(type: 'task' | 'todo', itemId: number) {
    if (type !== 'task') return
    const task = tasks.value.find((t) => t.id === itemId)
    if (task) syncGuard.beginEdit(itemId, task)
  }
  function endCalendarDrag(type: 'task' | 'todo', itemId: number) {
    if (type !== 'task') return
    if (syncGuard.isEditing(itemId)) void flushTaskEdit(itemId)
  }

  // Apply a scheduling patch to a task or todo. Returns false (having restored
  // the previous value) when the write fails.
  async function rescheduleItem(
    type: 'task' | 'todo',
    itemId: number,
    patch: Schedulable,
  ): Promise<boolean> {
    const listRef = type === 'task' ? tasks : todos
    const before = listRef.value
    const target = before.find((i) => i.id === itemId)
    if (!target) return false
    // Optimistic: the grid has already moved the event, so the store follows
    // immediately and only the failure path is visible.
    listRef.value = before.map((item) =>
      item.id === itemId
        ? touched({
            ...item,
            startAt: patch.startAt,
            endAt: patch.endAt,
            allDay: patch.allDay ?? false,
            durationMins: patch.durationMins ?? null,
          })
        : item,
    ) as typeof before
    if (type === 'task') syncGuard.markTouched(itemId, 'startAt')
    try {
      await saveCloudNow()
      return true
    } catch {
      listRef.value = before
      showToastMsg('Could not reschedule — reverted')
      return false
    }
  }

  // Several selected events moved at once: one write, not one per event.
  async function rescheduleMany(
    moves: { type: 'task' | 'todo'; id: number; patch: Schedulable }[],
  ): Promise<boolean> {
    if (!moves.length) return true
    const beforeTasks = tasks.value
    const beforeTodos = todos.value
    const apply = <T extends { id: number }>(list: T[], type: 'task' | 'todo') =>
      list.map((item) => {
        const move = moves.find((m) => m.type === type && m.id === item.id)
        return move
          ? touched({
              ...item,
              startAt: move.patch.startAt,
              endAt: move.patch.endAt,
              allDay: move.patch.allDay ?? false,
              durationMins: move.patch.durationMins ?? null,
            })
          : item
      })
    tasks.value = apply(tasks.value, 'task')
    todos.value = apply(todos.value, 'todo')
    try {
      await saveCloudNow()
      return true
    } catch {
      tasks.value = beforeTasks
      todos.value = beforeTodos
      showToastMsg('Could not reschedule — reverted')
      return false
    }
  }

  // Alt/Option-drag: duplicate at the new time rather than moving.
  function duplicateScheduled(
    type: 'task' | 'todo',
    itemId: number,
    patch: Schedulable,
  ): number | null {
    if (type === 'task') {
      const task = tasks.value.find((t) => t.id === itemId)
      if (!task) return null
      const newId = addTask(task.title, task.tag, {
        notes: task.notes,
        deadline: task.deadline,
        startAt: patch.startAt,
        endAt: patch.endAt,
        allDay: patch.allDay,
        durationMins: patch.durationMins,
      })
      return newId ?? null
    }
    const todo = todos.value.find((t) => t.id === itemId)
    if (!todo) return null
    const newId = addTodo(todo.text, todo.tag, todo.description, {
      startAt: patch.startAt,
      endAt: patch.endAt,
      allDay: patch.allDay,
      durationMins: patch.durationMins,
    })
    return newId ?? null
  }

  // Moving a reminder on the grid moves its fire time — and, when it already
  // has a Google Calendar event, patches THAT event by its stored id rather
  // than creating a second one.
  async function rescheduleReminder(reminderId: number, startAt: number): Promise<boolean> {
    const before = reminders.value
    const target = before.find((r) => r.id === reminderId)
    if (!target) return false
    const local = new Date(startAt)
    const pad = (n: number) => String(n).padStart(2, '0')
    const value = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`
    patchReminder(reminderId, { start: value })
    try {
      await saveCloudNow()
    } catch {
      reminders.value = before
      showToastMsg('Could not reschedule — reverted')
      return false
    }
    // Two-way with Google Calendar for reminders that already sync: match on
    // the stored external event id, so nothing is ever duplicated.
    if (target.calEventId && hasCalendarToken()) await syncCalendar(reminderId)
    return true
  }

  // Quick create from the calendar: one call whatever the type toggle says, so
  // the popover does not have to know how each collection is written.
  function createScheduledItem(
    kind: 'task' | 'todo' | 'reminder',
    title: string,
    project: string,
    patch: Schedulable,
  ): number | null {
    const text = title.trim()
    if (!text) return null
    if (kind === 'reminder') {
      const start = new Date(patch.startAt ?? Date.now())
      const pad = (n: number) => String(n).padStart(2, '0')
      const value = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`
      return addReminder({ title: text, note: '', start: value, repeat: { type: 'none' } }) ?? null
    }
    if (kind === 'todo') {
      return addTodo(text, project, '', { ...patch }) ?? null
    }
    return (
      addTask(text, project, {
        startAt: patch.startAt,
        endAt: patch.endAt,
        allDay: patch.allDay,
        durationMins: patch.durationMins,
        // An all-day quick-create doubles as a due date, which is what the rest
        // of the app already understands.
        deadline: patch.allDay && patch.startAt ? ymd(new Date(patch.startAt)) : '',
      }) ?? null
    )
  }

  // Dragging an event back to the Unscheduled panel clears its schedule and
  // nothing else.
  async function unscheduleItem(type: 'task' | 'todo', itemId: number): Promise<boolean> {
    return rescheduleItem(type, itemId, {
      startAt: null,
      endAt: null,
      allDay: false,
      durationMins: null,
    })
  }

  // ---- Calendar preferences (section 15) ----------------------------------
  // The last view used and the filter chips ride in the workspace document, so
  // the tab opens where the user left it on every device.
  function setCalendarView(view: CalendarViewKey) {
    calendarView.value = view
  }
  function setCalendarFilters(patch: Partial<CalendarFilters>) {
    calendarFilters.value = { ...calendarFilters.value, ...patch }
  }

  // Inline edit. An address change is re-validated exactly like a create, so a
  // wallet can never be edited into an invalid — or secret-bearing — state.
  function updateWallet(walletId: number, patch: Partial<Wallet>): { ok: boolean; error: string } {
    const current = walletById(walletId)
    if (!current) return { ok: false, error: 'Wallet not found' }
    const next: Wallet = { ...current, ...patch }
    if (patch.address !== undefined || patch.chain !== undefined || patch.network !== undefined) {
      const check = validateAddress(next.chain, (next.address || '').trim(), next.network)
      if (!check.ok) return { ok: false, error: check.reason }
      next.address = next.address.trim()
    }
    if (patch.memoTag !== undefined) next.memoTag = (patch.memoTag || '').trim() || null
    if (patch.label !== undefined) next.label = patch.label.trim() || chainName(next.chain)
    wallets.value = wallets.value.map((w) => (w.id === walletId ? touched(next) : w))
    return { ok: true, error: '' }
  }

  // Delete with the same undo affordance as everything else in the app; the
  // confirmation naming the label is the view's job.
  function removeWallet(walletId: number) {
    const wallet = walletById(walletId)
    if (!wallet) return
    const index = wallets.value.findIndex((w) => w.id === walletId)
    wallets.value = wallets.value.filter((w) => w.id !== walletId)
    // If the default went, promote the next wallet on that chain so the chain
    // still has one.
    const remaining = wallets.value.filter((w) => w.chain === wallet.chain)
    if (wallet.isDefault && remaining.length && !remaining.some((w) => w.isDefault)) {
      const promote = remaining[0].id
      wallets.value = wallets.value.map((w) => (w.id === promote ? { ...w, isDefault: true } : w))
    }
    toast.value = {
      message: 'Deleted "' + wallet.label + '"',
      undo: true,
      listKey: undefined,
      item: wallet,
      idx: index,
    }
    toastUndoHandler = () => {
      const restored = wallets.value.slice()
      restored.splice(Math.min(index, restored.length), 0, wallet)
      wallets.value = restored
    }
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      if (toast.value) toast.value = null
      toastUndoHandler = null
    }, 8000)
  }

  // Drag reorder. Orders are rewritten as a dense sequence rather than bisected:
  // the list is short, and a stable integer order reads better in the document.
  function moveWallet(walletId: number, toIndex: number) {
    const ordered = [...wallets.value].sort((a, b) => a.order - b.order)
    const from = ordered.findIndex((w) => w.id === walletId)
    if (from === -1) return
    const [moved] = ordered.splice(from, 1)
    ordered.splice(Math.max(0, Math.min(toIndex, ordered.length)), 0, moved)
    const orderById = new Map(ordered.map((w, i) => [w.id, i]))
    wallets.value = wallets.value.map((w) => ({ ...w, order: orderById.get(w.id) ?? w.order }))
  }

  // Exactly one default per chain.
  function setDefaultWallet(walletId: number) {
    const wallet = walletById(walletId)
    if (!wallet) return
    wallets.value = wallets.value.map((w) =>
      w.chain === wallet.chain ? { ...w, isDefault: w.id === walletId } : w,
    )
  }

  // Balance display is opt-in per wallet and off by default. The read goes
  // through a Cloud Function so no API key sits in the client, and it never
  // blocks the list: the wallet renders immediately, the number arrives later.
  function setWalletBalanceEnabled(walletId: number, enabled: boolean) {
    wallets.value = wallets.value.map((w) =>
      w.id === walletId
        ? { ...w, balanceEnabled: enabled, balance: enabled ? w.balance : null }
        : w,
    )
    if (enabled) void fetchWalletBalance(walletId)
  }

  async function fetchWalletBalance(walletId: number): Promise<void> {
    const wallet = walletById(walletId)
    if (!wallet || !wallet.balanceEnabled) return
    const url = (import.meta.env.VITE_WALLET_BALANCE_URL || '').trim()
    const setBalance = (balance: Wallet['balance']) => {
      wallets.value = wallets.value.map((w) => (w.id === walletId ? { ...w, balance } : w))
    }
    if (!url) {
      setBalance({
        amount: '',
        symbol: '',
        fetchedAt: Date.now(),
        error: 'Balances not configured',
      })
      return
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain: wallet.chain,
          network: wallet.network,
          address: wallet.address,
        }),
      })
      const payload = (await res.json()) as { amount?: string; symbol?: string; error?: string }
      setBalance({
        amount: typeof payload.amount === 'string' ? payload.amount : '',
        symbol: typeof payload.symbol === 'string' ? payload.symbol : '',
        fetchedAt: Date.now(),
        error: typeof payload.error === 'string' ? payload.error : '',
      })
    } catch {
      // A failed balance read is a footnote on one row, never an error state for
      // the address book.
      setBalance({ amount: '', symbol: '', fetchedAt: Date.now(), error: 'Balance unavailable' })
    }
  }

  // ---- Conditional polling fallback (13f) ---------------------------------
  // Webhooks are the primary path; this is the safety net for a delivery that
  // never arrived. Each linked repo is re-read at most every ten minutes with
  // its stored etag, so an unchanged repo answers 304 and costs no rate limit.

  let ghPollTimer: ReturnType<typeof setInterval> | undefined
  // Consecutive failures per repo, for exponential backoff. Cleared on success.
  const ghFailures = new Map<string, number>()

  // Refresh one repo's issues conditionally. Returns true when new data landed.
  async function refreshRepoIssues(repoId: string, force = false): Promise<boolean> {
    const repo = repoById(repoId)
    if (!repo || !canCallGithub()) return false
    if (!force && !repo.syncEnabled) return false
    try {
      const res = await ghCall<Record<string, unknown>[]>(
        'issues',
        { owner: repo.owner, repo: repo.name, perPage: 50 },
        { etag: repo.etag || null },
      )
      noteRateLimit(res.rateLimit)
      ghFailures.delete(repoId)
      // 304: nothing changed. Still stamp lastSyncAt, or the repo would look
      // permanently overdue and poll on every tick.
      if (res.notModified) {
        patchRepo(repoId, { lastSyncAt: Date.now() })
        return false
      }
      const incoming = (res.data ?? [])
        .map((raw) => issueFromApi(raw, repoId))
        .filter((i): i is GithubIssue => i !== null)
      patchRepo(repoId, { lastSyncAt: Date.now(), etag: res.etag ?? repo.etag })
      ingestGithubIssues(incoming)
      // Leave room for interactive work rather than spending the last of the
      // budget on background polling.
      if (shouldPauseForRateLimit(githubIntegration.value.rateLimit)) {
        pauseGithubSync(
          resumeAtFor(githubIntegration.value.rateLimit, Date.now()),
          'GitHub rate limit low',
        )
      }
      return incoming.length > 0
    } catch (err) {
      const attempt = (ghFailures.get(repoId) ?? 0) + 1
      ghFailures.set(repoId, attempt)
      if (err instanceof GhRateLimitError) {
        handleGhError(err, '')
      } else {
        // Back off visibly rather than retrying into a wall every tick.
        pauseGithubSync(Date.now() + backoffDelay(attempt), 'GitHub sync failing')
        handleGhError(err, 'Could not sync issues from GitHub.')
      }
      return false
    }
  }

  // One tick of the fallback poller. Cheap when nothing is due: no I/O at all.
  async function pollGithubOnce(): Promise<void> {
    if (!canCallGithub()) return
    const due = reposDueForPoll(repos.value, Date.now())
    for (const repo of due) await refreshRepoIssues(repo.id)
  }

  function startGithubPolling() {
    if (ghPollTimer || !isGhConfigured()) return
    ghPollTimer = setInterval(() => {
      // A pause that has expired lifts itself, so sync resumes without the user
      // having to press anything.
      if (githubIntegration.value.pausedUntil !== null && !githubPaused.value) resumeGithubSync()
      void pollGithubOnce()
    }, POLL_TICK_MS)
  }
  function stopGithubPolling() {
    clearInterval(ghPollTimer)
    ghPollTimer = undefined
  }

  // ---- Repo reads (13e) ---------------------------------------------------
  // Recent commits, open PRs and branches for a repo card. Transient by design:
  // it is a live read, and a stale copy in the workspace document would be worse
  // than an empty card.
  interface RepoActivity {
    commits: RepoCommit[]
    pulls: RepoPull[]
    branches: string[]
    loading: boolean
    loadedAt: number
  }
  const repoActivity = ref<Record<string, RepoActivity>>({})

  function activityOf(repoId: string): RepoActivity {
    return (
      repoActivity.value[repoId] ?? {
        commits: [],
        pulls: [],
        branches: [],
        loading: false,
        loadedAt: 0,
      }
    )
  }
  function setActivity(repoId: string, patch: Partial<RepoActivity>) {
    repoActivity.value = {
      ...repoActivity.value,
      [repoId]: { ...activityOf(repoId), ...patch },
    }
  }

  async function loadRepoActivity(repoId: string, force = false): Promise<void> {
    const repo = repoById(repoId)
    if (!repo || !canCallGithub()) return
    const current = activityOf(repoId)
    if (current.loading) return
    // Five minutes is plenty fresh for a card nobody is staring at.
    if (!force && current.loadedAt && Date.now() - current.loadedAt < 5 * 60_000) return
    setActivity(repoId, { loading: true })
    try {
      const [commits, pulls, branches] = await Promise.all([
        ghCall<Record<string, unknown>[]>('commits', {
          owner: repo.owner,
          repo: repo.name,
          perPage: 5,
        }),
        ghCall<Record<string, unknown>[]>('pulls', { owner: repo.owner, repo: repo.name }),
        ghCall<{ name?: string }[]>('branches', { owner: repo.owner, repo: repo.name }),
      ])
      noteRateLimit(commits.rateLimit ?? pulls.rateLimit ?? branches.rateLimit)
      setActivity(repoId, {
        commits: (commits.data ?? []).map(commitFromApi).filter((c): c is RepoCommit => c !== null),
        pulls: (pulls.data ?? []).map(pullFromApi).filter((p): p is RepoPull => p !== null),
        branches: (branches.data ?? [])
          .map((b) => (typeof b?.name === 'string' ? b.name : ''))
          .filter(Boolean),
        loading: false,
        loadedAt: Date.now(),
      })
    } catch (err) {
      setActivity(repoId, { loading: false, loadedAt: Date.now() })
      handleGhError(err, 'Could not read repository activity.')
    }
  }

  // ---- Task ↔ issue (13c) -------------------------------------------------
  // The only writes that cross to GitHub are: create an issue from a task, patch
  // a linked issue's title/state, and close it with a comment. Labels and
  // assignees flow GitHub → Spasta only; comments do not sync in v1.

  function canCallGithub(): boolean {
    return githubConfigured.value && githubConnected.value && !githubPaused.value
  }

  // Debounced outbound patches, one timer per task, so a burst of keystrokes is
  // one request.
  const ghPushTimers = new Map<number, ReturnType<typeof setTimeout>>()
  function scheduleIssuePush(taskId: number) {
    const t = tasks.value.find((x) => x.id === taskId)
    if (!t?.github || !canCallGithub()) return
    clearTimeout(ghPushTimers.get(taskId))
    ghPushTimers.set(
      taskId,
      setTimeout(() => {
        ghPushTimers.delete(taskId)
        void pushTaskToIssue(taskId)
      }, 1200),
    )
  }

  // Push the task's side of the contract to GitHub. shouldPatchIssue is what
  // stops an inbound webhook write from bouncing straight back out again.
  async function pushTaskToIssue(taskId: number): Promise<void> {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task?.github || !canCallGithub()) return
    const parsed = parseRepoKey(task.github.repoId)
    if (!parsed) return
    const issue = issueByKey(issueKey(parsed.owner, parsed.name, task.github.issueNumber))
    if (!shouldPatchIssue(task, issue)) return
    const nextState = issueStateForTaskStatus(task.status)
    try {
      const res = await ghCall<Record<string, unknown>>('patchIssue', {
        owner: parsed.owner,
        repo: parsed.name,
        number: task.github.issueNumber,
        title: task.title,
        body: buildIssueBody(task.notes, taskUrl(location.origin, task.id), task.id),
        state: nextState,
      })
      noteRateLimit(res.rateLimit)
      // Closing gets a comment so the trail is readable on GitHub's side.
      if (nextState === 'closed' && issue?.state === 'open') {
        const commented = await ghCall('comment', {
          owner: parsed.owner,
          repo: parsed.name,
          number: task.github.issueNumber,
          body: CLOSED_VIA_SPASTA,
        })
        noteRateLimit(commented.rateLimit)
      }
      const updated = res.data ? issueFromApi(res.data, task.github.repoId) : null
      if (updated) ingestGithubIssues([updated])
      setTaskGithubLink(taskId, { ...task.github, state: nextState, syncedAt: Date.now() })
    } catch (err) {
      handleGhError(err, 'Could not update the GitHub issue.')
    }
  }

  function setTaskGithubLink(taskId: number, link: GithubLink | null) {
    tasks.value = tasks.value.map((t) => (t.id === taskId ? { ...t, github: link } : t))
  }

  // Create an issue from a task. Title from the task title, body from its notes
  // plus a backlink and the round-trip marker, labels default from the task's
  // tag and the assignee defaults to the connected user.
  async function createIssueFromTask(taskId: number, repoId: string): Promise<boolean> {
    const task = tasks.value.find((t) => t.id === taskId)
    const parsed = parseRepoKey(repoId)
    if (!task || !parsed) return false
    if (!canCallGithub()) {
      showToastMsg('Connect GitHub first')
      return false
    }
    try {
      const res = await ghCall<Record<string, unknown>>('createIssue', {
        owner: parsed.owner,
        repo: parsed.name,
        title: task.title,
        body: buildIssueBody(task.notes, taskUrl(location.origin, task.id), task.id),
        labels: task.tag ? [task.tag] : [],
        assignees: githubIntegration.value.login ? [githubIntegration.value.login] : [],
      })
      noteRateLimit(res.rateLimit)
      const issue = res.data ? issueFromApi(res.data, repoId) : null
      if (!issue) {
        ghError.value = 'GitHub accepted the issue but returned nothing usable.'
        return false
      }
      ghIssues.value = ingestIssues(ghIssues.value, [{ ...issue, linkedTaskId: task.id }])
      setTaskGithubLink(taskId, {
        repoId,
        issueNumber: issue.number,
        issueUrl: issue.htmlUrl,
        state: issue.state,
        syncedAt: Date.now(),
      })
      showToastMsg('Created #' + issue.number + ' in ' + fullName(repoId))
      return true
    } catch (err) {
      handleGhError(err, 'Could not create the GitHub issue.')
      return false
    }
  }

  // Link a task to an issue that already exists. The issue body is left exactly
  // as its author wrote it — the link lives on both records instead.
  function linkIssueToTask(taskId: number, issueId: string): boolean {
    const issue = issueByKey(issueId)
    const task = tasks.value.find((t) => t.id === taskId)
    if (!issue || !task) return false
    ghIssues.value = ghIssues.value.map((i) =>
      i.id === issueId ? { ...i, linkedTaskId: taskId } : i,
    )
    setTaskGithubLink(taskId, {
      repoId: issue.repoId,
      issueNumber: issue.number,
      issueUrl: issue.htmlUrl,
      state: issue.state,
      syncedAt: Date.now(),
    })
    // Adopt the issue's state immediately, so a task linked to a closed issue
    // does not sit open until the next webhook.
    syncIssuesToTasks()
    showToastMsg('Linked #' + issue.number)
    return true
  }

  // Unlink: the issue on GitHub is left completely alone.
  function unlinkIssueFromTask(taskId: number) {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task?.github) return
    const parsed = parseRepoKey(task.github.repoId)
    if (parsed) {
      const key = issueKey(parsed.owner, parsed.name, task.github.issueNumber)
      ghIssues.value = ghIssues.value.map((i) =>
        i.id === key && i.linkedTaskId === taskId ? { ...i, linkedTaskId: null } : i,
      )
    }
    clearTimeout(ghPushTimers.get(taskId))
    ghPushTimers.delete(taskId)
    setTaskGithubLink(taskId, null)
    showToastMsg('Unlinked from GitHub')
  }

  // Candidates for "Link existing issue": mirrored issues in linked repos,
  // matched by number or title, that no task has claimed yet.
  function linkableIssues(query: string, limit = 20): GithubIssue[] {
    const q = query.trim().toLowerCase()
    const linkedRepoIds = new Set(repos.value.map((r) => r.id))
    const claimed = new Set(
      tasks.value
        .filter((t) => t.github)
        .map((t) => `${t.github?.repoId}__${t.github?.issueNumber}`),
    )
    return ghIssues.value
      .filter((i) => linkedRepoIds.has(i.repoId) && !claimed.has(i.id) && i.linkedTaskId === null)
      .filter((i) => !q || String(i.number) === q || i.title.toLowerCase().includes(q))
      .slice(0, limit)
  }

  // Pull an issue in as a task, preserving the marker relationship so the next
  // sync links rather than duplicates (acceptance 58).
  function createTaskFromIssue(issueId: string): number | null {
    const issue = issueByKey(issueId)
    if (!issue || issue.linkedTaskId !== null) return null
    const repo = repoById(issue.repoId)
    const newId = addTask(issue.title || 'Issue #' + issue.number, repo?.name ?? '', {
      notes: stripSpastaFooter(issue.body),
      repo: repo?.fullName ?? fullName(issue.repoId),
      status: issue.state === 'closed' ? 'done' : 'pending',
      done: issue.state === 'closed',
      completedAt: issue.state === 'closed' ? issue.closedAt : null,
      github: {
        repoId: issue.repoId,
        issueNumber: issue.number,
        issueUrl: issue.htmlUrl,
        state: issue.state,
        syncedAt: Date.now(),
      },
    })
    if (newId == null) return null
    ghIssues.value = ghIssues.value.map((i) =>
      i.id === issueId ? { ...i, linkedTaskId: newId } : i,
    )
    return newId
  }

  // Bulk "Create tasks from selected issues" — skips anything already linked, so
  // running it twice cannot duplicate.
  function createTasksFromIssues(issueIds: string[]): number {
    let made = 0
    for (const issueId of issueIds) if (createTaskFromIssue(issueId) !== null) made++
    if (made) showToastMsg('Created ' + made + (made === 1 ? ' task' : ' tasks'))
    return made
  }

  // ---- Webhook ingestion (13f) --------------------------------------------
  // Deliveries land here already verified: the Cloud Function checks the
  // X-Hub-Signature-256 HMAC and rejects a mismatch before anything is written.
  // This side turns them into mirrored issues, repo metadata and the one narrow
  // task effect the spec allows — always through the section-3 sync guard.

  // Effects held back because their task's dialog was open when they arrived.
  // Replayed by flushTaskEdit once the dialog closes, so the webhook is neither
  // lost nor allowed to clobber the edit (acceptance 57).
  let deferredGhEffects: TaskEffect[] = []

  function applyTaskEffect(effect: TaskEffect) {
    const cur = tasks.value.find((t) => t.id === effect.taskId)
    if (!cur) return
    // GitHub wins for the issue fields it owns (state, url); the task's own
    // fields — goalIds, parentId, estimates — are never touched from here.
    const withLink: Task = { ...cur, github: { ...effect.link, syncedAt: Date.now() } }
    tasks.value = tasks.value.map((t) =>
      t.id === effect.taskId
        ? effect.status === cur.status
          ? withLink
          : withStatus(withLink, effect.status)
        : t,
    )
    if (effect.status === 'done' && cur.status !== 'done')
      cancelRemindersFor('tasks', effect.taskId)
  }

  // Reconcile every mirrored issue against its task. Called after a snapshot
  // hydrate and after any ingestion, so the two sides converge whichever path
  // the data arrived by.
  function syncIssuesToTasks() {
    const effects = effectsForIssues(ghIssues.value, tasks.value)
    if (!effects.length) return
    const { apply, deferred } = partitionEffects(effects, syncGuard.editingIds)
    for (const effect of apply) applyTaskEffect(effect)
    if (deferred.length) deferredGhEffects = mergeDeferred(deferredGhEffects, deferred)
  }

  // Replay whatever a webhook wanted to do to this task while its dialog was
  // open. The local edit has already been written by the time this runs.
  function replayDeferredGhEffects(taskId: number) {
    const mine = deferredGhEffects.filter((e) => e.taskId === taskId)
    if (!mine.length) return
    deferredGhEffects = deferredGhEffects.filter((e) => e.taskId !== taskId)
    for (const effect of mine) applyTaskEffect(effect)
  }

  function ingestGithubIssues(incoming: GithubIssue[]) {
    if (!incoming.length) return
    ghIssues.value = ingestIssues(ghIssues.value, incoming)
    patchIntegration({ lastSyncAt: Date.now() })
    syncIssuesToTasks()
  }

  function patchRepo(repoId: string, patch: Partial<LinkedRepo>) {
    repos.value = repos.value.map((r) => (r.id === repoId ? { ...r, ...patch } : r))
  }

  // Drain a batch of verified deliveries. Unknown events and deliveries for
  // repos this workspace has not linked are ignored rather than half-applied.
  function ingestGithubDeliveries(raw: unknown[]): number {
    const deliveries = (Array.isArray(raw) ? raw : []).filter(isGhDelivery)
    const issues: GithubIssue[] = []
    let applied = 0
    for (const delivery of deliveries) {
      if (!repoById(delivery.repoId)) continue
      applied++
      const issue = issueFromDelivery(delivery)
      if (issue) issues.push(issue)
      const repoPatch = repoPatchFromDelivery(delivery)
      if (repoPatch) patchRepo(delivery.repoId, repoPatch)
    }
    // A repo's label filter is a display filter, not an ingestion filter for
    // issues already mirrored: an issue that stops matching still needs its
    // final state, or a linked task would be stranded mid-flight.
    ingestGithubIssues(issues)
    return applied
  }

  function issuesOfRepo(repoId: string): GithubIssue[] {
    return ghIssues.value.filter((i) => i.repoId === repoId)
  }
  function issueByKey(issueId: string): GithubIssue | undefined {
    return ghIssues.value.find((i) => i.id === issueId)
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
    // Arm the sync guard for a task edit, snapshotting the base version the edit
    // starts from so incoming snapshots can be reconciled against it on close.
    if (type === 'task') {
      const t = tasks.value.find((x) => x.id === itemId)
      if (t) syncGuard.beginEdit(itemId, t)
    }
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
      reportError('[Aureon] Share snapshot sync failed:', error)
    })
  }

  // ---- Detail dialog (section 18) -----------------------------------------
  // One shared shell over two bodies. The store owns which frame is on screen
  // and the sync-guard bookkeeping around entering and leaving one; the router
  // sync and everything visual live in the components.
  //
  // Section 18e's ordering is the load-bearing part: leaving a frame FLUSHES its
  // local writes, THEN drains whatever the guard held back, THEN drops the id.
  // `leaveFrame` is the single place that happens, so every exit — close, back,
  // drill-in, prev/next — goes through it in the same order.
  //
  // Moving BETWEEN frames is bracketed by a transition token. Without it the
  // moment between leaving one frame and entering the next is a moment with no
  // dialog registered at all — and the guard would take that as its cue to drain
  // the held list, reordering the list underneath a reader who never left the
  // dialog. The token holds the freeze across the gap; ids are all positive, so
  // a negative one can never collide with a real item.
  const DETAIL_TRANSITION = -1
  function acrossFrames(move: () => void) {
    syncGuard.beginHold(DETAIL_TRANSITION)
    try {
      move()
    } finally {
      const held = syncGuard.releaseHold(DETAIL_TRANSITION)
      if (held) tasks.value = held
    }
  }
  function enterFrame(frame: DetailFrame) {
    if (frame.kind === 'task') {
      const t = tasks.value.find((x) => x.id === frame.id)
      if (t) syncGuard.beginEdit(frame.id, t)
      else syncGuard.beginHold(frame.id)
    } else {
      syncGuard.beginHold(frame.id)
    }
  }
  function leaveFrame(frame: DetailFrame | null) {
    if (!frame) return
    detailDirty.value = false
    if (frame.kind === 'task') {
      // Writes the local edit first, then lets the guard reconcile the buffered
      // remote against it (see flushTaskEdit).
      void flushTaskEdit(frame.id)
      return
    }
    // A goal has no per-field merge to do — its own writes already went through
    // updateGoal. Releasing the hold drains the task list held while the dialog
    // covered it, so the list catches up in one go rather than mid-read.
    const held = syncGuard.releaseHold(frame.id)
    if (held) tasks.value = held
  }

  const detailFrame = computed<DetailFrame | null>(() => topOf(detailStack.value))
  const detailOpen = computed(() => detailStack.value.length > 0)
  const detailCanGoBack = computed(() => canGoBack(detailStack.value))
  const detailParent = computed(() => parentFrame(detailStack.value))
  // Prev/next only at the root of the stack: two levels deep, "next" has no
  // meaning the reader could predict.
  const detailSteps = computed(() => {
    const frame = detailFrame.value
    if (!frame || detailStack.value.length > 1) return { prevId: null, nextId: null }
    return stepIds(detailSiblings.value, frame.id)
  })

  function openDetail(kind: DetailKind, itemId: number, siblings: number[] = []) {
    const next = { kind, id: itemId }
    if (sameFrame(detailFrame.value, next) && detailStack.value.length === 1) {
      detailSiblings.value = siblings.slice()
      return
    }
    acrossFrames(() => {
      leaveFrame(detailFrame.value)
      detailSiblings.value = siblings.slice()
      detailStack.value = openStack(next)
      enterFrame(next)
    })
  }
  // Drill in from inside the dialog (a subtask, an attached task, a breadcrumb).
  function pushDetail(kind: DetailKind, itemId: number) {
    const next = { kind, id: itemId }
    if (sameFrame(detailFrame.value, next)) return
    acrossFrames(() => {
      leaveFrame(detailFrame.value)
      detailStack.value = pushFrame(detailStack.value, next)
      enterFrame(next)
    })
  }
  // The back arrow. Popping the last frame closes the dialog.
  function popDetail() {
    if (!detailStack.value.length) return
    if (detailStack.value.length === 1) {
      closeDetail()
      return
    }
    acrossFrames(() => {
      leaveFrame(detailFrame.value)
      const rest = popFrame(detailStack.value)
      detailStack.value = rest
      const top = topOf(rest)
      if (top) enterFrame(top)
    })
  }
  // The prev/next arrows and j/k: same depth, sibling content.
  function stepDetail(itemId: number) {
    const frame = detailFrame.value
    if (!frame || frame.id === itemId) return
    const next = { kind: frame.kind, id: itemId }
    acrossFrames(() => {
      leaveFrame(frame)
      detailStack.value = replaceTop(detailStack.value, next)
      enterFrame(next)
    })
  }
  function closeDetail() {
    if (!detailStack.value.length) return
    // Frames below the top go first, so the top frame is the last one out and
    // its flush is the one that drains the held list — merged with the local
    // edit rather than applied over it.
    for (const frame of detailStack.value.slice(0, -1)) syncGuard.releaseHold(frame.id)
    leaveFrame(detailFrame.value)
    detailStack.value = []
    detailSiblings.value = []
    detailDirty.value = false
  }
  function setDetailDirty(value: boolean) {
    detailDirty.value = value
  }
  // The wide page. Opening one closes the dialog — they are two views of the
  // same goal, and leaving both up would leave the reader editing through a
  // dialog over a page showing the same fields.
  function openGoalPage(gid: number) {
    if (detailStack.value.length) closeDetail()
    goalPageId.value = gid
  }
  function closeGoalPage() {
    goalPageId.value = null
  }

  function openTaskDialog(tid: number, siblings: number[] = []) {
    openDetail('task', tid, siblings)
  }
  function openGoalDialog(gid: number, siblings: number[] = []) {
    openDetail('goal', gid, siblings)
  }
  function openReminderDialog(rid: number) {
    openEdit('reminder', rid)
  }
  function closeItemDialog() {
    const state = itemDialog.value
    if (!state) return
    // Flush a task edit before tearing down: local write first, then the guard
    // drains any held remote snapshot through the conflict rules.
    if (state.type === 'task' && state.mode === 'edit' && state.id != null) {
      void flushTaskEdit(state.id)
    }
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
    for (const itemId of itemIds)
      if (createReminderFromItem(collection, itemId, payload) != null) made++
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
      showToastMsg(
        'Reminder cancelled — ' + (collection === 'todos' ? 'todo' : 'task') + ' completed',
      )
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
      patchReminder(rid, {
        start: when,
        acknowledgedAt: null,
        lastFiredOcc: null,
        cancelledAt: null,
      })
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
        parentId: null,
        order: 0,
        depth: 0,
        rootId: newId,
        localRev: 0,
        updatedBy: uid ?? '',
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
        reportError('[Aureon] Calendar sync failed:', error)
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
      reportError('[Aureon] Calendar remove failed:', error)
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
      boards: boards.value,
      boardNodes: boardNodes.value,
      boardEdges: boardEdges.value,
      goals: goals.value,
      goalChecklist: goalChecklist.value,
      goalOccurrences: goalOccurrences.value,
      lastGoalGenDay: lastGoalGenDay.value,
      tags: tags.value,
      security: security.value,
      themeSetting: themeSetting.value,
      preferredDark: preferredDark.value,
      preferredLight: preferredLight.value,
      railCollapsed: railCollapsed.value,
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
      githubIntegration: githubIntegration.value,
      repos: repos.value,
      ghIssues: ghIssues.value,
      wallets: wallets.value,
      noteEditorMode: noteEditorMode.value,
      calendarView: calendarView.value,
      calendarFilters: calendarFilters.value,
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
    boards.value = []
    boardNodes.value = []
    boardEdges.value = []
    goals.value = []
    goalChecklist.value = []
    goalOccurrences.value = []
    lastGoalGenDay.value = ''
    tags.value = DEFAULT_TAGS.slice()
    security.value = emptySecurity()
    themeSetting.value = 'auto'
    preferredDark.value = 'deepSpace'
    preferredLight.value = 'daylight'
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
    githubIntegration.value = emptyGithubIntegration()
    repos.value = []
    ghIssues.value = []
    wallets.value = []
    noteEditorMode.value = 'split'
    calendarView.value = 'dayGridMonth'
    calendarFilters.value = defaultFilters()
    ghInstalled.value = null
    ghError.value = ''
    syncedSig.value = new Map()
    syncFromCache.value = false
    syncHasPending.value = false
    lastSyncedAt.value = null
    editing.value = { type: null, id: null }
    draft.value = {}
    noteView.value = null
    noteViewClosing.value = false
    // A detail dialog left open across a sign-out would point at an id that no
    // longer exists. Cleared directly rather than through closeDetail, which
    // would try to flush an edit into a workspace that has just been emptied.
    detailStack.value = []
    detailSiblings.value = []
    detailDirty.value = false
    goalPageId.value = null
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
    todos.value = stamped<Todo>(data.todos).map((t, i) => ({
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
      // Flat-hierarchy fields, backfilled for todos written before it existed:
      // top-level, keeping their stored list position as the order.
      parentId: typeof t.parentId === 'number' ? t.parentId : null,
      order: typeof t.order === 'number' ? t.order : i,
      depth: typeof t.depth === 'number' ? t.depth : 0,
      rootId: typeof t.rootId === 'number' ? t.rootId : t.id,
      localRev: typeof t.localRev === 'number' ? t.localRev : 0,
      updatedBy: typeof t.updatedBy === 'string' ? t.updatedBy : '',
      // Goal attachments (task 8), backfilled to [] for todos written before it.
      goalIds: Array.isArray(t.goalIds) ? t.goalIds.filter((n) => typeof n === 'number') : [],
      // Calendar scheduling (section 15), backfilled to unscheduled.
      ...scheduleFields(t),
    }))
    // Rollover fields arrived after tasks did; tasks stored before then read as
    // "never rolled over".
    const incomingTasks = stamped<Task>(data.tasks)
      .map(statused)
      .map((t, i) => ({
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
        // Flat-hierarchy fields, backfilled for tasks written before it existed:
        // no parent (top-level), keep their stored list position as the order,
        // depth 0 and rootId = own id. Live depth/rootId are recomputed by the
        // tree; these are just the denormalised cache.
        parentId: typeof t.parentId === 'number' ? t.parentId : null,
        order: typeof t.order === 'number' ? t.order : i,
        depth: typeof t.depth === 'number' ? t.depth : 0,
        rootId: typeof t.rootId === 'number' ? t.rootId : t.id,
        // Edit-safe sync bookkeeping, backfilled to a clean baseline.
        localRev: typeof t.localRev === 'number' ? t.localRev : 0,
        updatedBy: typeof t.updatedBy === 'string' ? t.updatedBy : '',
        // Goal attachments (task 8), backfilled to [].
        goalIds: Array.isArray(t.goalIds) ? t.goalIds.filter((n) => typeof n === 'number') : [],
        // GitHub link (section 13c), backfilled to null for tasks written
        // before the integration existed.
        github: githubLinkOf(t.github),
        // Calendar scheduling (section 15), backfilled to unscheduled.
        ...scheduleFields(t),
        // Detail-dialog meta (section 18c). Absent rather than defaulted where
        // "unset" is the meaningful state: a task with no assignee should read
        // as unassigned, not as assigned to the empty string.
        assignee: typeof t.assignee === 'string' ? t.assignee : '',
        priority: isPriority(t.priority) ? t.priority : 'normal',
        estimateMins: typeof t.estimateMins === 'number' ? t.estimateMins : null,
        spentMins: typeof t.spentMins === 'number' ? t.spentMins : 0,
        statusLog: statusLogOf(t.statusLog),
      }))
    // Edit-safe sync: a task whose dialog is open (or whose local edits are
    // unsaved) is protected — the guard holds the incoming version back rather
    // than clobbering it, and freezes the list order while a dialog is open so it
    // cannot reflow underneath. Everything else applies normally.
    tasks.value = syncGuard.reconcileTasks(tasks.value, incomingTasks)
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
    // Planning boards — flat board/node/edge records. Nodes being dragged or
    // edited are protected by the planning board's own guard, not here (this only
    // runs on a server-acked snapshot).
    boards.value = stamped<PlanningBoard>(data.boards).map((b) => ({
      ...b,
      name: typeof b.name === 'string' ? b.name : 'Board',
      type: b.type === 'freeform' ? 'freeform' : 'tree',
      layoutMode: b.layoutMode === 'tidy' ? 'tidy' : 'manual',
    }))
    boardNodes.value = stamped<PlanningNode>(data.boardNodes).map((n) => ({
      ...n,
      boardId: typeof n.boardId === 'number' ? n.boardId : 0,
      label: typeof n.label === 'string' ? n.label : '',
      notes: typeof n.notes === 'string' ? n.notes : '',
      kind: isNodeKind(n.kind) ? n.kind : 'idea',
      x: typeof n.x === 'number' ? n.x : 0,
      y: typeof n.y === 'number' ? n.y : 0,
      width: typeof n.width === 'number' ? n.width : 180,
      height: typeof n.height === 'number' ? n.height : 64,
      color: typeof n.color === 'string' ? n.color : '',
      linkedType: n.linkedType === 'task' || n.linkedType === 'todo' ? n.linkedType : null,
      linkedId: typeof n.linkedId === 'number' ? n.linkedId : null,
      localRev: typeof n.localRev === 'number' ? n.localRev : 0,
      updatedBy: typeof n.updatedBy === 'string' ? n.updatedBy : '',
    }))
    boardEdges.value = stamped<PlanningEdge>(data.boardEdges).map((e) => ({
      ...e,
      boardId: typeof e.boardId === 'number' ? e.boardId : 0,
      source: typeof e.source === 'number' ? e.source : 0,
      target: typeof e.target === 'number' ? e.target : 0,
      relation: isEdgeRelation(e.relation) ? e.relation : 'relates_to',
      label: typeof e.label === 'string' ? e.label : '',
    }))
    // Goals (task 8). Flat list; depth is always 0 (goals do not nest).
    const goalStatuses = ['active', 'paused', 'done', 'archived']
    goals.value = stamped<Goal>(data.goals).map((g, i) => ({
      ...g,
      title: typeof g.title === 'string' ? g.title : 'Goal',
      description: typeof g.description === 'string' ? g.description : '',
      status: goalStatuses.includes(g.status as string) ? (g.status as GoalStatus) : 'active',
      targetDate: typeof g.targetDate === 'string' ? g.targetDate : '',
      startDate: typeof g.startDate === 'string' ? g.startDate : '',
      color: typeof g.color === 'string' ? g.color : '',
      icon: typeof g.icon === 'string' ? g.icon : '',
      source: g.source === 'url-import' ? 'url-import' : 'manual',
      sourceUrl: typeof g.sourceUrl === 'string' ? g.sourceUrl : '',
      parentId: null,
      order: typeof g.order === 'number' ? g.order : i,
      depth: 0,
      rootId: typeof g.rootId === 'number' ? g.rootId : g.id,
      localRev: typeof g.localRev === 'number' ? g.localRev : 0,
      updatedBy: typeof g.updatedBy === 'string' ? g.updatedBy : '',
    }))
    const incomingChecklist = stamped<GoalChecklistItem>(data.goalChecklist).map((c, i) => ({
      ...c,
      goalId: typeof c.goalId === 'number' ? c.goalId : 0,
      text: typeof c.text === 'string' ? c.text : '',
      done: c.done === true,
      order: typeof c.order === 'number' ? c.order : (i + 1) * 1000,
      estimateMins: typeof c.estimateMins === 'number' ? c.estimateMins : null,
      spentMins: typeof c.spentMins === 'number' ? c.spentMins : 0,
      dueAt: typeof c.dueAt === 'string' ? c.dueAt : '',
      startAt: typeof c.startAt === 'string' ? c.startAt : '',
      tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === 'string') : [],
      startedAt: typeof c.startedAt === 'number' ? c.startedAt : null,
      completedAt: typeof c.completedAt === 'number' ? c.completedAt : null,
      timerStartedAt: typeof c.timerStartedAt === 'number' ? c.timerStartedAt : null,
      localRev: typeof c.localRev === 'number' ? c.localRev : 0,
    }))
    // SYNC: keep the local copy of any checklist item being inline-edited or with
    // a live timer, so a remote snapshot can't reorder or clobber it mid-edit.
    const heldItems = new Map(
      goalChecklist.value
        .filter((c) => syncGuard.editingIds.has(c.id) || c.timerStartedAt != null)
        .map((c) => [c.id, c]),
    )
    goalChecklist.value = heldItems.size
      ? [
          ...incomingChecklist.map((c) => heldItems.get(c.id) ?? c),
          ...[...heldItems.values()].filter((c) => !incomingChecklist.some((x) => x.id === c.id)),
        ]
      : incomingChecklist
    // Recurring-goal occurrences (task 11). Sanitise, then preserve any occurrence
    // the capture popover is mid-entry on (in the guard's editingIds) so a remote
    // snapshot can't overwrite the number being typed.
    const incomingOccurrences = stamped<GoalOccurrence>(data.goalOccurrences).map((o) => ({
      ...o,
      goalId: typeof o.goalId === 'number' ? o.goalId : 0,
      date: typeof o.date === 'string' ? o.date : '',
      status:
        o.status === 'done' || o.status === 'missed' || o.status === 'skipped'
          ? o.status
          : ('pending' as GoalOccurrence['status']),
      target: typeof o.target === 'number' ? o.target : 0,
      actual: typeof o.actual === 'number' ? o.actual : null,
      note: typeof o.note === 'string' ? o.note : null,
      completedAt: typeof o.completedAt === 'number' ? o.completedAt : null,
      localRev: typeof o.localRev === 'number' ? o.localRev : 0,
      updatedBy: typeof o.updatedBy === 'string' ? o.updatedBy : '',
    }))
    const heldOccurrences = new Map(
      goalOccurrences.value.filter((o) => syncGuard.editingIds.has(o.id)).map((o) => [o.id, o]),
    )
    goalOccurrences.value = heldOccurrences.size
      ? [
          ...incomingOccurrences.map((o) => heldOccurrences.get(o.id) ?? o),
          ...[...heldOccurrences.values()].filter(
            (o) => !incomingOccurrences.some((x) => x.id === o.id),
          ),
        ]
      : incomingOccurrences
    // Workspaces written before tags existed have none stored. Rather than
    // leaving the pickers empty, seed them from the tags already in use and
    // fall back to the defaults for a workspace that has none of those either.
    const stored = sanitizeTags(data.tags)
    let vocab = stored.length ? stored : DEFAULT_TAGS.slice()
    for (const item of [...todos.value, ...tasks.value, ...ideas.value, ...stocks.value])
      vocab = withTag(vocab, item.tag || '')
    tags.value = vocab
    security.value =
      data.security && typeof data.security === 'object'
        ? { ...emptySecurity(), ...(data.security as Partial<SecuritySettings>) }
        : emptySecurity()
    // Guard the stored value: a theme key removed in a later release must not
    // leave the ui store indexing THEMES with a key that no longer exists.
    themeSetting.value = isThemeSetting(data.themeSetting) ? data.themeSetting : 'auto'
    // Only accept a stored preference whose family still matches (and isn't a
    // special theme), so the quick toggle can never land on the wrong mode.
    preferredDark.value =
      isThemeKey(data.preferredDark) &&
      THEMES[data.preferredDark].group === 'dark' &&
      !THEMES[data.preferredDark].noGlass
        ? data.preferredDark
        : 'deepSpace'
    preferredLight.value =
      isThemeKey(data.preferredLight) && THEMES[data.preferredLight].group === 'light'
        ? data.preferredLight
        : 'daylight'
    railCollapsed.value = data.railCollapsed === true
    autoRollover.value = data.autoRollover === true
    lastAutoRolloverDay.value =
      typeof data.lastAutoRolloverDay === 'string' ? data.lastAutoRolloverDay : ''
    lastGoalGenDay.value = typeof data.lastGoalGenDay === 'string' ? data.lastGoalGenDay : ''
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
    // GitHub integration (section 13). Every field goes through a strict
    // sanitiser rather than a spread, so nothing unexpected — least of all
    // anything token-shaped — can ride in from a stored document.
    githubIntegration.value = sanitizeIntegration(data.githubIntegration)
    repos.value = Array.isArray(data.repos)
      ? data.repos.map(sanitizeRepo).filter((r): r is LinkedRepo => r !== null)
      : []
    ghIssues.value = Array.isArray(data.ghIssues)
      ? data.ghIssues.map(sanitizeIssue).filter((i): i is GithubIssue => i !== null)
      : []
    // Wallets. Every field is checked on read: an unknown chain, or an address
    // that no longer validates, is dropped rather than shown as if it were fine.
    wallets.value = stamped<Wallet>(data.wallets)
      .filter((w) => isChainKey(w.chain) && typeof w.address === 'string' && w.address.length > 0)
      .map((w, i) => ({
        ...w,
        label: typeof w.label === 'string' ? w.label : '',
        network: w.network === 'testnet' ? 'testnet' : 'mainnet',
        memoTag: typeof w.memoTag === 'string' && w.memoTag ? w.memoTag : null,
        isDefault: w.isDefault === true,
        order: typeof w.order === 'number' ? w.order : i,
        notes: typeof w.notes === 'string' ? w.notes : '',
        balanceEnabled: w.balanceEnabled === true,
        balance: w.balance && typeof w.balance === 'object' ? w.balance : null,
      }))

    // Calendar preferences: the last view and the filter chips.
    noteEditorMode.value = isNoteEditorMode(data.noteEditorMode) ? data.noteEditorMode : 'split'
    calendarView.value = isCalendarView(data.calendarView) ? data.calendarView : 'dayGridMonth'
    calendarFilters.value =
      data.calendarFilters && typeof data.calendarFilters === 'object'
        ? { ...defaultFilters(), ...(data.calendarFilters as Partial<CalendarFilters>) }
        : defaultFilters()

    // A snapshot may carry issues a webhook mirrored while this client was
    // away; reconcile them with their tasks through the sync guard.
    syncIssuesToTasks()
    bumpNid()
    // Release the hydration guard after the reactive writes settle.
    setTimeout(() => {
      hydrating = false
    }, 0)
  }
  function saveCloud() {
    const cloud = firestoreReady()
    if (!firebaseEnabled || !cloud || !uid || hydrating || !cloudReady.value) return
    const ref = cloud.fs.doc(cloud.db, AUREON_COLLECTION, uid)
    syncState.value = 'saving'
    cloud.fs
      .setDoc(ref, { ...snapshotData(), ownerId: uid, updatedAt: Date.now() }, { merge: true })
      .then(() => {
        syncState.value = 'synced'
      })
      .catch((error) => {
        syncState.value = 'error'
        cloudError.value = 'Could not save changes to Firebase.'
        reportError('[Aureon] Cloud save failed:', error)
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
    const cloud = firestoreReady()
    if (!firebaseEnabled || !cloud || !uid || hydrating || !cloudReady.value)
      return Promise.resolve()
    const ref = cloud.fs.doc(cloud.db, AUREON_COLLECTION, uid)
    clearTimeout(saveTimer)
    syncState.value = 'saving'
    return cloud.fs
      .setDoc(ref, { ...snapshotData(), ownerId: uid, updatedAt: Date.now() }, { merge: true })
      .then(() => {
        syncState.value = 'synced'
      })
      .catch((error) => {
        syncState.value = 'error'
        cloudError.value = 'Could not save changes to Firebase.'
        reportError('[Aureon] Cloud save failed:', error)
        throw error
      })
  }

  async function connectCloud(u: FbUser | null) {
    if (cloudUnsub) {
      cloudUnsub()
      cloudUnsub = null
    }
    clearTimeout(saveTimer)
    stopGithubPolling()
    cloudReady.value = false
    cloudError.value = ''
    syncState.value = 'idle'
    uid = u && isFirebaseUserAllowed(u) ? u.uid : null
    resetData()
    if (!uid) return
    // Sign-in is where Firestore is first genuinely needed, so this is where it
    // is fetched. Everything below runs after the SDK has landed.
    const cloud = await loadFirestore()
    if (!cloud) return
    const { db, fs } = cloud
    const ref = fs.doc(db, AUREON_COLLECTION, uid)
    try {
      const snap = await fs.getDoc(ref)
      if (snap.exists()) applyData(snap.data())
      else {
        // A brand-new workspace: seed the two default bots so the Bots tab has
        // something to show, then write the first document.
        bots.value = seedBots(id, Date.now())
        await fs.setDoc(ref, { ...snapshotData(), ownerId: uid, updatedAt: Date.now() })
      }
      // Baseline the acknowledged signature so nothing reads as pending on load.
      captureSyncedBaseline()
      cloudReady.value = true
      syncState.value = 'synced'
      // Once hydration settles (applyData releases the guard on the next tick),
      // run the auto-rollover if it is enabled and hasn't run today, and lazily
      // materialise recurring-goal occurrences for today + the next 7 days.
      setTimeout(() => {
        void runAutoRolloverIfDue()
        runGoalGenerationIfDue()
        // Webhooks are primary; this is the every-10-minutes conditional
        // fallback for a delivery that never arrived.
        startGithubPolling()
      }, 0)
    } catch (error) {
      cloudError.value = 'Could not load your Firebase data.'
      syncState.value = 'error'
      reportError('[Aureon] Cloud load failed:', error)
      return
    }
    // Live updates from other devices. includeMetadataChanges so the pending /
    // fromCache transitions (which carry no data change) still wake the pill.
    cloudUnsub = fs.onSnapshot(
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
        reportError('[Aureon] Cloud listener failed:', error)
      },
    )
  }

  // Re-run the connect for whoever is currently signed in, so a transient
  // Firestore failure does not strand the user on the error card.
  async function retryCloud() {
    await connectCloud(auth?.currentUser ?? null)
  }

  if (firebaseEnabled && auth) {
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
        boards,
        boardNodes,
        boardEdges,
        goals,
        goalChecklist,
        goalOccurrences,
        security,
        themeSetting,
        preferredDark,
        preferredLight,
        railCollapsed,
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
        githubIntegration,
        repos,
        ghIssues,
        wallets,
        noteEditorMode,
        calendarView,
        calendarFilters,
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
    preferredDark,
    preferredLight,
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
    githubIntegration,
    repos,
    ghIssues,
    ghInstalled,
    ghBusy,
    ghError,
    githubConnected,
    githubConfigured,
    githubPaused,
    githubInstallUrl,
    connectGithub,
    disconnectGithub,
    loadInstalledRepos,
    repoById,
    linkRepo,
    unlinkRepo,
    toggleRepoLink,
    setRepoSync,
    setRepoLabelFilter,
    wallets,
    walletsByChain,
    walletById,
    defaultWalletFor,
    noteEditorMode,
    setNoteEditorMode,
    noteSearch,
    calendarView,
    calendarFilters,
    beginCalendarDrag,
    endCalendarDrag,
    rescheduleItem,
    rescheduleMany,
    duplicateScheduled,
    rescheduleReminder,
    createScheduledItem,
    unscheduleItem,
    setCalendarView,
    setCalendarFilters,
    addWallet,
    updateWallet,
    removeWallet,
    moveWallet,
    setDefaultWallet,
    setWalletBalanceEnabled,
    fetchWalletBalance,
    repoActivity,
    activityOf,
    refreshRepoIssues,
    pollGithubOnce,
    startGithubPolling,
    stopGithubPolling,
    loadRepoActivity,
    createIssueFromTask,
    linkIssueToTask,
    unlinkIssueFromTask,
    linkableIssues,
    createTaskFromIssue,
    createTasksFromIssues,
    pushTaskToIssue,
    ingestGithubIssues,
    ingestGithubDeliveries,
    syncIssuesToTasks,
    issuesOfRepo,
    issueByKey,
    pauseGithubSync,
    resumeGithubSync,
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
    patchTask,
    duplicateTask,
    archiveTask,
    convertTaskToGoalPoint,
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
    archiveCompleted,
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
    setDragId,
    dropOnTask,
    dropOnGroup,
    moveTask,
    moveTodo,
    remoteTaskVersion,
    dismissTaskConflict,
    // planning boards
    boards,
    boardNodes,
    boardEdges,
    addBoard,
    renameBoard,
    setBoardLayoutMode,
    deleteBoard,
    nodesOfBoard,
    edgesOfBoard,
    nodeById,
    tidyBoard,
    addNode,
    updateNode,
    moveNode,
    moveNodes,
    removeNode,
    addEdge,
    updateEdgeRelation,
    removeEdge,
    convertNodeToTask,
    convertNodeToTodo,
    linkNode,
    unlinkNode,
    // goals (task 8)
    goals,
    goalChecklist,
    goalOccurrences,
    // recurring occurrences (task 11)
    defaultRecurrence,
    defaultMetric,
    syncGoalReminders,
    occurrencesOf,
    occurrenceOn,
    goalToday,
    todayOccurrence,
    generateOccurrences,
    runGoalGenerationIfDue,
    captureOccurrence,
    skipOccurrence,
    markOccurrenceMissed,
    toggleOccurrenceDone,
    updateOccurrenceActual,
    occurrenceOutcome,
    addGoal,
    updateGoal,
    setGoalStatus,
    moveGoal,
    deleteGoal,
    goalById,
    checklistOf,
    addChecklistItem,
    updateChecklistItem,
    toggleChecklistItem,
    deleteChecklistItem,
    moveChecklistItem,
    startChecklistTimer,
    stopChecklistTimer,
    attachToGoal,
    detachFromGoal,
    createTaskInGoal,
    createTodoInGoal,
    tasksOfGoal,
    todosOfGoal,
    goalProgress,
    goalCounts,
    goalTime,
    goalBySourceUrl,
    importGoals,
    importGoalsDocument,
    exportGoal,
    archiveGoal,
    unarchiveGoal,
    setGoalTimeline,
    setGoalColor,
    reorderGoal,
    duplicateGoal,
    removeGoalWithUndo,
    bulkAddChecklist,
    saveCloudNow,
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
    openGoalDialog,
    openReminderDialog,
    // Detail dialog (section 18).
    detailStack,
    detailSiblings,
    detailDirty,
    detailFrame,
    detailOpen,
    detailCanGoBack,
    detailParent,
    detailSteps,
    goalPageId,
    openGoalPage,
    closeGoalPage,
    openDetail,
    pushDetail,
    popDetail,
    stepDetail,
    closeDetail,
    setDetailDirty,
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
