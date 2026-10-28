import { describe, expect, it } from 'vitest'
import {
  countDoc,
  isLearningDoc,
  parseLearningDoc,
  writeLearningDoc,
  type ExportGoal,
} from '@/utils/learningDoc'

const SAMPLE = {
  project: 'learningandgoals',
  goals: [
    {
      title: 'JavaScript - Junior to Advanced',
      timeline: { start: '2026-10-01', target: '2026-12-31' },
      status: 'in_progress',
      milestones: [
        {
          title: 'Core language',
          duration: 21,
          tasks: [
            {
              title: 'Types & coercion',
              subtasks: [
                { title: '== vs ===', completed: true },
                { title: 'Truthiness table', completed: false },
              ],
            },
            { title: 'Read the spec chapter', completed: true },
          ],
          conclusion: { status: 'pending', summary: '', evidence: [], closed_at: null },
        },
        {
          title: 'Async & runtime',
          duration: '14 days',
          tasks: [{ title: 'Event loop', subtasks: ['Microtasks', 'Macrotasks'] }],
        },
        {
          id: 'js-perf',
          title: 'Performance',
          duration: { start: '2026-11-10', deadline: '2026-11-20' },
          completed: true,
          tasks: [],
        },
      ],
    },
  ],
  tracking_rules: { progress: 'subtasks' },
}

describe('reading', () => {
  it('recognises the goals → milestones shape', () => {
    expect(isLearningDoc(SAMPLE)).toBe(true)
    expect(isLearningDoc({ goals: [{ title: 'x', points: [] }] })).toBe(false)
  })

  it('reads every level, chaining duration-only milestones from the goal start', () => {
    const doc = parseLearningDoc(JSON.stringify(SAMPLE))
    const [g] = doc.goals
    expect(doc.project).toBe('learningandgoals')
    expect(doc.trackingRules).toEqual({ progress: 'subtasks' })
    expect(g).toMatchObject({ start: '2026-10-01', target: '2026-12-31' })
    const [m1, m2, m3] = g.milestones
    // 21 inclusive days from Oct 1 ends Oct 21; the next starts Oct 22.
    expect([m1.start, m1.deadline]).toEqual(['2026-10-01', '2026-10-21'])
    expect([m2.start, m2.deadline]).toEqual(['2026-10-22', '2026-11-04'])
    expect([m3.start, m3.deadline]).toEqual(['2026-11-10', '2026-11-20'])
    expect(m1.tasks[0].subtasks.map((s) => s.completed)).toEqual([true, false])
    expect(m1.tasks[1]).toMatchObject({ completed: true, subtasks: [] })
    // String subtasks are accepted; a completed milestone arrives closed.
    expect(m2.tasks[0].subtasks.map((s) => s.title)).toEqual(['Microtasks', 'Macrotasks'])
    expect(m3.conclusion?.status).toBe('completed')
  })

  it('builds stable ids from the title path, never from an index', () => {
    const [g] = parseLearningDoc(SAMPLE).goals
    expect(g.id).toBe('javascript-junior-to-advanced')
    expect(g.milestones[0].id).toBe('javascript-junior-to-advanced/core-language')
    expect(g.milestones[0].tasks[0].subtasks[0].id).toBe(
      'javascript-junior-to-advanced/core-language/types-coercion/vs',
    )
    expect(g.milestones[2].id).toBe('js-perf')
  })

  it('keeps duplicate titles apart', () => {
    const doc = parseLearningDoc({
      goals: [{ title: 'G', milestones: [{ title: 'M', tasks: ['a', 'a'] }] }],
    })
    expect(doc.goals[0].milestones[0].tasks.map((t) => t.id)).toEqual(['g/m/a', 'g/m/a-2'])
  })

  it('reports invalid rows instead of dropping them', () => {
    const doc = parseLearningDoc({
      goals: [
        { title: '', milestones: [] },
        {
          title: 'G',
          milestones: [
            { title: 'Backwards', duration: { start: '2026-10-10', deadline: '2026-10-01' } },
          ],
        },
      ],
    })
    const counts = countDoc(doc)
    expect(counts.goals).toBe(1)
    expect(counts.milestones).toBe(0)
    expect(counts.errors).toEqual([
      'Goal "(untitled)": Missing title',
      'Milestone "Backwards" in "G": Deadline is before the start',
    ])
  })

  it('never throws on bad JSON', () => {
    expect(parseLearningDoc('{nope').parseError).toBeTruthy()
  })

  it('reads one milestone exported on its own, beside its goal', () => {
    const single = {
      project: 'learningandgoals',
      goal: 'React — Junior to Pro',
      milestone: {
        title: 'Advanced React State Management',
        description: 'Client state, server state and sync.',
        duration: { start: '2026-10-28', deadline: '2026-11-06', days: 10 },
        status: 'not_started',
        completed: false,
        tasks: [
          {
            title: 'Master Zustand',
            completed: false,
            subtasks: [
              { title: 'Install Zustand and create a typed store', completed: false },
              { title: 'Implement state updates and selectors', completed: true },
            ],
          },
        ],
        progress: { completed_subtasks: 1, total_subtasks: 2, percentage: 50 },
        conclusion: { status: 'pending', summary: null, evidence: [], closed_at: null },
      },
    }
    expect(isLearningDoc(single)).toBe(true)
    const doc = parseLearningDoc(JSON.stringify(single))
    expect(doc.goals).toHaveLength(1)
    const [g] = doc.goals
    expect(g).toMatchObject({ id: 'react-junior-to-pro', title: 'React — Junior to Pro' })
    expect(g.milestones[0]).toMatchObject({
      title: 'Advanced React State Management',
      description: 'Client state, server state and sync.',
      start: '2026-10-28',
      deadline: '2026-11-06',
      conclusion: { status: 'pending', summary: '', closedAt: null },
    })
    expect(g.milestones[0].error).toBeUndefined()
    expect(countDoc(doc)).toMatchObject({ milestones: 1, subtasks: 2, completedSubtasks: 1 })
    // A milestone without its goal is not this shape.
    expect(isLearningDoc({ milestone: single.milestone })).toBe(false)
  })
})

describe('writing', () => {
  it('round-trips ids and completion state', () => {
    const doc = parseLearningDoc(SAMPLE)
    const goals: ExportGoal[] = doc.goals.map((g) => ({
      ...g,
      milestones: g.milestones.map((m) => ({ ...m })),
    }))
    const text = writeLearningDoc(
      doc.project,
      goals,
      doc.trackingRules,
      '2026-10-27T10:00:00+05:30',
    )
    const again = parseLearningDoc(text)
    const flat = (d: typeof doc) =>
      d.goals.flatMap((g) =>
        g.milestones.flatMap((m) =>
          m.tasks.flatMap((t) => [
            [t.id, t.completed],
            ...t.subtasks.map((s) => [s.id, s.completed]),
          ]),
        ),
      )
    expect(flat(again)).toEqual(flat(doc))
    expect(again.goals[0].milestones.map((m) => [m.id, m.start, m.deadline])).toEqual(
      doc.goals[0].milestones.map((m) => [m.id, m.start, m.deadline]),
    )
    expect(again.trackingRules).toEqual({ progress: 'subtasks' })
  })

  it('writes derived progress and status', () => {
    const doc = parseLearningDoc(SAMPLE)
    const out = JSON.parse(writeLearningDoc(doc.project, doc.goals, null, 'now'))
    const m1 = out.goals[0].milestones[0]
    // 1 of 2 subtasks + 1 of 1 plain task = 2 of 3.
    expect(m1).toMatchObject({ progress: 67, status: 'in_progress', completed: false })
    expect(m1.duration).toEqual({ start: '2026-10-01', deadline: '2026-10-21', days: 21 })
    expect(out.goals[0].milestones[2]).toMatchObject({ status: 'completed', completed: true })
  })
})
