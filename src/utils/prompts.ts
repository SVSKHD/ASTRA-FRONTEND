// The Prompts tab: short, reusable prompt templates with fill-in blanks.
//
// The point is tokens. A prompt typed from scratch each time grows a preamble
// ("I was wondering if you could possibly help me with…") that the model reads
// and bills for and that changes nothing in the answer. A template says the
// task once, tightly, and leaves only the parts that change as blanks — so the
// prompt that goes out is the short one every time.
//
// A blank is written `{{name}}`. The same name twice is one blank, filled once.
// Everything here is pure, so the tab and the tests share one definition of
// what a blank is, how a prompt is filled and how many tokens it costs.

/** A template as the tab lists it: one of the library's, or one of the user's. */
export interface PromptEntry {
  /** 'b:<slug>' for a built-in, 'u:<id>' for one of the user's own. */
  key: string
  builtIn: boolean
  topic: string
  title: string
  body: string
}

const BLANK_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

/** The blanks in a template, in the order they first appear, each once. */
export function blanksOf(body: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of body.matchAll(BLANK_RE)) {
    const name = m[1]
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

/** One run of a filled template: literal text, or a blank with its value. */
export type PromptPart =
  { kind: 'text'; text: string } | { kind: 'blank'; name: string; value: string }

/**
 * The template cut into runs, so a preview can mark which words were filled
 * in and which blanks are still empty. Values are looked up by name, ignoring
 * case, the same way `blanksOf` folds repeats together.
 */
export function promptParts(body: string, values: Record<string, string>): PromptPart[] {
  const lookup = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]))
  const parts: PromptPart[] = []
  let last = 0
  for (const m of body.matchAll(BLANK_RE)) {
    const at = m.index ?? 0
    if (at > last) parts.push({ kind: 'text', text: body.slice(last, at) })
    const name = m[1]
    parts.push({ kind: 'blank', name, value: (lookup.get(name.toLowerCase()) ?? '').trim() })
    last = at + m[0].length
  }
  if (last < body.length) parts.push({ kind: 'text', text: body.slice(last) })
  return parts
}

/**
 * The template with its blanks filled. An empty blank stays as `{{name}}`, so a
 * prompt copied before it is finished says plainly what is missing rather than
 * going out with a hole in a sentence.
 */
export function fillPrompt(body: string, values: Record<string, string>): string {
  return promptParts(body, values)
    .map((p) => (p.kind === 'text' ? p.text : p.value || `{{${p.name}}}`))
    .join('')
}

/** How many blanks still have nothing in them. */
export function emptyBlanks(body: string, values: Record<string, string>): string[] {
  const lookup = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v.trim()]))
  return blanksOf(body).filter((name) => !lookup.get(name.toLowerCase()))
}

/**
 * The same prompt with nothing the model needs taken out: runs of spaces and
 * tabs become one space, each line is trimmed, and blank lines between
 * paragraphs are kept to one. Whitespace is tokens too, and a pasted block of
 * code or notes is usually full of it.
 */
export function compactPrompt(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * A token estimate. About four characters a token is the usual rule of thumb
 * for English with the common tokenizers, and that is all this claims to be —
 * close enough to see which of two prompts is cheaper, not a billing figure.
 */
export function estimateTokens(text: string): number {
  const t = text.trim()
  return t ? Math.ceil(t.length / 4) : 0
}

/** A blank whose name asks for more than a line gets a multi-line field. */
export function isLongBlank(name: string): boolean {
  return /\b(code|text|content|context|details?|notes?|draft|error|log|data|input|description|paste)\b/i.test(
    name,
  )
}

// An example for a blank, so a field says what kind of answer it wants rather
// than repeating its own name back. Known names get a real example; anything
// else gets a plain prompt to type.
const HINTS: Record<string, string> = {
  language: 'e.g. TypeScript',
  framework: 'e.g. Vitest',
  expected: 'what should happen',
  actual: 'what happens instead',
  level: 'e.g. beginner, senior',
  task: 'e.g. parses a CSV row',
  inputs: 'e.g. a string and a delimiter',
  output: 'e.g. an array of fields',
  tone: 'e.g. friendly, firm, formal',
  length: 'e.g. 3 bullets, 50 words',
  audience: 'e.g. my manager',
  recipient: 'e.g. the vendor',
  subject: 'e.g. the delayed invoice',
  goal: 'e.g. get a new date',
  answer: 'e.g. yes, from Monday',
  when: 'e.g. last Tuesday',
  ask: 'e.g. an update',
  options: 'e.g. Postgres vs MongoDB',
  'use case': 'e.g. a small SaaS',
  criteria: 'e.g. cost, speed, setup',
  topic: 'e.g. remote work',
  context: 'e.g. a 5-person team',
  concept: 'e.g. recursion',
  weeks: 'e.g. 6',
  skill: 'e.g. SQL',
  hours: 'e.g. 5',
  count: 'e.g. 10',
  difficulty: 'e.g. medium',
  minutes: 'e.g. 25',
  start: 'e.g. 9am',
  end: 'e.g. 6pm',
  tasks: 'e.g. report, gym, calls',
  meetings: 'e.g. 11am standup',
}
export function blankHint(name: string): string {
  const known = HINTS[name.toLowerCase()]
  if (known) return known
  return isLongBlank(name) ? `Paste the ${name}…` : `Type the ${name}…`
}

/** A blank's name as a field label: "use case" → "Use case". */
export function blankLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

// ---- the library ------------------------------------------------------------
// Written to be short. Each says the task, the constraint that matters, and the
// shape of the answer — the three things that change what comes back — and
// nothing else.

const LIBRARY: Omit<PromptEntry, 'key' | 'builtIn'>[] = [
  // Coding
  {
    topic: 'Coding',
    title: 'Fix a bug',
    body: '{{language}} bug. Expected: {{expected}}. Actual: {{actual}}.\nCode:\n{{code}}\nFind the cause, give the minimal fix, explain in 2 lines.',
  },
  {
    topic: 'Coding',
    title: 'Review code',
    body: 'Review this {{language}} code for bugs, edge cases and readability. List issues by severity, one line each, with the fix.\n{{code}}',
  },
  {
    topic: 'Coding',
    title: 'Explain code',
    body: 'Explain what this {{language}} code does, step by step, for a {{level}} developer. No restating line by line.\n{{code}}',
  },
  {
    topic: 'Coding',
    title: 'Write a function',
    body: 'Write a {{language}} function that {{task}}. Inputs: {{inputs}}. Output: {{output}}. Handle edge cases. Code only, plus a 1-line usage example.',
  },
  {
    topic: 'Coding',
    title: 'Write tests',
    body: 'Write {{framework}} tests for this code. Cover the happy path, edge cases and failures. Code only.\n{{code}}',
  },
  // Writing
  {
    topic: 'Writing',
    title: 'Rewrite clearly',
    body: 'Rewrite for clarity and brevity, keep the meaning, tone: {{tone}}. Return only the rewrite.\n{{text}}',
  },
  {
    topic: 'Writing',
    title: 'Summarise',
    body: 'Summarise in {{length}} for {{audience}}. Keep key facts and numbers.\n{{text}}',
  },
  {
    topic: 'Writing',
    title: 'Fix grammar',
    body: 'Fix grammar and spelling only. Do not change style. Return the corrected text.\n{{text}}',
  },
  // Email
  {
    topic: 'Email',
    title: 'Write an email',
    body: 'Email to {{recipient}} about {{subject}}. Goal: {{goal}}. Tone: {{tone}}. Under 120 words, with a subject line.',
  },
  {
    topic: 'Email',
    title: 'Reply to an email',
    body: 'Reply to this email. My answer: {{answer}}. Tone: {{tone}}. Under 100 words.\n{{email}}',
  },
  {
    topic: 'Email',
    title: 'Follow up',
    body: 'Polite follow-up to {{recipient}} on {{subject}}, last contact {{when}}. Ask for {{ask}}. Under 70 words.',
  },
  // Research
  {
    topic: 'Research',
    title: 'Compare options',
    body: 'Compare {{options}} for {{use case}}. Table: criteria as rows ({{criteria}}). Then a 2-line recommendation.',
  },
  {
    topic: 'Research',
    title: 'Pros and cons',
    body: 'Pros and cons of {{topic}} for {{context}}. 5 bullets each, most important first.',
  },
  {
    topic: 'Research',
    title: 'Explain a concept',
    body: 'Explain {{concept}} to a {{level}} in under 150 words, with one concrete example.',
  },
  // Learning
  {
    topic: 'Learning',
    title: 'Study plan',
    body: '{{weeks}}-week plan to learn {{skill}} from {{level}}, {{hours}} h/week. Weekly goals + one project. Bullets.',
  },
  {
    topic: 'Learning',
    title: 'Quiz me',
    body: '{{count}} quiz questions on {{topic}}, {{difficulty}} level. Answers at the end.',
  },
  // Productivity
  {
    topic: 'Productivity',
    title: 'Break down a task',
    body: 'Break "{{task}}" into steps of under {{minutes}} min each. Numbered, with a time estimate each.',
  },
  {
    topic: 'Productivity',
    title: 'Plan my day',
    body: 'Plan my day {{start}}–{{end}}. Tasks: {{tasks}}. Fixed: {{meetings}}. Hard work first, breaks included. Time blocks only.',
  },
  {
    topic: 'Productivity',
    title: 'Meeting notes to actions',
    body: 'From these notes, list decisions, then action items as "owner — task — due". Nothing else.\n{{notes}}',
  },
]

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export const BUILT_IN_PROMPTS: PromptEntry[] = LIBRARY.map((p) => ({
  ...p,
  key: 'b:' + slug(p.topic + '-' + p.title),
  builtIn: true,
}))

/** The library's topics, in the order the library lists them. */
export const BUILT_IN_TOPICS: string[] = [...new Set(LIBRARY.map((p) => p.topic))]
