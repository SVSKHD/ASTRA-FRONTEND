// The AI tab's send loop, at module scope.
//
// It used to live inside AiView, so the `streaming` flag and the abort handle
// belonged to the component instance — and switching tabs unmounts it. The
// fetch kept writing into the store, but the view that came back had lost track
// of it: no Stop button, no cursor, and Send re-enabled mid-reply. Here the run
// outlives any one component, which is also what lets the chat dock follow a
// reply from another tab and pop when it lands.
//
// The OpenRouter key never touches the client: sends POST to `/api/ai`
// (VITE_AI_PROXY_URL), a Netlify function that verifies the Supabase session,
// injects the key, and streams back `data: {"text": …}` lines.

import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { supabase } from '@/supabase'
import { chatTarget } from '@/utils/aiSettings'
import {
  AI_INSTRUCTIONS,
  buildAiContext,
  parseAiReply,
  stepDescription,
  type AiActionDraft,
  type AiContextInput,
  type AiItemUpdate,
  type AiNewItem,
  type AiNewKind,
  type AiPlan,
  type AiUpdateKind,
} from '@/utils/ai'
import { richPlain } from '@/utils/richText'
import { buildIndex, childrenOf, rootsOf, type TreeNode } from '@/utils/taskTree'
import { fromLocalInput } from '@/utils/detailFields'
import { noteLabel } from '@/utils/notes'
import { currentMonthKey, resolveIncome } from '@/utils/budget'
import { toMinor } from '@/utils/money'
import { blockFor } from '@/utils/calendarEvents'
import { upcomingReminders } from '@/utils/upcoming'
import { repFreqLabel } from '@/utils/reminders'
import type { Task, Todo } from '@/types'

export interface AiRun {
  chatId: number
  msgId: number
  status: 'streaming' | 'done' | 'error'
  startedAt: number
  finishedAt?: number
}

const run = ref<AiRun | null>(null)
let abort: AbortController | null = null

/**
 * Who actually answered the latest reply. The proxy falls back to the other
 * provider when the picked one refuses, so the model picker shows a note when
 * this differs from the pick — otherwise it says "Qwen" over replies Gemini
 * wrote. Remembered per device so a fresh visit starts with the last answerer.
 */
export interface AiAnswerer {
  model: string
  provider: string
  /** Why the default provider was skipped, when it was. */
  fallback?: string
}
const ANSWERER_KEY = 'aureon.ai.answerer'
function readAnswerer(): AiAnswerer | null {
  try {
    const v = JSON.parse(localStorage.getItem(ANSWERER_KEY) || 'null') as AiAnswerer | null
    return v && typeof v.model === 'string' && typeof v.provider === 'string' ? v : null
  } catch {
    return null
  }
}
const answerer = ref<AiAnswerer | null>(readAnswerer())
function setAnswerer(next: AiAnswerer) {
  answerer.value = next
  try {
    localStorage.setItem(ANSWERER_KEY, JSON.stringify(next))
  } catch {
    /* private window — still right for this visit */
  }
}

const streaming = computed(() => run.value?.status === 'streaming')

function proxyUrl(): string {
  return import.meta.env.VITE_AI_PROXY_URL || ''
}

// Assemble the live-data context block fresh each turn. Exported for the
// "What Aureon sees" panel, which shows this same input.
export function aiContextInput(app: ReturnType<typeof useAppStore>): AiContextInput {
  const monthKey = currentMonthKey()
  // In integer paise, like everything else since 27b. The legacy `finances`
  // array is still rupee floats, so it converts on the way in — and the income
  // comes through resolveIncome rather than by reaching into the settings map.
  const monthExpenses = app.finances.filter((f) => (f.date || '').startsWith(monthKey))
  const spent = monthExpenses.reduce((sum, f) => sum + toMinor(f.amount || 0), 0)
  const income = resolveIncome(app.financeSettings, monthKey)
  const now = Date.now()
  const overdueTodos = app.pendingOverdue('todos') as Todo[]
  const overdueTasks = app.pendingOverdue('tasks') as Task[]
  const overdueTodoIds = new Set(overdueTodos.map((t) => t.id))
  const overdueTaskIds = new Set(overdueTasks.map((t) => t.id))
  const live = <T extends { status: string; archivedAt?: number | null }>(x: T) =>
    x.status !== 'done' && !x.archivedAt
  const todos = app.todos.filter(live)
  const tasks = app.tasks.filter(live)

  // The calendar is the time-blocked todos and tasks from the start of today
  // through the next 7 days — the same blocks the Calendar view draws.
  const dayStart = new Date(now).setHours(0, 0, 0, 0)
  const weekEnd = dayStart + 8 * DAY_MS
  const calendar = [
    ...todos.map((t) => ({ kind: 'todo', id: t.id, title: t.text, block: blockFor(t) })),
    ...tasks.map((t) => ({ kind: 'task', id: t.id, title: t.title, block: blockFor(t) })),
  ]
    .filter((e) => e.block && e.block.end > dayStart && e.block.start < weekEnd)
    .sort((a, b) => a.block!.start - b.block!.start)
    .slice(0, 25)
    .map((e) => `[${e.kind}:${e.id}] ${blockLabel(e.block!)} — ${e.title}`)

  const todoLine = (t: Todo) =>
    itemLine('todo', t.id, t.text, t.tag, t.description, [
      overdueTodoIds.has(t.id) ? 'overdue' : '',
      t.startAt ? `scheduled ${whenLabel(t.startAt)}` : '',
    ])
  const taskLine = (t: Task) =>
    itemLine('task', t.id, t.title, t.tag, t.notes, [
      overdueTaskIds.has(t.id) ? 'overdue' : '',
      t.deadline ? `due ${t.deadline}` : '',
    ])

  return {
    todos: treeLines(todos, todoLine),
    tasks: treeLines(tasks, taskLine),
    calendar,
    upcomingReminders: upcomingReminders(app.reminders, now, {
      withinMs: 14 * DAY_MS,
      limit: 12,
    }).map((u) =>
      itemLine('reminder', u.reminder.id, u.reminder.title, '', u.reminder.note, [
        whenLabel(u.fireAt),
        u.overdue ? 'missed, not acknowledged' : '',
        u.reminder.repeat?.type && u.reminder.repeat.type !== 'none'
          ? repFreqLabel(u.reminder.repeat)
          : '',
      ]),
    ),
    income,
    spent,
    remaining: income - spent,
    trips: app.trips
      .filter((t) => t.status !== 'done')
      .slice(0, CAP)
      .map((t) => itemLine('trip', t.id, t.title, t.tag, t.description, [t.date])),
    ideas: app.ideas
      .filter(live)
      .slice(0, CAP)
      .map((i) =>
        itemLine('idea', i.id, i.title, i.tag, i.description, [
          i.ideaType,
          i.deadline ? `due ${i.deadline}` : '',
        ]),
      ),
    goals: app.goals
      .filter((g) => g.status === 'active' || g.status === 'paused')
      .slice(0, CAP)
      .map((g) =>
        itemLine('goal', g.id, g.title, g.tag, g.description, [
          g.status === 'paused' ? 'paused' : '',
          g.targetDate ? `target ${g.targetDate}` : '',
        ]),
      ),
    stocks: app.stocks
      .slice(0, CAP)
      .map((s) =>
        itemLine('stock', s.id, s.name ? `${s.symbol} (${s.name})` : s.symbol, s.tag, s.why),
      ),
    noteTitles: app.notes.slice(-6).map((n) => noteLabel(n)),
    bots: app.bots.map((b) => ({ name: b.name, status: b.status, enabled: b.enabled })),
  }
}

const DAY_MS = 86_400_000

function whenLabel(ms: number): string {
  return new Date(ms).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function blockLabel(b: { start: number; end: number; allDay: boolean }): string {
  if (b.allDay) {
    return (
      new Date(b.start).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }) + ', all day'
    )
  }
  const end = new Date(b.end)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${whenLabel(b.start)}–${p(end.getHours())}:${p(end.getMinutes())}`
}

// Items sent per collection — enough to cover a real list without letting one
// collection crowd the rest out of the context cap. The todo and task trees get
// more, since sub-items count too.
const CAP = 40
const TREE_CAP = 80

/**
 * A todo or task list in the order the tree views draw it: each item followed
 * by its sub-items, indented two spaces per level. An item whose parent is done
 * or archived (so not in `items`) is shown at the top level rather than hidden.
 */
function treeLines<T extends TreeNode>(items: T[], line: (item: T) => string): string[] {
  const index = buildIndex(items)
  const out: string[] = []
  const walk = (nodes: T[], level: number) => {
    for (const n of nodes) {
      if (out.length >= TREE_CAP) return
      out.push('  '.repeat(level) + line(n))
      walk(childrenOf(index, n.id), level + 1)
    }
  }
  walk(rootsOf(index), 0)
  return out
}

// What an item's description looks like to the model: "desc: none", or the
// opening of it. Rich-text descriptions go over as plain text.
function descLabel(text: string | null | undefined): string {
  const plain = richPlain(text).replace(/\s+/g, ' ').trim()
  if (!plain) return 'desc: none'
  return `desc: "${plain.length > 80 ? plain.slice(0, 79).trimEnd() + '…' : plain}"`
}

/**
 * One item as the model sees it: its ref (what an updates block names it by),
 * title, tag, any extra facts, and its current description.
 */
function itemLine(
  kind: AiUpdateKind,
  id: number,
  title: string,
  tag: string,
  description: string | null | undefined,
  extras: string[] = [],
): string {
  return [`[${kind}:${id}] ${title}`, tag ? `#${tag}` : '', ...extras, descLabel(description)]
    .filter(Boolean)
    .join(' · ')
}

async function accessToken(): Promise<string> {
  // getSession() refreshes an expired token before handing it over.
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  if (!session) throw new Error('Sign in before using AI.')
  return session.access_token
}

function finish(status: 'done' | 'error') {
  if (run.value) run.value = { ...run.value, status, finishedAt: Date.now() }
  abort = null
}

async function send(prompt: string): Promise<void> {
  const app = useAppStore()
  const body = prompt.trim()
  if (!body || streaming.value) return
  let chatId = app.aiActiveChatId
  if (chatId == null) chatId = app.newAiChat()
  const chat = app.aiChatById(chatId)
  if (!chat) return
  // The provider and model picked in the header, for this turn.
  const { provider, model } = chatTarget()
  if (model !== chat.model) app.setAiChatModel(chatId, model)

  app.addAiMessage(chatId, { role: 'user', content: body })
  const usedData = app.aiUseData
  const msgId = app.addAiMessage(chatId, { role: 'assistant', content: '', model, usedData })

  const url = proxyUrl()
  if (!url) {
    app.appendAiMessageContent(
      chatId,
      msgId,
      '⚠️ AI proxy not configured. Set `VITE_AI_PROXY_URL=/api/ai` and `BYTEZ_API_KEY` (server-side, no VITE_ prefix; `OPEN_ROUTER_API_KEY` is the fallback) so the `/api/ai` Netlify function can answer. Your message is saved.',
    )
    return
  }

  run.value = { chatId, msgId, status: 'streaming', startedAt: Date.now() }
  abort = new AbortController()
  let failed = false
  try {
    const history = app
      .aiChatById(chatId)!
      .messages.filter((m) => m.id !== msgId)
      .map((m) => ({ role: m.role, content: m.content }))
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await accessToken()}`,
      },
      body: JSON.stringify({
        provider,
        model,
        messages: history,
        system: [AI_INSTRUCTIONS, todayLine(), usedData ? buildAiContext(aiContextInput(app)) : '']
          .filter(Boolean)
          .join('\n\n'),
      }),
      signal: abort.signal,
    })
    if (!res.ok || !res.body) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(err?.error || 'Proxy error ' + res.status)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let evt: {
          text?: string
          model?: string
          provider?: string
          fallback?: string
          usage?: { in: number; out: number }
          error?: string
        }
        try {
          evt = JSON.parse(payload)
        } catch {
          continue /* keep-alive / non-JSON line */
        }
        if (evt.model) app.setAiMessageModel(chatId, msgId, evt.model)
        if (evt.model && evt.provider)
          setAnswerer({ model: evt.model, provider: evt.provider, fallback: evt.fallback })
        if (evt.text) app.appendAiMessageContent(chatId, msgId, evt.text)
        if (evt.usage) app.setAiMessageUsage(chatId, msgId, evt.usage.in, evt.usage.out)
        if (evt.error) throw new Error(evt.error)
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      failed = true
      app.appendAiMessageContent(
        chatId,
        msgId,
        `\n\n⚠️ ${(err as Error).message || 'Stream failed.'}`,
      )
    }
  } finally {
    const stopped = abort?.signal.aborted ?? false
    finish(failed ? 'error' : 'done')
    // Only a reply that finished on its own fills descriptions in by itself.
    if (!failed && !stopped) autoApplyUpdates(chatId, msgId)
  }
}

function stop() {
  abort?.abort()
}

/** Forget the finished run — the dock has been seen or dismissed. */
function dismiss() {
  if (run.value && run.value.status !== 'streaming') run.value = null
}

export interface AiPlanTarget {
  collection: 'todos' | 'tasks'
  id: number
  label: string
}

/**
 * The open todo or task a plan's steps belong under, by the title the model
 * named: an exact match first, then the first title that contains it.
 */
export function resolvePlanTarget(
  app: ReturnType<typeof useAppStore>,
  plan: AiPlan,
): AiPlanTarget | null {
  const want = plan.target?.trim().toLowerCase()
  if (!want) return null
  const open: AiPlanTarget[] = [
    ...app.todos
      .filter((t) => !t.done)
      .map((t) => ({ collection: 'todos' as const, id: t.id, label: t.text })),
    ...app.tasks
      .filter((t) => !t.done && !t.archivedAt)
      .map((t) => ({ collection: 'tasks' as const, id: t.id, label: t.title })),
  ]
  return (
    open.find((o) => o.label.trim().toLowerCase() === want) ??
    open.find((o) => o.label.toLowerCase().includes(want)) ??
    null
  )
}

/** One item a create card made, for the "Created" pop-up and its Undo. */
export interface AiCreated {
  kind: AiNewKind
  id: number
  title: string
  due?: string
  /** Sub-todo / subtask ids, or (for a goal) checklist item ids. */
  childIds: number[]
}

/**
 * Create a card's ticked items: todos and tasks with their sub-items nested
 * under them, goals with their steps as checklist items. Marks the card done
 * and returns what was made.
 */
function createItems(
  chatId: number,
  msgId: number,
  createIndex: number,
  items: AiNewItem[],
): AiCreated[] {
  const app = useAppStore()
  const made: AiCreated[] = []
  for (const it of items) {
    const subs = it.items ?? []
    if (it.kind === 'todo') {
      const id = app.addTodo(it.title, it.tag ?? '', it.notes ?? '')
      if (id == null) continue
      const childIds: number[] = []
      subs.forEach((s, i) => {
        const cid = app.addTodo(s, it.tag ?? '')
        if (cid == null) return
        app.moveTodo(cid, id, i)
        childIds.push(cid)
      })
      made.push({ kind: 'todo', id, title: it.title, childIds })
    } else if (it.kind === 'task') {
      const id = app.addTask(it.title, it.tag ?? '', {
        notes: it.notes ?? '',
        deadline: it.due ?? '',
      })
      if (id == null) continue
      const childIds: number[] = []
      subs.forEach((s, i) => {
        const cid = app.addTask(s, it.tag ?? '')
        if (cid == null) return
        app.moveTask(cid, id, i)
        childIds.push(cid)
      })
      made.push({ kind: 'task', id, title: it.title, due: it.due, childIds })
    } else {
      const id = app.addGoal({
        title: it.title,
        description: it.notes ?? '',
        targetDate: it.due ?? '',
        ...(it.tag ? { tag: it.tag } : {}),
      })
      const childIds = subs.map((s) => app.addChecklistItem(id, s))
      made.push({ kind: 'goal', id, title: it.title, due: it.due, childIds })
    }
  }
  if (made.length) app.markAiCreatesApplied(chatId, msgId, createIndex)
  return made
}

/** Take back what a create card made, and re-arm the card. */
function undoCreated(chatId: number, msgId: number, createIndex: number, made: AiCreated[]) {
  const app = useAppStore()
  for (const c of made) {
    if (c.kind === 'goal') {
      app.deleteGoal(c.id)
      continue
    }
    const list = c.kind === 'todo' ? 'todos' : 'tasks'
    // Children first, so no sub-item is left pointing at a parent that is gone.
    for (const cid of c.childIds) app.deleteWithUndo(list, c.kind, cid, { toast: false })
    app.deleteWithUndo(list, c.kind, c.id, { toast: false })
  }
  app.markAiCreatesApplied(chatId, msgId, createIndex, false)
}

/** Add a plan's steps — under its target when there is one, else as todos. */
function applyPlan(chatId: number, msgId: number, planIndex: number, plan: AiPlan): number {
  const app = useAppStore()
  const target = resolvePlanTarget(app, plan)
  let count = 0
  // Each step keeps its details as the new item's description — a todo or
  // subtask made from a plan used to arrive as a bare title.
  if (target) {
    // A task has an estimate field of its own; a todo keeps it in the text.
    const asTask = target.collection === 'tasks'
    const items = plan.steps.map((s) => ({
      title: s.text.replace(/\s+/g, ' '),
      description: asTask ? (s.notes ?? '') : stepDescription(s),
      ...(asTask && s.mins ? { estimateMins: s.mins } : {}),
    }))
    count = app.addItemsUnder(target.collection, target.id, JSON.stringify(items)).count
  } else {
    for (const s of plan.steps) app.addTodo(s.text, '', stepDescription(s))
    count = plan.steps.length
  }
  if (count) app.markAiPlanApplied(chatId, msgId, planIndex)
  return count
}

export interface AiUpdateTarget {
  title: string
  /** The item's description as it stands, as plain text. */
  current: string
  /** The description exactly as stored (possibly rich HTML) — what Undo restores. */
  raw: string
}

/** The live item an update names, or null when the ref matches nothing. */
export function resolveUpdateTarget(
  app: ReturnType<typeof useAppStore>,
  u: Pick<AiItemUpdate, 'kind' | 'id'>,
): AiUpdateTarget | null {
  const hit = <T extends { id: number }>(list: T[]) => list.find((x) => x.id === u.id)
  const t = (title: string | undefined, current: string | undefined) =>
    title === undefined ? null : { title, current: richPlain(current), raw: current ?? '' }
  switch (u.kind) {
    case 'todo': {
      const x = hit(app.todos)
      return t(x?.text, x?.description)
    }
    case 'task': {
      const x = hit(app.tasks)
      return t(x?.title, x?.notes)
    }
    case 'idea': {
      const x = hit(app.ideas)
      return t(x?.title, x?.description)
    }
    case 'goal': {
      const x = hit(app.goals)
      return t(x?.title, x?.description)
    }
    case 'trip': {
      const x = hit(app.trips)
      return t(x?.title, x?.description)
    }
    case 'reminder': {
      const x = hit(app.reminders)
      return t(x?.title, x?.note)
    }
    case 'stock': {
      const x = hit(app.stocks)
      return t(x?.symbol, x?.why)
    }
  }
}

function writeDescription(
  app: ReturnType<typeof useAppStore>,
  kind: AiUpdateKind,
  id: number,
  d: string,
) {
  switch (kind) {
    case 'todo':
      app.updateTodo(id, { description: d })
      break
    case 'task':
      app.updateTask(id, 'notes', d)
      break
    case 'idea':
      app.updateIdea(id, { description: d })
      break
    case 'goal':
      app.updateGoal(id, { description: d })
      break
    case 'trip':
      app.updateTrip(id, { description: d })
      break
    case 'reminder':
      app.updateReminder(id, 'note', d)
      break
    case 'stock':
      app.updateStock(id, { why: d })
      break
  }
}

/**
 * Write an updates card's descriptions onto the items it names. Refs that no
 * longer match an item are skipped. The toast's Undo puts every previous
 * description back and re-arms the card. Returns how many items were updated.
 */
function applyUpdates(
  chatId: number,
  msgId: number,
  updatesIndex: number,
  updates: AiItemUpdate[],
): number {
  const app = useAppStore()
  const before: { kind: AiUpdateKind; id: number; raw: string }[] = []
  for (const u of updates) {
    const target = resolveUpdateTarget(app, u)
    if (!target) continue
    before.push({ kind: u.kind, id: u.id, raw: target.raw })
    writeDescription(app, u.kind, u.id, u.description)
  }
  const count = before.length
  if (count) {
    app.markAiUpdatesApplied(chatId, msgId, updatesIndex)
    app.showToastWithUndo(`Updated ${count} description${count === 1 ? '' : 's'}`, () => {
      for (const b of before) writeDescription(app, b.kind, b.id, b.raw)
      app.markAiUpdatesApplied(chatId, msgId, updatesIndex, false)
    })
  }
  return count
}

/**
 * Once a reply has finished, fill in the todo and task descriptions it wrote
 * without waiting for a tap. A card naming any other kind (idea, goal, trip,
 * reminder, stock) still waits for the button.
 */
function autoApplyUpdates(chatId: number, msgId: number) {
  const app = useAppStore()
  const msg = app.aiChatById(chatId)?.messages.find((m) => m.id === msgId)
  if (!msg) return
  let idx = 0
  for (const part of parseAiReply(msg.content).parts) {
    if (part.kind !== 'updates') continue
    const auto = part.updates.every((u) => u.kind === 'todo' || u.kind === 'task')
    if (auto && !(msg.appliedUpdates ?? []).includes(idx)) {
      applyUpdates(chatId, msgId, idx, part.updates)
    }
    idx++
  }
}

// Suggested times are only useful if the model knows when "now" is.
function todayLine(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `Now: ${d.toDateString()}, ${p(d.getHours())}:${p(d.getMinutes())} local time (${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}).`
}

const ACTION_DONE: Record<AiActionDraft['kind'], string> = {
  todo: 'Added to todos',
  task: 'Added to tasks',
  event: 'Added to calendar',
  reminder: 'Reminder set',
  note: 'Saved to notes',
}

/**
 * Create what a reply-action dialog describes, after the user has checked it.
 * Notes on a task or calendar block go in a note attached to it, which is where
 * the detail pane reads them. Returns the toast line, or null when nothing was
 * made.
 */
function createFromDraft(draft: AiActionDraft): string | null {
  const app = useAppStore()
  const title = draft.title.trim()
  const notes = draft.notes.trim()
  const attach = (itemId: number | null | undefined) => {
    if (itemId == null || !notes) return
    const noteId = app.createNoteFor('task', itemId)
    if (noteId != null) app.setNoteText(noteId, notes)
  }
  switch (draft.kind) {
    case 'todo': {
      if (!title) return null
      app.addTodo(title, '', notes)
      break
    }
    case 'task': {
      if (!title) return null
      const deadline = /^\d{4}-\d{2}-\d{2}/.exec(draft.when)?.[0] ?? ''
      attach(app.addTask(title, '', { deadline }))
      break
    }
    case 'event': {
      const start = fromLocalInput(draft.when)
      if (!title || start == null) return null
      const mins = Math.max(5, draft.mins ?? 30)
      attach(
        app.createScheduledItem('task', title, '', {
          startAt: start,
          endAt: start + mins * 60_000,
          allDay: false,
          durationMins: mins,
        }),
      )
      break
    }
    case 'reminder': {
      if (!title || !draft.when) return null
      app.addReminder({ title, note: notes, start: draft.when, repeat: { type: 'none' } })
      break
    }
    case 'note': {
      if (app.addNote(title, notes) == null) return null
      break
    }
  }
  const line = ACTION_DONE[draft.kind]
  app.showToastMsg(`${line} — ${title || 'Untitled'}`)
  return line
}

export function useAiChat() {
  return {
    run,
    streaming,
    answerer,
    send,
    stop,
    dismiss,
    applyPlan,
    applyUpdates,
    createFromDraft,
    createItems,
    undoCreated,
  }
}
