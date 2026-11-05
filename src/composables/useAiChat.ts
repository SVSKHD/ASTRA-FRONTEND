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
  aiBackend,
  aureonAi,
  fallbackText,
  loadUsage,
  PROVIDER_NAME,
  streamChat,
  targetFor,
  setTarget,
  type ExternalProvider,
} from '@/ai/aureonChat'
import { aiTraces, applyEvent, endTrace, startTrace, traceKey } from '@/ai/steps'
import type { AiItemRef, AiMessage, AiSource } from '@/types'
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
  type AiParentRef,
  type AiPlan,
  type AiSubItem,
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
  // The provider and model picked in the header, for this turn. On Aureon the
  // pick is the chat's Aureon target (or the server's choice): the proxy-era
  // setting (Bytez "Qwen3 4B" by default) is never stamped on an Aureon reply,
  // which used to label a Gemini answer as Qwen until the stream named it.
  const onAureon = aiBackend() === 'aureon'
  const { provider, model: proxyModel } = chatTarget()
  const model = onAureon ? (targetFor(String(chatId))?.model ?? '') : proxyModel
  if (!onAureon && model !== chat.model) app.setAiChatModel(chatId, model)

  app.addAiMessage(chatId, { role: 'user', content: body })
  const usedData = app.aiUseData
  // The item picked to work on, as it stands right now.
  const working = focus.value ? focusInfo(app, focus.value) : null
  if (focus.value && !working) setFocus(null) // deleted since it was picked
  const msgId = app.addAiMessage(chatId, {
    role: 'assistant',
    content: '',
    model,
    usedData,
    ...(working ? { focus: { collection: working.collection, id: working.id } } : {}),
  })

  if (onAureon) {
    await sendAureon(app, chatId, msgId, body, working, usedData)
    return
  }

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
        // Links in the message are fetched by the proxy and read by the model.
        readLinks: true,
        messages: history,
        system: [
          AI_INSTRUCTIONS,
          todayLine(),
          working ? focusBlock(working) : '',
          usedData ? buildAiContext(aiContextInput(app)) : '',
        ]
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
          sources?: AiSource[]
          usage?: { in: number; out: number }
          error?: string
        }
        try {
          evt = JSON.parse(payload)
        } catch {
          continue /* keep-alive / non-JSON line */
        }
        if (evt.model) app.setAiMessageModel(chatId, msgId, evt.model)
        if (Array.isArray(evt.sources)) app.setAiMessageSources(chatId, msgId, evt.sources)
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

/**
 * Migration stage 4: the same turn against Aureon's local Ollama (POST /api/chat).
 * Aureon keeps the conversation server-side, so only the new prompt is sent,
 * plus the instructions and live context as the system message (src/ai/aureonChat.ts).
 */
async function sendAureon(
  app: ReturnType<typeof useAppStore>,
  chatId: number,
  msgId: number,
  prompt: string,
  working: ReturnType<typeof focusInfo> | null,
  usedData: boolean,
): Promise<void> {
  // The chat's provider + model (per conversation; new chats take the pick or
  // the server default). null = let the server choose.
  const key = String(chatId)
  const target = targetFor(key)
  if (!target && !aureonAi.catalog) {
    app.appendAiMessageContent(
      chatId,
      msgId,
      '⚠️ Pick a model in the header first (the list comes from the server). Your message is saved.',
    )
    return
  }
  if (target) {
    setTarget(key, target)
    aureonAi.pending = null
    app.setAiMessageModel(chatId, msgId, target.model)
  }
  // The external provider that answered (its spend meter refreshes after the turn).
  let usedExternal: ExternalProvider | null = null
  run.value = { chatId, msgId, status: 'streaming', startedAt: Date.now() }
  abort = new AbortController()
  let failed = false
  // The reply's thinking steps (src/ai/steps.ts), for this visit.
  const tkey = traceKey(chatId, msgId)
  aiTraces[tkey] = startTrace(Date.now(), aureonAi.think)
  const trace = aiTraces[tkey]
  try {
    const turns = app
      .aiChatById(chatId)!
      .messages.filter((m) => m.id !== msgId && m.content)
      .map((m) => ({ role: m.role, content: m.content }))
    const system = [
      AI_INSTRUCTIONS,
      todayLine(),
      working ? focusBlock(working) : '',
      usedData ? buildAiContext(aiContextInput(app)) : '',
    ]
      .filter(Boolean)
      .join('\n\n')
    for await (const evt of streamChat({
      model: target?.model ?? '',
      provider: target?.provider,
      system,
      history: turns.slice(0, -1), // the last turn is this prompt
      prompt,
      chatKey: String(chatId),
      signal: abort.signal,
      think: aureonAi.think,
    })) {
      applyEvent(trace, evt)
      if (evt.reset) app.clearAiMessageContent(chatId, msgId)
      if (evt.route) {
        const r = evt.route
        if (r.provider !== 'ollama') usedExternal = r.provider
        app.setAiMessageRoute(chatId, msgId, {
          provider: r.provider,
          requestedProvider: r.requestedProvider ?? target?.provider,
          requestedModel: r.requestedModel ?? target?.model,
          ...(r.fromProvider ? { fromProvider: r.fromProvider } : {}),
          fallbackReason: r.fallbackReason ?? null,
          localOnly: r.localOnly ?? false,
          costUsd: r.costUsd ?? null,
        })
      }
      // '' with a route: the answering model is unknown. Clear it, so the chip never
      // keeps the model of the provider that was asked (or answered before a fallback).
      if (evt.route && evt.model === '') app.setAiMessageModel(chatId, msgId, '')
      if (evt.model) {
        app.setAiMessageModel(chatId, msgId, evt.model)
        const r = evt.route
        setAnswerer({
          model: evt.model,
          provider:
            r && r.provider !== 'ollama'
              ? `${PROVIDER_NAME[r.provider]} (via Aureon)`
              : 'Aureon (local)',
          ...(r?.fallbackReason
            ? { fallback: fallbackText(r.fallbackReason, r.requestedProvider) }
            : {}),
        })
      }
      if (evt.text) app.appendAiMessageContent(chatId, msgId, evt.text)
      if (evt.usage) app.setAiMessageUsage(chatId, msgId, evt.usage.in, evt.usage.out)
      if (evt.error) throw new Error(evt.error)
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      failed = true
      endTrace(trace, 'error', (err as Error).message)
      app.appendAiMessageContent(
        chatId,
        msgId,
        `\n\n⚠️ ${(err as Error).message || 'Stream failed.'}`,
      )
    }
  } finally {
    const stopped = abort?.signal.aborted ?? false
    if (stopped) endTrace(trace, 'stopped')
    finish(failed ? 'error' : 'done')
    if (!failed && !stopped) autoApplyUpdates(chatId, msgId)
    // The usage meter: OpenRouter spend moves only when OpenRouter was called.
    if (usedExternal) void loadUsage(usedExternal).catch(() => {})
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

// ---- The item the chat is working on --------------------------------------
// Picked above the composer: an existing todo or task. Its sub-items are shown
// there and sent with every turn, and whatever the reply suggests — steps or
// new items — is added UNDER it, so a new topic is mapped onto that item
// instead of arriving as separate todos. Each reply remembers the item it was
// asked about (AiMessage.focus), so its card still adds to the right place
// after the pick changes.

export interface AiFocus {
  collection: 'todos' | 'tasks'
  id: number
}
export interface AiFocusChild {
  id: number
  title: string
  done: boolean
  /** Added from the chat during this visit. */
  fresh: boolean
}
export interface AiFocusInfo extends AiFocus {
  title: string
  done: boolean
  children: AiFocusChild[]
}

const focus = ref<AiFocus | null>(null)
// `collection:id` of sub-items added from the chat this visit, to mark as new.
const fresh = ref<Set<string>>(new Set())

function setFocus(f: AiFocus | null) {
  focus.value = f
}

/** The focused item as it stands now, with its direct sub-items; null if it is gone. */
export function focusInfo(app: ReturnType<typeof useAppStore>, f: AiFocus): AiFocusInfo | null {
  const list = f.collection === 'todos' ? app.todos : app.tasks
  const item = (list as (Todo | Task)[]).find((x) => x.id === f.id)
  if (!item) return null
  const kids = childrenOf(buildIndex(list as (Todo | Task)[]), f.id)
  const titleOf = (x: Todo | Task) => ('text' in x ? x.text : x.title)
  return {
    ...f,
    title: titleOf(item),
    done: item.done,
    children: kids.map((k) => ({
      id: k.id,
      title: titleOf(k),
      done: k.done,
      fresh: fresh.value.has(`${f.collection}:${k.id}`),
    })),
  }
}

/** What the model is told about the focused item. */
function focusBlock(info: AiFocusInfo): string {
  const kind = info.collection === 'todos' ? 'todo' : 'task'
  const sub = info.collection === 'todos' ? 'sub-todo' : 'subtask'
  const kids = info.children.length
    ? info.children.map((c) => `- ${c.title}${c.done ? ' (done)' : ''}`).join('\n')
    : '(none yet)'
  return `THE ITEM THE USER IS WORKING ON (picked in the chat): [${kind}:${info.id}] "${info.title}"
Its ${sub}s now:
${kids}
Everything you suggest in this conversation is for this ${kind}: put new ${sub}s in a steps block with "target":"${info.title}", one step per new ${sub}, never repeating one that exists. When the user brings up a new topic, map it onto this ${kind} as new ${sub}s the same way, unless they clearly ask for a separate item. When asked what is already under it, list the ${sub}s above.`
}

function markFresh(collection: AiFocus['collection'], ids: number[]) {
  const next = new Set(fresh.value)
  for (const id of ids) next.add(`${collection}:${id}`)
  fresh.value = next
}
function childIds(
  app: ReturnType<typeof useAppStore>,
  collection: AiFocus['collection'],
  id: number,
) {
  const list = (collection === 'todos' ? app.todos : app.tasks) as (Todo | Task)[]
  return childrenOf(buildIndex(list), id).map((c) => c.id)
}

/**
 * Where a plan card's steps go: the item the reply was asked about, while it
 * still exists — otherwise the item the model named.
 */
export function planTargetFor(
  app: ReturnType<typeof useAppStore>,
  msg: Pick<AiMessage, 'focus'> | undefined,
  plan: AiPlan,
): AiPlanTarget | null {
  if (msg?.focus) {
    const info = focusInfo(app, msg.focus)
    if (info) return { collection: info.collection, id: info.id, label: info.title }
  }
  return resolvePlanTarget(app, plan)
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
/** One thing Undo takes back, children before their parent. */
export type AiRemove =
  | { list: 'todos' | 'tasks' | 'ideas'; id: number }
  | { list: 'deadlines' | 'reminders' | 'notes' | 'trips' | 'stocks'; id: number }
  | { list: 'goals' | 'steps' | 'txns'; id: number }

export interface AiCreated {
  kind: AiNewKind
  id: number
  title: string
  due?: string
  /** Every sub-item made with it, at every depth (or a goal's checklist step ids). */
  childIds: number[]
  /** What the quick look opens: the item itself, or the goal a step went into. */
  ref: AiItemRef
  /** What Undo removes, in order. */
  removes: AiRemove[]
}

type Tree = 'todo' | 'task' | 'idea'
const TREE_LIST = { todo: 'todos', task: 'tasks', idea: 'ideas' } as const

/** The live item a create entry's `parent` names, or null when it is gone. */
export function resolveParent(
  app: ReturnType<typeof useAppStore>,
  p: AiParentRef | undefined,
): { kind: AiParentRef['kind']; id: number; title: string } | null {
  if (!p) return null
  const hit = <T extends { id: number }>(list: T[]) => list.find((x) => x.id === p.id)
  if (p.kind === 'todo') {
    const t = hit(app.todos)
    return t ? { ...p, title: t.text } : null
  }
  if (p.kind === 'task') {
    const t = hit(app.tasks)
    return t ? { ...p, title: t.title } : null
  }
  if (p.kind === 'idea') {
    const t = hit(app.ideas)
    return t ? { ...p, title: t.title } : null
  }
  const g = hit(app.goals)
  return g ? { ...p, title: g.title } : null
}

function kidsOf(app: ReturnType<typeof useAppStore>, kind: Tree, id: number): number {
  if (kind === 'idea') return app.ideas.filter((i) => i.parentId === id).length
  return childIds(app, TREE_LIST[kind], id).length
}

/**
 * One todo / task / idea and all its sub-items, nested as the model gave them.
 * Pushes every id made into `made` (parent first) and returns the top id.
 */
function addTree(
  app: ReturnType<typeof useAppStore>,
  kind: Tree,
  parentId: number | null,
  node: { title: string; notes?: string; due?: string; items?: AiSubItem[] },
  tag: string,
  made: number[],
): number | null {
  const notes = node.notes ?? ''
  const id =
    kind === 'todo'
      ? app.addTodo(node.title, tag, notes)
      : kind === 'task'
        ? app.addTask(node.title, tag, { notes, deadline: node.due ?? '' })
        : app.addIdea(node.title, tag, { description: notes, deadline: node.due ?? '' })
  if (id == null) return null
  made.push(id)
  if (parentId != null) {
    // Counted before the move, the new item is not yet a child: it lands last.
    const at = kidsOf(app, kind, parentId)
    if (kind === 'todo') app.moveTodo(id, parentId, at)
    else if (kind === 'task') app.moveTask(id, parentId, at)
    else app.moveIdea(id, parentId, at)
  }
  for (const sub of node.items ?? []) addTree(app, kind, id, sub, tag, made)
  return id
}

/** A goal's checklist steps, flattening nested sub-items in order (a checklist is flat). */
function addSteps(
  app: ReturnType<typeof useAppStore>,
  goalId: number,
  items: AiSubItem[],
  made: number[],
) {
  for (const it of items) {
    const pid = app.addChecklistItem(goalId, it.title)
    // The step's details open with the point (PointDetailDialog).
    if (it.notes) app.updateChecklistItem(pid, { description: it.notes })
    made.push(pid)
    addSteps(app, goalId, it.items ?? [], made)
  }
}

/**
 * Create a card's ticked items in their own scope: todos, tasks and ideas as
 * trees (with their sub-items nested), under an existing parent when the model
 * named one; goals with their checklist; deadlines, reminders, notes, trips,
 * stocks and money in/out as single items. Nothing is created that its scope
 * cannot hold (the parser already dropped a reminder without a time, a
 * deadline without a date, money without an amount).
 */
export function createItems(
  chatId: number,
  msgId: number,
  createIndex: number,
  items: AiNewItem[],
): AiCreated[] {
  const app = useAppStore()
  const made: AiCreated[] = []
  // Asked about a picked item: its new todos and tasks go under it, in its list.
  const msg = app.aiChatById(chatId)?.messages.find((m) => m.id === msgId)
  const under = msg?.focus ? focusInfo(app, msg.focus) : null
  for (const it of items) {
    const tag = it.tag ?? ''
    const parent = resolveParent(app, it.parent)

    // A todo or task under a goal becomes one of its checklist steps.
    if (parent?.kind === 'goal' && (it.kind === 'todo' || it.kind === 'task')) {
      const ids: number[] = []
      addSteps(app, parent.id, [{ title: it.title, notes: it.notes, items: it.items }], ids)
      made.push({
        kind: it.kind,
        id: ids[0],
        title: it.title,
        childIds: ids.slice(1),
        ref: { kind: 'goal', id: parent.id },
        removes: [...ids].reverse().map((id) => ({ list: 'steps' as const, id })),
      })
      continue
    }

    if (it.kind === 'todo' || it.kind === 'task' || it.kind === 'idea') {
      // An explicit parent wins; else a picked todo/task takes new todos and tasks.
      let kind: Tree = it.kind
      let parentId: number | null = null
      if (parent && parent.kind === it.kind) parentId = parent.id
      else if (!it.parent && under && it.kind !== 'idea') {
        kind = under.collection === 'todos' ? 'todo' : 'task'
        parentId = under.id
      }
      const ids: number[] = []
      const id = addTree(app, kind, parentId, it, tag, ids)
      if (id == null) continue
      if (parentId != null && kind !== 'idea') markFresh(kind === 'todo' ? 'todos' : 'tasks', [id])
      made.push({
        kind,
        id,
        title: it.title,
        ...(it.due ? { due: it.due } : {}),
        childIds: ids.slice(1),
        ref: { kind, id },
        removes: [...ids].reverse().map((x) => ({ list: TREE_LIST[kind], id: x })),
      })
      continue
    }

    let id: number | null | undefined
    let ref: AiItemRef | null = null
    let removes: AiRemove[] = []
    const childIdsMade: number[] = []
    switch (it.kind) {
      case 'goal': {
        const gid = app.addGoal({
          title: it.title,
          description: it.notes ?? '',
          targetDate: it.due ?? '',
          ...(it.tag ? { tag: it.tag } : {}),
        })
        id = gid
        addSteps(app, gid, it.items ?? [], childIdsMade)
        ref = { kind: 'goal', id: gid }
        removes = [
          ...[...childIdsMade].reverse().map((x) => ({ list: 'steps' as const, id: x })),
          { list: 'goals', id: gid },
        ]
        break
      }
      case 'deadline': {
        const did = app.addDeadline(it.title, it.due ?? '')
        if (did != null) {
          id = did
          ref = { kind: 'deadline', id: did }
          removes = [{ list: 'deadlines', id: did }]
        }
        break
      }
      case 'reminder': {
        const rid = app.addReminder({
          title: it.title,
          note: it.notes ?? '',
          start: it.when ?? '',
          repeat: { type: 'none' },
        })
        if (rid != null) {
          id = rid
          ref = { kind: 'reminder', id: rid }
          removes = [{ list: 'reminders', id: rid }]
        }
        break
      }
      case 'note': {
        const nid = app.addNote(it.title, it.notes ?? '')
        if (nid != null) {
          id = nid
          ref = { kind: 'note', id: nid }
          removes = [{ list: 'notes', id: nid }]
        }
        break
      }
      case 'trip': {
        const tid = app.addTrip({
          title: it.title,
          ...(it.due ? { date: it.due } : {}),
          description: it.notes ?? '',
          ...(it.tag ? { tag: it.tag } : {}),
        })
        if (tid != null) {
          id = tid
          ref = { kind: 'trip', id: tid }
          removes = [{ list: 'trips', id: tid }]
        }
        break
      }
      case 'stock': {
        const sid = app.addStock(it.title, tag, { why: it.notes ?? '' })
        if (sid != null) {
          id = sid
          ref = { kind: 'stock', id: sid }
          removes = [{ list: 'stocks', id: sid }]
        }
        break
      }
      case 'expense':
      case 'income': {
        if (!it.amount || it.amount <= 0) break
        const xid = app.addTxn({
          kind: it.kind,
          amountMinor: Math.round(it.amount * 100),
          ...(it.due ? { date: it.due } : {}),
          note: [it.title, it.notes].filter(Boolean).join(' — '),
          ...(it.category ? { category: it.category } : {}),
          ...(it.tag ? { tags: [it.tag] } : {}),
        })
        id = xid
        ref = { kind: 'txn', id: xid }
        removes = [{ list: 'txns', id: xid }]
        break
      }
    }
    if (id == null || !ref) continue
    made.push({
      kind: it.kind,
      id,
      title: it.title,
      ...(it.due ? { due: it.due } : {}),
      childIds: childIdsMade,
      ref,
      removes,
    })
  }
  if (made.length) {
    app.markAiCreatesApplied(chatId, msgId, createIndex)
    app.trackAiMade(chatId, msgId, uniqueRefs(made))
  }
  return made
}

function uniqueRefs(made: AiCreated[]): AiItemRef[] {
  const seen = new Set<string>()
  return made
    .map((c) => c.ref)
    .filter((r) => {
      const k = `${r.kind}:${r.id}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
}

const UNDO_TYPE = {
  todos: 'todo',
  tasks: 'task',
  ideas: 'idea',
  deadlines: 'deadline',
  reminders: 'reminder',
  notes: 'note',
  trips: 'trip',
  stocks: 'stock',
} as const

/** Take back what a create card made, and re-arm the card. */
function undoCreated(chatId: number, msgId: number, createIndex: number, made: AiCreated[]) {
  const app = useAppStore()
  for (const c of made) {
    for (const r of c.removes) {
      if (r.list === 'goals') app.deleteGoal(r.id)
      else if (r.list === 'steps') app.deleteChecklistItem(r.id)
      else if (r.list === 'txns') app.deleteTxn(r.id)
      else app.deleteWithUndo(r.list, UNDO_TYPE[r.list], r.id, { toast: false })
    }
  }
  app.markAiCreatesApplied(chatId, msgId, createIndex, false)
  // Steps that went into an existing goal leave that goal in place: keep it tracked.
  const gone = made.filter((c) => !(c.ref.kind === 'goal' && c.ref.id !== c.id))
  app.trackAiMade(chatId, msgId, uniqueRefs(gone), 'remove')
}

/** Add a plan's steps — under its target when there is one, else as todos. */
function applyPlan(chatId: number, msgId: number, planIndex: number, plan: AiPlan): number {
  const app = useAppStore()
  const msg = app.aiChatById(chatId)?.messages.find((m) => m.id === msgId)
  const target = planTargetFor(app, msg, plan)
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
    const before = new Set(childIds(app, target.collection, target.id))
    count = app.addItemsUnder(target.collection, target.id, JSON.stringify(items)).count
    // Show them where they landed: the item, with the new ones marked.
    markFresh(
      target.collection,
      childIds(app, target.collection, target.id).filter((id) => !before.has(id)),
    )
    if (count) {
      setFocus({ collection: target.collection, id: target.id })
      app.trackAiMade(chatId, msgId, [
        { kind: target.collection === 'todos' ? 'todo' : 'task', id: target.id },
      ])
    }
  } else {
    // No existing item to go under: the steps divide one new todo, as its
    // sub-todos, rather than landing as a flat run of separate todos.
    const parentTitle =
      plan.title?.trim() || app.aiChatById(chatId)?.title?.trim() || 'Plan from AI chat'
    const parentId = app.addTodo(parentTitle, '')
    if (parentId != null) {
      const made: number[] = []
      plan.steps.forEach((s, i) => {
        const cid = app.addTodo(s.text, '', stepDescription(s))
        if (cid == null) return
        app.moveTodo(cid, parentId, i)
        made.push(cid)
        count++
      })
      // The new todo becomes the one the chat is working on, so the next
      // topic maps onto it — and its sub-todos are on show.
      markFresh('todos', made)
      setFocus({ collection: 'todos', id: parentId })
      app.trackAiMade(chatId, msgId, [{ kind: 'todo', id: parentId }])
    }
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
 * the detail pane reads them. Returns what was made (for the quick look), or
 * null when nothing was. With `from`, the reply it came from records it too.
 */
function createFromDraft(
  draft: AiActionDraft,
  from?: { chatId: number; msgId: number },
): AiItemRef | null {
  const app = useAppStore()
  const title = draft.title.trim()
  const notes = draft.notes.trim()
  const attach = (itemId: number | null | undefined) => {
    if (itemId == null || !notes) return itemId ?? null
    const noteId = app.createNoteFor('task', itemId)
    if (noteId != null) app.setNoteText(noteId, notes)
    return itemId
  }
  let made: AiItemRef | null = null
  const as = (kind: AiItemRef['kind'], id: number | null | undefined) =>
    id == null ? null : { kind, id }
  switch (draft.kind) {
    case 'todo': {
      if (!title) return null
      made = as('todo', app.addTodo(title, '', notes))
      break
    }
    case 'task': {
      if (!title) return null
      const deadline = /^\d{4}-\d{2}-\d{2}/.exec(draft.when)?.[0] ?? ''
      made = as('task', attach(app.addTask(title, '', { deadline })))
      break
    }
    case 'event': {
      const start = fromLocalInput(draft.when)
      if (!title || start == null) return null
      const mins = Math.max(5, draft.mins ?? 30)
      made = as(
        'task',
        attach(
          app.createScheduledItem('task', title, '', {
            startAt: start,
            endAt: start + mins * 60_000,
            allDay: false,
            durationMins: mins,
          }),
        ),
      )
      break
    }
    case 'reminder': {
      if (!title || !draft.when) return null
      made = as(
        'reminder',
        app.addReminder({ title, note: notes, start: draft.when, repeat: { type: 'none' } }),
      )
      break
    }
    case 'note': {
      const id = app.addNote(title, notes)
      if (id == null) return null
      made = as('note', id)
      break
    }
  }
  if (!made) return null
  if (from) app.trackAiMade(from.chatId, from.msgId, [made])
  app.showToastMsg(`${ACTION_DONE[draft.kind]} — ${title || 'Untitled'}`)
  return made
}

export function useAiChat() {
  return {
    run,
    focus,
    setFocus,
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
