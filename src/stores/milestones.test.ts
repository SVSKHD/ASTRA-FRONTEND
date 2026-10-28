// Milestones: bulk delete with one Undo, KPIs, and what each point taught.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'

beforeEach(() => setActivePinia(createPinia()))

describe('deleting several milestones', () => {
  it('removes them all and one Undo puts every one back with its points and links', () => {
    const app = useAppStore()
    const a = app.addGoal({ title: 'JavaScript' })
    const b = app.addGoal({ title: 'TypeScript' })
    const keep = app.addGoal({ title: 'Vue' })
    app.addChecklistItem(a, 'Closures')
    app.addChecklistItem(b, 'Generics')
    app.addTask('Read the handbook', '')
    const task = app.tasks[app.tasks.length - 1]
    app.attachToGoal('tasks', task.id, a)
    app.attachToGoal('tasks', task.id, b)

    app.removeGoalsWithUndo([a, b])
    expect(app.goals.map((g) => g.id)).toEqual([keep])
    expect(app.goalChecklist).toHaveLength(0)
    expect(app.tasks.find((t) => t.id === task.id)!.goalIds ?? []).toEqual([])
    expect(app.toast?.message).toBe('Deleted 2 milestones')

    app.performUndo()
    expect(app.goals.map((g) => g.id).sort()).toEqual([a, b, keep].sort())
    expect(app.goalChecklist.map((c) => c.text).sort()).toEqual(['Closures', 'Generics'])
    expect(app.tasks.find((t) => t.id === task.id)!.goalIds!.sort()).toEqual([a, b].sort())
  })

  it('names a single milestone in its toast, as before', () => {
    const app = useAppStore()
    const a = app.addGoal({ title: 'Node.js' })
    app.removeGoalWithUndo(a)
    expect(app.toast?.message).toBe('Deleted "Node.js"')
  })

  it('ignores ids that are already gone', () => {
    const app = useAppStore()
    app.removeGoalsWithUndo([12345])
    expect(app.toast).toBeFalsy()
  })
})

describe('KPIs', () => {
  it('adds, logs, and removes entries and KPIs', () => {
    const app = useAppStore()
    const gid = app.addGoal({ title: 'DSA' })
    const kid = app.addKpi(gid, {
      name: ' Problems solved ',
      unit: 'problems',
      start: 0,
      target: 150,
    })
    app.logKpi(gid, kid, 12)
    app.logKpi(gid, kid, 20, ' weekend ')
    app.logKpi(gid, kid, Number.NaN)
    const kpi = () => app.goals.find((g) => g.id === gid)!.kpis![0]
    expect(kpi().name).toBe('Problems solved')
    expect(kpi().entries.map((e) => [e.value, e.note])).toEqual([
      [12, ''],
      [20, 'weekend'],
    ])

    app.removeKpiEntry(gid, kid, kpi().entries[0].id)
    expect(kpi().entries.map((e) => e.value)).toEqual([20])
    app.updateKpi(gid, kid, { target: 200 })
    expect(kpi().target).toBe(200)

    app.removeKpi(gid, kid)
    expect(app.goals.find((g) => g.id === gid)!.kpis).toEqual([])
  })

  it('numbers KPIs within their own milestone', () => {
    const app = useAppStore()
    const gid = app.addGoal({ title: 'Fitness' })
    expect(app.addKpi(gid, { name: 'a', unit: '', start: 0, target: 1 })).toBe(1)
    expect(app.addKpi(gid, { name: 'b', unit: '', start: 0, target: 1 })).toBe(2)
  })
})

describe('learnings on a point', () => {
  it('adds a learning with examples, edits it, and removes the parts', () => {
    const app = useAppStore()
    const gid = app.addGoal({ title: 'JavaScript' })
    const pid = app.addChecklistItem(gid, 'Closures')
    const lid = app.addLearning(pid, ' Closures capture variables ', [
      { kind: 'code', body: 'for (var i = 0; i < 3; i++) setTimeout(() => log(i))' },
    ])
    app.addLearningExample(pid, lid, { kind: 'text', body: 'A counter factory' })
    const point = () => app.goalChecklist.find((c) => c.id === pid)!
    const learning = () => point().learnings![0]

    expect(learning().text).toBe('Closures capture variables')
    expect(learning().examples.map((e) => [e.id, e.kind])).toEqual([
      [1, 'code'],
      [2, 'text'],
    ])

    app.updateLearning(pid, lid, 'Closures capture bindings, not values')
    app.updateLearningExample(pid, lid, 2, { kind: 'code' })
    expect(learning().text).toBe('Closures capture bindings, not values')
    expect(learning().examples[1].kind).toBe('code')

    app.removeLearningExample(pid, lid, 1)
    expect(learning().examples.map((e) => e.id)).toEqual([2])
    app.removeLearning(pid, lid)
    expect(point().learnings).toEqual([])
  })
})

describe('subtasks', () => {
  it('derives the point from its subtasks and counts each in progress', () => {
    const app = useAppStore()
    const gid = app.addGoal({ title: 'Core language' })
    const pid = app.addChecklistItem(gid, 'Types & coercion')
    const a = app.addSubtask(pid, '== vs ===')!
    const b = app.addSubtask(pid, 'Truthiness table')!
    app.addChecklistItem(gid, 'Plain point')
    const point = () => app.goalChecklist.find((c) => c.id === pid)!

    expect(app.goalProgress(gid)).toEqual({ done: 0, total: 3, ratio: 0 })
    app.toggleSubtask(pid, a)
    expect(point().done).toBe(false)
    app.toggleSubtask(pid, b)
    expect(point().done).toBe(true)
    expect(app.goalProgress(gid)).toEqual({ done: 2, total: 3, ratio: 2 / 3 })
    // Ticking the point itself unticks every subtask.
    app.toggleChecklistItem(pid)
    expect(point().subtasks!.every((st) => !st.completed)).toBe(true)
  })

  it('ignores blank titles and reorders', () => {
    const app = useAppStore()
    const gid = app.addGoal({ title: 'M' })
    const pid = app.addChecklistItem(gid, 'P')
    expect(app.addSubtask(pid, '  ')).toBeUndefined()
    const a = app.addSubtask(pid, 'a')!
    app.addSubtask(pid, 'b')
    app.moveSubtask(pid, a, 1)
    expect(app.goalChecklist.find((c) => c.id === pid)!.subtasks!.map((s) => s.title)).toEqual([
      'b',
      'a',
    ])
  })

  it('offers Undo on delete, putting a ticked subtask back where it was', () => {
    const app = useAppStore()
    const gid = app.addGoal({ title: 'M' })
    const pid = app.addChecklistItem(gid, 'P')
    const a = app.addSubtask(pid, 'a')!
    app.addSubtask(pid, 'b')
    app.toggleSubtask(pid, a)
    const titles = () => app.goalChecklist.find((c) => c.id === pid)!.subtasks!.map((s) => s.title)

    app.removeSubtask(pid, a)
    expect(titles()).toEqual(['b'])
    expect(app.goalProgress(gid)).toEqual({ done: 0, total: 1, ratio: 0 })
    expect(app.toast?.message).toBe('Deleted subtask "a"')

    app.performUndo()
    expect(titles()).toEqual(['a', 'b'])
    expect(app.goalProgress(gid)).toEqual({ done: 1, total: 2, ratio: 0.5 })
  })
})

describe('closing a milestone', () => {
  function ready() {
    const app = useAppStore()
    const gid = app.addGoal({ title: 'Core language' })
    const pid = app.addChecklistItem(gid, 'Closures')
    const sid = app.addSubtask(pid, 'Counter factory')!
    return { app, gid, pid, sid }
  }

  it('refuses until every unit is checked and a summary exists', () => {
    const { app, gid, pid, sid } = ready()
    expect(app.closeMilestone(gid)).toEqual([
      '1 of 1 still unchecked',
      'Write a conclusion summary',
    ])
    app.toggleSubtask(pid, sid)
    expect(app.closeMilestone(gid)).toEqual(['Write a conclusion summary'])
    app.setConclusionSummary(gid, 'Closures capture bindings.')
    app.addAcceptanceCheck(gid, 'Explain closures without notes')
    expect(app.closeMilestone(gid)).toEqual(['Confirm 1 acceptance check'])
    app.toggleAcceptanceCheck(gid, 1)
    expect(app.closeMilestone(gid)).toEqual([])

    const g = app.goals.find((x) => x.id === gid)!
    expect(g.status).toBe('done')
    expect(g.conclusion).toMatchObject({
      status: 'completed',
      summary: 'Closures capture bindings.',
    })
    expect(g.conclusion!.closedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(g.audit!.map((a) => a.action)).toEqual(['closed'])
  })

  it('never closes an empty milestone', () => {
    const app = useAppStore()
    const gid = app.addGoal({ title: 'Empty' })
    app.setConclusionSummary(gid, 'Nothing to do')
    expect(app.closeMilestone(gid)).toEqual(['Add at least one point or subtask'])
  })

  it('reopens when a subtask is unchecked, keeping the audit and the summary', () => {
    const { app, gid, pid, sid } = ready()
    app.toggleSubtask(pid, sid)
    app.setConclusionSummary(gid, 'Done')
    app.closeMilestone(gid)
    app.toggleSubtask(pid, sid)
    const g = app.goals.find((x) => x.id === gid)!
    expect(g.status).toBe('active')
    expect(g.conclusion).toMatchObject({ status: 'pending', summary: 'Done', closedAt: null })
    expect(g.audit!.map((a) => [a.action, a.reason])).toEqual([
      ['closed', 'Closed with conclusion'],
      ['reopened', 'Subtask unchecked'],
    ])
  })
})

describe('goals above milestones', () => {
  it('weights goal progress by milestone size and counts closed ones', () => {
    const app = useAppStore()
    const sg = app.addSkillGoal({ title: 'JavaScript' })
    const small = app.addGoal({ title: 'M1', skillGoalId: sg, startDate: '2026-10-01' })
    const big = app.addGoal({ title: 'M2', skillGoalId: sg, startDate: '2026-11-01' })
    const p1 = app.addChecklistItem(small, 'one')
    app.toggleChecklistItem(p1)
    for (const t of ['a', 'b', 'c']) app.addChecklistItem(big, t)
    app.setConclusionSummary(small, 'ok')
    app.closeMilestone(small)

    expect(app.milestonesOfSkillGoal(sg).map((m) => m.title)).toEqual(['M1', 'M2'])
    expect(app.skillGoalProgress(sg)).toMatchObject({ done: 1, total: 4, milestones: 2, closed: 1 })
  })

  it('deleting a goal keeps its milestones, and Undo regroups them', () => {
    const app = useAppStore()
    const sg = app.addSkillGoal({ title: 'Vue' })
    const m = app.addGoal({ title: 'M', skillGoalId: sg })
    app.removeSkillGoal(sg)
    expect(app.skillGoals).toHaveLength(0)
    expect(app.goals.find((g) => g.id === m)!.skillGoalId).toBeNull()
    app.performUndo()
    expect(app.skillGoals.map((g) => g.id)).toEqual([sg])
    expect(app.goals.find((g) => g.id === m)!.skillGoalId).toBe(sg)
  })
})

describe('Learning & Goals documents', () => {
  const DOC = {
    project: 'learningandgoals',
    goals: [
      {
        title: 'TypeScript',
        timeline: { start: '2026-10-01', target: '2026-11-30' },
        milestones: [
          {
            title: 'Types',
            duration: 10,
            tasks: [
              {
                title: 'Generics',
                subtasks: [{ title: 'Constraints', completed: true }, 'Inference'],
              },
              { title: 'Read handbook', completed: true },
            ],
          },
          { title: 'Bad', duration: { start: '2026-10-20', deadline: '2026-10-01' } },
        ],
      },
    ],
    tracking_rules: { unit: 'subtask' },
  }

  it('imports every valid level and skips invalid rows', async () => {
    const { parseLearningDoc } = await import('@/utils/learningDoc')
    const app = useAppStore()
    const res = app.importLearningDoc(parseLearningDoc(DOC))
    expect(res).toMatchObject({ goals: 1, milestones: 1, tasks: 2, subtasks: 2, updated: 0 })
    const [sg] = app.skillGoals
    const [m] = app.milestonesOfSkillGoal(sg.id)
    expect(m).toMatchObject({ title: 'Types', startDate: '2026-10-01', targetDate: '2026-10-10' })
    expect(app.goalProgress(m.id)).toEqual({ done: 2, total: 3, ratio: 2 / 3 })
    expect(app.learningMeta).toEqual({
      project: 'learningandgoals',
      trackingRules: { unit: 'subtask' },
    })
  })

  it('updates on re-import instead of duplicating, keeping local additions', async () => {
    const { parseLearningDoc } = await import('@/utils/learningDoc')
    const app = useAppStore()
    app.importLearningDoc(parseLearningDoc(DOC))
    const m = app.goals[0]
    const generics = app.goalChecklist.find((c) => c.text === 'Generics')!
    app.addLearning(generics.id, 'extends narrows the type parameter')
    app.toggleSubtask(generics.id, generics.subtasks![1].id)

    const res = app.importLearningDoc(parseLearningDoc(DOC))
    expect(res.updated).toBe(2)
    expect(app.goals).toHaveLength(1)
    expect(app.goalChecklist).toHaveLength(2)
    const again = app.goalChecklist.find((c) => c.text === 'Generics')!
    expect(again.id).toBe(generics.id)
    expect(again.learnings).toHaveLength(1)
    // The document is the source of truth for completion on import.
    expect(again.subtasks!.map((s) => s.completed)).toEqual([true, false])
    expect(app.goals[0].id).toBe(m.id)
  })

  it('exports with stable ids and re-imports onto the same items', async () => {
    const { parseLearningDoc } = await import('@/utils/learningDoc')
    const app = useAppStore()
    const sg = app.addSkillGoal({ title: 'Vue', startDate: '2026-10-01' })
    const m = app.addGoal({
      title: 'Composition API',
      skillGoalId: sg,
      startDate: '2026-10-01',
      targetDate: '2026-10-14',
    })
    const p = app.addChecklistItem(m, 'Refs')
    const s1 = app.addSubtask(p, 'ref vs reactive')!
    app.toggleSubtask(p, s1)

    const text = app.exportLearningDoc()
    const parsed = parseLearningDoc(text)
    expect(parsed.goals[0].id).toBe(`goal-${sg}`)
    expect(parsed.goals[0].milestones[0]).toMatchObject({
      id: `milestone-${m}`,
      start: '2026-10-01',
      deadline: '2026-10-14',
    })
    const res = app.importLearningDoc(parsed)
    expect(res.updated).toBe(2)
    expect(app.skillGoals).toHaveLength(1)
    expect(app.goals).toHaveLength(1)
    expect(app.goalChecklist[0].subtasks!.map((s) => [s.id, s.completed])).toEqual([[s1, true]])
  })

  it('adds a lone milestone to the goal of that title, keeping its dates', async () => {
    const { parseLearningDoc } = await import('@/utils/learningDoc')
    const app = useAppStore()
    const sg = app.addSkillGoal({
      title: 'React — Junior to Pro',
      startDate: '2026-10-01',
      targetDate: '2027-03-31',
    })
    const res = app.importLearningDoc(
      parseLearningDoc({
        project: 'learningandgoals',
        goal: 'react — junior to pro',
        milestone: {
          title: 'Advanced React State Management',
          description: 'Client and server state.',
          duration: { start: '2026-10-28', deadline: '2026-11-06' },
          tasks: [{ title: 'Master Zustand', subtasks: [{ title: 'Typed store' }] }],
        },
      }),
    )
    expect(res).toMatchObject({ goals: 1, milestones: 1, subtasks: 1 })
    expect(app.skillGoals).toHaveLength(1)
    expect(app.skillGoals[0]).toMatchObject({
      id: sg,
      startDate: '2026-10-01',
      targetDate: '2027-03-31',
    })
    const [m] = app.milestonesOfSkillGoal(sg)
    expect(m).toMatchObject({
      title: 'Advanced React State Management',
      description: 'Client and server state.',
      startDate: '2026-10-28',
      targetDate: '2026-11-06',
    })
  })
})
