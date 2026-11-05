// The Learning & Goals document (spec section 8): read it, check it, write it.
//
//   { project, goals: [ { title, timeline, status, completed, conclusion,
//       milestones: [ { title, duration, status, completed, conclusion,
//         tasks: [ { title, status, completed,
//           subtasks: [ { title, completed } ] } ] } ] } ],
//     tracking_rules }
//
// In the app a document goal is a SkillGoal, a milestone is a milestone (the
// Goal type), a task is a point and a subtask is a subtask.
//
// READING is tolerant, because these documents are written by hand and by other
// tools: `duration` may be a day count, a "21 days" string or an object with
// start/deadline/days; a timeline may be an object or a bare target date. A
// milestone with only a duration follows on from the one before it (or from
// the goal's start), counting days inclusively as the original JSON does.
//
// Nothing invalid is dropped silently. A goal or milestone with a problem keeps
// its row and carries an `error`; the preview lists every one, and import
// skips only those rows.
//
// IDENTITY is stable: an `id` in the document is kept as `sourceId`; without
// one, the id is built from the titles along its path, never from an index, so
// re-importing the same document updates rather than duplicates.
import { deadlineFrom, durationDays } from '@/utils/milestoneProgress'

export const LEARNING_DOC_VERSION = 1

export interface DocConclusion {
  status: 'pending' | 'completed'
  summary: string
  evidence: string[]
  closedAt: string | null
}
export interface DocSubtask {
  id: string
  title: string
  completed: boolean
}
export interface DocTask {
  id: string
  title: string
  completed: boolean
  subtasks: DocSubtask[]
  /** The point's detail, shown when it is opened. '' = none. */
  description: string
  start: string
  deadline: string
  estimateMins: number | null
  tags: string[]
}
export interface DocMilestone {
  id: string
  title: string
  description: string
  start: string
  deadline: string
  conclusion: DocConclusion | null
  tasks: DocTask[]
  error?: string
}
export interface DocGoal {
  /** Milestones given without a goal: they import on their own, under no goal. */
  standalone?: boolean
  id: string
  title: string
  description: string
  start: string
  target: string
  conclusion: DocConclusion | null
  milestones: DocMilestone[]
  error?: string
}
export interface LearningDoc {
  project: string
  goals: DocGoal[]
  trackingRules: unknown
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const day = (v: unknown): string => {
  if (typeof v !== 'string') return ''
  const t = v.trim().slice(0, 10)
  return ISO.test(t) ? t : ''
}
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** A stable id: the document's own, or one built from the titles on its path. */
function idOf(raw: Record<string, unknown>, parent: string, title: string): string {
  if (typeof raw.id === 'string' && raw.id.trim()) return raw.id.trim()
  if (typeof raw.id === 'number') return String(raw.id)
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return parent ? `${parent}/${slug || 'untitled'}` : slug || 'untitled'
}

/** Two items with the same built id get "-2", "-3": identity never collides. */
function dedupe<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, number>()
  return items.map((it) => {
    const n = (seen.get(it.id) ?? 0) + 1
    seen.set(it.id, n)
    return n === 1 ? it : { ...it, id: `${it.id}-${n}` }
  })
}

const isDone = (raw: Record<string, unknown>) =>
  raw.completed === true || str(raw.status).toLowerCase() === 'completed'

function readConclusion(v: unknown): DocConclusion | null {
  if (!v || typeof v !== 'object') return null
  const c = obj(v)
  const closedAt = str(c.closed_at) || str(c.closedAt)
  return {
    status: str(c.status).toLowerCase() === 'completed' ? 'completed' : 'pending',
    summary: str(c.summary),
    evidence: list(c.evidence).flatMap((e) =>
      typeof e === 'string' && e.trim() ? [e.trim()] : [],
    ),
    closedAt: closedAt || null,
  }
}

/** Days from a duration in any of its shapes; null when there is none. */
function durationOf(v: unknown): number | null {
  if (typeof v === 'number' && v > 0) return Math.round(v)
  if (typeof v === 'string') {
    const m = /(\d+)\s*(day|days|d|week|weeks|w)?\b/i.exec(v)
    if (!m) return null
    const n = Number(m[1])
    return /^w/i.test(m[2] ?? '') ? n * 7 : n
  }
  if (!v || typeof v !== 'object') return null
  const o = obj(v)
  const inner = o.days ?? o.length ?? o.total_days ?? o.totalDays
  return typeof inner === 'number' || typeof inner === 'string' ? durationOf(inner) : null
}

/** Minutes from 90, "90m", "1.5h", "2 hours"; null when there is none. */
function minutesOf(v: unknown): number | null {
  if (typeof v === 'number') return v >= 0 ? Math.round(v) : null
  if (typeof v !== 'string') return null
  const m = /^\s*(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)?\s*$/i.exec(v)
  if (!m) return null
  const n = Number(m[1])
  return Math.round(/^h/i.test(m[2] ?? '') ? n * 60 : n)
}

/** The first list under any of the names documents use for it. */
function listOf(raw: Record<string, unknown>, ...keys: string[]): unknown[] {
  for (const k of keys) if (Array.isArray(raw[k])) return raw[k] as unknown[]
  return []
}

const TASK_KEYS = ['tasks', 'points', 'steps', 'items', 'checklist']
const SUBTASK_KEYS = ['subtasks', 'steps', 'items', 'checklist', 'children']

function readTask(t: unknown, milestoneId: string): DocTask {
  const tr = obj(typeof t === 'string' ? { title: t } : t)
  const title = str(tr.title) || str(tr.name) || str(tr.text)
  const tid = idOf(tr, milestoneId, title)
  const tl = obj(tr.timeline)
  const subtasks = dedupe(
    listOf(tr, ...SUBTASK_KEYS).map((sIn) => {
      const sr = obj(typeof sIn === 'string' ? { title: sIn } : sIn)
      const stitle = str(sr.title) || str(sr.name) || str(sr.text)
      return { id: idOf(sr, tid, stitle), title: stitle, completed: isDone(sr) }
    }),
  ).filter((x) => x.title)
  const estimate =
    minutesOf(tr.estimateMins) ??
    minutesOf(tr.estimate_mins) ??
    minutesOf(tr.estimate) ??
    minutesOf(tr.minutes) ??
    (typeof tr.hours === 'number' ? Math.round(tr.hours * 60) : null)
  return {
    id: tid,
    title,
    completed: isDone(tr),
    subtasks,
    description: str(tr.description) || str(tr.notes) || str(tr.details),
    start: day(tr.start) || day(tl.start) || day(tr.startDate) || day(tr.start_date),
    deadline:
      day(tr.deadline) ||
      day(tr.due) ||
      day(tr.dueAt) ||
      day(tr.due_date) ||
      day(tl.target) ||
      day(tl.end) ||
      (typeof tr.timeline === 'string' ? day(tr.timeline) : ''),
    estimateMins: estimate,
    tags: list(tr.tags).flatMap((x) =>
      typeof x === 'string' && x.trim() ? [x.trim().replace(/^#/, '')] : [],
    ),
  }
}

function nextDay(ymd: string): string {
  return deadlineFrom(ymd, 2)
}

function readMilestone(rawIn: unknown, goalId: string, follow: string): DocMilestone {
  const raw = obj(rawIn)
  const title = str(raw.title) || str(raw.name)
  const id = idOf(raw, goalId, title)
  const dur = obj(raw.duration)
  const tl = obj(raw.timeline)
  let start =
    day(raw.start) || day(dur.start) || day(tl.start) || day(raw.start_date) || day(raw.startDate)
  let deadline =
    day(raw.deadline) ||
    day(dur.deadline) ||
    day(dur.end) ||
    day(dur.target) ||
    day(tl.target) ||
    day(tl.end) ||
    day(raw.end) ||
    day(raw.due) ||
    (typeof raw.timeline === 'string' ? day(raw.timeline) : '')
  const days = durationOf(raw.duration)
  // Only a duration: follow on from the milestone before, inclusively.
  if (!start && days && follow) start = follow
  if (start && !deadline && days) deadline = deadlineFrom(start, days)
  if (!start && deadline && days) start = deadlineFrom(deadline, 2 - days)

  const tasks = dedupe(listOf(raw, ...TASK_KEYS).map((t) => readTask(t, id))).filter((t) => t.title)

  const m: DocMilestone = {
    id,
    title,
    description: str(raw.description) || str(raw.notes),
    start,
    deadline,
    conclusion: readConclusion(raw.conclusion),
    tasks,
  }
  // A milestone marked completed with no conclusion object still arrives closed.
  if (!m.conclusion && isDone(raw))
    m.conclusion = { status: 'completed', summary: '', evidence: [], closedAt: null }
  if (!title) m.error = 'Missing title'
  else if (start && deadline && deadline < start) m.error = 'Deadline is before the start'
  return m
}

function readGoal(rawIn: unknown): DocGoal {
  const raw = obj(rawIn)
  const title = str(raw.title) || str(raw.name)
  const id = idOf(raw, '', title)
  const tl = obj(raw.timeline)
  const start = day(tl.start) || day(raw.start) || day(raw.startDate)
  const target =
    day(tl.target) ||
    day(tl.end) ||
    day(raw.target) ||
    day(raw.targetDate) ||
    (typeof raw.timeline === 'string' ? day(raw.timeline) : '')
  let follow = start
  const milestones = dedupe(
    list(raw.milestones).map((mr) => {
      const m = readMilestone(mr, id, follow)
      if (m.deadline) follow = nextDay(m.deadline)
      return m
    }),
  )
  const g: DocGoal = {
    ...(raw.__standalone === true && { standalone: true }),
    id,
    title,
    description: str(raw.description),
    start,
    target,
    conclusion: readConclusion(raw.conclusion),
    milestones,
  }
  if (!title) g.error = 'Missing title'
  else if (start && target && target < start) g.error = 'Target is before the start'
  return g
}

/**
 * One milestone exported on its own names its goal beside it:
 * `{ project, goal: "React — Junior to Pro", milestone: { … } }`. The goal may
 * be a title or an object, and `milestones` may stand in for `milestone`.
 * Lifted into the full shape so everything after reads one document.
 */
function goalsOf(input: unknown): unknown[] {
  const looksLikeMilestone = (m: unknown) => {
    const o = obj(m)
    return (
      !!(str(o.title) || str(o.name)) &&
      (TASK_KEYS.some((k) => Array.isArray(o[k])) ||
        'duration' in o ||
        'deadline' in o ||
        'timeline' in o)
    )
  }
  // A bare array: of goals (each with milestones), or of milestones.
  if (Array.isArray(input)) {
    if (input.some((g) => Array.isArray(obj(g).milestones))) return input
    return input.some(looksLikeMilestone) ? [standalone(input)] : []
  }
  const root = obj(input)
  if (Array.isArray(root.goals)) return root.goals
  const single = root.milestone ?? root.milestones
  if (single == null) return []
  const ms = Array.isArray(single) ? single : [single]
  // Milestones with no goal named: they import on their own, under no goal.
  if (root.goal == null) return [standalone(ms)]
  const goal = typeof root.goal === 'string' ? { title: root.goal } : obj(root.goal)
  return [{ ...goal, milestones: ms }]
}

function standalone(milestones: unknown[]) {
  return { __standalone: true, id: 'standalone', title: 'Milestones (no goal)', milestones }
}

/** True when the input has the goals → milestones shape this module reads. */
export function isLearningDoc(input: unknown): boolean {
  return goalsOf(input).some((g) => Array.isArray(obj(g).milestones))
}

export function parseLearningDoc(input: string | unknown): LearningDoc & { parseError?: string } {
  let o: unknown = input
  if (typeof input === 'string') {
    try {
      o = JSON.parse(input)
    } catch (e) {
      return { project: '', goals: [], trackingRules: null, parseError: (e as Error).message }
    }
  }
  const root = obj(o)
  const project = typeof root.project === 'string' ? root.project : str(obj(root.project).name)
  return {
    project,
    goals: dedupe(goalsOf(o).map(readGoal)),
    trackingRules: root.tracking_rules ?? root.trackingRules ?? null,
  }
}

export interface DocCounts {
  goals: number
  milestones: number
  tasks: number
  subtasks: number
  completedSubtasks: number
  errors: string[]
}

/** What the preview reports, including every row that will be skipped and why. */
export function countDoc(doc: LearningDoc): DocCounts {
  const out: DocCounts = {
    goals: 0,
    milestones: 0,
    tasks: 0,
    subtasks: 0,
    completedSubtasks: 0,
    errors: [],
  }
  for (const g of doc.goals) {
    if (g.error) {
      out.errors.push(`Goal "${g.title || '(untitled)'}": ${g.error}`)
      continue
    }
    if (!g.standalone) out.goals++
    for (const m of g.milestones) {
      if (m.error) {
        out.errors.push(`Milestone "${m.title || '(untitled)'}" in "${g.title}": ${m.error}`)
        continue
      }
      out.milestones++
      for (const t of m.tasks) {
        out.tasks++
        out.subtasks += t.subtasks.length
        out.completedSubtasks += t.subtasks.filter((s) => s.completed).length
      }
    }
  }
  return out
}

// --- writing ------------------------------------------------------------------------

export interface ExportSubtask {
  id: string
  title: string
  completed: boolean
}
export interface ExportTask {
  id: string
  title: string
  subtasks: ExportSubtask[]
  /** Used when the task has no subtasks. */
  completed: boolean
  description?: string
  start?: string
  deadline?: string
  estimateMins?: number | null
  tags?: string[]
}
export interface ExportMilestone {
  id: string
  title: string
  description?: string
  start: string
  deadline: string
  conclusion: DocConclusion | null
  tasks: ExportTask[]
}
export interface ExportGoal {
  id: string
  title: string
  description: string
  start: string
  target: string
  conclusion: DocConclusion | null
  milestones: ExportMilestone[]
}

const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0)
const statusOf = (done: number, closed: boolean) =>
  closed ? 'completed' : done > 0 ? 'in_progress' : 'not_started'

/**
 * Back to the document shape, with ids, derived progress and status. Parsing
 * the output again gives the same ids and completion state (the round trip).
 */
export function writeLearningDoc(
  project: string,
  goals: ExportGoal[],
  trackingRules: unknown,
  exportedAt: string,
): string {
  const conclusionOut = (c: DocConclusion | null) =>
    c && { status: c.status, summary: c.summary, evidence: c.evidence, closed_at: c.closedAt }
  const doc = {
    version: LEARNING_DOC_VERSION,
    exportedAt,
    project,
    goals: goals.map((g) => {
      let gDone = 0
      let gTotal = 0
      const milestones = g.milestones.map((m) => {
        let mDone = 0
        let mTotal = 0
        const tasks = m.tasks.map((t) => {
          const done = t.subtasks.length
            ? t.subtasks.filter((s) => s.completed).length
            : +t.completed
          const total = t.subtasks.length || 1
          mDone += done
          mTotal += total
          const complete = done === total
          const tl = {
            ...(t.start && { start: t.start }),
            ...(t.deadline && { target: t.deadline }),
          }
          return {
            id: t.id,
            title: t.title,
            ...(t.description && { description: t.description }),
            ...(Object.keys(tl).length && { timeline: tl }),
            ...(t.estimateMins != null && { estimateMins: t.estimateMins }),
            ...(t.tags?.length && { tags: t.tags }),
            status: statusOf(done, complete),
            completed: complete,
            progress: pct(done, total),
            subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title, completed: s.completed })),
          }
        })
        gDone += mDone
        gTotal += mTotal
        const closed = m.conclusion?.status === 'completed'
        const days = durationDays(m.start, m.deadline)
        return {
          id: m.id,
          title: m.title,
          ...(m.description && { description: m.description }),
          duration: {
            ...(m.start && { start: m.start }),
            ...(m.deadline && { deadline: m.deadline }),
            ...(days != null && { days }),
          },
          status: statusOf(mDone, closed),
          completed: closed,
          progress: pct(mDone, mTotal),
          tasks,
          conclusion: conclusionOut(m.conclusion),
        }
      })
      const closedAll = milestones.length > 0 && milestones.every((m) => m.completed)
      return {
        id: g.id,
        title: g.title,
        ...(g.description && { description: g.description }),
        timeline: { ...(g.start && { start: g.start }), ...(g.target && { target: g.target }) },
        status: statusOf(gDone, closedAll),
        completed: closedAll,
        progress: pct(gDone, gTotal),
        milestones,
        conclusion: conclusionOut(g.conclusion),
      }
    }),
    tracking_rules: trackingRules ?? undefined,
  }
  return JSON.stringify(doc, null, 2)
}
