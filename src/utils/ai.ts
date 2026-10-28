// The "make it useful, not a generic chatbot" layer: a compact, freshly-built
// context block assembled from the user's live app data and injected as a system
// prompt section. Pure and capped so it can be unit-tested and can never blow the
// token budget. The aiProxy Cloud Function prepends this to the system prompt.

import { formatMinor } from '@/utils/money'

// Todos, tasks, calendar blocks and reminders are four separate things in the
// app, so each goes over as its own clearly-named section — the model must be
// able to answer "my todos" without mixing in tasks, events or reminders.
export interface AiContextInput {
  /**
   * Open todos in tree order: each sub-todo follows its parent, indented two
   * spaces per level. Overdue ones are flagged on their own line rather than
   * split into a separate list, so the nesting survives.
   */
  todos: string[]
  /** Open tasks, as a tree in the same way. */
  tasks: string[]
  /** Time-blocked todos/tasks on the calendar over the coming week. */
  calendar: string[]
  /** Upcoming (and missed) reminders, each with when it fires. */
  upcomingReminders: string[]
  /** Integer minor units (paise), like every money figure since 27b. */
  income: number
  spent: number
  remaining: number
  trips: string[]
  ideas: string[]
  goals: string[]
  stocks: string[]
  noteTitles: string[]
  bots: { name: string; status: string; enabled: boolean }[]
}

export type AiContextKey =
  | 'todos'
  | 'tasks'
  | 'calendar'
  | 'reminders'
  | 'money'
  | 'trips'
  | 'ideas'
  | 'goals'
  | 'stocks'
  | 'notes'
  | 'bots'

export interface AiContextSection {
  key: AiContextKey
  title: string
  lines: string[]
}

// The same sections the model is sent, as data — so the "What Aureon sees"
// panel shows exactly what goes over the wire rather than a description of it.
export function aiContextSections(input: AiContextInput): AiContextSection[] {
  const all: AiContextSection[] = [
    {
      key: 'todos',
      title: 'TODOS — open, sub-todos indented under their parent',
      lines: input.todos,
    },
    {
      key: 'tasks',
      title: 'TASKS — open, subtasks indented under their parent',
      lines: input.tasks,
    },
    { key: 'calendar', title: 'CALENDAR — scheduled blocks, next 7 days', lines: input.calendar },
    { key: 'reminders', title: 'REMINDERS — upcoming', lines: input.upcomingReminders },
    {
      key: 'money',
      title: 'This month (INR)',
      lines: [
        `income ${formatMinor(input.income)}`,
        `spent ${formatMinor(input.spent)}`,
        `remaining ${formatMinor(input.remaining)}`,
      ],
    },
    { key: 'trips', title: 'TRIPS — planned', lines: input.trips },
    { key: 'ideas', title: 'IDEAS — open', lines: input.ideas },
    { key: 'goals', title: 'GOALS — active', lines: input.goals },
    { key: 'stocks', title: 'STOCKS — watchlist', lines: input.stocks },
    { key: 'notes', title: 'Recent notes', lines: input.noteTitles },
    {
      key: 'bots',
      title: 'Bots',
      lines: input.bots.map((b) => `${b.name} — ${b.status}${b.enabled ? ' (enabled)' : ''}`),
    },
  ]
  return all.filter((s) => s.lines.length)
}

// A line's leading spaces are its nesting depth, so the bullet goes after them.
function section(s: AiContextSection): string {
  return `${s.title}:\n` + s.lines.map((l) => l.replace(/^(\s*)/, '$1- ')).join('\n') + '\n'
}

// ~6k tokens ≈ 24000 chars — room for the todo and task trees and every other
// collection's open items with their refs and description previews, which the
// caller caps per section. Built fresh each turn by the caller; this only
// shapes and caps it.
export function buildAiContext(input: AiContextInput, maxChars = 24000): string {
  const parts = aiContextSections(input).map(section)
  const block = ["[AUREON CONTEXT — the user's live data]", ...parts].join('\n').trim()
  if (block.length <= maxChars) return block
  return block.slice(0, maxChars - 1).trimEnd() + '…'
}

/** The usual ~4 characters a token. A readout, not a bill. */
export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4)
}

// ---- Structured replies --------------------------------------------------
// A reply can carry a plan card (steps with minutes, and the item they belong
// under) and follow-up chips. The model writes them as a fenced ```aureon JSON
// block; the view renders the card where the block sits and the chips after the
// reply. Plain prose needs nothing — the block is optional.

export const AI_INSTRUCTIONS = `You are Aureon, the assistant inside the user's personal tracker. Be brief, concrete and warm. Use the user's data when it is provided; never invent items that are not in it.

The user's data keeps TODOS, TASKS, CALENDAR and REMINDERS as separate lists, and so must you. When the user asks about todos, answer only from the TODOS section; tasks only from TASKS; calendar, schedule, events or meetings only from CALENDAR; reminders only from REMINDERS. Never mix one kind into another's answer — if a list is missing or empty, say there are none of that kind rather than substituting another. Only when the user asks what is on their plate, their day or their week, combine them, labelled by kind.

TODOS and TASKS are trees: an indented item is a sub-todo or subtask of the item above it at one level less. Whenever you list todos or tasks, keep that structure — every sub-item stays under its own parent as an indented "-" list, in the order given, and is never flattened or moved under another parent. If you list only some items (say, those missing a description), still show each one under its parent, and include the parent's title for context even when the parent itself does not match. Items flagged "overdue" are overdue; say so where it helps.

Each item in the data starts with a ref like [todo:12] and ends with its current description: desc: none when it has none, otherwise a short preview. When the user asks which items lack a description, list the ones marked desc: none, by title (never show refs or ids). When the user asks you to write, fill in or improve descriptions, put them in an updates block — one entry per item, with the type and id copied exactly from its ref:
\`\`\`aureon
{"updates":[{"type":"todo","id":12,"description":"Renew the car insurance before the current policy lapses on 2 Nov, so the car is never uninsured. Get the renewal quote from the current insurer, compare it with two others on cover and claim history, then pay online and save the new policy PDF."}]}
\`\`\`
"type" is one of todo, task, idea, goal, trip, reminder or stock. The description replaces the current one, so keep whatever is still true in it and add to it. Write it from the item's title, tag and dates, its parent and sub-items, and anything the user has told you: what it is, why it matters and the concrete next steps, in plain sentences. A sub-item's description should fit within its parent's goal. Each description is 200 to 300 characters long unless the user asks for a different length. Only use refs that appear in the data. Todo and task descriptions are saved automatically when your reply finishes, and the user can undo them; other kinds are saved when the user taps the card. In prose, just say what you wrote; do not repeat the descriptions.

When you break something into steps, put the steps in a fenced block, exactly like this, where the list would go:
\`\`\`aureon
{"steps":[{"text":"Fix the installation status filter","mins":25,"notes":"The status dropdown on /installations ignores 'Pending'. Check the query param mapping in the list API, then confirm the count badge updates."}],"target":"<the exact title of the existing todo or task these belong under, if any>","title":"<when there is no target: a short name for the new todo these steps divide>"}
\`\`\`
At the very end of every reply, you may suggest up to two short follow-up questions the user could tap:
\`\`\`aureon
{"followups":["Start a 25-minute focus","What else is due this week?"]}
\`\`\`
When the reply is about something the user could schedule, track or keep, you may offer it as one-tap actions, each prefilled. "type" is one of todo, task, event (a calendar block), reminder or note; "when" is local time as YYYY-MM-DDTHH:mm; "mins" is a duration:
\`\`\`aureon
{"actions":[{"type":"event","title":"Aquakart CRM — focus block","when":"2026-10-15T10:00","mins":90,"notes":"Fix the filter, then wire the counts."}]}
\`\`\`
When the user talks about new things they want to do, track or achieve — new todos, new tasks, new goals, a project to set up — propose them as new items in a create block, so they can be created with one tap. Pick the kind that fits: "todo" for a quick personal to-do; "task" for a piece of work, with "due" as YYYY-MM-DD when there is a deadline; "goal" for a bigger outcome to work towards over time, with "due" as its target date. "items" are short sub-points: for a todo or task they become its sub-todos or subtasks, for a goal they become its checklist steps. Divide the work: any todo or task that takes more than one action gets 2 to 6 items, one concrete action each, in the order they are done; only a single-action item has none. "tag" is an optional one-word label. Propose only what the user discussed, never something already in their data, and ask before guessing a date:
\`\`\`aureon
{"create":[{"type":"goal","title":"Run a half marathon","due":"2027-03-01","notes":"Finish the city half marathon in March under 2h15, building up from 5 km runs three times a week.","items":["Buy running shoes","Run 5 km three times a week","Sign up for the race"]},{"type":"task","title":"Book a physio check-up","due":"2026-11-05","notes":"Check the left knee before training ramps up."}]}
\`\`\`
Nothing is created until the user taps the card; in prose, say briefly what you suggest and that they can create it below.
When the user shares a link, the page's text is given to you under WEB PAGES THE USER LINKED. Use it for the details — names, dates, times, places, prices, steps, requirements — and never invent what the page does not say. When they want to act on it (plan it, track it, add it), propose the items in a create block, put the details you used in each item's "notes", and end the notes with the link. If a page could not be read, say so plainly and work from what the user wrote.
Every step, action and new item becomes a real item in the user's app, and its "notes" become that item's description. So "text"/"title" is a short name, and "notes" must carry every detail the user gave or you worked out for it: the what and why, names, numbers, amounts, dates, links, file or page names, acceptance criteria and sub-points. Never leave "notes" out or empty, and never drop a detail the user mentioned.
Always open these blocks with the \`\`\`aureon fence and close them with \`\`\` — never write the JSON bare. Never mention these blocks or describe their format.
Format with light Markdown only: short paragraphs, **bold** for names, and "-" lists. No headings or tables.`

export interface AiStep {
  text: string
  mins?: number
  /** The step's details — what becomes the created item's description. */
  notes?: string
}

/**
 * Everything a plan step carries, as the description of the item it becomes:
 * its notes, then its estimate. Empty only when the step has neither.
 */
export function stepDescription(s: AiStep): string {
  const parts = [s.notes?.trim() ?? '']
  if (s.mins) parts.push(`Estimate: ${s.mins} min`)
  return parts.filter(Boolean).join('\n\n')
}
export interface AiPlan {
  steps: AiStep[]
  target?: string
  /** The new todo the steps divide, when they belong under no existing item. */
  title?: string
}
/** The collections whose description an updates block may rewrite. */
export type AiUpdateKind = 'todo' | 'task' | 'idea' | 'goal' | 'trip' | 'reminder' | 'stock'
export const AI_UPDATE_KINDS: AiUpdateKind[] = [
  'todo',
  'task',
  'idea',
  'goal',
  'trip',
  'reminder',
  'stock',
]
/** A new description for one existing item, as the model proposed it. */
export interface AiItemUpdate {
  kind: AiUpdateKind
  id: number
  description: string
}
/** The kinds a create block may make. */
export type AiNewKind = 'todo' | 'task' | 'goal'
export const AI_NEW_KINDS: AiNewKind[] = ['todo', 'task', 'goal']
/** One new item the model proposed — created only when the user taps the card. */
export interface AiNewItem {
  kind: AiNewKind
  title: string
  notes?: string
  /** YYYY-MM-DD: a task's deadline, a goal's target date. A todo has none. */
  due?: string
  tag?: string
  /** Sub-todos / subtasks, or a goal's checklist steps. */
  items?: string[]
}
export type AiReplyPart =
  | { kind: 'text'; text: string }
  | { kind: 'plan'; plan: AiPlan }
  | { kind: 'updates'; updates: AiItemUpdate[] }
  | { kind: 'create'; items: AiNewItem[] }
export type AiActionKind = 'todo' | 'task' | 'event' | 'reminder' | 'note'
export const AI_ACTION_KINDS: AiActionKind[] = ['todo', 'task', 'event', 'reminder', 'note']
/** An action the model offered — every field but the kind is a suggestion. */
export interface AiSuggestedAction {
  kind: AiActionKind
  title?: string
  when?: string
  mins?: number
  notes?: string
}
export interface ParsedAiReply {
  parts: AiReplyPart[]
  followups: string[]
  actions: AiSuggestedAction[]
}

const WHEN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/

function readActions(raw: unknown): AiSuggestedAction[] {
  if (!Array.isArray(raw)) return []
  const out: AiSuggestedAction[] = []
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  for (const a of raw as Record<string, unknown>[]) {
    const kind = String(a?.type ?? a?.kind ?? '') as AiActionKind
    if (!AI_ACTION_KINDS.includes(kind)) continue
    const title = str(a.title)
    const when = str(a.when)
    const notes = str(a.notes) ?? str(a.description) ?? str(a.details)
    out.push({
      kind,
      ...(title ? { title } : {}),
      ...(when && WHEN.test(when) ? { when } : {}),
      ...(Number(a.mins) > 0 ? { mins: Math.round(Number(a.mins)) } : {}),
      ...(notes ? { notes } : {}),
    })
  }
  return out
}

function readUpdates(raw: unknown): AiItemUpdate[] {
  if (!Array.isArray(raw)) return []
  const out: AiItemUpdate[] = []
  for (const u of raw as Record<string, unknown>[]) {
    let kind = String(u?.type ?? u?.kind ?? '')
    let id = Number(u?.id)
    // The model sometimes hands back the whole ref ("todo:12") instead.
    const ref = /^\[?(\w+):(\d+)\]?$/.exec(String(u?.ref ?? u?.id ?? ''))
    if (ref) {
      kind ||= ref[1]
      id = Number(ref[2])
    }
    const description = [u?.description, u?.notes, u?.desc].find(
      (v): v is string => typeof v === 'string' && !!v.trim(),
    )
    if (!AI_UPDATE_KINDS.includes(kind as AiUpdateKind) || !Number.isFinite(id) || !description)
      continue
    out.push({ kind: kind as AiUpdateKind, id, description: description.trim() })
  }
  return out
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

function readCreate(raw: unknown): AiNewItem[] {
  if (!Array.isArray(raw)) return []
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const out: AiNewItem[] = []
  for (const c of raw as Record<string, unknown>[]) {
    const kind = String(c?.type ?? c?.kind ?? '').toLowerCase() as AiNewKind
    const title = str(c?.title) ?? str(c?.text)
    if (!AI_NEW_KINDS.includes(kind) || !title) continue
    const notes = str(c.notes) ?? str(c.description) ?? str(c.details)
    // "2026-11-05T10:00" still names a day; keep just the day.
    const due = str(c.due ?? c.deadline ?? c.targetDate ?? c.when)?.slice(0, 10)
    const tag = str(c.tag)?.replace(/^#/, '').split(/\s+/)[0]
    const rawItems = Array.isArray(c.items) ? c.items : Array.isArray(c.steps) ? c.steps : []
    const items = (rawItems as unknown[])
      .map((i) =>
        typeof i === 'string'
          ? i.trim()
          : (str((i as Record<string, unknown>)?.title ?? (i as Record<string, unknown>)?.text) ??
            ''),
      )
      .filter(Boolean)
      .slice(0, 30)
    out.push({
      kind,
      title: title.replace(/\s+/g, ' '),
      ...(notes ? { notes } : {}),
      ...(due && DAY.test(due) && kind !== 'todo' ? { due } : {}),
      ...(tag ? { tag } : {}),
      ...(items.length ? { items } : {}),
    })
  }
  return out.slice(0, 20)
}

interface ReadBlock {
  plan?: AiPlan
  followups?: string[]
  actions?: AiSuggestedAction[]
  updates?: AiItemUpdate[]
  create?: AiNewItem[]
}

function readBlock(json: string): ReadBlock {
  try {
    const raw = JSON.parse(json) as {
      steps?: unknown
      target?: unknown
      followups?: unknown
      actions?: unknown
      updates?: unknown
      create?: unknown
      title?: unknown
    }
    const out: ReadBlock = {}
    const create = readCreate(raw.create)
    if (create.length) out.create = create
    const actions = readActions(raw.actions)
    if (actions.length) out.actions = actions
    const updates = readUpdates(raw.updates)
    if (updates.length) out.updates = updates
    if (Array.isArray(raw.steps)) {
      const steps = raw.steps
        .map((s) => (typeof s === 'string' ? { text: s } : ((s ?? {}) as Record<string, unknown>)))
        .map((s) => {
          const first = (...vs: unknown[]) =>
            vs.find((v): v is string => typeof v === 'string' && !!v.trim())?.trim()
          return {
            text: first(s.text, s.title) ?? '',
            mins: Number(s.mins),
            notes: first(s.notes, s.description, s.details),
          }
        })
        .filter((s) => s.text)
        .map((s) => ({
          text: s.text,
          ...(s.mins > 0 ? { mins: Math.round(s.mins) } : {}),
          ...(s.notes ? { notes: s.notes } : {}),
        }))
      if (steps.length) {
        out.plan = {
          steps,
          ...(typeof raw.target === 'string' && raw.target.trim()
            ? { target: raw.target.trim() }
            : {}),
          ...(typeof raw.title === 'string' && raw.title.trim()
            ? { title: raw.title.trim().replace(/\s+/g, ' ').slice(0, 120) }
            : {}),
        }
      }
    }
    if (Array.isArray(raw.followups)) {
      out.followups = raw.followups
        .filter((f): f is string => typeof f === 'string' && !!f.trim())
        .map((f) => f.trim())
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Split a reply into prose and plan cards, and lift out its follow-ups. An
 * unclosed block (mid-stream) is hidden until it closes, so the raw JSON never
 * flashes on screen.
 */
export function parseAiReply(content: string): ParsedAiReply {
  const parts: AiReplyPart[] = []
  const followups: string[] = []
  const actions: AiSuggestedAction[] = []
  const pushText = (t: string) => {
    const text = t.replace(/\n{3,}/g, '\n\n').trim()
    if (text) parts.push({ kind: 'text', text })
  }
  const src = content || ''
  const take = (block: ReturnType<typeof readBlock>) => {
    if (block.plan) parts.push({ kind: 'plan', plan: block.plan })
    if (block.updates) parts.push({ kind: 'updates', updates: block.updates })
    if (block.create) parts.push({ kind: 'create', items: block.create })
    if (block.followups) followups.push(...block.followups)
    if (block.actions) actions.push(...block.actions)
  }
  const done = () => ({ parts, followups: followups.slice(0, 3), actions })
  let textStart = 0
  STRUCT_START.lastIndex = 0
  for (let m = STRUCT_START.exec(src); m; m = STRUCT_START.exec(src)) {
    const at = m.index + m[1].length
    if (m[2].startsWith('```')) {
      const lang = m[3] ?? ''
      const bodyStart = at + m[2].length
      const end = src.indexOf('```', bodyStart)
      const body = src.slice(bodyStart, end < 0 ? undefined : end).trim()
      if (end < 0) {
        // Still streaming. Hide what will become a block; let a code fence show.
        if (lang === 'aureon' || body.startsWith('{') || !body) {
          pushText(src.slice(textStart, at))
          return done()
        }
        break
      }
      const block = readBlock(body)
      if (
        lang === 'aureon' ||
        block.plan ||
        block.followups ||
        block.actions ||
        block.updates ||
        block.create
      ) {
        pushText(src.slice(textStart, at))
        take(block)
        textStart = end + 3
      }
      STRUCT_START.lastIndex = end + 3
    } else {
      // The model sometimes drops the fence and writes the JSON bare.
      const end = closingBrace(src, at)
      if (end < 0) {
        pushText(src.slice(textStart, at))
        return done()
      }
      const block = readBlock(src.slice(at, end))
      if (block.plan || block.followups || block.actions || block.updates || block.create) {
        pushText(src.slice(textStart, at))
        take(block)
        textStart = end
      }
      STRUCT_START.lastIndex = Math.max(end, at + 1)
    }
  }
  pushText(src.slice(textStart))
  return done()
}

// A block's start: a fence (```aureon, ```json or a bare ```) or, at the start
// of a line, a bare JSON object opening on one of the block's keys.
const STRUCT_START =
  /(^|\n)[ \t]*(```(aureon|json)?[ \t]*(?=\n|\{|$)|\{\s*"(?:steps|followups|target|actions|updates|create)")/g

/** The index just past the brace that closes the object opening at `from`. */
function closingBrace(src: string, from: number): number {
  let depth = 0
  let inString = false
  for (let i = from; i < src.length; i++) {
    const ch = src[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return i + 1
  }
  return -1
}

/** The reply as plain text — for the copy button and the chat-list preview. */
export function plainAiReply(content: string): string {
  return parseAiReply(content)
    .parts.map((p) =>
      p.kind === 'text'
        ? p.text
        : p.kind === 'updates'
          ? p.updates.map((u) => `- ${u.description}`).join('\n')
          : p.kind === 'create'
            ? p.items
                .map(
                  (c) =>
                    `- ${c.kind}: ${c.title}${c.due ? ` (by ${c.due})` : ''}` +
                    (c.items ?? []).map((i) => `\n  - ${i}`).join(''),
                )
                .join('\n')
            : p.plan.steps.map((s) => `- ${s.text}${s.mins ? ` (${s.mins}m)` : ''}`).join('\n'),
    )
    .join('\n\n')
}

// Empty-state suggestion chips. Static labels; the useful data goes into the
// context block above once the user picks one.
export const SUGGESTION_CHIPS: string[] = [
  'Summarise my overdue todos',
  "Where did this month's money go?",
  "What's my next reminder?",
  "Draft a note from this week's tasks",
]

// A short title from the first user message (no extra model call): first line,
// trimmed to a handful of words.
export function titleFromMessage(text: string): string {
  const firstLine = (text || '').split('\n')[0].trim()
  if (!firstLine) return 'New chat'
  const words = firstLine.split(/\s+/).slice(0, 6).join(' ')
  return words.length > 48 ? words.slice(0, 48) + '…' : words
}

// ---- Reply actions ---------------------------------------------------------
// Every finished reply offers to become a todo, task, calendar block, reminder
// or note. The dialog opens prefilled — from the model's own suggestion when it
// made one, otherwise from the reply itself — and nothing is created until the
// user has seen the fields and pressed Add.

export const AI_ACTION_META: Record<
  AiActionKind,
  {
    label: string
    add: string
    icon: 'square-check-big' | 'list-checks' | 'calendar-plus' | 'bell-plus' | 'sticky-note'
  }
> = {
  todo: { label: 'Todo', add: 'Add todo', icon: 'square-check-big' },
  task: { label: 'Task', add: 'Add task', icon: 'list-checks' },
  event: { label: 'Calendar', add: 'Add to calendar', icon: 'calendar-plus' },
  reminder: { label: 'Reminder', add: 'Set reminder', icon: 'bell-plus' },
  note: { label: 'Note', add: 'Save note', icon: 'sticky-note' },
}

export interface AiActionDraft {
  kind: AiActionKind
  title: string
  /** Local 'YYYY-MM-DDTHH:mm', or 'YYYY-MM-DD' for a task's due day; '' = none. */
  when: string
  mins: number | null
  notes: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')
function localInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** The next sensible slot: the top of an hour at least 30 minutes out, or 9am tomorrow. */
export function nextSlot(now: number): string {
  const d = new Date(now + 30 * 60_000)
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  if (d.getHours() >= 21 || d.getHours() < 8) {
    if (d.getHours() >= 21) d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
  }
  return localInput(d)
}

function firstSentence(text: string): string {
  const line =
    text
      .replace(/[*_`#>]/g, '')
      .split('\n')
      .find((l) => l.trim()) ?? ''
  const s = (/^(.+?[.!?:])(\s|$)/.exec(line.trim())?.[1] ?? line.trim()).replace(/[:.]$/, '')
  return s.length > 80 ? s.slice(0, 79).trimEnd() + '…' : s
}

export function aiActionDraft(
  kind: AiActionKind,
  src: { reply: string; chatTitle: string; now: number },
): AiActionDraft {
  const parsed = parseAiReply(src.reply)
  const own = parsed.actions.find((a) => a.kind === kind)
  const any = own ?? parsed.actions[0]
  const plan = parsed.parts.find((p) => p.kind === 'plan')?.plan
  const steps = plan?.steps
    .map((s) => {
      const head = `- ${s.text}${s.mins ? ` (${s.mins}m)` : ''}`
      return s.notes ? `${head}\n  ${s.notes.replace(/\n/g, '\n  ')}` : head
    })
    .join('\n')
  const fallbackTitle =
    src.chatTitle && src.chatTitle !== 'New chat' ? src.chatTitle : firstSentence(src.reply)

  const title = any?.title ?? plan?.target ?? fallbackTitle
  // Nothing the reply said is left behind: the model's own notes, then the
  // plan's steps with their details, and failing both the reply itself — an
  // item with an empty description loses whatever the chat worked out.
  const detail = [any?.notes, steps].filter((p): p is string => !!p?.trim()).join('\n\n')
  const notes =
    kind === 'note' ? (own?.notes ?? plainAiReply(src.reply)) : detail || plainAiReply(src.reply)
  let when = ''
  if (kind === 'event' || kind === 'reminder') {
    when = own?.when && own.when.includes('T') ? own.when : nextSlot(src.now)
  } else if (kind === 'task' && own?.when) {
    when = own.when.slice(0, 10)
  }
  const planMins = plan?.steps.reduce((sum, s) => sum + (s.mins ?? 0), 0) || null
  const mins = kind === 'event' ? (own?.mins ?? planMins ?? 30) : null
  return { kind, title, when, mins, notes }
}
