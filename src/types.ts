// Domain types for Aureon.

export type TabKey =
  'todo' | 'tasks' | 'deadlines' | 'reminders' | 'finances' | 'trips' | 'ideas' | 'stocks'

// Every stored item carries these. Items written before timestamps existed have
// neither, so applyData() backfills them to 0 — which the formatter renders as
// "Unknown" rather than pretending everything was created at the epoch.
export interface Timestamped {
  createdAt: number
  updatedAt: number
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

export interface Todo extends Timestamped, Shareable {
  id: number
  text: string
  done: boolean
  status: ItemStatus
  // Added after the first release; todos stored before that lack both, so
  // applyData() backfills them on read.
  tag: string
  description: string
}

export interface Task extends Timestamped {
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
