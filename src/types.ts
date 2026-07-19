// Domain types for Aureon.

export type TabKey = 'todo' | 'tasks' | 'deadlines' | 'reminders' | 'finances'

export interface Todo {
  id: number
  text: string
  done: boolean
}

export interface Task {
  id: number
  title: string
  tag: string
  done: boolean
  deadline: string // YYYY-MM-DD, '' = no date
  notes: string
  repo: string // owner/repo, '' = none
}

export interface Deadline {
  id: number
  title: string
  due: string // YYYY-MM-DD
}

export type RepeatType =
  | 'none'
  | 'minutes'
  | 'hours'
  | 'days'
  | 'weeks'
  | 'months'
  | 'years'
  | 'weekdays'

export interface Repeat {
  type: RepeatType
  n?: number
  weekdays?: number[] // 0=Sun..6=Sat
}

export type CalSync = 'local' | 'pending' | 'synced'

export interface Reminder {
  id: number
  title: string
  note: string
  start: string // datetime-local value (YYYY-MM-DDTHH:mm)
  repeat: Repeat
  calSync: CalSync
  lastFiredOcc: number | null
}

export type FinanceCategory = 'Food' | 'Transport' | 'Bills' | 'Fun' | 'Other'

export interface Finance {
  id: number
  amount: number
  category: FinanceCategory | string
  note: string
  date: string // YYYY-MM-DD
}

export interface Note {
  id: number
  text: string // HTML
  ts: number
}

export type ListKey = 'todos' | 'tasks' | 'deadlines' | 'reminders' | 'finances' | 'notes'
export type ItemType = 'todo' | 'task' | 'deadline' | 'reminder' | 'finance' | 'note'

export interface EditingState {
  type: ItemType | null
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

export type GithubCacheEntry =
  | { status: 'loading' }
  | { status: 'ready'; data: GithubMeta }

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
  name: string
  email: string
  provider: 'google' | 'github'
  initial: string
  color: string
}
