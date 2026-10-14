// The AI tab's send loop, at module scope.
//
// It used to live inside AiView, so the `streaming` flag and the abort handle
// belonged to the component instance — and switching tabs unmounts it. The
// fetch kept writing into the store, but the view that came back had lost track
// of it: no Stop button, no cursor, and Send re-enabled mid-reply. Here the run
// outlives any one component, which is also what lets the chat dock follow a
// reply from another tab and pop when it lands.
//
// The Gemini key never touches the client: sends POST to `/api/ai`
// (VITE_AI_PROXY_URL), a Netlify function that verifies the Supabase session,
// injects the key, and streams back `data: {"text": …}` lines.

import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { supabase } from '@/supabase'
import { AI_MODELS } from '@/types'
import {
  AI_INSTRUCTIONS,
  buildAiContext,
  type AiActionDraft,
  type AiContextInput,
  type AiPlan,
} from '@/utils/ai'
import { fromLocalInput } from '@/utils/detailFields'
import { noteLabel } from '@/utils/notes'
import { currentMonthKey, resolveIncome } from '@/utils/budget'
import { toMinor } from '@/utils/money'

export interface AiRun {
  chatId: number
  msgId: number
  status: 'streaming' | 'done' | 'error'
  startedAt: number
  finishedAt?: number
}

const run = ref<AiRun | null>(null)
let abort: AbortController | null = null

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
  return {
    overdueTodos: app.pendingOverdue('todos').map((t) => (t as { text: string }).text),
    todayTodos: [],
    overdueTasks: app.pendingOverdue('tasks').map((t) => (t as { title: string }).title),
    upcomingReminders: app.reminders.slice(0, 6).map((r) => r.title),
    income,
    spent,
    remaining: income - spent,
    trips: app.trips.filter((t) => t.status !== 'done').map((t) => t.title),
    noteTitles: app.notes.slice(-6).map((n) => noteLabel(n)),
    bots: app.bots.map((b) => ({ name: b.name, status: b.status, enabled: b.enabled })),
  }
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
  // A chat started before the switch to Gemini still carries a Claude id.
  const model = AI_MODELS.some((m) => m.id === chat.model) ? chat.model : AI_MODELS[0].id
  if (model !== chat.model) app.setAiChatModel(chatId, model)

  app.addAiMessage(chatId, { role: 'user', content: body })
  const usedData = app.aiUseData
  const msgId = app.addAiMessage(chatId, { role: 'assistant', content: '', model, usedData })

  const url = proxyUrl()
  if (!url) {
    app.appendAiMessageContent(
      chatId,
      msgId,
      '⚠️ AI proxy not configured. Set `VITE_AI_PROXY_URL=/api/ai` and `GEMINI_API_KEY` (server-side, no VITE_ prefix) so the `/api/ai` Netlify function can answer. Your message is saved.',
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
        let evt: { text?: string; usage?: { in: number; out: number }; error?: string }
        try {
          evt = JSON.parse(payload)
        } catch {
          continue /* keep-alive / non-JSON line */
        }
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
    finish(failed ? 'error' : 'done')
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

/** Add a plan's steps — under its target when there is one, else as todos. */
function applyPlan(chatId: number, msgId: number, planIndex: number, plan: AiPlan): number {
  const app = useAppStore()
  const target = resolvePlanTarget(app, plan)
  let count = 0
  if (target) {
    const lines = plan.steps.map((s) => s.text.replace(/\s+/g, ' ')).join('\n')
    count = app.addItemsUnder(target.collection, target.id, lines).count
  } else {
    for (const s of plan.steps) app.addTodo(s.text)
    count = plan.steps.length
  }
  if (count) app.markAiPlanApplied(chatId, msgId, planIndex)
  return count
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
  return { run, streaming, send, stop, dismiss, applyPlan, createFromDraft }
}
