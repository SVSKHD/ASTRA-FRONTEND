// "How to add a goal", as data (section 23).
//
// There are three ways into a goal and the app has always had all three; what
// it never had was anywhere that said so. This is that — the walkthroughs, the
// schema reference, the shorthand and a sample that actually imports.
//
// It lives here rather than as markup in the panel for two reasons. The first
// is that documentation which cannot be tested goes stale silently, and the
// worst possible bug in a schema reference is a field that no longer does what
// the table says. Everything below is asserted against the real parser in
// goalHelp.test.ts, so a change to `normalizeGoal` that this file does not
// follow fails the build.
//
// The second is honesty about scope: two of the fields somebody would expect to
// set in JSON — `recurrence` and `metric` — are not read by the importer at
// all. They are listed anyway, marked for what they are, because a reference
// that quietly omits them leaves the reader to discover it by having their
// config dropped.

import type { GoalDocStatus } from '@/utils/goals'

export type GoalHelpTab = 'manual' | 'json' | 'link'

export const GOAL_HELP_TABS: { value: GoalHelpTab; label: string }[] = [
  { value: 'manual', label: 'Create manually' },
  { value: 'json', label: 'Paste JSON' },
  { value: 'link', label: 'Import from link' },
]

export function isGoalHelpTab(value: unknown): value is GoalHelpTab {
  return value === 'manual' || value === 'json' || value === 'link'
}

// ---- the walkthroughs ------------------------------------------------------
// Each step carries a miniature of what it produces. Not a screenshot: a
// screenshot of this app would be stale by the next theme change and unreadable
// in the other one, and it cannot be read aloud. A demo is a few strings the
// panel draws with the same tokens as the real thing, so it restyles with the
// app and a screen reader gets the text.
export interface HelpDemo {
  // 'card' is a miniature goal card, 'points' a short checklist, 'code' a
  // fragment of the document, 'field' a single labelled control.
  kind: 'card' | 'points' | 'code' | 'field'
  title?: string
  meta?: string
  lines?: string[]
  code?: string
}

export interface HelpStep {
  title: string
  body: string
  demo: HelpDemo
}

export const GOAL_HELP_STEPS: Record<GoalHelpTab, HelpStep[]> = {
  manual: [
    {
      title: 'Open New goal',
      body: 'The button at the top right of this tab, or press g then n. A goal starts blank — there is nothing to fill in before it exists.',
      demo: { kind: 'card', title: 'Untitled goal', meta: 'Active · 0 points' },
    },
    {
      title: 'Give it a name and a timeline',
      body: 'The name is the only part that matters. Start and target are both optional; a target turns on the days-left chip on the card.',
      demo: {
        kind: 'card',
        title: 'Ship the trading bot',
        meta: 'Aug 15 → Nov 30 · 24 days left',
      },
    },
    {
      title: 'Add the points',
      body: 'One line each, in the order you would do them. Shorthand works as you type: ~2h sets an estimate, @2026-09-15 a due date, #research a tag.',
      demo: {
        kind: 'points',
        lines: [
          'Finish the backtest harness ~2h #research',
          'Paper trade for two weeks @2026-09-15',
          'Go live with 1% size',
        ],
      },
    },
    {
      title: 'Optional: make it recur, or give it a number',
      body: 'A recurring goal generates a dated occurrence per day and can carry a metric — a target you record against each time. Both are set on the goal itself, not in the JSON.',
      demo: { kind: 'card', title: 'Read 30 minutes', meta: 'Daily · at least 30 mins' },
    },
  ],
  json: [
    {
      title: 'Start from the schema',
      body: 'Copy the sample below, or use Load sample goal to drop a working document straight into the import box. Every field is in the reference table.',
      demo: { kind: 'code', code: '{ "goals": [{ "title": "…", "points": ["…"] }] }' },
    },
    {
      title: 'Open Import → Paste JSON',
      body: 'The import screen takes a pasted document, a dropped .json file, or a link. Anything starting with { or [ is read as JSON.',
      demo: { kind: 'field', title: 'Paste JSON, a link, or drop a .json file' },
    },
    {
      title: 'Check the preview',
      body: 'Every goal in the document is listed before anything is written. A goal missing a title is flagged and skipped; the rest still import.',
      demo: { kind: 'card', title: 'Ship the trading bot', meta: '3 points · ready' },
    },
    {
      title: 'Import',
      body: 'One write for the whole document. Points arrive as the goal’s checklist, with their estimates, due dates and tags already parsed.',
      demo: {
        kind: 'points',
        lines: ['Finish the backtest harness — 2h, #research', 'Paper trade — due Sep 15'],
      },
    },
  ],
  link: [
    {
      title: 'Copy a goals link',
      body: 'A spasta.online link of the shape ?project=<name>&goals=<items>. The older ?project=name=a|b|c form works too.',
      demo: { kind: 'code', code: 'spasta.online/?project=trading&goals=Backtest|Paper trade' },
    },
    {
      title: 'Open Import → Import from a link',
      body: 'Paste it in. If a link is already on your clipboard when the screen opens, it is filled in for you.',
      demo: { kind: 'field', title: 'https://spasta.online/?project=trading&goals=…' },
    },
    {
      title: 'Edit the preview',
      body: 'The project name becomes the goal title and each item becomes a point. Rename, reorder or drop rows before importing — and choose whether each row lands as a point, a task or a todo.',
      demo: { kind: 'points', lines: ['Backtest the strategy', 'Paper trade for two weeks'] },
    },
    {
      title: 'Import, or merge',
      body: 'Re-importing a link you have used before offers to merge into the goal it made, rather than creating a second copy of it.',
      demo: { kind: 'card', title: 'Trading', meta: 'Merge into existing goal' },
    },
  ],
}

// ---- the schema reference --------------------------------------------------
// `scope` is what the field hangs off; `source` is how it can be set. A field
// marked 'app' is real and settable — just not through a document, which is the
// one thing a schema table must not leave the reader to find out the hard way.
export interface SchemaField {
  field: string
  scope: 'document' | 'goal' | 'point'
  type: string
  required: boolean
  example: string
  notes: string
  source: 'json' | 'app'
}

export const GOAL_SCHEMA_FIELDS: SchemaField[] = [
  {
    field: 'project',
    scope: 'document',
    type: 'string',
    required: false,
    example: '"trading"',
    notes: 'Names the import. It does not become a goal, and it does not have to be unique.',
    source: 'json',
  },
  {
    field: 'goals',
    scope: 'document',
    type: 'array',
    required: true,
    example: '[{ "title": "…" }]',
    notes: 'The goals to create. An empty or missing array imports nothing rather than failing.',
    source: 'json',
  },
  {
    field: 'title',
    scope: 'goal',
    type: 'string',
    required: true,
    example: '"Ship the trading bot"',
    notes:
      'The only required field. A goal without one is flagged in the preview and skipped — every other goal in the document still imports.',
    source: 'json',
  },
  {
    field: 'description',
    scope: 'goal',
    type: 'string',
    required: false,
    example: '"Backtest, then go live."',
    notes: 'Free text. Searched along with the title from the goals toolbar.',
    source: 'json',
  },
  {
    field: 'timeline.start',
    scope: 'goal',
    type: 'string — YYYY-MM-DD',
    required: false,
    example: '"2026-08-15"',
    notes: 'Also accepted as a top-level `startDate`. Anything not an ISO date is ignored.',
    source: 'json',
  },
  {
    field: 'timeline.target',
    scope: 'goal',
    type: 'string — YYYY-MM-DD',
    required: false,
    example: '"2026-11-30"',
    notes:
      'Also accepted as `targetDate`. A bare string in place of the timeline object is read as the target. Drives the days-left chip.',
    source: 'json',
  },
  {
    field: 'points',
    scope: 'goal',
    type: 'array of string | object',
    required: false,
    example: '["Backtest ~2h", { "text": "Go live" }]',
    notes:
      'A string becomes { text }. Shorthand in the text is parsed out and stripped either way. A point with no text is dropped.',
    source: 'json',
  },
  {
    field: 'color',
    scope: 'goal',
    type: 'string',
    required: false,
    example: '"#7c5cff"',
    notes: 'Any CSS colour. Tints the progress ring on the card.',
    source: 'json',
  },
  {
    field: 'status',
    scope: 'goal',
    type: "'active' | 'paused' | 'done' | 'archived'",
    required: false,
    example: '"active"',
    notes: 'Defaults to active. Anything unrecognised falls back to active rather than failing.',
    source: 'json',
  },
  {
    field: 'recurrence',
    scope: 'goal',
    type: 'object',
    required: false,
    example: '—',
    notes:
      'Not read by the importer: set it on the goal after importing. Frequency, time of day and an optional end-of-day nudge.',
    source: 'app',
  },
  {
    field: 'metric',
    scope: 'goal',
    type: 'object',
    required: false,
    example: '—',
    notes:
      'Not read by the importer either. A number recorded against each occurrence of a recurring goal — label, unit, target and direction.',
    source: 'app',
  },
  {
    field: 'text',
    scope: 'point',
    type: 'string',
    required: true,
    example: '"Finish the backtest harness"',
    notes: 'Shorthand is stripped out of it, so the stored text is just the text.',
    source: 'json',
  },
  {
    field: 'estimateMins',
    scope: 'point',
    type: 'number — minutes',
    required: false,
    example: '120',
    notes: 'A `~2h` in the text sets the same field. Given both, this one wins.',
    source: 'json',
  },
  {
    field: 'dueAt',
    scope: 'point',
    type: 'string — YYYY-MM-DD',
    required: false,
    example: '"2026-09-15"',
    notes:
      'The point’s own `timeline.target` is the same field, and `@2026-09-15` in the text sets it too. Explicit wins over shorthand.',
    source: 'json',
  },
  {
    field: 'timeline.start',
    scope: 'point',
    type: 'string — YYYY-MM-DD',
    required: false,
    example: '"2026-09-01"',
    notes: 'When the point is meant to begin, as against when it is due.',
    source: 'json',
  },
  {
    field: 'tags',
    scope: 'point',
    type: 'string[]',
    required: false,
    example: '["research"]',
    notes:
      'Merged with any `#tag` found in the text, de-duplicated case-insensitively, first spelling kept.',
    source: 'json',
  },
  {
    field: 'done',
    scope: 'point',
    type: 'boolean',
    required: false,
    example: 'false',
    notes: 'Defaults to false. Lets an already-part-done plan import at the right progress.',
    source: 'json',
  },
]

// ---- the shorthand ---------------------------------------------------------
// The three tokens, with an example each that the test round-trips through the
// real parser — a cheat sheet that lies is worse than no cheat sheet.
export interface ShorthandEntry {
  token: string
  means: string
  example: string
  // What the example leaves behind once the token is stripped.
  leaves: string
}

export const GOAL_SHORTHAND: ShorthandEntry[] = [
  {
    token: '~2h',
    means: 'an estimate — `~90m` for minutes',
    example: 'Finish the backtest harness ~2h',
    leaves: 'Finish the backtest harness',
  },
  {
    token: '@2026-09-01',
    means: 'a due date, ISO only',
    example: 'Paper trade for two weeks @2026-09-01',
    leaves: 'Paper trade for two weeks',
  },
  {
    token: '#tag',
    means: 'a tag — as many as you like',
    example: 'Read the docs #research #api',
    leaves: 'Read the docs',
  },
]

// ---- the sample ------------------------------------------------------------
// A document that imports. It is deliberately one goal with three points, one
// of each shape: a string carrying shorthand, a string carrying a date, and the
// long object form. Anybody who edits it has seen every option they need.
export const SAMPLE_GOAL_JSON = `{
  "project": "trading",
  "goals": [
    {
      "title": "Ship the trading bot",
      "description": "Backtest, paper trade, then go live with a small size.",
      "timeline": { "start": "2026-08-15", "target": "2026-11-30" },
      "status": "active",
      "color": "#7c5cff",
      "points": [
        "Finish the backtest harness ~2h #research",
        "Paper trade for two weeks @2026-09-15",
        {
          "text": "Go live with 1% size",
          "estimateMins": 90,
          "timeline": { "start": "2026-11-01", "target": "2026-11-30" },
          "tags": ["launch"],
          "done": false
        }
      ]
    }
  ]
}`

// The status values the table names, kept in step with the parser's own list by
// the type rather than by a second copy of the strings.
export const SAMPLE_STATUS: GoalDocStatus = 'active'

// ---- the one automatic open (section 23) -----------------------------------
// A first-timer on an empty Goals tab gets the panel without asking. Once.
//
// Both guards matter. `cloudReady` is the important one: the seen flag lives on
// the user's document, so before the workspace has arrived it reads false for
// everybody — opening on that would pop the panel at every cold load, which is
// precisely the behaviour the flag exists to prevent. `goalCount` is the other:
// somebody with goals already knows how to make one.
export function shouldAutoOpenGoalHelp(state: {
  cloudReady: boolean
  goalCount: number
  seen: boolean
  alreadyOpen: boolean
}): boolean {
  if (!state.cloudReady || state.seen || state.alreadyOpen) return false
  return state.goalCount === 0
}
