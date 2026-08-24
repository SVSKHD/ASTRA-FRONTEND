// Domain types for Aureon.
import type { Recurrence } from './utils/recurrence'
import type { ChainKey, Network } from './utils/chains'
import type { Metric, Occurrence } from './utils/goalMetrics'
import type { Attachment } from './utils/attachments'

export type { Recurrence } from './utils/recurrence'
export type { ChainKey, Network } from './utils/chains'
export type { Metric, Occurrence, MetricDirection, MetricUnit } from './utils/goalMetrics'
// Re-exported from the util that owns the limits, so the model and the rules
// that police it cannot end up describing two different things.
export type { Attachment } from './utils/attachments'

export type TabKey =
  | 'overview'
  | 'todo'
  | 'tasks'
  | 'planning'
  | 'deadlines'
  | 'reminders'
  | 'finances'
  | 'trips'
  | 'ideas'
  | 'stocks'
  | 'ai'
  | 'bots'
  | 'goals'
  | 'github'
  | 'wallets'
  | 'calendar'

// Every stored item carries these. Items written before timestamps existed have
// neither, so applyData() backfills them to 0 — which the formatter renders as
// "Unknown" rather than pretending everything was created at the epoch.
export interface Timestamped {
  createdAt: number
  updatedAt: number
}

// ---- AI chat (Part A) -----------------------------------------------------
// The available models. `id` is what the aiProxy Cloud Function forwards to the
// Anthropic API; the label is what the header dropdown and the per-message badge
// show. Kept as data so adding a model later is one line.
export interface AiModel {
  id: string
  label: string
}
export const AI_MODELS: AiModel[] = [
  { id: 'claude-opus-4-6', label: 'Opus' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku' },
]
export type AiRole = 'user' | 'assistant'
export interface AiMessage {
  id: number
  role: AiRole
  content: string
  // The model that produced an assistant message (badge). Absent on user turns.
  model?: string
  tokensIn?: number
  tokensOut?: number
  createdAt: number
}
export interface AiChat {
  id: number
  title: string
  model: string
  pinned: boolean
  messages: AiMessage[]
  createdAt: number
  updatedAt: number
}

// ---- Trading bots (Part B) ------------------------------------------------
// The app is a control surface: it reads everything the bot process writes and
// only ever flips `enabled`. Mode 'live' is real money; the toggle for it is
// gated behind a name-typed confirm.
export type BotMode = 'paper' | 'demo' | 'live'
export type BotStatus = 'running' | 'stopped' | 'error' | 'stale'
export interface BotPosition {
  ticket: string
  direction: 'buy' | 'sell'
  lot: number
  entry: number
  current: number
  floatingPl: number
  sl: number
  // Hedge/basket layer tag (H1/H2/H3) where applicable.
  layer?: string
}
export interface BotBasket {
  open: boolean
  layers: number
  floatingTotal: number
  stop: number
  openedAt: number | null
}
export interface Bot {
  id: number
  name: string
  symbol: string
  engine: string
  lot: number
  enabled: boolean
  // UI-only: set while a toggle waits for the bot's next heartbeat to confirm,
  // so we never claim a bot is off before it says so.
  pending?: boolean
  mode: BotMode
  status: BotStatus
  heartbeatAt: number
  version: string
  lastError: string
  // Today's figures, written by the bot process.
  realizedPl: number
  floatingPl: number
  tradeCount: number
  winRate: number
  dailyLossUsed: number
  dailyLossCap: number
  positions: BotPosition[]
  basket: BotBasket | null
  equityCurve: number[]
  phase: string
  phaseRemaining: string
  blackout: boolean
  config: Record<string, unknown>
  configFrozenAt: number
}

// Todos and tasks share one three-state lifecycle so both lists can be read the
// same way. `done` is kept alongside it — shares, the GitHub panel and the
// public share page all still speak the boolean — and is always
// `status === 'done'`; the store is the only place allowed to set them apart.
export type ItemStatus = 'pending' | 'progress' | 'done'

export const STATUS_CYCLE: ItemStatus[] = ['pending', 'progress', 'done']

export const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: 'Pending',
  progress: 'In progress',
  done: 'Done',
}

export function isStatus(v: unknown): v is ItemStatus {
  return v === 'pending' || v === 'progress' || v === 'done'
}

// A reference to another linkable item. Links are stored as {id, collection}
// objects (not bare ids) so a todo can link a task and vice versa. `linked`
// are the children an item depends on / is composed of; `parents` are the
// reverse pointers, maintained on every link/unlink write.
export type LinkCollection = 'todos' | 'tasks'
export interface LinkRef {
  id: number
  collection: LinkCollection
}

// A cross-collection back-pointer used by the todo↔reminder bridge: a reminder
// created from a todo carries a sourceRef into 'todos'|'tasks', and a todo
// created from a reminder carries one into 'reminders'. Unlike LinkRef it can
// span the reminder collection, so it is its own type rather than a widened
// LinkRef. Null when the item was created directly.
export type SourceCollection = 'todos' | 'tasks' | 'reminders' | 'goals'
export interface SourceRef {
  collection: SourceCollection
  id: number
}

// Both linkable item types carry these; backfilled to [] / null on read.
export interface Linkable {
  linked: LinkRef[]
  parents: LinkRef[]
}

// Flat any-depth hierarchy shared by todos and tasks (see utils/taskTree). Every
// item is a flat record; the tree is rebuilt in memory from parentId.
// parentId === null is top-level. order is a fractional sort key within a sibling
// group so a reparent writes one field, not the whole group. depth (0 at root)
// and rootId (the top-level ancestor's id, its own when top-level) are
// denormalised for render speed and recomputed on every reparent. localRev
// increments on every local write so a stale in-flight write can be recognised;
// updatedBy records the last writer. hasConflict is set when a remote snapshot
// that landed mid-edit changed a field the user was also editing. All are
// backfilled on read for items written before the hierarchy existed.
export interface Hierarchical {
  parentId: number | null
  order: number
  depth: number
  rootId: number
  localRev: number
  updatedBy: string
  hasConflict?: boolean
}

// Calendar scheduling (section 15), carried by both tasks and todos. `startAt`
// and `endAt` are epoch ms; `allDay` marks a date-only item; `durationMins` is
// derived from start/end and stored so a render does not have to recompute it.
// A task's existing `deadline` (YYYY-MM-DD) remains its due date and is
// unchanged — an item with a deadline but no startAt renders as an all-day chip
// on that day. All four are absent on items written before the calendar existed
// and are backfilled on read.
export interface Schedulable {
  startAt?: number | null
  endAt?: number | null
  allDay?: boolean
  durationMins?: number | null
}

// Items written before status existed only carry `done`.
export function statusFromDone(done: unknown): ItemStatus {
  return done === true ? 'done' : 'pending'
}

// Public-share fields carried by any item that can be made shareable. They live
// on the item itself so the toggle survives a refresh; a signed-out reader never
// sees them (they only read the frozen mirror doc, not the workspace). Added
// after the first release, so applyData() backfills them on read.
//
// `shareId` is a nanoid minted once on first enable and reused afterwards, so a
// link handed out stays valid across toggles — it is nulled only by "Stop
// sharing", after which the next enable mints a fresh one.
export interface Shareable {
  isPublic: boolean
  shareId: string | null
  sharedAt: number | null
}

export interface Todo extends Timestamped, Shareable, Linkable, Hierarchical, Schedulable {
  id: number
  text: string
  done: boolean
  status: ItemStatus
  // Added after the first release; todos stored before that lack both, so
  // applyData() backfills them on read.
  tag: string
  description: string
  // When the todo last entered `done` (for month-fulfilment counting); null
  // while not done. Backfilled on read.
  completedAt: number | null
  // "Move pending to today" carries an overdue todo forward. Todos have no due
  // date — their day is their createdAt — so a move re-stamps createdAt to
  // today; rolledOverAt/rolloverCount record that, mirroring Task. Backfilled
  // on read for todos written before these existed.
  rolledOverAt: number | null
  rolloverCount: number
  // Reminders spawned from this todo (the "Remind me" bell). The reminder docs
  // point back via their own sourceRef; this is the forward index so the row can
  // show a bell chip and completing the todo can cancel them. Backfilled to [].
  reminderIds: number[]
  // Set when this todo was created from a reminder ("Create todo from this");
  // null otherwise. Backfilled on read.
  sourceRef: SourceRef | null
  // Set by "Clear completed": the item is hidden from the list but not deleted,
  // so it still counts in Overview and Calendar. Absent = live.
  archivedAt?: number | null
  // Back-references to planning-board nodes/relations, so a board relation is
  // navigable from the item too. Absent on items with no board relations.
  graphRefs?: GraphRef[]
  // Goals this todo is attached to (task 8). Attachment is by reference — the
  // todo stays in its own list and may belong to several goals at once. Absent
  // when unattached; backfilled to [] on read.
  goalIds?: number[]
  // Notes attached to this todo (section 21a), referenced never copied. The
  // note carries the matching entry in its own `attachedTo`. Absent = none.
  noteIds?: number[]
}

export interface Task extends Timestamped, Linkable, Hierarchical, Schedulable {
  id: number
  title: string
  tag: string
  done: boolean
  status: ItemStatus
  deadline: string // YYYY-MM-DD, '' = no date
  notes: string
  repo: string // owner/repo, '' = none
  // Set by "Move pending to today" when an overdue task's deadline is rolled
  // forward. rolloverCount records how many times it has been carried over —
  // a gentle signal that a task keeps slipping. Both are absent on tasks that
  // have never been rolled, so applyData() backfills them.
  rolledOverAt: number | null
  rolloverCount: number
  // When the task last entered `done` (for month-fulfilment counting); null
  // while not done. Backfilled on read.
  completedAt: number | null
  // Reminders spawned from this task, mirroring Todo.reminderIds. Backfilled.
  reminderIds: number[]
  // Set when this task was created from a reminder; null otherwise. Backfilled.
  sourceRef: SourceRef | null
  // Set by "Clear completed" (archive, not delete). Absent = live.
  archivedAt?: number | null
  // Back-references to planning-board nodes/relations. Absent when none.
  graphRefs?: GraphRef[]
  // Goals this task is attached to (task 8). See Todo.goalIds.
  goalIds?: number[]
  // The GitHub issue this task is linked to (section 13c), or null when
  // unlinked. Backfilled to null on read for tasks written before it existed.
  github?: GithubLink | null
  // ---- Detail-dialog fields (section 18c) ---------------------------------
  // The meta row of the task detail dialog. All optional and all backfilled on
  // read, so a task written before the dialog existed simply has none of them
  // set rather than reading as assigned to nobody in particular.
  // Free text rather than a user id: this is a single-user workspace, and the
  // field is for "who owes me this", not an account.
  assignee?: string
  priority?: Priority
  // Planned vs accumulated minutes, mirroring GoalChecklistItem. null estimate =
  // no estimate given, which is different from an estimate of zero.
  estimateMins?: number | null
  spentMins?: number
  // Status transitions, newest last, for the activity section. Capped when
  // written — this is a readable history, not an audit log, and it rides in the
  // one workspace document with everything else.
  statusLog?: StatusChange[]
  // Notes attached to this task (section 21a). See Todo.noteIds.
  noteIds?: number[]
}

// One entry in a task's status history (section 18c).
export interface StatusChange {
  at: number
  status: ItemStatus
}
// Kept short deliberately: the activity section shows the recent shape of a
// task's life, and an unbounded array in a single-document store is a slow leak.
export const STATUS_LOG_LIMIT = 20

// ---- Goals (task 8) -------------------------------------------------------
// A goal is a container that sits above tasks/todos: it holds its own checklist
// items and can have existing tasks/todos attached to it by reference (via their
// goalIds). Progress rolls up from checklist items + attached items and is
// computed client-side — never persisted. In this single-workspace-document app
// the goal's checklist lives as a flat GoalChecklistItem[] array keyed by goalId
// (adapting the spec's /goals/{id}/checklist subcollection), and progress /
// counts are derived from the live lists rather than stored counters.
export type GoalStatus = 'active' | 'paused' | 'done' | 'archived'
export type GoalSource = 'manual' | 'url-import'

export interface Goal extends Timestamped, Hierarchical {
  id: number
  title: string
  description: string
  status: GoalStatus
  // ISO YYYY-MM-DD, '' = unset.
  targetDate: string
  startDate: string
  color: string
  icon: string
  source: GoalSource
  // The original import link, for traceability + idempotent re-import merge.
  sourceUrl: string
  // Recurring-goal config (task 11). Absent/​disabled = a one-off goal. When
  // enabled the goal generates dated occurrences and fires a daily reminder.
  recurrence?: Recurrence
  // Numeric target captured per occurrence (task 11). Absent/​disabled = the
  // occurrence checkbox behaves as a plain tick with no capture prompt.
  metric?: Metric
  // Reminder ids registered for a recurring goal (task 11): the daily fire time
  // reminder and the optional end-of-day nudge. Managed by syncGoalReminders.
  reminderIds?: number[]
  // Notes attached to this goal (section 21a). See Todo.noteIds.
  noteIds?: number[]
}

// One dated instance of a recurring goal (task 11). The doc id IS the local date
// string, so generation is idempotent and multi-device sync can't duplicate a
// day. In this single-workspace-document app occurrences live as a flat array
// keyed by (goalId, date). `target` is snapshotted at generation time so later
// edits to the goal's metric don't rewrite history.
export interface GoalOccurrence extends Occurrence, Timestamped {
  // A local numeric handle (for the sync guard + list keys). Identity for
  // idempotent generation is the (goalId, date) pair, enforced at generation
  // time — never create a second occurrence for the same goal+date.
  id: number
  goalId: number
  completedAt: number | null
  localRev: number
  updatedBy: string
}

export interface GoalChecklistItem extends Timestamped {
  id: number
  goalId: number
  text: string
  done: boolean
  order: number
  // Planned vs accumulated time, in minutes. estimateMins null = no estimate.
  estimateMins: number | null
  spentMins: number
  // ISO YYYY-MM-DD, '' = no due date. dueAt doubles as the point timeline's
  // target; startAt is the point timeline's planned start (both '' = unset). These
  // let a point round-trip the JSON `timeline: { start, target }` shape losslessly.
  dueAt: string
  startAt: string
  // Free-form tags carried on the point, preserved across JSON import/export.
  tags: string[]
  startedAt: number | null
  completedAt: number | null
  // Set while the built-in timer is running (epoch ms); null when stopped. On
  // stop, elapsed minutes are folded into spentMins. Not counted as an edit.
  timerStartedAt: number | null
  localRev: number
}

export interface Deadline extends Timestamped {
  id: number
  title: string
  due: string // YYYY-MM-DD
}

export type RepeatType =
  'none' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years' | 'weekdays'

export interface Repeat {
  type: RepeatType
  n?: number
  weekdays?: number[] // 0=Sun..6=Sat
}

export type CalSync = 'local' | 'pending' | 'synced' | 'error'

export type Priority = 'low' | 'normal' | 'high'

// Highest first, for sorting the reminders list.
export const PRIORITY_ORDER: Record<Priority, number> = { high: 0, normal: 1, low: 2 }

export interface Reminder extends Timestamped {
  id: number
  title: string
  note: string
  start: string // datetime-local value (YYYY-MM-DDTHH:mm)
  repeat: Repeat
  priority: Priority
  calSync: CalSync
  // Google Calendar event id, set once the event is actually created. Required
  // to delete the event later — a template URL never returns one.
  calEventId: string | null
  lastFiredOcc: number | null
  // When the user last acknowledged (dismissed) this reminder's notification —
  // the "fulfilled" signal for the monthly overview. Null until acknowledged.
  acknowledgedAt: number | null
  // Set when this reminder was created from a todo/task ("Remind me"); the row
  // shows a "from Todo: …" chip linking back, and completing that todo cancels
  // this reminder. Null for a directly-created reminder. Backfilled on read.
  sourceRef: SourceRef | null
  // A reminder whose future occurrences have been cancelled (source todo
  // completed, or "Skip" pressed) — it stops firing and drops out of Up next but
  // is kept so Undo/history still resolve it. Backfilled to false.
  cancelledAt: number | null
}

// Ideas carry an editable type. These are the suggested values; the store keeps
// it a plain string so a typed-in type is preserved rather than dropped.
export type IdeaType = 'app' | 'business' | 'content' | 'feature' | 'experiment'

export const IDEA_TYPE_OPTIONS: { value: IdeaType; label: string }[] = [
  { value: 'app', label: 'App' },
  { value: 'business', label: 'Business' },
  { value: 'content', label: 'Content' },
  { value: 'feature', label: 'Feature' },
  { value: 'experiment', label: 'Experiment' },
]

export interface Idea extends Timestamped {
  id: number
  title: string
  description: string
  deadline: string // YYYY-MM-DD, '' = none
  ideaType: string // one of IdeaType, or a user-typed value
  tag: string
  // References into notes[] — a note is attached by id, never copied.
  noteIds: number[]
}

export interface Stock extends Timestamped {
  id: number
  symbol: string
  name: string
  why: string // why-tracking notes
  targetPrice: number
  watchPrice: number
  tag: string
  noteIds: number[]
}

export type FinanceCategory = 'Food' | 'Transport' | 'Bills' | 'Fun' | 'Other'

export interface Finance extends Timestamped {
  id: number
  amount: number
  category: FinanceCategory | string
  note: string
  date: string // YYYY-MM-DD
}

// Monthly-income settings for the expenses view. Income is tracked per month
// (keyed 'YYYY-MM') so a raise mid-year does not retroactively rewrite older
// months; `monthlyIncome` is the most recent value set and is the fallback for
// any month that has no explicit entry. Amounts are in
// whole/decimal rupees — the app is INR-only for now.
export interface FinanceSettings {
  currency: 'INR'
  /** Integer minor units (section 27b). See Txn.amountMinor. */
  monthlyIncomeMinor: number
  incomeByMonthMinor: Record<string, number>
  /** @deprecated Pre-27b rupee floats. Migrated on load, then dropped. */
  monthlyIncome?: number
  /** @deprecated Pre-27b rupee floats. Migrated on load, then dropped. */
  incomeByMonth?: Record<string, number>
  incomeUpdatedAt: number
}

export function emptyFinanceSettings(): FinanceSettings {
  return { currency: 'INR', monthlyIncomeMinor: 0, incomeByMonthMinor: {}, incomeUpdatedAt: 0 }
}

// ---- Finances rework: scopes, transactions, debts, tags -------------------
// Every money object is either personal or business; the tab's scope switch
// (Personal / Business / All) filters on it with no cross-leak.
export type FinScope = 'personal' | 'business'
export type ScopeFilter = FinScope | 'all'
export type TxnKind = 'expense' | 'income'

export interface FinGst {
  applicable: boolean
  ratePct: number
  amount: number
}

// The unified money record — income and expenses in one collection so the
// month's In/Out/Net all derive from a single query.
// How the money moved. `method` is not decoration: "was that on the card or in
// cash" is the question that makes a row identifiable a month later, and it is
// the one people reliably remember.
export type TxnMethod = 'cash' | 'upi' | 'card' | 'bank' | 'other'
export const TXN_METHODS: readonly TxnMethod[] = ['cash', 'upi', 'card', 'bank', 'other']

export interface Txn extends Timestamped {
  id: number
  // `kind` is this app's name for the spec's `direction`: 'expense' is out,
  // 'income' is in. Kept rather than renamed because it is the discriminator on
  // every existing row, and a rename would be a data migration that buys a
  // synonym.
  kind: TxnKind
  scope: FinScope
  /**
   * An INTEGER count of paise (section 27b, acceptance 143). Never a float:
   * a ledger is a long chain of additions and a running balance is that chain
   * shown to the user, so a float drifts visibly. Read it through
   * `txnMinor()`, which also covers rows written before this field existed.
   */
  amountMinor: number
  /**
   * @deprecated The pre-27b float, in rupees. Present only on rows that have not
   * been migrated yet; `migrateTxnAmounts` fills `amountMinor` from it on load
   * and drops it. Nothing new should read or write this.
   */
  amount?: number
  date: string // YYYY-MM-DD
  note: string
  category: string // single primary bucket
  tags: string[] // many, cross-cutting
  method?: TxnMethod
  source?: string // income only: Salary / Client / Interest / …
  party?: string // client / vendor / person — the spec's `counterparty`
  isRecurring?: boolean
  recurrenceRule?: string
  /** Set on each occurrence materialised from a recurring rule. */
  recurringId?: number | null
  // Recurring income materialises as "expected" until confirmed received.
  confirmed?: boolean
  gst?: FinGst
  // Set when this txn is a debt repayment/borrowing, linking it to the debt.
  debtId?: number | null
  /** @deprecated Pre-27b single URL. Read by the strip, never written. */
  attachmentUrl?: string
  /** Receipts (section 27b). Stored inline: at most four small records a row. */
  attachments?: Attachment[]
}

// A spend category, user-editable, with an icon and a colour (section 27b).
export interface TxnCategory {
  id: number
  name: string
  /** A name from the app's one icon set. */
  icon: string
  color: string
  kind?: TxnKind | 'both'
  archived?: boolean
}

export type DebtDirection = 'owed_by_me' | 'owed_to_me'
export type DebtStatus = 'open' | 'settled' | 'overdue' | 'written_off'
export type InterestType = 'simple' | 'compound' | 'none'

export interface DebtPayment {
  id: number
  /** Integer minor units. See Txn.amountMinor. */
  amountMinor: number
  /** @deprecated Pre-27b float, in rupees. Migrated on load. */
  amount?: number
  date: string
  note: string
  transactionId?: number | null
}

export interface Debt extends Timestamped {
  id: number
  direction: DebtDirection
  scope: FinScope
  counterparty: string
  /** Integer minor units. See Txn.amountMinor. */
  principalMinor: number
  /** @deprecated Pre-27b float, in rupees. Migrated on load. */
  principal?: number
  currency: 'INR'
  interestRatePct?: number
  interestType?: InterestType
  startDate: string
  dueDate?: string
  status: DebtStatus
  note: string
  tags: string[]
  payments: DebtPayment[]
}

// First-class, colour-coded tags shared by income and expenses.
export interface FinTag {
  id: number
  name: string
  color: string
  scope: ScopeFilter
  kind?: TxnKind | 'both'
  archived?: boolean
}

// ---- Devices, sessions and activity (section 27a) --------------------------
// Unlike everything above, these do NOT live in the workspace document. They are
// a real Firestore subtree under /users/{uid}, because two of their fields are
// security controls — `revokedAt` and `lastActiveAt` — and a security control
// the client can write is not a control. Every write happens in a Cloud
// Function; the client reads and nothing more.

export type DeviceKind = 'desktop' | 'mobile' | 'tablet'

export interface DeviceSession {
  id: string
  deviceLabel: string
  deviceType: DeviceKind
  os: string
  browser: string
  /** A salted SHA-256 prefix. The address itself is never stored. */
  ipHash: string | null
  city: string | null
  region: string | null
  country: string | null
  /** One decimal place — city scale, deliberately not street scale. */
  approxLat: number | null
  approxLng: number | null
  createdAt: number
  lastActiveAt: number
  revokedAt: number | null
  userAgent: string
  /** Not stored: derived by comparing against this install's own id. */
  current?: boolean
}

export type ActivityKind =
  'login' | 'logout' | 'revoke' | 'password-change' | 'new-device' | 'new-country'

export interface ActivityEvent {
  id: string
  type: ActivityKind
  sessionId: string
  city: string | null
  country: string | null
  detail: string | null
  at: number
}

// ---- Planning boards (JointJS node graphs) --------------------------------
// A board is a node-graph canvas for thinking a plan out visually; its nodes can
// become — or link to — real tasks/todos. Adapted to this app's single-workspace
// document: boards, nodes and edges are flat arrays (like todos/tasks), each node
// carrying its own position so sync/conflict handling stays granular rather than
// serialising the whole graph as one blob.
export type BoardType = 'tree' | 'freeform'
export type NodeKind = 'idea' | 'milestone' | 'task' | 'todo' | 'group'
export type EdgeRelation = 'parent' | 'depends_on' | 'blocks' | 'relates_to'
export type LinkedItemType = 'task' | 'todo'

export interface PlanningBoard extends Timestamped {
  id: number
  name: string
  type: BoardType
  layoutMode: 'manual' | 'tidy'
}

export interface PlanningNode extends Timestamped {
  id: number
  boardId: number
  label: string
  notes: string
  kind: NodeKind
  x: number
  y: number
  width: number
  height: number
  color: string
  // When set, this node mirrors a real task/todo (one source of truth): its
  // title/status are read from that doc, not edited on the board.
  linkedType: LinkedItemType | null
  linkedId: number | null
  // Edit-safe sync bookkeeping, like tasks/todos carry.
  localRev: number
  updatedBy: string
}

export interface PlanningEdge extends Timestamped {
  id: number
  boardId: number
  source: number // nodeId
  target: number // nodeId
  relation: EdgeRelation
  label: string
}

// Back-reference on a task/todo so a board relation is navigable both ways.
export interface GraphRef {
  boardId: number
  nodeId: number
  relation: EdgeRelation | 'mirror'
}

// What a note can hang off (section 21a). Ideas, stocks and trips have carried
// a one-way `noteIds` list since long before this; tasks, todos and goals are
// what section 21 adds. They are all one type because the reference is the same
// reference — the difference is only which list the owner lives in.
export type NoteOwnerType = 'task' | 'todo' | 'goal' | 'idea' | 'stock' | 'trip'

// One end of an attachment. Notes carry these; the owner carries the note id.
// Both directions are stored so neither read has to scan the other list.
export interface NoteRef {
  type: NoteOwnerType
  id: number
}

export interface Note extends Timestamped {
  id: number
  // Markdown source when `format` is 'md'. Notes written before section 17 hold
  // HTML from the old contentEditable and carry no `format`; they are converted
  // the first time they are opened in the editor.
  text: string
  format?: 'md'
  ts: number
  // ---- Attachment + filing (section 21a) ----------------------------------
  // A given name, separate from the first line of the body. Empty means "use
  // the first line", which is what every note written before this had, so an
  // untitled note reads exactly as it always did.
  title?: string
  tags?: string[]
  pinned?: boolean
  // The items this note is attached to. Empty is the ordinary case — a note
  // filed nowhere is still a note, and every note that existed before section
  // 21 has an empty list rather than being forced into a home.
  attachedTo?: NoteRef[]
}

export type TripStatus = 'tovisit' | 'done'

// One stop on a trip. A trip is an ordered list of these; each carries its own
// map pin, its own visited date & time, notes and photos.
export interface TripPlace {
  id: number
  name: string // place / destination name
  address: string // formatted address from the location search
  lat: number | null
  lng: number | null
  visitedAt: string // datetime-local 'YYYY-MM-DDTHH:mm', '' = none/planned
  notes: string // HTML from the slash editor
  photos: string[] // image URLs
}

export interface Trip extends Timestamped {
  id: number
  title: string // trip name
  status: TripStatus // 'tovisit' | 'done'
  date: string // planned date (To Visit), YYYY-MM-DD
  visitedDate: string // visited date (Done), YYYY-MM-DD, '' = none
  description: string
  tag: string
  photos: string[] // trip-level image URLs
  places: TripPlace[] // ordered list of stops
  noteIds: number[] // attached notes, referenced never copied
  // Legacy single-location field, kept so trips written before places existed
  // still read; mirrors the trip title / first place for older share links.
  location: string
}

export interface SecuritySettings {
  pinHash: string
  pinSalt: string
  autoLockEnabled: boolean
  lockTimeoutMinutes: number
}

export type ListKey =
  | 'todos'
  | 'tasks'
  | 'deadlines'
  | 'reminders'
  | 'finances'
  | 'notes'
  | 'trips'
  | 'ideas'
  | 'stocks'
export type ItemType =
  'todo' | 'task' | 'deadline' | 'reminder' | 'finance' | 'note' | 'trip' | 'idea' | 'stock'

export interface EditingState {
  type: ItemType | null
  id: number | null
}

export type DialogMode = 'create' | 'edit'

// The single open item dialog. `id` is null in create mode, where the form
// lives in the store's dialogDraft until it is committed.
export interface ItemDialogState {
  type: ItemType
  mode: DialogMode
  id: number | null
}

export interface Toast {
  message: string
  undo: boolean
  // Label for the action button; defaults to "Undo" when unset (e.g. "Retry").
  actionLabel?: string
  listKey?: ListKey
  item?: unknown
  idx?: number
}

export interface ActiveNotif {
  id: number
  title: string
  note: string
}

export interface SharedView {
  type?: ItemType
  item?: Record<string, unknown>
  notFound?: boolean
}

// ---- GitHub integration (section 13) --------------------------------------
// The connection itself. The installation id is the only GitHub identifier the
// client ever holds — the access token lives in Secret Manager, keyed by that
// installation, and is used exclusively inside the ghProxy Cloud Function.
// Nothing token-shaped is stored here or anywhere else on the client.
export interface GithubIntegration {
  installationId: number | null
  login: string
  avatarUrl: string
  connectedAt: number | null
  scopes: string[]
  lastSyncAt: number
  // Last rate-limit reading from the proxy, shown in Settings → Integrations.
  rateLimit: { limit: number; remaining: number; resetAt: number } | null
  // Set when sync backs off; the UI shows a visible "sync paused" state rather
  // than failing silently (13f).
  pausedUntil: number | null
  pausedReason: string
}

export function emptyGithubIntegration(): GithubIntegration {
  return {
    installationId: null,
    login: '',
    avatarUrl: '',
    connectedAt: null,
    scopes: [],
    lastSyncAt: 0,
    rateLimit: null,
    pausedUntil: null,
    pausedReason: '',
  }
}

// A repo linked into the workspace. `id` is the spec's "owner__name" key.
export interface LinkedRepo {
  id: string
  owner: string
  name: string
  fullName: string
  defaultBranch: string
  private: boolean
  htmlUrl: string
  stars: number
  openIssuesCount: number
  language: string
  pushedAt: number
  linkedAt: number
  syncEnabled: boolean
  labelFilter: string[]
  lastSyncAt: number
  // The conditional-request tag for this repo's issue list; a matching etag
  // returns 304 and costs no rate limit (13f).
  etag: string
}

// A mirrored GitHub issue. `id` is the spec's "owner__name__number" key.
// `linkedTaskId` is the only Spasta-owned field — everything else is GitHub's,
// and GitHub wins on conflict.
export interface GithubIssue {
  id: string
  repoId: string
  number: number
  title: string
  body: string
  state: 'open' | 'closed'
  labels: string[]
  assignees: string[]
  author: string
  htmlUrl: string
  createdAt: number
  updatedAt: number
  closedAt: number | null
  commentsCount: number
  linkedTaskId: number | null
  etag: string
}

// The link a task carries once it has an issue on the other side.
export interface GithubLink {
  repoId: string
  issueNumber: number
  issueUrl: string
  state: 'open' | 'closed'
  syncedAt: number
}

// Recent-activity payloads for the repo cards (read-only, never persisted).
export interface RepoCommit {
  sha: string
  message: string
  author: string
  committedAt: number
  htmlUrl: string
}
export interface RepoPull {
  number: number
  title: string
  author: string
  htmlUrl: string
  draft: boolean
  ci: 'passing' | 'failing' | 'pending' | 'none'
}

// ---- Wallets (section 14) --------------------------------------------------
// An address book of the user's own PUBLIC receive addresses. There is no field
// here for a private key, seed phrase or keystore, and there never will be: the
// app rejects that input at the door (utils/address) rather than storing it.
//
// The spec puts these at /users/{uid}/wallets/{walletId}. This app keeps one
// workspace document per uid, so they live as a flat array on that document —
// still under the user, never under a project, and covered by the same
// `request.auth.uid == userId` rule (acceptance 65).
export interface Wallet extends Timestamped {
  id: number
  label: string
  chain: ChainKey
  network: Network
  address: string
  // XRP/XLM/ATOM destination tag or memo; null when the chain does not use one.
  memoTag: string | null
  // At most one default per chain — the one the share block and dashboard
  // reach for first.
  isDefault: boolean
  order: number
  notes: string
  // Balance display is off by default and opt-in per wallet; the read goes
  // through a Cloud Function so no API key sits in the client.
  balanceEnabled: boolean
  balance: WalletBalance | null
}

export interface WalletBalance {
  amount: string
  symbol: string
  fetchedAt: number
  error: string
}

export interface AureonUser {
  uid: string
  name: string
  email: string
  provider: 'google' | 'github'
  initial: string
  color: string
}
