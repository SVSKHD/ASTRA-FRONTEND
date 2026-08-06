// Domain types for Aureon.

export type TabKey =
  | 'overview'
  | 'todo'
  | 'tasks'
  | 'deadlines'
  | 'reminders'
  | 'finances'
  | 'trips'
  | 'ideas'
  | 'stocks'
  | 'ai'
  | 'bots'

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
export type SourceCollection = 'todos' | 'tasks' | 'reminders'
export interface SourceRef {
  collection: SourceCollection
  id: number
}

// Both linkable item types carry these; backfilled to [] / null on read.
export interface Linkable {
  linked: LinkRef[]
  parents: LinkRef[]
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

export interface Todo extends Timestamped, Shareable, Linkable {
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
}

export interface Task extends Timestamped, Linkable {
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
// any month that has no explicit entry (see useMonthlyBudget). Amounts are in
// whole/decimal rupees — the app is INR-only for now.
export interface FinanceSettings {
  currency: 'INR'
  monthlyIncome: number
  incomeByMonth: Record<string, number>
  incomeUpdatedAt: number
}

export function emptyFinanceSettings(): FinanceSettings {
  return { currency: 'INR', monthlyIncome: 0, incomeByMonth: {}, incomeUpdatedAt: 0 }
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
export interface Txn extends Timestamped {
  id: number
  kind: TxnKind
  scope: FinScope
  amount: number
  date: string // YYYY-MM-DD
  note: string
  category: string // single primary bucket
  tags: string[] // many, cross-cutting
  source?: string // income only: Salary / Client / Interest / …
  party?: string // client / vendor / person
  isRecurring?: boolean
  recurrenceRule?: string
  // Recurring income materialises as "expected" until confirmed received.
  confirmed?: boolean
  gst?: FinGst
  // Set when this txn is a debt repayment/borrowing, linking it to the debt.
  debtId?: number | null
  attachmentUrl?: string
}

export type DebtDirection = 'owed_by_me' | 'owed_to_me'
export type DebtStatus = 'open' | 'settled' | 'overdue' | 'written_off'
export type InterestType = 'simple' | 'compound' | 'none'

export interface DebtPayment {
  id: number
  amount: number
  date: string
  note: string
  transactionId?: number | null
}

export interface Debt extends Timestamped {
  id: number
  direction: DebtDirection
  scope: FinScope
  counterparty: string
  principal: number
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

export interface Note extends Timestamped {
  id: number
  text: string // HTML
  ts: number
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

// GitHub (mock) shapes ----------------------------------------------------

export interface PullRequest {
  id: string
  num: number
  title: string
  author: string
  url: string
}

export interface GithubMeta {
  branch: string
  issues: number
  prs: number
  stars: number
  ci: 'passing' | 'failing'
  commitMsg: string
  commitTime: string
  prList: PullRequest[]
}

export type GithubCacheEntry = { status: 'loading' } | { status: 'ready'; data: GithubMeta }

export interface RepoIssue {
  id: string
  num: number
  title: string
}

export interface Repo {
  id: string
  name: string
  full: string
  desc: string
  lang: string
  langColor: string
  stars: number
  issues: number
  prs: number
  ci: 'passing' | 'failing'
  pushedMs: number
  pushedLabel: string
  openIssues: RepoIssue[]
}

export interface AureonUser {
  uid: string
  name: string
  email: string
  provider: 'google' | 'github'
  initial: string
  color: string
}
