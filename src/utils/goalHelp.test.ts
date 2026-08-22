// Section 23, and the reason the help content is data rather than markup:
// documentation that cannot be tested goes stale silently. Every claim the
// panel makes is checked here against the parser that actually reads it, so a
// change to normalizeGoal that this reference does not follow fails the build.
import { describe, expect, it } from 'vitest'
import {
  GOAL_HELP_STEPS,
  GOAL_HELP_TABS,
  GOAL_SCHEMA_FIELDS,
  GOAL_SHORTHAND,
  SAMPLE_GOAL_JSON,
  isGoalHelpTab,
  shouldAutoOpenGoalHelp,
} from '@/utils/goalHelp'
import { parseGoalsJson, parseItemMetadata } from '@/utils/goals'

describe('the sample goal', () => {
  const doc = parseGoalsJson(SAMPLE_GOAL_JSON)

  it('is valid JSON — the button loads it, so it cannot be prose', () => {
    expect(doc.parseError).toBeUndefined()
  })

  it('imports without a single flagged row', () => {
    expect(doc.goals).toHaveLength(1)
    expect(doc.goals[0].error).toBeUndefined()
  })

  it('carries the fields the walkthrough says it does', () => {
    const goal = doc.goals[0]
    expect(goal.title).toBe('Ship the trading bot')
    expect(goal.startAt).toBe('2026-08-15')
    expect(goal.targetAt).toBe('2026-11-30')
    expect(goal.status).toBe('active')
    expect(goal.color).toBe('#7c5cff')
    expect(goal.points).toHaveLength(3)
  })

  it('shows every point shape somebody might need to edit', () => {
    const [shorthandEstimate, shorthandDue, longForm] = doc.goals[0].points
    // A string with ~ and #.
    expect(shorthandEstimate.text).toBe('Finish the backtest harness')
    expect(shorthandEstimate.estimateMins).toBe(120)
    expect(shorthandEstimate.tags).toEqual(['research'])
    // A string with @.
    expect(shorthandDue.text).toBe('Paper trade for two weeks')
    expect(shorthandDue.dueAt).toBe('2026-09-15')
    // The object form, including a point-level timeline.
    expect(longForm.text).toBe('Go live with 1% size')
    expect(longForm.estimateMins).toBe(90)
    expect(longForm.startAt).toBe('2026-11-01')
    expect(longForm.dueAt).toBe('2026-11-30')
    expect(longForm.tags).toEqual(['launch'])
    expect(longForm.done).toBe(false)
  })
})

describe('the shorthand cheat-sheet', () => {
  it('strips exactly what it claims to leave behind', () => {
    for (const entry of GOAL_SHORTHAND) {
      expect(parseItemMetadata(entry.example).text, entry.token).toBe(entry.leaves)
    }
  })

  it('parses each token to the value the sheet promises', () => {
    expect(parseItemMetadata('x ~2h').estimateMins).toBe(120)
    expect(parseItemMetadata('x ~90m').estimateMins).toBe(90)
    expect(parseItemMetadata('x @2026-09-01').dueAt).toBe('2026-09-01')
    expect(parseItemMetadata('Read the docs #research #api').tags).toEqual(['research', 'api'])
  })
})

describe('the schema reference', () => {
  const byField = (scope: string, field: string) =>
    GOAL_SCHEMA_FIELDS.find((f) => f.scope === scope && f.field === field)

  it('covers every field section 23 names', () => {
    for (const [scope, field] of [
      ['goal', 'title'],
      ['goal', 'description'],
      ['goal', 'timeline.start'],
      ['goal', 'timeline.target'],
      ['goal', 'points'],
      ['goal', 'color'],
      ['goal', 'status'],
      ['goal', 'recurrence'],
      ['goal', 'metric'],
      ['point', 'estimateMins'],
      ['point', 'dueAt'],
      ['point', 'tags'],
    ] as const) {
      expect(byField(scope, field), `${scope}.${field}`).toBeTruthy()
    }
  })

  it('annotates every row — a table with a blank cell is not a reference', () => {
    for (const row of GOAL_SCHEMA_FIELDS) {
      expect(row.type.length, row.field).toBeGreaterThan(0)
      expect(row.example.length, row.field).toBeGreaterThan(0)
      expect(row.notes.length, row.field).toBeGreaterThan(20)
    }
  })

  it('marks title as the one required goal field, matching the parser', () => {
    const required = GOAL_SCHEMA_FIELDS.filter((f) => f.scope === 'goal' && f.required)
    expect(required.map((f) => f.field)).toEqual(['title'])
    // And the parser agrees: no title is the only thing that flags a row.
    expect(parseGoalsJson('{"goals":[{"description":"no title"}]}').goals[0].error).toBe(
      'Missing title',
    )
    expect(parseGoalsJson('{"goals":[{"title":"t"}]}').goals[0].error).toBeUndefined()
  })

  // The claim most likely to rot, and the most damaging if it does: these two
  // are documented as app-only, so the parser had better still drop them.
  it('is right that recurrence and metric are not read from a document', () => {
    const appOnly = GOAL_SCHEMA_FIELDS.filter((f) => f.source === 'app').map((f) => f.field)
    expect(appOnly).toEqual(['recurrence', 'metric'])
    const parsed = parseGoalsJson(
      '{"goals":[{"title":"t","recurrence":{"enabled":true},"metric":{"enabled":true}}]}',
    )
    expect(parsed.goals[0]).not.toHaveProperty('recurrence')
    expect(parsed.goals[0]).not.toHaveProperty('metric')
  })

  it('is right that a bare string timeline reads as the target', () => {
    const notes = byField('goal', 'timeline.target')!.notes
    expect(notes).toContain('bare string')
    expect(
      parseGoalsJson('{"goals":[{"title":"t","timeline":"2026-11-30"}]}').goals[0],
    ).toMatchObject({ startAt: null, targetAt: '2026-11-30' })
  })

  it('is right that an explicit field beats the shorthand in the text', () => {
    const notes = byField('point', 'estimateMins')!.notes
    expect(notes).toContain('wins')
    const doc = parseGoalsJson(
      '{"goals":[{"title":"t","points":[{"text":"x ~2h","estimateMins":5}]}]}',
    )
    expect(doc.goals[0].points[0].estimateMins).toBe(5)
  })

  it('is right that an unrecognised status falls back rather than failing', () => {
    const goal = parseGoalsJson('{"goals":[{"title":"t","status":"nonsense"}]}').goals[0]
    expect(goal.status).toBe('active')
    expect(goal.error).toBeUndefined()
  })
})

describe('the walkthroughs', () => {
  it('has one per tab, each a numbered sequence with a demo', () => {
    for (const tab of GOAL_HELP_TABS) {
      const steps = GOAL_HELP_STEPS[tab.value]
      expect(steps.length, tab.value).toBeGreaterThanOrEqual(3)
      for (const step of steps) {
        expect(step.title.length, tab.value).toBeGreaterThan(0)
        expect(step.body.length, tab.value).toBeGreaterThan(20)
        // Every step shows what it produces — that is the screenshot-free demo.
        expect(step.demo, `${tab.value}: ${step.title}`).toBeTruthy()
      }
    }
  })

  it('names the three ways in, and nothing else', () => {
    expect(GOAL_HELP_TABS.map((t) => t.value)).toEqual(['manual', 'json', 'link'])
    expect(isGoalHelpTab('json')).toBe(true)
    expect(isGoalHelpTab('elsewhere')).toBe(false)
  })
})

describe('the one automatic open', () => {
  const state = (over: Partial<Parameters<typeof shouldAutoOpenGoalHelp>[0]> = {}) => ({
    cloudReady: true,
    goalCount: 0,
    seen: false,
    alreadyOpen: false,
    ...over,
  })

  it('opens for a first-timer on an empty tab', () => {
    expect(shouldAutoOpenGoalHelp(state())).toBe(true)
  })

  it('never opens again once the flag is on the user doc', () => {
    expect(shouldAutoOpenGoalHelp(state({ seen: true }))).toBe(false)
  })

  it('does not open for somebody who already has goals', () => {
    expect(shouldAutoOpenGoalHelp(state({ goalCount: 3 }))).toBe(false)
  })

  // The one that would otherwise ship: before the workspace arrives the seen
  // flag reads false for everybody, so an unguarded check pops the panel on
  // every cold load — exactly what the flag exists to prevent.
  it('waits for the workspace rather than trusting a default flag', () => {
    expect(shouldAutoOpenGoalHelp(state({ cloudReady: false }))).toBe(false)
  })

  it('does not re-open a panel that is already up', () => {
    expect(shouldAutoOpenGoalHelp(state({ alreadyOpen: true }))).toBe(false)
  })
})
