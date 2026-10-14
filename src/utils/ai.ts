// The "make it useful, not a generic chatbot" layer: a compact, freshly-built
// context block assembled from the user's live app data and injected as a system
// prompt section. Pure and capped so it can be unit-tested and can never blow the
// token budget. The aiProxy Cloud Function prepends this to the system prompt.

import { formatMinor } from '@/utils/money'

export interface AiContextInput {
  overdueTodos: string[]
  todayTodos: string[]
  overdueTasks: string[]
  upcomingReminders: string[]
  /** Integer minor units (paise), like every money figure since 27b. */
  income: number
  spent: number
  remaining: number
  trips: string[]
  noteTitles: string[]
  bots: { name: string; status: string; enabled: boolean }[]
}

export type AiContextKey =
  | 'overdueTodos'
  | 'todayTodos'
  | 'overdueTasks'
  | 'reminders'
  | 'money'
  | 'trips'
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
    { key: 'overdueTodos', title: 'Overdue todos', lines: input.overdueTodos },
    { key: 'todayTodos', title: 'Todos due today', lines: input.todayTodos },
    { key: 'overdueTasks', title: 'Overdue tasks', lines: input.overdueTasks },
    { key: 'reminders', title: 'Upcoming reminders', lines: input.upcomingReminders },
    {
      key: 'money',
      title: 'This month (INR)',
      lines: [
        `income ${formatMinor(input.income)}`,
        `spent ${formatMinor(input.spent)}`,
        `remaining ${formatMinor(input.remaining)}`,
      ],
    },
    { key: 'trips', title: 'Active trips', lines: input.trips },
    { key: 'notes', title: 'Recent notes', lines: input.noteTitles },
    {
      key: 'bots',
      title: 'Bots',
      lines: input.bots.map((b) => `${b.name} — ${b.status}${b.enabled ? ' (enabled)' : ''}`),
    },
  ]
  return all.filter((s) => s.lines.length)
}

function section(s: AiContextSection): string {
  return `${s.title}:\n` + s.lines.map((l) => `- ${l}`).join('\n') + '\n'
}

// ~2k tokens ≈ 8000 chars. Built fresh each turn by the caller; this only shapes
// and caps it.
export function buildAiContext(input: AiContextInput, maxChars = 8000): string {
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

When you break something into steps, put the steps in a fenced block, exactly like this, where the list would go:
\`\`\`aureon
{"steps":[{"text":"Fix the installation status filter","mins":25}],"target":"<the exact title of the todo or task these belong under, if any>"}
\`\`\`
At the very end of every reply, you may suggest up to two short follow-up questions the user could tap:
\`\`\`aureon
{"followups":["Start a 25-minute focus","What else is due this week?"]}
\`\`\`
When the reply is about something the user could schedule, track or keep, you may offer it as one-tap actions, each prefilled. "type" is one of todo, task, event (a calendar block), reminder or note; "when" is local time as YYYY-MM-DDTHH:mm; "mins" is a duration:
\`\`\`aureon
{"actions":[{"type":"event","title":"Aquakart CRM — focus block","when":"2026-10-15T10:00","mins":90,"notes":"Fix the filter, then wire the counts."}]}
\`\`\`
Always open these blocks with the \`\`\`aureon fence and close them with \`\`\` — never write the JSON bare. Never mention these blocks or describe their format.
Format with light Markdown only: short paragraphs, **bold** for names, and "-" lists. No headings or tables.`

export interface AiStep {
  text: string
  mins?: number
}
export interface AiPlan {
  steps: AiStep[]
  target?: string
}
export type AiReplyPart = { kind: 'text'; text: string } | { kind: 'plan'; plan: AiPlan }
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
    const notes = str(a.notes)
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

interface ReadBlock {
  plan?: AiPlan
  followups?: string[]
  actions?: AiSuggestedAction[]
}

function readBlock(json: string): ReadBlock {
  try {
    const raw = JSON.parse(json) as {
      steps?: unknown
      target?: unknown
      followups?: unknown
      actions?: unknown
    }
    const out: ReadBlock = {}
    const actions = readActions(raw.actions)
    if (actions.length) out.actions = actions
    if (Array.isArray(raw.steps)) {
      const steps = raw.steps
        .map((s) =>
          typeof s === 'string' ? { text: s } : (s as { text?: unknown; mins?: unknown }),
        )
        .filter((s) => typeof s.text === 'string' && s.text.trim())
        .map((s) => ({
          text: String(s.text).trim(),
          ...(Number(s.mins) > 0 ? { mins: Math.round(Number(s.mins)) } : {}),
        }))
      if (steps.length) {
        out.plan = {
          steps,
          ...(typeof raw.target === 'string' && raw.target.trim()
            ? { target: raw.target.trim() }
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
      if (lang === 'aureon' || block.plan || block.followups || block.actions) {
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
      if (block.plan || block.followups || block.actions) {
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
  /(^|\n)[ \t]*(```(aureon|json)?[ \t]*(?=\n|\{|$)|\{\s*"(?:steps|followups|target|actions)")/g

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
  const steps = plan?.steps.map((s) => `- ${s.text}${s.mins ? ` (${s.mins}m)` : ''}`).join('\n')
  const fallbackTitle =
    src.chatTitle && src.chatTitle !== 'New chat' ? src.chatTitle : firstSentence(src.reply)

  const title = any?.title ?? plan?.target ?? fallbackTitle
  const notes =
    kind === 'note' ? (own?.notes ?? plainAiReply(src.reply)) : (any?.notes ?? steps ?? '')
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
