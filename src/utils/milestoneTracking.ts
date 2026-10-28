// Milestone tracking: KPIs, learnings and subtasks on points, conclusions, goals.
//
// Pure functions only — reading, sanitising and measuring — so the store's
// writes stay one-liners and the arithmetic can be argued with in a test.
//
// Ids inside these lists are local to the list (max + 1), not drawn from the
// store's counter: that counter is rebuilt on load from the top-level lists
// alone, so a nested id taken from it could be handed out again after a reload
// and collide with its own sibling.
import type {
  AcceptanceCheck,
  GoalChecklistItem,
  Kpi,
  KpiEntry,
  Learning,
  LearningExample,
  MilestoneAuditEntry,
  MilestoneConclusion,
  SkillGoal,
  Subtask,
} from '@/types'

export function nextLocalId(list: readonly { id: number }[]): number {
  return list.reduce((max, x) => Math.max(max, x.id), 0) + 1
}

const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : null

// --- KPIs ------------------------------------------------------------------------

export function kpiCurrent(kpi: Kpi): number {
  return kpi.entries.length ? kpi.entries[kpi.entries.length - 1].value : kpi.start
}

// 0..1 along the way from start to target, in whichever direction that runs.
export function kpiRatio(kpi: Kpi): number {
  const span = kpi.target - kpi.start
  if (span === 0) return kpiCurrent(kpi) === kpi.target ? 1 : 0
  return Math.max(0, Math.min(1, (kpiCurrent(kpi) - kpi.start) / span))
}

// The change since the entry before the latest, signed so that positive always
// means "towards the target".
export function kpiTrend(kpi: Kpi): number | null {
  const n = kpi.entries.length
  if (n === 0) return null
  const prev = n > 1 ? kpi.entries[n - 2].value : kpi.start
  const delta = kpi.entries[n - 1].value - prev
  return kpi.target >= kpi.start ? delta : -delta
}

// The milestone's KPIs together: the mean of their ratios.
export function kpisRatio(kpis: readonly Kpi[] | undefined): number | null {
  if (!kpis?.length) return null
  return kpis.reduce((n, k) => n + kpiRatio(k), 0) / kpis.length
}

// Short and stable: "42", "1.5k", "0.25". Units go after, by the caller.
export function formatKpiValue(v: number): string {
  if (Math.abs(v) >= 10000) return `${Math.round(v / 100) / 10}k`
  return String(Math.round(v * 100) / 100)
}

export function normaliseKpis(input: unknown): Kpi[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((raw, i) => {
    const k = obj(raw)
    if (!k) return []
    const entries: KpiEntry[] = Array.isArray(k.entries)
      ? k.entries.flatMap((r, j) => {
          const e = obj(r)
          if (!e || typeof e.value !== 'number' || !Number.isFinite(e.value)) return []
          return [{ id: num(e.id, j + 1), at: num(e.at), value: e.value, note: str(e.note) }]
        })
      : []
    entries.sort((a, b) => a.at - b.at)
    return [
      {
        id: num(k.id, i + 1),
        name: str(k.name),
        unit: str(k.unit),
        start: num(k.start),
        target: num(k.target),
        entries,
        createdAt: num(k.createdAt),
      },
    ]
  })
}

// --- Learnings -------------------------------------------------------------------

export function normaliseLearnings(input: unknown): Learning[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((raw, i) => {
    const l = obj(raw)
    if (!l) return []
    const examples: LearningExample[] = Array.isArray(l.examples)
      ? l.examples.flatMap((r, j) => {
          const e = obj(r)
          if (!e) return []
          return [
            { id: num(e.id, j + 1), kind: e.kind === 'code' ? 'code' : 'text', body: str(e.body) },
          ]
        })
      : []
    return [{ id: num(l.id, i + 1), text: str(l.text), examples, createdAt: num(l.createdAt) }]
  })
}

export interface LearningProgress {
  /** Points with at least one learning written down. */
  covered: number
  total: number
  ratio: number
  learnings: number
  examples: number
}

export function learningProgress(points: readonly GoalChecklistItem[]): LearningProgress {
  let covered = 0
  let learnings = 0
  let examples = 0
  for (const p of points) {
    const list = p.learnings ?? []
    if (list.length) covered++
    learnings += list.length
    for (const l of list) examples += l.examples.length
  }
  const total = points.length
  return { covered, total, ratio: total ? covered / total : 0, learnings, examples }
}

// --- Subtasks, conclusions, audit and goals ----------------------------------------
// Sanitised the same way, on every load: a field of the wrong type falls back to
// its empty value rather than taking the whole milestone down with it.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const day = (v: unknown) => (typeof v === 'string' && ISO_DAY.test(v) ? v : '')

export function normaliseSubtasks(input: unknown): Subtask[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((raw, i) => {
    const s = obj(raw)
    if (!s) return []
    return [
      {
        id: num(s.id, i + 1),
        title: str(s.title),
        completed: s.completed === true,
        completedAt: typeof s.completedAt === 'number' ? s.completedAt : null,
        ...(typeof s.sourceId === 'string' && { sourceId: s.sourceId }),
      },
    ]
  })
}

export function normaliseConclusion(input: unknown): MilestoneConclusion | undefined {
  const c = obj(input)
  if (!c) return undefined
  const acceptance: AcceptanceCheck[] = Array.isArray(c.acceptance)
    ? c.acceptance.flatMap((raw, i) => {
        const a = obj(raw)
        return a ? [{ id: num(a.id, i + 1), text: str(a.text), checked: a.checked === true }] : []
      })
    : []
  return {
    status: c.status === 'completed' ? 'completed' : 'pending',
    summary: str(c.summary),
    evidence: Array.isArray(c.evidence)
      ? c.evidence.filter((e): e is string => typeof e === 'string')
      : [],
    ...(c.evidenceRequired === true && { evidenceRequired: true }),
    acceptance,
    closedAt: typeof c.closedAt === 'string' && c.closedAt ? c.closedAt : null,
  }
}

export function normaliseAudit(input: unknown): MilestoneAuditEntry[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((raw) => {
    const a = obj(raw)
    if (!a || (a.action !== 'closed' && a.action !== 'reopened')) return []
    return [{ at: str(a.at), action: a.action, reason: str(a.reason) }]
  })
}

export function normaliseSkillGoals(input: unknown): SkillGoal[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((raw, i) => {
    const g = obj(raw)
    if (!g || typeof g.id !== 'number') return []
    const conclusion = normaliseConclusion(g.conclusion)
    return [
      {
        id: g.id,
        title: str(g.title) || 'Untitled goal',
        description: str(g.description),
        startDate: day(g.startDate),
        targetDate: day(g.targetDate),
        order: num(g.order, i),
        project: str(g.project),
        createdAt: num(g.createdAt),
        updatedAt: num(g.updatedAt),
        ...(typeof g.sourceId === 'string' && { sourceId: g.sourceId }),
        ...(conclusion && { conclusion }),
      },
    ]
  })
}
